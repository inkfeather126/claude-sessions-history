import { useEffect, useState } from 'react'

/** 防抖值:输入停止 delay 毫秒后才更新返回值 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/** 相对时间(几分钟前 / 几小时前 / 日期) */
export function formatRelativeTime(ms: number): string {
  if (!ms) return '—'
  const diff = Date.now() - ms
  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return formatDate(ms)
}

/** 年-月-日 */
export function formatDate(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 年-月-日 时:分 */
export function formatDateTime(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${formatDate(ms)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 从绝对路径取最后一段作为项目短名 */
export function basename(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || path
}
