import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  theme: {
    setNative: (theme) => ipcRenderer.send('theme:set', theme)
  },
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    add: (entry) => ipcRenderer.invoke('history:add', entry),
    remove: (id) => ipcRenderer.invoke('history:remove', id),
    clear: () => ipcRenderer.invoke('history:clear')
  },
  search: {
    suggest: (keyword) => ipcRenderer.invoke('search:suggest', keyword),
    songs: (keyword) => ipcRenderer.invoke('search:songs', keyword),
    guess: (keyword) => ipcRenderer.invoke('search:guess', keyword),
    hot: () => ipcRenderer.invoke('search:hot'),
    hotMusic: (page) => ipcRenderer.invoke('search:hot-music', page),
    top: (type, page) => ipcRenderer.invoke('search:top', type, page)
  },
  player: {
    song: (musicId) => ipcRenderer.invoke('player:song', musicId),
    refreshUrl: (payload) => ipcRenderer.invoke('player:refresh-url', payload),
    download: (payload) => ipcRenderer.invoke('player:download', payload),
    onDownloadProgress: (callback) => {
      const listener = (_event, progress) => callback(progress)
      ipcRenderer.on('player:download-progress', listener)
      return () => ipcRenderer.removeListener('player:download-progress', listener)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch)
  },
  library: {
    scan: (dir) => ipcRenderer.invoke('library:scan', dir)
  },
  dialog: {
    pickDirectory: (title) => ipcRenderer.invoke('dialog:pick-directory', title)
  },
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    state: () => ipcRenderer.invoke('window:state'),
    onStateChanged: (callback) => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('window:state-changed', listener)
      return () => ipcRenderer.removeListener('window:state-changed', listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
