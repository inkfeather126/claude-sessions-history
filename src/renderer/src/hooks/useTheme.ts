import { useCallback, useState } from 'react'
import { getStoredTheme, applyTheme, storeTheme } from '../themes'

interface UseTheme {
  theme: string
  setTheme: (key: string) => void
}

/** 主题状态:读初始值、切换时应用到 DOM 并持久化 */
export function useTheme(): UseTheme {
  const [theme, setThemeState] = useState<string>(getStoredTheme)

  const setTheme = useCallback((key: string): void => {
    setThemeState(key)
    applyTheme(key)
    storeTheme(key)
  }, [])

  return { theme, setTheme }
}
