import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { existsSync, rmSync, writeFileSync } from 'fs'
import { readHidden, setHidden } from './hidden'

let counter = 0
const created: string[] = []

function tmpFile(): string {
  const f = join(tmpdir(), `hidden-test-${counter++}.json`)
  created.push(f)
  return f
}

afterEach(() => {
  for (const f of created.splice(0)) {
    if (existsSync(f)) rmSync(f)
    if (existsSync(f + '.tmp')) rmSync(f + '.tmp')
  }
})

describe('hidden', () => {
  it('不存在的文件读取返回空表', () => {
    expect(readHidden(tmpFile())).toEqual({})
  })

  it('隐藏后记录时间戳并可读回', () => {
    const f = tmpFile()
    expect(setHidden('s1', true, 1000, f)).toBe(true)
    expect(readHidden(f)).toEqual({ s1: 1000 })
  })

  it('取消隐藏后删除记录', () => {
    const f = tmpFile()
    setHidden('s1', true, 1000, f)
    expect(setHidden('s1', false, 2000, f)).toBe(false)
    expect(readHidden(f)['s1']).toBeUndefined()
  })

  it('多个会话互不影响', () => {
    const f = tmpFile()
    setHidden('s1', true, 1, f)
    setHidden('s2', true, 2, f)
    setHidden('s1', false, 3, f)
    expect(readHidden(f)).toEqual({ s2: 2 })
  })

  it('原子写不残留临时文件', () => {
    const f = tmpFile()
    setHidden('s1', true, 1, f)
    expect(existsSync(f + '.tmp')).toBe(false)
    expect(existsSync(f)).toBe(true)
  })

  it('损坏的 JSON 读取返回空表而非抛错', () => {
    const f = tmpFile()
    writeFileSync(f, '{ broken', 'utf-8')
    expect(readHidden(f)).toEqual({})
  })
})
