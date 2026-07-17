import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpc, sendProgress } from './ipc'
import { runIndex } from './indexer'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 970,
    minHeight: 560,
    title: 'Claude 会话历史',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // electron-vite 注入的开发服务器地址;生产加载打包后的 html
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    // 开发模式自动打开 DevTools(独立窗口,不挤压应用布局)供审查
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 窗口就绪后在后台启动增量索引,通过 IPC 向渲染层报告进度
  mainWindow.webContents.once('did-finish-load', () => {
    runIndex((p) => {
      if (mainWindow) sendProgress(mainWindow.webContents, p)
    }).catch((err) => {
      console.error('索引失败:', err)
    })
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
