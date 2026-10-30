<script setup>
import { ref, onMounted } from 'vue'
import Icon from '../components/Icon.vue'

const emit = defineEmits(['play', 'play-list'])

const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const list = ref([])
const page = ref(1)
const hasNext = ref(false)
const totalPages = ref(1)
let seq = 0

async function run(target = 1, append = false) {
  const id = ++seq
  if (append) loadingMore.value = true
  else {
    loading.value = true
    error.value = ''
    list.value = []
  }
  try {
    const res = await window.api.search.hotMusic(target)
    if (id !== seq) return
    if (!res?.ok) {
      error.value = res?.error || '加载热门推荐失败'
      return
    }
    const data = res.data || {}
    const items = Array.isArray(data.list) ? data.list : []
    list.value = append ? [...list.value, ...items] : items
    page.value = data.current || target
    hasNext.value = !!data.hasNext
    totalPages.value = data.total || 1
  } catch (e) {
    if (id === seq) error.value = e?.message || '加载热门推荐失败'
  } finally {
    if (id === seq) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function loadMore() {
  if (loadingMore.value || !hasNext.value) return
  run(page.value + 1, true)
}

onMounted(() => run(1, false))
</script>

<template>
  <div class="view">
    <h1>热门推荐</h1>
    <p class="muted">
      {{ list.length ? `第 ${page} / ${totalPages} 页 · 共 ${list.length} 首` : '为你精选的站内热门曲目' }}
    </p>

    <!-- 加载 -->
    <div v-if="loading" class="table">
      <div class="table-head" style="grid-template-columns: 28px 3fr 2fr 64px 72px">
        <span class="num">#</span>
        <span>标题</span>
        <span>艺术家</span>
        <span class="num" style="text-align: right">时长</span>
        <span class="num" style="text-align: right">操作</span>
      </div>
      <div v-for="i in 8" :key="i" class="table-row" style="grid-template-columns: 28px 3fr 2fr 64px 72px">
        <span class="num">{{ i }}</span>
        <span class="skeleton" style="height: 12px; width: 60%"></span>
        <span class="skeleton" style="height: 12px; width: 40%"></span>
        <span class="skeleton" style="height: 12px; width: 36px; justify-self: end"></span>
        <span class="skeleton" style="height: 12px; width: 40px; justify-self: end"></span>
      </div>
    </div>

    <!-- 失败 -->
    <div v-else-if="error" class="card state">
      <Icon name="close" :size="18" />
      <div>
        <p class="state-title">加载失败</p>
        <p class="muted">{{ error }}</p>
      </div>
      <button class="btn btn-primary" @click="run">重试</button>
    </div>

    <!-- 空 -->
    <div v-else-if="!list.length" class="empty muted">
      <Icon name="hot" :size="30" />
      <p>暂时没有热门推荐数据。</p>
    </div>

    <!-- 列表 -->
    <div v-else class="list-wrap">
      <div class="table">
      <div class="table-head" style="grid-template-columns: 28px 3fr 2fr 64px 72px">
        <span class="num">#</span>
        <span>标题</span>
        <span>艺术家</span>
        <span class="num" style="text-align: right">时长</span>
        <span class="num" style="text-align: right">操作</span>
      </div>
      <div
        v-for="(song, i) in list"
        :key="`${song.id ?? i}-${song.title}`"
        class="table-row song-row"
        style="grid-template-columns: 28px 3fr 2fr 64px 72px"
        :title="`${song.title}${song.artist ? ' - ' + song.artist : ''}（点击播放）`"
        @click="emit('play-list', { list, index: i })"
      >
        <span class="num">
          <span class="row-index">{{ i + 1 }}</span>
          <Icon class="row-play" name="play" :size="10" />
        </span>
        <span class="truncate">{{ song.title }}</span>
        <span class="truncate muted">{{ song.artist || '-' }}</span>
        <span class="num" style="text-align: right">—</span>
        <span class="row-action">
          <button class="btn play-btn" @click.stop="emit('play-list', { list, index: i })">
            <Icon name="play" :size="10" />
            播放
          </button>
        </span>
      </div>
      </div>
      <div class="pager">
        <button v-if="hasNext" class="btn load-more" :disabled="loadingMore" @click="loadMore">
          <Icon name="refresh" :size="14" :class="{ spin: loadingMore }" />
          <span>加载更多</span>
        </button>
        <span v-else class="muted small">已经到底了 · 共 {{ totalPages }} 页</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 64px 16px;
  text-align: center;
}
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

.list-wrap { display: flex; flex-direction: column; gap: 14px; }
.pager { display: flex; justify-content: center; align-items: center; min-height: 40px; }
.load-more {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  border: 1px solid var(--border);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--t), color var(--t), opacity var(--t);
}
.load-more:hover { background: var(--surface-hover); color: var(--text); }
.load-more:disabled { opacity: 0.6; cursor: default; }
.small { font-size: 12px; }
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.row-action { display: flex; justify-content: flex-end; }
.row-action .play-btn {
  padding: 2px 8px;
  font-size: 12px;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--t), background var(--t);
}
.song-row:hover .row-action .play-btn { opacity: 1; }
</style>
