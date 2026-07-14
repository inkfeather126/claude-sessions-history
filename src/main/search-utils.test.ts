import { describe, it, expect } from 'vitest'
import { escapeLike, buildFtsMatch } from './search-utils'

describe('escapeLike', () => {
  it('转义 LIKE 通配符 % _ 和反斜杠', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d')
  })

  it('普通字符与中文原样保留', () => {
    expect(escapeLike('搜索 hello')).toBe('搜索 hello')
  })

  it('空串返回空串', () => {
    expect(escapeLike('')).toBe('')
  })
})

describe('buildFtsMatch', () => {
  it('把查询包成 phrase(双引号包裹)', () => {
    expect(buildFtsMatch('hello world')).toBe('"hello world"')
  })

  it('内部双引号翻倍转义,避免 FTS 语法错误', () => {
    expect(buildFtsMatch('say "hi"')).toBe('"say ""hi"""')
  })

  it('中文子串正常包裹', () => {
    expect(buildFtsMatch('会话搜索')).toBe('"会话搜索"')
  })
})
