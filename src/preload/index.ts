import { contextBridge, ipcRenderer } from 'electron'
import type {
  ProjectSummary,
  SessionSummary,
  SearchHit,
  SessionDetail,
  IndexProgress,
  ResumeResult,
  DeleteResult,
  MessageEditResult,
  ClaudeSessionsApi
} from '../shared/types'

const INDEX_PROGRESS_CHANNEL = 'index:progress'

const api: ClaudeSessionsApi = {
  listProjects: (): Promise<ProjectSummary[]> => ipcRenderer.invoke('projects:list'),
  listSessions: (projectDir?: string, includeHidden?: boolean): Promise<SessionSummary[]> =>
    ipcRenderer.invoke('sessions:list', projectDir, includeHidden),
  searchSessions: (query: string, includeHidden?: boolean): Promise<SearchHit[]> =>
    ipcRenderer.invoke('sessions:search', query, includeHidden),
  getSessionDetail: (sessionId: string): Promise<SessionDetail> =>
    ipcRenderer.invoke('sessions:detail', sessionId),
  renameSession: (sessionId: string, alias: string): Promise<SessionSummary> =>
    ipcRenderer.invoke('sessions:rename', sessionId, alias),
  hideSession: (sessionId: string, hidden: boolean): Promise<SessionSummary> =>
    ipcRenderer.invoke('sessions:hide', sessionId, hidden),
  deleteSession: (sessionId: string): Promise<DeleteResult> =>
    ipcRenderer.invoke('sessions:delete', sessionId),
  deleteMessage: (sessionId: string, uuid: string): Promise<MessageEditResult> =>
    ipcRenderer.invoke('message:delete', sessionId, uuid),
  restoreMessage: (sessionId: string, uuid: string): Promise<MessageEditResult> =>
    ipcRenderer.invoke('message:restore', sessionId, uuid),
  resumeSession: (sessionId: string): Promise<ResumeResult> =>
    ipcRenderer.invoke('sessions:resume', sessionId),
  reindex: (): Promise<IndexProgress> => ipcRenderer.invoke('index:reindex'),
  onIndexProgress: (cb: (p: IndexProgress) => void): (() => void) => {
    const listener = (_e: unknown, p: IndexProgress): void => cb(p)
    ipcRenderer.on(INDEX_PROGRESS_CHANNEL, listener)
    return () => ipcRenderer.removeListener(INDEX_PROGRESS_CHANNEL, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
