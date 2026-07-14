import { describe, it, expect } from 'vitest'
import { formatRelativeTime, formatDate, formatDateTime, basename } from './useApi'

describe('basename', () => {
  it('取绝对路径最后一段', () => {
    expect(basename('/Users/me/proj')).toBe('proj')
  })

  it('忽略末尾斜杠', () => {
    expect(basename('/Users/me/proj/')).toBe('proj')
    expect(basename('/Users/me/proj///')).toBe('proj')
  })

  it('单段路径原样返回', () => {
    expect(basename('proj')).toBe('proj')
  })

  it('根路径返回自身', () => {
    expect(basename('/')).toBe('/')
  })
})

describe('formatDate', () => {
  it('0 返回占位符', () => {
    expect(formatDate(0)).toBe('—')
  })

  it('格式化为 年-月-日 并补零(月份 +1)', () => {
    // 本地构造 + 本地解析,断言与运行时区无关
    const ms = new Date(2026, 0, 5).getTime() // 2026 年 1 月 5 日
    expect(formatDate(ms)).toBe('2026-01-05')
  })
})

describe('formatDateTime', () => {
  it('0 返回占位符', () => {
    expect(formatDateTime(0)).toBe('—')
  })

  it('在日期后附加 时:分 并补零', () => {
    const ms = new Date(2026, 5, 9, 9, 3).getTime() // 2026-06-09 09:03
    expect(formatDateTime(ms)).toBe('2026-06-09 09:03')
  })
})

describe('formatRelativeTime', () => {
  it('0 返回占位符', () => {
    expect(formatRelativeTime(0)).toBe('—')
  })

  it('一分钟内显示"刚刚"', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe('刚刚')
  })

  it('分钟级', () => {
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toBe('5 分钟前')
  })

  it('小时级', () => {
    expect(formatRelativeTime(Date.now() - 2 * 3600_000)).toBe('2 小时前')
  })

  it('天级', () => {
    expect(formatRelativeTime(Date.now() - 3 * 86_400_000)).toBe('3 天前')
  })

  it('超过 7 天回落到日期格式', () => {
    const ms = Date.now() - 10 * 86_400_000
    expect(formatRelativeTime(ms)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
