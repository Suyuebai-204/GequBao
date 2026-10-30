<script setup>
import { computed, ref, onMounted } from 'vue'
import Icon from '../components/Icon.vue'

const emit = defineEmits(['play-list'])

const dir = ref('')
const list = ref([])
const totalSizeText = ref('')
const loading = ref(false)
const scanning = ref(false)
const error = ref('')
const filter = ref('')
let seq = 0

const filtered = computed(() => {
  const kw = filter.value.trim().toLowerCase()
  if (!kw) return list.value
  return list.value.filter(
    (item) =>
      item.title?.toLowerCase().includes(kw) ||
      item.artist?.toLowerCase().includes(kw) ||
      item.album?.toLowerCase().includes(kw)
  )
})

async function scan(target) {
  const id = ++seq
  loading.value = true
  error.value = ''
  try {
    const res = await window.api.library.scan(target)
    if (id !== seq) return
    if (!res?.ok) {
      error.value = res?.error || '扫描失败'
      list.value = []
      return
    }
    dir.value = res.data.dir
    list.value = res.data.list || []
    totalSizeText.value = res.data.totalSizeText || ''
  } catch (e) {
    if (id === seq) error.value = e?.message || '扫描失败'
  } finally {
    if (id === seq) loading.value = false
  }
}

async function pickFolder() {
  const res = await window.api.dialog.pickDirectory('选择音乐文件夹')
  if (!res?.ok || res.canceled || !res.path) return
  dir.value = res.path
  window.api.settings.set({ libraryDir: res.path }).catch(() => {})
  scanning.value = true
  await scan(res.path)
  scanning.value = false
}

onMounted(async () => {
  const res = await window.api?.settings?.get?.().catch?.(() => null)
  if (res?.ok && res.data?.libraryDir) {
    dir.value = res.data.libraryDir
    scan(res.data.libraryDir)
  }
})
</script>

<template>
  <div class="view">
    <h1>本地音乐</h1>
    <p class="muted">
      <template v-if="dir">{{ dir }} · {{ list.length }} 个文件 · 共 {{ totalSizeText }}</template>
      <template v-else>选择一个文件夹，扫描其中的音频文件（支持 mp3 / flac / wav / m4a 等）</template>
    </p>

    <div class="row" style="margin-bottom: 12px">
      <input v-model="filter" class="filter" placeholder="筛选标题 / 歌手 / 专辑" />
      <button class="btn btn-primary" :disabled="scanning" @click="pickFolder">
        {{ dir ? '更换文件夹' : '选择文件夹' }}
      </button>
    </div>

    <!-- 加载中：骨架行 -->
    <div v-if="loading" class="table">
      <div class="table-head" style="grid-template-columns: 28px 3fr 2fr 56px 80px 110px">
        <span class="num">#</span>
        <span>文件名</span>
        <span>艺术家</span>
        <span class="num">年份</span>
        <span class="num">大小</span>
        <span>编码</span>
      </div>
      <div
        v-for="i in 8"
        :key="i"
        class="skeleton skel-row"
        style="grid-template-columns: 28px 3fr 2fr 56px 80px 110px"
      ></div>
    </div>

    <!-- 失败 -->
    <div v-else-if="error" class="card state">
      <Icon name="close" :size="18" />
      <div>
        <p class="state-title">扫描失败</p>
        <p class="muted">{{ error }}</p>
      </div>
      <button class="btn btn-primary" @click="scan(dir)">重试</button>
    </div>

    <!-- 未选择目录 -->
    <div v-else-if="!dir" class="empty muted">
      <Icon name="library" :size="30" />
      <p>还没有选择音乐文件夹。</p>
      <button class="btn btn-primary" @click="pickFolder">选择文件夹</button>
    </div>

    <!-- 目录为空 / 筛选无结果 -->
    <div v-else-if="!filtered.length" class="empty muted">
      <Icon name="music" :size="30" />
      <p>{{ list.length ? '没有匹配的曲目。' : '该文件夹下没有找到音频文件。' }}</p>
    </div>

    <!-- 列表：点击行播放（整张表作为队列，可上下曲） -->
    <div v-else class="table">
      <div class="table-head" style="grid-template-columns: 28px 3fr 2fr 56px 80px 110px">
        <span class="num">#</span>
        <span>文件名</span>
        <span>艺术家</span>
        <span class="num">年份</span>
        <span class="num">大小</span>
        <span>编码</span>
      </div>
      <div
        v-for="(song, i) in filtered"
        :key="song.path"
        class="table-row song-row"
        style="grid-template-columns: 28px 3fr 2fr 56px 80px 110px"
        :title="`${song.title}${song.artist ? ' - ' + song.artist : ''}（点击播放）`"
        @click="emit('play-list', { list: filtered, index: i, local: true })"
      >
        <span class="num">
          <span class="row-index">{{ i + 1 }}</span>
          <Icon class="row-play" name="play" :size="10" />
        </span>
        <span class="truncate">
          {{ song.title }}
          <span v-if="song.album" class="muted small">· {{ song.album }}</span>
        </span>
        <span class="truncate muted">{{ song.artist || '-' }}</span>
        <span class="num">{{ song.year || '—' }}</span>
        <span class="num">{{ song.sizeText }}</span>
        <span class="muted">{{ song.format }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter { max-width: 240px; }
.empty { gap: 12px; }
.state {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-3);
}
.state .btn { margin-left: auto; }
.state-title { color: var(--text); font-size: 14px; font-weight: 600; }

.song-row { cursor: pointer; }
.row-play { display: none; color: var(--accent); }
.song-row:hover .row-index { display: none; }
.song-row:hover .row-play { display: inline-block; }

.small { font-size: 12px; }
.skel-row { height: 36px; margin: 2px 0; }
</style>
