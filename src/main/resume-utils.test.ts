import { describe, it, expect } from 'vitest'
import { isValidSessionId, escapeForAppleScript, buildResumeCommand } from './resume-utils'

describe('isValidSessionId', () => {
  it('接受合法 UUID', () => {
    expect(isValidSessionId('ccf88c71-068f-46eb-8656-b1976af59500')).toBe(true)
  })

  it('拒绝注入式输入', () => {
    expect(isValidSessionId('abc; rm -rf /')).toBe(false)
    expect(isValidSessionId('"; do shell script "evil')).toBe(false)
    expect(isValidSessionId('')).toBe(false)
    expect(isValidSessionId('not-a-uuid')).toBe(false)
  })
})

describe('escapeForAppleScript', () => {
  it('转义双引号与反斜杠', () => {
    expect(escapeForAppleScript('a"b\\c')).toBe('a\\"b\\\\c')
  })
})

describe('buildResumeCommand', () => {
  it('用 JSON.stringify 安全包裹 cwd', () => {
    const cmd = buildResumeCommand('/Users/me/my proj', 'ccf88c71-068f-46eb-8656-b1976af59500')
    expect(cmd).toBe('cd "/Users/me/my proj" && claude --resume ccf88c71-068f-46eb-8656-b1976af59500')
  })
})
