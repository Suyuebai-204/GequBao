import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, shell } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { Readable } from 'node:stream'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { suggest, searchSongs, guessMusics, hotWords, hotMusic, topMusic } from './search.js'
import { openSong, refreshPlayUrl, getPlayUrl, downloadToFile, safeFileName } from './song.js'
import { initStore, getHistory, pushHistory, removeHistory, clearHistory } from './store.js'
import { initSettings, getSettings, updateSettings } from './settings.js'
import { scanLibrary } from './library.js'

/* 本地音频播放协议：localmusic://<encodeURIComponent(绝对路径)>
 * 渲染层（http 源）不能直接播 file://，走自定义协议并手动支持 Range（flac 大文件拖动进度必需） */
const LOCAL_MIME = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.ape': 'audio/x-ape'
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'localmusic', privileges: { stream: true, supportFetchAPI: true, secure: true } }
])

async function handleLocalMusic(request) {
  const filePath = decodeURIComponent(request.url.replace(/^localmusic:\/\//i, ''))
  let info
  try {
    info = await stat(filePath)
  } catch {
    return new Response('Not Found', { status: 404 })
  }
  const contentType = LOCAL_MIME[extname(filePath).toLowerCase()] || 'application/octet-stream'
  const range = request.headers.get('range')

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    const start = m && m[1] ? Number.parseInt(m[1], 10) : 0
    const end = Math.min(m && m[2] ? Number.parseInt(m[2], 10) : info.size - 1, info.size - 1)
    if (!Number.isFinite(start) || start >= info.size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } })
    }
    return new Response(Readable.toWeb(createReadStream(filePath, { start, end })), {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${info.size}`,
        'Content-Length': String(end - start + 1)
      }
    })
  }

  return new Response(Readable.toWeb(createReadStream(filePath)), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(info.size)
    }
  })
}

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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#f9f9f9',
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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.example.vuewindowsapp')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initStore(app.getPath('userData'))
  initSettings(app.getPath('userData'))

  // 开机自启动：以设置文件里保存的状态为准
  try {
    const settings = await getSettings()
    if (app.getLoginItemSettings().openAtLogin !== !!settings.autoStart) {
      app.setLoginItemSettings({ openAtLogin: !!settings.autoStart })
    }
  } catch {
    /* 设置损坏时跳过自启动同步 */
  }

  registerWindowIpc()
  registerAppIpc()
  registerSearchIpc()
  registerPlayerIpc()
  registerHistoryIpc()
  registerSettingsIpc()
  registerLibraryIpc()

  protocol.handle('localmusic', handleLocalMusic)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function registerWindowIpc() {
  // 渲染层设置的主题同步到原生层：themeSource 影响 shouldUseDarkColors、原生对话框等
  ipcMain.on('theme:set', (_event, theme) => {
    nativeTheme.themeSource = theme === 'system' ? 'system' : theme
    const bg = nativeTheme.shouldUseDarkColors ? '#202020' : '#f9f9f9'
    for (const win of BrowserWindow.getAllWindows()) {
      win.setBackgroundColor(bg)
    }
  })

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

// 打开外部链接（如站点启用人机验证时，引导用户到原页面播放）
function registerAppIpc() {
  ipcMain.handle('app:open-external', async (_event, url) => {
    try {
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) await shell.openExternal(url)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error?.message || '打开失败' }
    }
  })
}

// 最近播放：本地 JSON 持久化，统一返回 { ok, data } | { ok, error }
function registerHistoryIpc() {
  ipcMain.handle('history:list', async () => guard(() => getHistory()))
  ipcMain.handle('history:add', async (_event, entry) => guard(() => pushHistory(entry)))
  ipcMain.handle('history:remove', async (_event, id) => guard(() => removeHistory(id)))
  ipcMain.handle('history:clear', async () => guard(() => clearHistory()))
}

// 应用设置：读写 userData/settings.json；开机自启动实时同步到系统登录项
function registerSettingsIpc() {
  ipcMain.handle('settings:get', async () => {
    const settings = await getSettings()
    return { ...settings, autoStart: app.getLoginItemSettings().openAtLogin }
  })

  ipcMain.handle('settings:set', async (_event, patch) => {
    if (patch && typeof patch !== 'object') throw new Error('无效的设置项')
    const { autoStart, ...rest } = patch || {}
    if (typeof autoStart === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: autoStart })
    }
    const settings = await updateSettings({ ...rest, ...(typeof autoStart === 'boolean' ? { autoStart } : {}) })
    return { ...settings, autoStart: app.getLoginItemSettings().openAtLogin }
  })

  // 通用目录选择对话框（缓存目录 / 本地音乐目录共用）
  ipcMain.handle('dialog:pick-directory', async (event, title) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getWindow()
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: typeof title === 'string' && title ? title : '选择文件夹',
      properties: ['openDirectory']
    })
    if (canceled || !filePaths?.length) return { ok: false, canceled: true }
    return { ok: true, canceled: false, path: filePaths[0] }
  })
}

// 本地音乐：扫描指定目录的音频文件（含元数据）
function registerLibraryIpc() {
  ipcMain.handle('library:scan', async (_event, dir) => guard(() => scanLibrary(dir)))
}

// 搜索相关：建议 / 结果 / 热词，统一返回 { ok, data } | { ok, error }
function registerSearchIpc() {
  ipcMain.handle('search:suggest', async (_event, keyword) => guard(() => suggest(keyword)))
  ipcMain.handle('search:songs', async (_event, keyword) => guard(() => searchSongs(keyword)))
  ipcMain.handle('search:guess', async (_event, keyword) => guard(() => guessMusics(keyword)))
  ipcMain.handle('search:hot', async () => guard(() => hotWords()))
  ipcMain.handle('search:hot-music', async (_event, page) => guard(() => hotMusic(page)))
  ipcMain.handle('search:top', async (_event, type, page) => guard(() => topMusic(type, page)))
}

// 播放相关：打开歌曲（详情 + 直链）/ 直链失效后重新获取
function registerPlayerIpc() {
  ipcMain.handle('player:song', async (_event, musicId) => guard(() => openSong(musicId)))
  ipcMain.handle('player:refresh-url', async (_event, payload) =>
    guard(() => refreshPlayUrl(payload?.playId, payload?.musicId, payload?.urlA))
  )

  // 直链下载：另存为对话框 + 重新取直链 + 流式写入 + 进度回传
  ipcMain.handle('player:download', async (event, payload) =>
    guard(async () => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? getWindow()
      const baseName = safeFileName(
        `${payload?.title || '音乐'}${payload?.artist ? ' - ' + payload.artist : ''}`,
        `music-${payload?.musicId || ''}`
      )

      let defaultDir
      try {
        const settings = await getSettings()
        defaultDir = settings.downloadDir || app.getPath('music')
      } catch {
        defaultDir = app.getPath('downloads')
      }

      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: '保存歌曲',
        defaultPath: join(defaultDir, `${baseName}.mp3`),
        filters: [
          { name: 'MP3 音频', extensions: ['mp3'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      if (canceled || !filePath) return { canceled: true }

      // 下载前重新取一次直链，避免用到已经过期的地址
      let url = ''
      try {
        const resolved = await getPlayUrl(payload?.playId, payload?.musicId)
        url = resolved.url
      } catch {
        /* 落到下面的兜底 */
      }
      if (!url) url = payload?.url || payload?.urlA || ''
      if (!url) throw new Error('播放地址已失效，请重新播放后再下载')

      const onProgress = (percent) => {
        if (!event.sender.isDestroyed()) event.sender.send('player:download-progress', { percent })
      }

      const { bytes } = await downloadToFile(url, filePath, onProgress)
      return { canceled: false, path: filePath, bytes }
    })
  )
}

async function guard(task) {
  try {
    return { ok: true, data: await task() }
  } catch (error) {
    return { ok: false, error: error?.message || '未知错误' }
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
