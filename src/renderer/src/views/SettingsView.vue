<script setup>
import { ref, computed, onMounted } from 'vue'
import Versions from '../components/Versions.vue'
import { getSavedTheme, applyTheme } from '../composables/theme'
import { player, setVolume, setRepeat, setAutoOpenPlayer } from '../composables/player'
import { loadRecent } from '../composables/recent'

const theme = ref(getSavedTheme())
const volume = computed({
  get: () => Math.round(player.volume * 100),
  set: (v) => setVolume(Number(v) / 100)
})
const repeatMode = ref(player.repeat)
const autoOpen = ref(false)
const autoStart = ref(false)
const downloadDir = ref('')
const clearMessage = ref('')

function onThemeChange(e) {
  theme.value = e.target.value
  applyTheme(theme.value)
}

function onRepeatChange(e) {
  repeatMode.value = e.target.value
  setRepeat(repeatMode.value)
}

function onAutoOpenChange(e) {
  autoOpen.value = e.target.value === '1'
  setAutoOpenPlayer(autoOpen.value)
}

function onAutoStartChange(e) {
  autoStart.value = e.target.value === '1'
  window.api.settings.set({ autoStart: autoStart.value }).catch(() => {})
}

async function pickDownloadDir() {
  const res = await window.api.dialog.pickDirectory('选择下载保存目录')
  if (!res?.ok || res.canceled || !res.path) return
  downloadDir.value = res.path
  window.api.settings.set({ downloadDir: res.path }).catch(() => {})
}

async function clearHistory() {
  clearMessage.value = ''
  const res = await window.api.history.clear().catch(() => null)
  if (res?.ok) {
    await loadRecent()
    clearMessage.value = '播放记录已清除'
    setTimeout(() => {
      clearMessage.value = ''
    }, 2500)
  } else {
    clearMessage.value = res?.error || '清除失败'
  }
}

onMounted(async () => {
  const res = await window.api.settings.get().catch(() => null)
  if (res?.ok) {
    autoStart.value = !!res.data.autoStart
    autoOpen.value = !!res.data.autoOpenPlayer
    downloadDir.value = res.data.downloadDir || ''
    if (['off', 'all', 'one'].includes(res.data.repeatMode)) repeatMode.value = res.data.repeatMode
  }
})
</script>

<template>
  <div class="view">
    <h1>设置</h1>
    <p class="muted">应用偏好将保存在本地配置文件</p>

    <div class="col" style="gap: 14px; max-width: 620px">
      <section class="card col" style="gap: 12px">
        <h2>常规</h2>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>主题</span>
            <span class="muted">界面配色方案</span>
          </div>
          <select class="control" :value="theme" @change="onThemeChange">
            <option value="dark">深色</option>
            <option value="light">浅色</option>
            <option value="system">跟随系统</option>
          </select>
        </div>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>开机自动运行</span>
            <span class="muted">登录 Windows 后自动启动</span>
          </div>
          <select class="control" :value="autoStart ? '1' : '0'" @change="onAutoStartChange">
            <option value="0">关闭</option>
            <option value="1">开启</option>
          </select>
        </div>
      </section>

      <section class="card col" style="gap: 12px">
        <h2>播放</h2>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>默认音量</span>
            <span class="muted">启动时恢复该音量</span>
          </div>
          <div class="row" style="gap: 8px">
            <input
              v-model.number="volume"
              type="range"
              min="0"
              max="100"
              :style="{ width: '140px', '--fill': `${volume}%` }"
            />
            <span class="num" style="width: 34px; text-align: right">{{ volume }}%</span>
          </div>
        </div>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>循环模式</span>
            <span class="muted">列表播完后的行为</span>
          </div>
          <select class="control" :value="repeatMode" @change="onRepeatChange">
            <option value="off">顺序播放</option>
            <option value="all">列表循环</option>
            <option value="one">单曲循环</option>
          </select>
        </div>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>播放时自动展开</span>
            <span class="muted">播放新歌时自动打开播放页</span>
          </div>
          <select class="control" :value="autoOpen ? '1' : '0'" @change="onAutoOpenChange">
            <option value="0">关闭</option>
            <option value="1">开启</option>
          </select>
        </div>
      </section>

      <section class="card col" style="gap: 12px">
        <h2>存储</h2>

        <div class="row between item">
          <div class="col" style="gap: 2px; min-width: 0">
            <span>下载目录</span>
            <span class="muted truncate">
              {{ downloadDir || '默认保存到系统「音乐」文件夹' }}
            </span>
          </div>
          <button class="btn" style="flex-shrink: 0" @click="pickDownloadDir">更改</button>
        </div>

        <div class="row between item">
          <div class="col" style="gap: 2px">
            <span>清除播放记录</span>
            <span class="muted">清空「最近播放」的全部历史</span>
          </div>
          <div class="row" style="gap: 8px">
            <span v-if="clearMessage" class="muted small">{{ clearMessage }}</span>
            <button class="btn" @click="clearHistory">清除</button>
          </div>
        </div>
      </section>

      <section class="card">
        <Versions />
      </section>
    </div>
  </div>
</template>

<style scoped>
.control { width: 160px; flex-shrink: 0; }
.item {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}
.num { font-variant-numeric: tabular-nums; color: var(--text-3); }
.small { font-size: 12px; }
</style>
