<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import {
  activeLyricIndex,
  close,
  download,
  formatTime,
  next,
  open,
  player,
  prev,
  progress,
  retry,
  seek,
  setVolume,
  toggle,
  toggleMute
} from '../composables/player'

// 站点启用人机验证时，引导用户到原页面播放
function openInBrowser() {
  const id = player.song?.id
  if (!id) return
  window.api?.openExternal(`https://www.gequbao.com/music/${id}`)
}

const sheetEl = ref(null)
const barEl = ref(null)
const lyricBox = ref(null)

const dragY = ref(0)
const dragging = ref(false)
const seeking = ref(false)

let startY = 0

const lrc = computed(() => (Array.isArray(player.song?.lrc) ? player.song.lrc : []))
const totalDuration = computed(() => player.duration || player.song?.durationSec || 0)
const percent = computed(() => `${(progress.value * 100).toFixed(3)}%`)

const sheetStyle = computed(() => ({
  transform: player.open ? `translateY(${dragY.value}px)` : 'translateY(100%)'
}))

const statusText = computed(() => {
  if (player.loading) return '正在获取播放地址…'
  if (player.error) return player.error
  if (player.source === 'fallback') return '已使用备用直链播放'
  return ''
})

const downloadLabel = computed(() => {
  const state = player.download
  if (state.active) return state.percent ? `${state.percent}%` : '下载中…'
  return state.message || '下载'
})

// 用封面做全屏背景的模糊底，缺封面时退回纯色
const backdropStyle = computed(() => {
  const cover = player.song?.cover
  return cover ? { backgroundImage: `url("${cover}")` } : {}
})

/* ============ 拖拽收起 ============ */

function onHandleDown(e) {
  if (e.button !== 0 || !player.open) return
  dragging.value = true
  startY = e.clientY
  dragY.value = 0
  window.addEventListener('mousemove', onHandleMove)
  window.addEventListener('mouseup', onHandleUp)
  e.preventDefault()
}

function onHandleMove(e) {
  if (!dragging.value) return
  dragY.value = Math.max(0, e.clientY - startY)
}

function onHandleUp() {
  window.removeEventListener('mousemove', onHandleMove)
  window.removeEventListener('mouseup', onHandleUp)
  if (!dragging.value) return
  dragging.value = false

  const threshold = Math.min(240, Math.max(90, window.innerHeight * 0.18))
  if (dragY.value > threshold) close()
  else dragY.value = 0
}

function onTransitionEnd(e) {
  if (e.target === sheetEl.value && !player.open) dragY.value = 0
}

/* ============ 进度 / 音量 ============ */

function ratioFromEvent(e) {
  const rect = barEl.value?.getBoundingClientRect()
  if (!rect || !rect.width) return 0
  return Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
}

function onBarDown(e) {
  if (!totalDuration.value) return
  seeking.value = true
  seek(ratioFromEvent(e) * totalDuration.value)
  window.addEventListener('mousemove', onBarMove)
  window.addEventListener('mouseup', onBarUp)
  e.preventDefault()
}

function onBarMove(e) {
  if (seeking.value) seek(ratioFromEvent(e) * totalDuration.value)
}

function onBarUp() {
  seeking.value = false
  window.removeEventListener('mousemove', onBarMove)
  window.removeEventListener('mouseup', onBarUp)
}

function onVolumeInput(e) {
  setVolume(e.target.value)
}

/* ============ 歌词滚动 ============ */

watch(activeLyricIndex, async (index) => {
  if (!player.open || index < 0) return
  await nextTick()
  const box = lyricBox.value
  const line = box?.children?.[index]
  if (!box || !line) return
  box.scrollTo({
    top: Math.max(0, line.offsetTop - box.clientHeight / 2 + line.offsetHeight / 2),
    behavior: 'smooth'
  })
})

/* ============ 生命周期 ============ */

function onKeydown(e) {
  if (e.key === 'Escape' && player.open) close()
}
window.addEventListener('keydown', onKeydown)

watch(
  () => player.open,
  (isOpen) => {
    document.documentElement.classList.toggle('player-open', isOpen)
  }
)

