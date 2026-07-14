import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyStoredTheme } from './themes'
import './styles.css'

// 在 React 渲染前同步应用已保存主题,避免首屏闪烁
applyStoredTheme()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
