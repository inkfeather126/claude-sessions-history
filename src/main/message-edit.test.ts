import { describe, it, expect } from 'vitest'
import {
  REMOVED_PLACEHOLDER,
  redactContent,
  redactLine,
  redactMessage,
  findLineByUuid,
  restoreMessage,
  mergeNewMessages
} from './message-edit'

// 贴近真实结构的样本行
const userStr = JSON.stringify({
  parentUuid: 'p1',
  type: 'user',
  uuid: 'u1',
  message: { role: 'user', content: '原始问题' },
  cwd: '/x'
})
const asstTool = JSON.stringify({
  parentUuid: 'u1',
  type: 'assistant',
  uuid: 'u2',
  message: {
    role: 'assistant',
    content: [
      { type: 'text', text: '我来调用工具' },
      { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file: 'a.ts' }, caller: 'x' }
    ]
  }
})
const toolResult = JSON.stringify({
  parentUuid: 'u2',
  type: 'user',
  uuid: 'u3',
  message: { role: 'user', content: [{ tool_use_id: 'toolu_1', type: 'tool_result', content: '文件内容' }] },
  toolUseResult: { ok: true }
})

describe('redactContent', () => {
  it('string 内容整体占位', () => {
    expect(redactContent('你好')).toBe(REMOVED_PLACEHOLDER)
  })

  it('text 块只清 text,保留 type', () => {
    expect(redactContent([{ type: 'text', text: '原文' }])).toEqual([
      { type: 'text', text: REMOVED_PLACEHOLDER }
    ])
  })

  it('thinking 块清 thinking', () => {
    expect(redactContent([{ type: 'thinking', thinking: '想法' }])).toEqual([
      { type: 'thinking', thinking: REMOVED_PLACEHOLDER }
    ])
  })

  it('tool_use 清 input 但保留配对键 id/name', () => {
    const out = redactContent([
      { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file: 'a.ts' } }
    ]) as Record<string, unknown>[]
    expect(out[0].id).toBe('toolu_1')
    expect(out[0].name).toBe('Read')
    expect(out[0].input).toEqual({})
  })

  it('tool_result 清 content 但保留配对键 tool_use_id', () => {
    const out = redactContent([
      { tool_use_id: 'toolu_1', type: 'tool_result', content: '结果' }
    ]) as Record<string, unknown>[]
    expect(out[0].tool_use_id).toBe('toolu_1')
    expect(out[0].content).toBe(REMOVED_PLACEHOLDER)
  })

  it('未知形态原样返回', () => {
    expect(redactContent(null)).toBeNull()
    expect(redactContent(42)).toBe(42)
  })
})

describe('redactLine', () => {
  it('保留顶层 uuid/parentUuid,只占位 content', () => {
    const o = JSON.parse(redactLine(userStr))
    expect(o.uuid).toBe('u1')
    expect(o.parentUuid).toBe('p1')
    expect(o.cwd).toBe('/x')
    expect(o.message.content).toBe(REMOVED_PLACEHOLDER)
  })

  it('assistant 工具行:tool_use 配对键存活、input 清空、text 占位', () => {
    const o = JSON.parse(redactLine(asstTool))
    expect(o.message.content[0].text).toBe(REMOVED_PLACEHOLDER)
    expect(o.message.content[1].id).toBe('toolu_1')
    expect(o.message.content[1].name).toBe('Read')
    expect(o.message.content[1].input).toEqual({})
  })

  it('tool_result 行:tool_use_id 存活,顶层 toolUseResult 保留', () => {
    const o = JSON.parse(redactLine(toolResult))
    expect(o.message.content[0].tool_use_id).toBe('toolu_1')
    expect(o.message.content[0].content).toBe(REMOVED_PLACEHOLDER)
    expect(o.toolUseResult).toEqual({ ok: true })
  })

  it('坏行/无 message 行原样返回', () => {
    expect(redactLine('{ broken')).toBe('{ broken')
    const meta = JSON.stringify({ type: 'ai-title', aiTitle: 'x' })
    expect(redactLine(meta)).toBe(meta)
  })
})

describe('redactMessage', () => {
  const file = [userStr, asstTool, toolResult].join('\n')

  it('命中 uuid 改写该行,其他行逐字保留', () => {
    const { content, changed } = redactMessage(file, 'u2')
    expect(changed).toBe(true)
    const lines = content.split('\n')
    expect(lines[0]).toBe(userStr) // 未动
    expect(lines[2]).toBe(toolResult) // 未动
    expect(JSON.parse(lines[1]).message.content[1].id).toBe('toolu_1') // 配对键仍在
  })

  it('未命中 uuid 时 changed=false 且全文不变', () => {
    const { content, changed } = redactMessage(file, 'nope')
    expect(changed).toBe(false)
    expect(content).toBe(file)
  })
})

describe('restoreMessage + findLineByUuid', () => {
  it('占位后用归档原始行恢复,可精确还原原文件', () => {
    const file = [userStr, asstTool, toolResult].join('\n')
    const redacted = redactMessage(file, 'u1').content
    expect(redacted).not.toBe(file)
    const original = findLineByUuid(file, 'u1') // 归档里的原始行
    expect(original).toBe(userStr)
    const restored = restoreMessage(redacted, 'u1', original as string).content
    expect(restored).toBe(file)
  })

  it('找不到 uuid 返回 null', () => {
    expect(findLineByUuid(userStr, 'zzz')).toBeNull()
  })
})

describe('mergeNewMessages', () => {
  it('追加归档里没有的新消息,不覆盖已有原文', () => {
    const archive = [userStr, asstTool].join('\n')
    // 工作文件:u1 被占位、u3 是 resume 后新增
    const work = [redactLine(userStr), asstTool, toolResult].join('\n')
    const merged = mergeNewMessages(work, archive)
    // u3 被追加
    expect(findLineByUuid(merged, 'u3')).toBe(toolResult)
    // u1 仍是归档里的原始版(未被工作文件的占位版覆盖)
    expect(findLineByUuid(merged, 'u1')).toBe(userStr)
  })

  it('无新增时归档原样返回', () => {
    const archive = [userStr, asstTool].join('\n')
    expect(mergeNewMessages(archive, archive)).toBe(archive)
  })
})
