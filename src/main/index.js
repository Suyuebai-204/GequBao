import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

function getWindow() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    show: false,
    frame: false, // 使用自绘标题栏，Windows 桌面软件常用样式
    backgroundColor: '#1b1b23',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 窗口最大化状态变化时通知渲染进程刷新 UI
  mainWindow.on('maximize', () => sendWindowState(mainWindow, true))
  mainWindow.on('unmaximize', () => sendWindowState(mainWindow, false))

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function sendWindowState(win, maximized) {
  if (!win.isDestroyed()) {
    win.webContents.send('window:state-changed', { maximized })
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.example.vuewindowsapp')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerWindowIpc()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function registerWindowIpc() {
  ipcMain.on('window:minimize', () => getWindow()?.minimize())

  ipcMain.on('window:toggle-maximize', () => {
    const win = getWindow()
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })

  ipcMain.on('window:close', () => getWindow()?.close())

  ipcMain.handle('window:state', () => {
    const win = getWindow()
    return { maximized: !!win?.isMaximized() }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
