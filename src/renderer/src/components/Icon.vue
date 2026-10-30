<script setup>
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
  // 媒体控制图标用实心填充，更接近原生播放器的观感
  filled: { type: Boolean, default: false }
})

// 24x24 线性图标路径，统一 stroke 风格，贴近原生软件
const paths = {
  discover: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0 M21 21l-4.35-4.35',
  library: 'M9 18V5l12-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  charts: 'M5 21V8 M12 21V3 M19 21v-9',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  search: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0 M21 21l-4.35-4.35',
  // 播放三角略偏右，视觉重心才落在圆形按钮中心
  play: 'M7 4.5l12 7.5-12 7.5z',
  pause: 'M8 4h3v16H8z M13 4h3v16h-3z',
  prev: 'M19 20L9 12l10-8z M5 4h2.4v16H5z',
  next: 'M5 4l10 8-10 8z M16.6 4H19v16h-2.4z',
  volume: 'M11 5L6 9H2v6h4l5 4z M15.5 8.5a5 5 0 0 1 0 7',
  mute: 'M11 5L6 9H2v6h4l5 4z M22 9l-5 5 M17 9l5 5',
  down: 'M6 9l6 6 6-6',
  download: 'M12 3v12 M8 11l4 4 4-4 M5 20h14',
  link: 'M10.6 13.4a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1.1 1.1 M13.4 10.6a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1.1-1.1',
  music: 'M9 18V5l12-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  close: 'M18 6L6 18 M6 6l12 12',
  trash: 'M4 7h16 M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13',
  hot: 'M12 22a7 7 0 0 0 7-7c0-5-4-7-7-13-3 6-7 8-7 13a7 7 0 0 0 7 7z M12 22a3 3 0 0 0 3-3c0-2-3-4-3-4s-3 2-3 4a3 3 0 0 0 3 3z',
  back: 'M15 18l-6-6 6-6',
  forward: 'M9 18l6-6-6-6',
  refresh: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8 M21 3v5h-5',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-5 M12 8h.01',
  menu: 'M3 12h18 M3 6h18 M3 18h18'
}
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="filled ? 'currentColor' : 'none'"
    :stroke="filled ? 'none' : 'currentColor'"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    shape-rendering="geometricPrecision"
    aria-hidden="true"
  >
    <path :d="paths[name]" />
  </svg>
</template>
