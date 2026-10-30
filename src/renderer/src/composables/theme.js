const KEY = 'app:theme'

export function getSavedTheme() {
  return localStorage.getItem(KEY) || 'dark'
}

function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function isDarkTheme(theme) {
  return theme === 'dark' || (theme === 'system' && prefersDark())
}

/**
 * 应用主题：切换 html.theme-light 类（驱动 CSS 变量），
 * 并通知主进程同步 nativeTheme（窗口底色、原生控件跟随）。
 */
export function applyTheme(theme) {
  localStorage.setItem(KEY, theme)
  document.documentElement.classList.toggle('theme-light', !isDarkTheme(theme))
  window.api?.theme?.setNative?.(theme)
}

/** 应用启动时调用：恢复上次主题并监听系统主题变化 */
export function initTheme() {
  applyTheme(getSavedTheme())
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (getSavedTheme() === 'system') applyTheme('system')
    })
}