watch(
  () => player.song?.id,
  () => {
    if (lyricBox.value) lyricBox.value.scrollTop = 0
  }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousemove', onHandleMove)
  window.removeEventListener('mouseup', onHandleUp)
  window.removeEventListener('mousemove', onBarMove)
  window.removeEventListener('mouseup', onBarUp)
  document.documentElement.classList.remove('player-open')
})
</script>

<template>
  <!-- 全屏播放页 -->
  <section
    ref="sheetEl"
    class="sheet"
    :class="{ open: player.open, dragging }"
    :style="sheetStyle"
    @transitionend="onTransitionEnd"
  >
    <div class="backdrop" :style="backdropStyle"></div>
    <div class="scrim"></div>

    <!-- 顶部拖拽条 -->
    <header class="sheet-top">
      <button class="icon-btn" title="收起播放页" @click="close">
        <Icon name="down" :size="18" />
      </button>

      <div class="handle" title="按住向下拖动可收起" @mousedown="onHandleDown">
        <span class="grip"></span>
      </div>

      <span class="top-hint muted">正在播放 · 向下拖动收起</span>
    </header>

    <div class="stage">
      <!-- 左：封面 + 信息 + 控制 -->
      <div class="panel">
        <div class="cover-box">
          <img v-if="player.song?.cover" class="cover" :src="player.song.cover" alt="封面" />
          <div v-else class="cover cover-empty">
            <Icon name="music" :size="42" />
          </div>
        </div>

        <div class="meta">
          <h2 class="title truncate" :title="player.song?.title">
            {{ player.song?.title || '未在播放' }}
          </h2>
          <p class="artist truncate" :title="player.song?.artist">
            {{ player.song?.artist || '—' }}
          </p>
        </div>

        <div class="progress-row">
          <span class="time">{{ formatTime(player.currentTime) }}</span>
          <div ref="barEl" class="bar" @mousedown="onBarDown">
            <span class="bar-hit"></span>
            <span class="bar-fill" :style="{ width: percent }"></span>
            <span class="bar-knob" :style="{ left: percent }"></span>
          </div>
          <span class="time">{{ formatTime(totalDuration) }}</span>
        </div>

        <div class="btn-row">
          <!-- 走带按钮居中，音量靠右：避免 auto margin 把整组挤到左边 -->
          <div class="transport">
            <button class="ghost-btn" title="上一曲" @click="prev">
              <Icon name="prev" :size="18" filled />
            </button>
            <button class="play-btn" :title="player.playing ? '暂停' : '播放'" @click="toggle">
              <Icon :name="player.playing ? 'pause' : 'play'" :size="20" filled />
            </button>
            <button class="ghost-btn" title="下一曲" @click="next">
              <Icon name="next" :size="18" filled />
            </button>
          </div>

          <div class="volume">
            <!-- 滑块在图标左侧展开，图标位置保持不动 -->
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="player.muted ? 0 : player.volume"
              :style="{ '--fill': `${(player.muted ? 0 : player.volume) * 100}%` }"
              class="volume-range"
              @input="onVolumeInput"
            />
            <button class="ghost-btn" :title="player.muted ? '取消静音' : '静音'" @click="toggleMute">
              <Icon :name="player.muted || player.volume === 0 ? 'mute' : 'volume'" :size="16" />
            </button>
          </div>
        </div>

        <div class="status-row">
          <span v-if="statusText" class="status muted">{{ statusText }}</span>
          <button v-if="player.error" class="btn btn-subtle" @click="retry">重试</button>
          <button v-if="player.error && player.song?.id" class="btn btn-subtle" @click="openInBrowser">
            在浏览器打开
          </button>

          <!-- 直链下载 + 网盘下载并排 -->
          <button
            class="btn btn-subtle dl-btn"
            :disabled="player.download.active"
            title="保存 mp3 直链到本地"
            @click="download"
          >
            <Icon name="download" :size="14" />
            {{ downloadLabel }}
          </button>
          <a
            v-if="player.song?.netdiskUrl"
            class="btn btn-subtle"
            :href="player.song.netdiskUrl"
            target="_blank"
            rel="noreferrer"
            title="在浏览器打开网盘下载页"
          >
            <Icon name="link" :size="14" />
            网盘下载
          </a>
        </div>
      </div>

      <!-- 右：滚动歌词 -->
      <div ref="lyricBox" class="lyrics">
        <p v-if="!lrc.length" class="lyric-empty">
          {{ player.loading ? '正在加载歌词…' : '暂无歌词' }}
        </p>
        <p
          v-for="(line, i) in lrc"
          :key="`${line.time}-${i}`"
          class="lyric-line"
          :class="{ active: i === activeLyricIndex, passed: i < activeLyricIndex }"
          @click="seek(line.time)"
        >
          {{ line.text || '♪' }}
        </p>
      </div>
    </div>
  </section>

  <!-- 收起后的迷你播放条 -->
  <transition name="mini">
    <div
      v-if="player.song && !player.open"
      class="mini"
      :title="`${player.song.title} - ${player.song.artist}`"
      @click="open"
    >
      <img v-if="player.song.cover" class="mini-cover" :src="player.song.cover" alt="" />
      <div v-else class="mini-cover mini-cover-empty">
        <Icon name="music" :size="16" />
      </div>

      <div class="mini-text">
        <span class="mini-title truncate">{{ player.song.title }}</span>
        <span class="mini-artist truncate">{{ player.song.artist || '—' }}</span>
      </div>

      <button class="mini-btn" title="上一曲" @click.stop="prev">
        <Icon name="prev" :size="14" filled />
      </button>
      <button class="mini-btn mini-play" :title="player.playing ? '暂停' : '播放'" @click.stop="toggle">
        <Icon :name="player.playing ? 'pause' : 'play'" :size="14" filled />
      </button>
      <button class="mini-btn" title="下一曲" @click.stop="next">
        <Icon name="next" :size="14" filled />
      </button>

      <span class="mini-progress">
        <span class="mini-progress-fill" :style="{ width: percent }"></span>
      </span>
    </div>
  </transition>
