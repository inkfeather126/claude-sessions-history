import type { ClaudeSessionsApi } from '../shared/types'

declare global {
  interface Window {
    api: ClaudeSessionsApi
  }
}

export {}
