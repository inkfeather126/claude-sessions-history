import { describe, it, expect, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { existsSync, rmSync, writeFileSync } from 'fs'
import { readRemoved, addRemoved, removeRemoved, removedSet, clearRemoved } from './removed'

let counter = 0
const created: string[] = []

function tmpFile(): string {
  const f = join(tmpdir(), `removed-test-${counter++}.json`)
  created.push(f)
  return f
}

afterEach(() => {
  for (const f of created.splice(0)) {
    if (existsSync(f)) rmSync(f)
    if (existsSync(f + '.tmp')) rmSync(f + '.tmp')
  }
})

describe('removed', () => {
  it('不存在的文件返回空表', () => {
    expect(readRemoved(tmpFile())).toEqual({})
  })

  it('记录被删 uuid,按会话分组', () => {
    const f = tmpFile()
    addRemoved('s1', 'u1', f)
    addRemoved('s1', 'u2', f)
    expect(readRemoved(f)).toEqual({ s1: ['u1', 'u2'] })
  })

  it('重复记录同一 uuid 幂等去重', () => {
    const f = tmpFile()
    addRemoved('s1', 'u1', f)
    addRemoved('s1', 'u1', f)
    expect(readRemoved(f)['s1']).toEqual(['u1'])
  })

  it('恢复后移除 uuid;会话清空后删除该 key', () => {
    const f = tmpFile()
    addRemoved('s1', 'u1', f)
    addRemoved('s1', 'u2', f)
    removeRemoved('s1', 'u1', f)
    expect(readRemoved(f)).toEqual({ s1: ['u2'] })
    removeRemoved('s1', 'u2', f)
    expect(readRemoved(f)['s1']).toBeUndefined()
  })

  it('clearRemoved 清空整个会话的记录', () => {
    const f = tmpFile()
    addRemoved('s1', 'u1', f)
    addRemoved('s1', 'u2', f)
    addRemoved('s2', 'x1', f)
    clearRemoved('s1', f)
    expect(readRemoved(f)).toEqual({ s2: ['x1'] })
  })

  it('removedSet 返回某会话的 uuid 集合', () => {
    const map = { s1: ['a', 'b'] }
    const set = removedSet('s1', map)
    expect(set.has('a')).toBe(true)
    expect(set.has('z')).toBe(false)
    expect(removedSet('other', map).size).toBe(0)
  })

  it('损坏 JSON 返回空表', () => {
    const f = tmpFile()
    writeFileSync(f, '{ broken', 'utf-8')
    expect(readRemoved(f)).toEqual({})
  })
})