</template>

<style scoped>
/* ============ 全屏播放页 ============ */
.sheet {
  position: fixed;
  top: var(--titlebar-h, 32px); /* 让出自绘标题栏，窗口仍可拖动/关闭 */
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--bg);
  /* 位移动画：0.3s ease-out */
  transition: transform 0.3s ease-out;
  will-change: transform;
  pointer-events: none;
}
.sheet.open { pointer-events: auto; }
.sheet.dragging { transition: none; }

/* 磨砂玻璃：封面放大模糊做底，再压一层主题色蒙版保证文字对比度 */
.backdrop {
  position: absolute;
  inset: -20%;
  background-size: cover;
  background-position: center;
  filter: var(--sheet-backdrop-filter);
  transform: scale(1.06);
  opacity: var(--sheet-backdrop-opacity);
  pointer-events: none;
}
.scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      to bottom,
      var(--sheet-vignette),
      transparent 30%,
      transparent 70%,
      var(--sheet-vignette)
    ),
    var(--bg);
  opacity: var(--sheet-scrim-opacity);
  pointer-events: none;
}

.sheet-top {
  position: relative;
  flex-shrink: 0;
  height: 46px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
}

.handle {
  flex: 1;
  height: var(--control-h);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
}
.handle:active { cursor: grabbing; }
.grip {
  width: 52px;
  height: 4px;
  border-radius: 2px;
  background: var(--border-strong);
  transition: background var(--t);
}
.handle:hover .grip { background: var(--text-3); }

.top-hint { flex-shrink: 0; font-size: 12px; }

.stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  /* 左列至少 380：走带组 126 + 音量组 120（含常驻的滑块宽度）刚好不重叠 */
  grid-template-columns: minmax(380px, 420px) minmax(0, 1fr);
  gap: 36px;
  padding: 4px 36px 26px;
}

.panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
}

