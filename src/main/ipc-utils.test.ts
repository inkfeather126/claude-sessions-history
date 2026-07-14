import { describe, it, expect } from 'vitest'
import { resolveTitle, aliasMatches, classifyMatch, buildSummary } from './ipc-utils'
import type { SessionRow } from './db'
import type { AliasMap } from './aliases'

function row(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    sessionId: 'ccf88c71-068f-46eb-8656-b1976af59500',
    projectDir: '-Users-me-proj',
    projectPath: '/Users/me/proj',
    aiTitle: null,
    slug: null,
    firstUserMsg: null,
    createdAt: 1,
    updatedAt: 2,
    messageCount: 3,
    model: 'claude-opus-4-8',
    ...overrides
  }
}

describe('resolveTitle', () => {
  it('别名优先级最高', () => {
    const r = row({ aiTitle: 'AI 标题', slug: 'a-slug', firstUserMsg: '首条消息' })
    expect(resolveTitle(r, '我的别名')).toBe('我的别名')
  })

  it('无别名时用 aiTitle', () => {
    expect(resolveTitle(row({ aiTitle: 'AI 标题', slug: 'a-slug' }), null)).toBe('AI 标题')
  })

  it('无别名/aiTitle 时用 slug', () => {
    expect(resolveTitle(row({ slug: 'a-slug', firstUserMsg: '首条消息' }), null)).toBe('a-slug')
  })

  it('再退到首条用户消息', () => {
    expect(resolveTitle(row({ firstUserMsg: '首条消息' }), null)).toBe('首条消息')
  })

  it('全空时回落到 sessionId 前 8 位短码', () => {
    expect(resolveTitle(row(), null)).toBe('ccf88c71')
  })

  it('空字符串别名视为无别名(继续向下回退)', () => {
    expect(resolveTitle(row({ aiTitle: 'AI 标题' }), '')).toBe('AI 标题')
  })
})

describe('aliasMatches', () => {
  it('大小写不敏感的包含匹配', () => {
    expect(aliasMatches('My Project', 'project')).toBe(true)
    expect(aliasMatches('My Project', 'PROJ')).toBe(true)
  })

  it('不包含则不命中', () => {
    expect(aliasMatches('My Project', 'xyz')).toBe(false)
  })

  it('null / undefined 别名不命中', () => {
    expect(aliasMatches(null, 'a')).toBe(false)
    expect(aliasMatches(undefined, 'a')).toBe(false)
  })
})

describe('classifyMatch', () => {
  it('仅标题命中 → title', () => {
    expect(classifyMatch(true, false, false)).toBe('title')
  })

  it('仅内容命中 → content', () => {
    expect(classifyMatch(false, true, false)).toBe('content')
  })

  it('标题 + 内容 → both', () => {
    expect(classifyMatch(true, true, false)).toBe('both')
  })

  it('别名命中并入标题维度:别名 + 内容 → both', () => {
    expect(classifyMatch(false, true, true)).toBe('both')
  })

  it('仅别名命中(无内容) → title', () => {
    expect(classifyMatch(false, false, true)).toBe('title')
  })
})

describe('buildSummary', () => {
  it('合并别名并解析标题,映射所有字段', () => {
    const aliases: AliasMap = {
      'ccf88c71-068f-46eb-8656-b1976af59500': { alias: '别名标题', updatedAt: 99 }
    }
    const s = buildSummary(row({ aiTitle: 'AI 标题' }), aliases)
    expect(s.alias).toBe('别名标题')
    expect(s.title).toBe('别名标题') // 别名优先
    expect(s.aiTitle).toBe('AI 标题')
    expect(s.sessionId).toBe('ccf88c71-068f-46eb-8656-b1976af59500')
    expect(s.messageCount).toBe(3)
    expect(s.model).toBe('claude-opus-4-8')
  })

  it('无别名时 alias 为 null,title 用 aiTitle', () => {
    const s = buildSummary(row({ aiTitle: 'AI 标题' }), {})
    expect(s.alias).toBeNull()
    expect(s.title).toBe('AI 标题')
  })

  it('hidden 默认 false,可显式传入 true', () => {
    expect(buildSummary(row(), {}).hidden).toBe(false)
    expect(buildSummary(row(), {}, true).hidden).toBe(true)
  })
})
