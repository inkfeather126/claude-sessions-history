import { describe, it, expect } from 'vitest'
import { parseSessionForIndex, parseSessionDetail } from './jsonl-parser'

const userLine = JSON.stringify({
  type: 'user',
  message: { role: 'user', content: '帮我做一个工具' },
  uuid: 'u1',
  timestamp: '2026-06-18T06:56:56.381Z',
  sessionId: 'sess-123',
  cwd: '/Users/me/proj',
  slug: 'peaceful-snowglobe'
})

const assistantLine = JSON.stringify({
  type: 'assistant',
  message: {
    role: 'assistant',
    model: 'claude-opus-4-8',
    content: [
      { type: 'thinking', thinking: '我在思考' },
      { type: 'text', text: '好的,我来帮你' },
      { type: 'tool_use', name: 'Write', input: { file_path: '/a/b.ts' } }
    ]
  },
  uuid: 'a1',
  timestamp: '2026-06-18T06:57:09.654Z',
  sessionId: 'sess-123'
})

const aiTitleLine = JSON.stringify({
  type: 'ai-title',
  aiTitle: '构建会话搜索工具',
  sessionId: 'sess-123'
})

describe('parseSessionForIndex', () => {
  it('抽取会话元数据与 FTS 文本', () => {
    const content = [userLine, assistantLine, aiTitleLine].join('\n')
    const r = parseSessionForIndex(content)
    expect(r.sessionId).toBe('sess-123')
    expect(r.cwd).toBe('/Users/me/proj')
    expect(r.slug).toBe('peaceful-snowglobe')
    expect(r.aiTitle).toBe('构建会话搜索工具')
    expect(r.firstUserMsg).toBe('帮我做一个工具')
    expect(r.messageCount).toBe(2)
    expect(r.model).toBe('claude-opus-4-8')
    expect(r.createdAt).toBeGreaterThan(0)
    expect(r.updatedAt).toBeGreaterThanOrEqual(r.createdAt)
    // user 文本 + assistant 的 text(不含 thinking)
    const allText = r.ftsMessages.map((m) => m.content).join(' ')
    expect(allText).toContain('帮我做一个工具')
    expect(allText).toContain('好的,我来帮你')
    expect(allText).not.toContain('我在思考')
  })

  it('坏行被跳过并计数,不中断解析', () => {
    const content = [userLine, '{ 这不是合法 json', assistantLine].join('\n')
    const r = parseSessionForIndex(content)
    expect(r.skippedLines).toBe(1)
    expect(r.messageCount).toBe(2)
  })

  it('忽略 isSidechain 的子链消息', () => {
    const side = JSON.stringify({
      type: 'user',
      isSidechain: true,
      message: { role: 'user', content: '子agent消息' },
      timestamp: '2026-06-18T07:00:00.000Z',
      sessionId: 'sess-123'
    })
    const r = parseSessionForIndex([userLine, side].join('\n'))
    expect(r.messageCount).toBe(1)
  })

  it('空内容返回零值结构', () => {
    const r = parseSessionForIndex('')
    expect(r.sessionId).toBeNull()
    expect(r.messageCount).toBe(0)
    expect(r.ftsMessages).toHaveLength(0)
  })
})

describe('parseSessionDetail', () => {
  it('按时间排序并保留 thinking / tool_use', () => {
    const content = [assistantLine, userLine].join('\n')
    const msgs = parseSessionDetail(content)
    expect(msgs).toHaveLength(2)
    // user 时间更早,应排在前
    expect(msgs[0].role).toBe('user')
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[1].thinking).toContain('我在思考')
    expect(msgs[1].text).toContain('好的')
    expect(msgs[1].toolUses[0].name).toBe('Write')
    expect(msgs[1].toolUses[0].input).toContain('/a/b.ts')
  })

  it('仅含 tool_result 的 user 消息标记为 tool 角色', () => {
    const toolLine = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'x', content: '文件读取成功' }]
      },
      uuid: 't1',
      timestamp: '2026-06-18T07:01:00.000Z'
    })
    const msgs = parseSessionDetail(toolLine)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('tool')
    expect(msgs[0].text).toContain('文件读取成功')
  })

  it('含 text 的 user 消息仍是真人输入(user 角色)', () => {
    const mixed = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: '真人提问' }] },
      uuid: 'h1',
      timestamp: '2026-06-18T07:02:00.000Z'
    })
    const msgs = parseSessionDetail(mixed)
    expect(msgs[0].role).toBe('user')
  })

  it('跳过没有可展示内容的行', () => {
    const empty = JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [] },
      uuid: 'x',
      timestamp: '2026-06-18T06:57:09.654Z'
    })
    const msgs = parseSessionDetail(empty)
    expect(msgs).toHaveLength(0)
  })

  it('抽取 image 块为 data: URI', () => {
    const imgLine = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: '看这张图' },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }
        ]
      },
      uuid: 'img1',
      timestamp: '2026-06-18T07:03:00.000Z'
    })
    const msgs = parseSessionDetail(imgLine)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].images).toEqual(['data:image/jpeg;base64,AAAA'])
  })

  it('纯图片消息(无文字)不被丢弃', () => {
    const onlyImg = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'BBBB' } }]
      },
      uuid: 'img2',
      timestamp: '2026-06-18T07:04:00.000Z'
    })
    const msgs = parseSessionDetail(onlyImg)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].images).toEqual(['data:image/png;base64,BBBB'])
  })

  it('抽取 tool_result 内嵌的图片', () => {
    const toolImg = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'CCCC' } }]
          }
        ]
      },
      uuid: 'img3',
      timestamp: '2026-06-18T07:05:00.000Z'
    })
    const msgs = parseSessionDetail(toolImg)
    expect(msgs[0].images).toEqual(['data:image/png;base64,CCCC'])
  })
})
