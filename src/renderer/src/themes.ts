// 内置主题定义与持久化。主题的实际配色在 styles.css 的 [data-theme] 中,
// 这里只保留切换器需要的元数据(名称、明暗、预览三色)与读写逻辑。

export interface ThemeMeta {
  key: string
  name: string
  mode: 'dark' | 'light'
  /** 预览三色:[背景, accent, accent-2] */
  swatch: [string, string, string]
}

export const THEMES: ThemeMeta[] = [
  { key: 'obsidian', name: '黑曜', mode: 'dark', swatch: ['#14161c', '#4dd0e1', '#7c9cff'] },
  { key: 'nocturne', name: '夜曲', mode: 'dark', swatch: ['#16131f', '#b794f6', '#f687b3'] },
  { key: 'phosphor', name: '磷光', mode: 'dark', swatch: ['#0a0e0a', '#ffb347', '#5ef08a'] },
  { key: 'paper', name: '纸墨', mode: 'light', swatch: ['#faf8f2', '#b3432f', '#2f6b5d'] },
  { key: 'sepia', name: '羊皮', mode: 'light', swatch: ['#f3ead8', '#a0612f', '#56753f'] }
]

export const DEFAULT_THEME = 'obsidian'

const STORAGE_KEY = 'csh-theme'

export function isValidTheme(key: string): boolean {
  return THEMES.some((t) => t.key === key)
}

/** 读取已保存主题;无效或读取失败时回退默认 */
export function getStoredTheme(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && isValidTheme(v)) return v
  } catch {
    // localStorage 不可用时静默回退
  }
  return DEFAULT_THEME
}

export function storeTheme(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch {
    // 忽略写入失败
  }
}

/** 把主题应用到 <html> 的 data-theme 属性 */
export function applyTheme(key: string): void {
  document.documentElement.setAttribute('data-theme', key)
}

/** 启动时同步应用已保存主题(在 React 渲染前调用,避免首屏闪烁) */
export function applyStoredTheme(): void {
  applyTheme(getStoredTheme())
}
