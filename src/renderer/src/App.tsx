import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  ProjectSummary,
  SessionSummary,
  SearchHit,
  SessionDetail,
  IndexProgress
} from '../../shared/types'
import { ProjectSidebar } from './components/ProjectSidebar'
import { SessionList } from './components/SessionList'
import { SearchBar } from './components/SearchBar'
import { ConversationView } from './components/ConversationView'
import { RenameDialog } from './components/RenameDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { useDebouncedValue } from './hooks/useApi'

export default function App(): JSX.Element {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [activeProjectDir, setActiveProjectDir] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])

  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)

  const [activeSession, setActiveSession] = useState<SessionSummary | null>(null)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [progress, setProgress] = useState<IndexProgress | null>(null)
  const [renameTarget, setRenameTarget] = useState<SessionSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    setProjects(await window.api.listProjects())
  }, [])

  const loadSessions = useCallback(
    async (projectDir: string | null, includeHidden: boolean) => {
      setSessions(await window.api.listSessions(projectDir ?? undefined, includeHidden))
    },
    []
  )

  // 启动:加载数据 + 订阅索引进度
  useEffect(() => {
    loadProjects()
    loadSessions(null, showHidden)
    const off = window.api.onIndexProgress((p) => {
      setProgress(p)
      if (p.finished) {
        loadProjects()
        loadSessions(activeProjectDir, showHidden)
      }
    })
    return off
    // 仅在挂载时订阅一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切换项目或"显示已隐藏"开关
  useEffect(() => {
    loadSessions(activeProjectDir, showHidden)
  }, [activeProjectDir, showHidden, loadSessions])

  // 搜索
  useEffect(() => {
    const q = debouncedQuery.trim()
    if (!q) {
      setSearchHits(null)
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    window.api.searchSessions(q, showHidden).then((hits) => {
      if (!cancelled) {
        setSearchHits(hits)
        setSearching(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [debouncedQuery, showHidden])

  // 加载详情
  useEffect(() => {
    if (!activeSession) {
      setDetail(null)
      return
    }
    let cancelled = false
    setLoadingDetail(true)
    window.api.getSessionDetail(activeSession.sessionId).then((d) => {
      if (!cancelled) {
        setDetail(d)
        setLoadingDetail(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeSession])

  // 中栏要展示的会话列表 + 命中信息
  const isSearchMode = searchHits !== null
  const hitMap = useMemo(() => {
    const m = new Map<string, SearchHit>()
    if (searchHits) for (const h of searchHits) m.set(h.session.sessionId, h)
    return m
  }, [searchHits])
  const listItems: SessionSummary[] = isSearchMode
    ? (searchHits as SearchHit[]).map((h) => h.session)
    : sessions

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }, [])

  const handleResume = useCallback(
    async (s: SessionSummary) => {
      const r = await window.api.resumeSession(s.sessionId)
      showToast(
        r.mode === 'launched'
          ? '已在终端打开 claude --resume'
          : '已复制恢复命令到剪贴板'
      )
    },
    [showToast]
  )

  const handleRenamed = useCallback(
    (updated: SessionSummary) => {
      setRenameTarget(null)
      // 同步更新各处的该会话
      setSessions((prev) =>
        prev.map((x) => (x.sessionId === updated.sessionId ? updated : x))
      )
      setSearchHits((prev) =>
        prev
          ? prev.map((h) =>
              h.session.sessionId === updated.sessionId
                ? { ...h, session: updated }
                : h
            )
          : prev
      )
      if (activeSession?.sessionId === updated.sessionId) setActiveSession(updated)
      showToast('已重命名')
    },
    [activeSession, showToast]
  )

  const handleToggleHidden = useCallback(
    async (s: SessionSummary) => {
      const updated = await window.api.hideSession(s.sessionId, !s.hidden)
      await loadSessions(activeProjectDir, showHidden)
      if (activeSession?.sessionId === s.sessionId) setActiveSession(updated)
      setSearchHits((prev) =>
        prev
          ? prev.map((h) =>
              h.session.sessionId === updated.sessionId ? { ...h, session: updated } : h
            )
          : prev
      )
      showToast(updated.hidden ? '已隐藏' : '已取消隐藏')
    },
    [activeProjectDir, showHidden, activeSession, loadSessions, showToast]
  )

  const handleDeleteConfirmed = useCallback(async () => {
    const s = deleteTarget
    if (!s) return
    const r = await window.api.deleteSession(s.sessionId)
    setDeleteTarget(null)
    if (!r.trashed) {
      showToast('删除失败')
      return
    }
    if (activeSession?.sessionId === s.sessionId) {
      setActiveSession(null)
      setDetail(null)
    }
    setSearchHits((prev) =>
      prev ? prev.filter((h) => h.session.sessionId !== s.sessionId) : prev
    )
    await loadProjects()
    await loadSessions(activeProjectDir, showHidden)
    showToast('已移入废纸篓')
  }, [deleteTarget, activeSession, activeProjectDir, showHidden, loadProjects, loadSessions, showToast])

  const refreshDetail = useCallback(async (sessionId: string) => {
    const d = await window.api.getSessionDetail(sessionId)
    setDetail(d)
  }, [])

  const handleDeleteMessage = useCallback(
    async (uuid: string) => {
      if (!activeSession) return
      try {
        const r = await window.api.deleteMessage(activeSession.sessionId, uuid)
        if (!r.ok) {
          showToast('移除失败:未找到该消息')
          return
        }
        await refreshDetail(activeSession.sessionId)
        showToast('已移除该消息 · 原文已备份,可恢复')
      } catch (err) {
        showToast('移除出错:' + (err instanceof Error ? err.message : String(err)))
      }
    },
    [activeSession, refreshDetail, showToast]
  )

  const handleRestoreMessage = useCallback(
    async (uuid: string) => {
      if (!activeSession) return
      try {
        const r = await window.api.restoreMessage(activeSession.sessionId, uuid)
        if (!r.ok) {
          showToast('恢复失败:归档中无此消息')
          return
        }
        await refreshDetail(activeSession.sessionId)
        showToast('已恢复该消息')
      } catch (err) {
        showToast('恢复出错:' + (err instanceof Error ? err.message : String(err)))
      }
    },
    [activeSession, refreshDetail, showToast]
  )

  const handleReindex = useCallback(async () => {
    await window.api.reindex()
    await loadProjects()
    await loadSessions(activeProjectDir, showHidden)
  }, [loadProjects, loadSessions, activeProjectDir, showHidden])

  return (
    <div className="app">
      <ProjectSidebar
        projects={projects}
        activeProjectDir={activeProjectDir}
        onSelect={setActiveProjectDir}
        progress={progress}
        onReindex={handleReindex}
        showHidden={showHidden}
        onToggleShowHidden={setShowHidden}
      />
      <div className="middle">
        <SearchBar value={query} onChange={setQuery} searching={searching} />
        <SessionList
          items={listItems}
          hitMap={isSearchMode ? hitMap : undefined}
          activeSessionId={activeSession?.sessionId ?? null}
          onSelect={setActiveSession}
          emptyHint={
            isSearchMode ? '没有匹配的会话' : '该项目暂无会话'
          }
        />
      </div>
      <ConversationView
        session={activeSession}
        detail={detail}
        loading={loadingDetail}
        onRename={() => activeSession && setRenameTarget(activeSession)}
        onResume={() => activeSession && handleResume(activeSession)}
        onToggleHidden={() => activeSession && handleToggleHidden(activeSession)}
        onDelete={() => activeSession && setDeleteTarget(activeSession)}
        onDeleteMessage={handleDeleteMessage}
        onRestoreMessage={handleRestoreMessage}
      />
      {renameTarget && (
        <RenameDialog
          session={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRenamed={handleRenamed}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="删除会话"
          message={`将「${deleteTarget.title}」的原始记录移入系统废纸篓(可从废纸篓恢复),并从索引中移除。此操作不影响其它会话。`}
          confirmLabel="移入废纸篓"
          onConfirm={handleDeleteConfirmed}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