.cover-box { display: flex; justify-content: center; }
.cover {
  /* 以视口高度约束，避免小窗口下封面把控制区挤出屏幕 */
  width: min(280px, 34vh);
  aspect-ratio: 1;
  border-radius: var(--radius);
  object-fit: cover;
  background: var(--surface-2);
  box-shadow: var(--shadow-2);
}
.cover-empty {
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
}

.meta { text-align: center; }
.title { font-size: 20px; font-weight: 600; }
.artist { margin-top: 4px; font-size: 13px; color: var(--text-3); }

.progress-row { display: flex; align-items: center; gap: 10px; }
.time {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
  min-width: 38px;
  text-align: center;
}
.bar {
  position: relative;
  flex: 1;
  height: 14px;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.bar-hit {
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 2px;
  background: var(--slider-track);
  transition: background var(--t);
}
.bar:hover .bar-hit { background: var(--slider-track-hover); }
.bar-fill {
  position: absolute;
  left: 0;
  height: 3px;
  border-radius: 2px;
  background: var(--accent);
}
.bar-knob {
  position: absolute;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0;
  transition: opacity var(--t), transform var(--t);
}
.bar:hover .bar-knob { opacity: 1; }

/* 走带按钮绝对居中，音量绝对靠右：互不影响，缩放/展开都不会挤动对方 */
.btn-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.ghost-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}
.ghost-btn:hover { background: var(--surface-hover); color: var(--text); }
.ghost-btn:active { background: var(--surface-active); }

.play-btn {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: var(--shadow-1);
  cursor: pointer;
  transition: background var(--t), transform var(--t);
}
.play-btn:hover { background: var(--accent-hover); }
.play-btn:active { transform: scale(0.96); }

/* 音量：平时只有图标，悬停/聚焦才展开拖动条（宽度常驻，避免布局抖动） */
.volume {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
}
.volume-range {
  width: 84px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s var(--ease);
}
.volume:hover .volume-range,
.volume:focus-within .volume-range {
  opacity: 1;
  pointer-events: auto;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 30px;
}
.status { font-size: 12px; }
.dl-btn {
  min-width: 86px;
  font-variant-numeric: tabular-nums;
}
.dl-btn:disabled { opacity: 0.7; }

.lyrics {
  min-width: 0;
  overflow: auto;
  padding: 12px 8px 12px 0;
  mask-image: linear-gradient(to bottom, transparent, #000 8%, #000 92%, transparent);
}
.lyric-line {
  margin: 0;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-3);
  cursor: pointer;
  transition: color var(--t), background var(--t), font-size var(--t);
}
.lyric-line:hover { background: var(--surface-hover); color: var(--text-2); }
.lyric-line.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-size: 17px;
  font-weight: 600;
}
.lyric-empty { font-size: 14px; color: var(--text-3); }

/* ============ 迷你播放条 ============ */
.mini {
  position: fixed;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  z-index: 40;
  width: min(580px, calc(100% - 56px));
  height: 60px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-2);
  overflow: hidden;
  cursor: pointer;
  transition: border-color var(--t), box-shadow var(--t), background var(--t);
}
.mini:hover {
  border-color: var(--text-3);
  background: var(--surface-2);
  box-shadow: var(--shadow-3);
}

.mini-cover {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: var(--surface-2);
}
.mini-cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
}

.mini-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.25;
}
.mini-title { font-size: 13px; font-weight: 600; color: var(--text); }
.mini-artist { font-size: 11px; color: var(--text-3); }

.mini-btn {
  width: var(--control-h);
  height: var(--control-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}
.mini-btn:hover { background: var(--surface-hover); color: var(--text); }
.mini-btn:active { background: var(--surface-active); }
.mini-play {
  width: var(--control-h-lg);
  height: var(--control-h-lg);
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--on-accent);
}
.mini-play:hover { background: var(--accent-hover); color: var(--on-accent); }

.mini-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: var(--surface-2);
}
.mini-progress-fill {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s linear;
}

.mini-enter-active,
.mini-leave-active { transition: opacity 0.25s ease-out, transform 0.25s ease-out; }
.mini-enter-from,
.mini-leave-to { opacity: 0; transform: translateX(-50%) translateY(16px); }
</style>
