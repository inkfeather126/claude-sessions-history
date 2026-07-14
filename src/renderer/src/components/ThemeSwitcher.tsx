import type { CSSProperties } from 'react'
import { THEMES } from '../themes'
import { useTheme } from '../hooks/useTheme'

export function ThemeSwitcher(): JSX.Element {
  const { theme, setTheme } = useTheme()
  const current = THEMES.find((t) => t.key === theme)

  return (
    <div className="theme-switcher">
      <div className="theme-label">
        <span>主题</span>
        <span className="theme-current">{current?.name}</span>
      </div>
      <div className="theme-swatches">
        {THEMES.map((t) => (
          <button
            key={t.key}
            className={`theme-swatch ${theme === t.key ? 'active' : ''}`}
            title={`${t.name}（${t.mode === 'dark' ? '深色' : '浅色'}）`}
            aria-label={t.name}
            onClick={() => setTheme(t.key)}
            style={
              {
                '--s-bg': t.swatch[0],
                '--s-a': t.swatch[1],
                '--s-b': t.swatch[2]
              } as CSSProperties
            }
          >
            <span className="sw-a" />
            <span className="sw-b" />
          </button>
        ))}
      </div>
    </div>
  )
}
