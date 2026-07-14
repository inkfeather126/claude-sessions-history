import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { existsSync, rmSync, readFileSync } from 'fs'
import { readAliases, setAlias } from './aliases'

function tmpFile(): string {
  // 用固定后缀 + 计数避免 Date.now/random;每个用例独立路径
  return join(tmpdir(), `alias-test-${counter++}.json`)
}
let counter = 0
const created: string[] = []

function track(f: string): string {
  created.push(f)
  return f
}

afterEach(() => {
  for (const f of created.splice(0)) {
    if (existsSync(f)) rmSync(f)
    if (existsSync(f + '.tmp')) rmSync(f + '.tmp')
  }
})

describe('aliases', () => {
  it('不存在的文件读取返回空表', () => {
    const f = track(tmpFile())
    expect(readAliases(f)).toEqual({})
  })

  it('设置别名后可读回,且写入了 updatedAt', () => {
    const f = track(tmpFile())
    const r = setAlias('sess-1', '我的会话', 1000, f)
    expect(r).toBe('我的会话')
    const map = readAliases(f)
    expect(map['sess-1'].alias).toBe('我的会话')
    expect(map['sess-1'].updatedAt).toBe(1000)
  })

  it('空白别名表示清除', () => {
    const f = track(tmpFile())
    setAlias('sess-1', '名字', 1000, f)
    const r = setAlias('sess-1', '   ', 2000, f)
    expect(r).toBeNull()
    expect(readAliases(f)['sess-1']).toBeUndefined()
  })

  it('原子写不残留临时文件', () => {
    const f = track(tmpFile())
    setAlias('sess-1', 'a', 1000, f)
    expect(existsSync(f + '.tmp')).toBe(false)
    expect(existsSync(f)).toBe(true)
  })

  it('损坏的 JSON 文件读取返回空表而非抛错', () => {
    const f = track(tmpFile())
    // 写入损坏内容
    require('fs').writeFileSync(f, '{ broken', 'utf-8')
    expect(readAliases(f)).toEqual({})
  })

  it('多次设置不同会话互不影响', () => {
    const f = track(tmpFile())
    setAlias('s1', 'A', 1, f)
    setAlias('s2', 'B', 2, f)
    const map = readAliases(f)
    expect(map['s1'].alias).toBe('A')
    expect(map['s2'].alias).toBe('B')
    // 文件确实是合法 JSON
    expect(() => JSON.parse(readFileSync(f, 'utf-8'))).not.toThrow()
  })
})
