import { describe, it, expect } from 'vitest'
import { parseUserSegments } from './messageContent'

describe('parseUserSegments', () => {
  it('纯文本返回单个 text 片段', () => {
    const segs = parseUserSegments('帮我写个函数')
    expect(segs).toEqual([{ kind: 'text', text: '帮我写个函数' }])
  })

  it('解析斜杠命令三元组为单个 command 片段', () => {
    const input =
      '<command-message>foo is running…</command-message>\n' +
      '<command-name>/foo</command-name>\n' +
      '<command-args>bar baz</command-args>'
    const segs = parseUserSegments(input)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toEqual({
      kind: 'command',
      name: '/foo',
      args: 'bar baz',
      message: 'foo is running…'
    })
  })

  it('命令后跟本地输出', () => {
    const input =
      '<command-name>/build</command-name>\n' +
      '<local-command-stdout>BUILD OK</local-command-stdout>'
    const segs = parseUserSegments(input)
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ kind: 'command', name: '/build' })
    expect(segs[1]).toEqual({ kind: 'stdout', text: 'BUILD OK' })
  })

  it('提取 system-reminder 并保留前面的真实文本', () => {
    const input = '真实问题在这里\n<system-reminder>背景上下文</system-reminder>'
    const segs = parseUserSegments(input)
    expect(segs[0]).toEqual({ kind: 'text', text: '真实问题在这里' })
    expect(segs[1]).toEqual({ kind: 'reminder', text: '背景上下文' })
  })

  it('提取 caveat 片段', () => {
    const input = '<local-command-caveat>Caveat: do not respond</local-command-caveat>'
    const segs = parseUserSegments(input)
    expect(segs).toEqual([{ kind: 'caveat', text: 'Caveat: do not respond' }])
  })

  it('解析连续的两个命令为两个片段', () => {
    const input =
      '<command-name>/a</command-name>\n' +
      '<command-name>/b</command-name>'
    const segs = parseUserSegments(input)
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ kind: 'command', name: '/a' })
    expect(segs[1]).toMatchObject({ kind: 'command', name: '/b' })
  })

  it('文本 + 命令 + 文本 混合保持顺序', () => {
    const input =
      '先说明\n<command-name>/x</command-name>\n然后继续问'
    const segs = parseUserSegments(input)
    expect(segs.map((s) => s.kind)).toEqual(['text', 'command', 'text'])
  })

  it('未闭合的未知标签作为文本保留(交给后续转义)', () => {
    const input = '看这个 <weird-tag> 标签'
    const segs = parseUserSegments(input)
    expect(segs).toEqual([{ kind: 'text', text: '看这个 <weird-tag> 标签' }])
  })
})
