import type { ProjectSummary, IndexProgress } from '../../../shared/types'
import { basename, formatRelativeTime } from '../hooks/useApi'
import { ThemeSwitcher } from './ThemeSwitcher'

interface Props {
  projects: ProjectSummary[]
  activeProjectDir: string | null
  onSelect: (projectDir: string | null) => void
  progress: IndexProgress | null
  onReindex: () => void
  showHidden: boolean
  onToggleShowHidden: (v: boolean) => void
}

export function ProjectSidebar({
  projects,
  activeProjectDir,
  onSelect,
  progress,
  onReindex,
  showHidden,
  onToggleShowHidden
}: Props): JSX.Element {
  const totalSessions = projects.reduce((s, p) => s + p.sessionCount, 0)
  const indexing = progress != null && !progress.finished

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="logo">Claude 会话历史</span>
        <button
          className="icon-btn"
          title="重新索引"
          onClick={onReindex}
          disabled={indexing}
        >
          ⟳
        </button>
      </div>

      {progress && (
        <div className="index-status">
          {indexing
            ? `索引中… ${progress.done}/${progress.total}`
            : `已索引 ${progress.total} 个会话文件`}
        </div>
      )}

      <ul className="project-list">
        <li
          className={`project-item ${activeProjectDir === null ? 'active' : ''}`}
          onClick={() => onSelect(null)}
        >
          <span className="project-name">全部项目</span>
          <span className="badge">{totalSessions}</span>
        </li>
        {projects.map((p) => (
          <li
            key={p.projectDir}
            className={`project-item ${activeProjectDir === p.projectDir ? 'active' : ''}`}
            onClick={() => onSelect(p.projectDir)}
            title={p.projectPath}
          >
            <span className="project-meta">
              <span className="project-name">{basename(p.projectPath)}</span>
              <span className="project-path">{p.projectPath}</span>
              <span className="project-time">{formatRelativeTime(p.lastActivity)}</span>
            </span>
            <span className="badge">{p.sessionCount}</span>
          </li>
        ))}
      </ul>

      <label className="show-hidden">
        <span className="sh-label">显示已隐藏</span>
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(e) => onToggleShowHidden(e.target.checked)}
        />
        <span className="sh-track">
          <span className="sh-thumb" />
        </span>
      </label>

      <ThemeSwitcher />
    </aside>
  )
}
