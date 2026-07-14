import { describe, it, expect } from 'vitest'
import { dirNameToPath } from './paths'

describe('dirNameToPath', () => {
  it('把编码目录名还原为路径(无连字符的简单情形)', () => {
    expect(dirNameToPath('-Users-alice')).toBe('/Users/alice')
  })

  it('原路径含连字符时不可逆(已知限制,仅兜底)', () => {
    // claude-sessions-history 的 '-' 会被一并还原成 '/',这是预期的不完美行为
    expect(dirNameToPath('-Users-alice-AI_Plugins-claude-sessions-history')).toBe(
      '/Users/alice/AI_Plugins/claude/sessions/history'
    )
  })

  it('不以连字符开头时原样返回', () => {
    expect(dirNameToPath('plain')).toBe('plain')
  })
})
