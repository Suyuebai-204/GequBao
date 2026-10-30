<script setup>
import { ref, watch, onMounted } from 'vue'
import Icon from '../components/Icon.vue'

const emit = defineEmits(['search', 'play-list'])

const tabs = [
  { type: 'week-search', label: '周搜索榜' },
  { type: 'week-download', label: '周下载榜' }
]
const active = ref('week-download')

const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const type = ref('')
const list = ref([])
const page = ref(1)
const hasNext = ref(false)
const totalPages = ref(1)
let seq = 0

async function run(t = active.value, target = 1, append = false) {
  const id = ++seq
  if (append) loadingMore.value = true
  else {
    loading.value = true
    error.value = ''
    list.value = []
    type.value = t
  }
  try {
    const res = await window.api.search.top(t, target)
    if (id !== seq) return
    if (!res?.ok) {
      error.value = res?.error || '加载排行榜失败'
      return
    }
    const data = res.data || {}
    const items = Array.isArray(data.list) ? data.list : []
    list.value = append ? [...list.value, ...items] : items
    type.value = data.type || t
    page.value = data.current || target
    hasNext.value = !!data.hasNext
    totalPages.value = data.total || 1
  } catch (e) {
    if (id === seq) error.value = e?.message || '加载排行榜失败'
  } finally {
    if (id === seq) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function loadMore() {
  if (loadingMore.value || !hasNext.value) return
  run(active.value, page.value + 1, true)
}

watch(active, (t) => run(t, 1, false))
onMounted(() => run(active.value, 1, false))
</script>

<template>
  <div class="view">
    <div class="view-head">
      <h1>排行榜</h1>
      <div class="tabs">
        <button
          v-for="t in tabs"
          :key="t.type"
          class="tab"
          :class="{ active: active === t.type }"
          @click="active = t.type"
        >
          {{ t.label }}
        </button>
      </div>
    </div>

    <p class="muted">
      <template v-if="type === 'week-search'">本周搜索热度最高的关键词</template>
      <template v-else-if="type === 'week-download'">本周下载量最高的歌曲</template>
      <template v-else>站内热门榜单</template>
      <span v-if="list.length"> · 第 {{ page }} / {{ totalPages }} 页</span>
    </p>

    <!-- 加载 -->
    <div v-if="loading" class="table">
      <div class="table-head" style="grid-template-columns: 56px 3fr 2fr 72px">
        <span class="num">排名</span>
        <span>标题</span>
        <span>艺术家</span>
        <span class="num" style="text-align: right">操作</span>
      </div>
      <div v-for="i in 8" :key="i" class="table-row" style="grid-template-columns: 56px 3fr 2fr 72px">
        <span class="skeleton" style="height: 12px; width: 28px"></span>
        <span class="skeleton" style="height: 12px; width: 60%"></span>
        <span class="skeleton" style="height: 12px; width: 40%"></span>
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
      <button class="btn btn-primary" @click="run(active, 1, false)">重试</button>
    </div>

    <!-- 空 -->
    <div v-else-if="!list.length" class="empty muted">
      <Icon name="charts" :size="30" />
      <p>暂时没有榜单数据。</p>
    </div>

    <!-- 周下载榜：歌曲，点击播放 -->
    <div v-else-if="type === 'week-download'" class="list-wrap">
      <div class="table">
      <div class="table-head" style="grid-template-columns: 56px 3fr 2fr 72px">
        <span class="num">排名</span>
        <span>标题</span>
        <span>艺术家</span>
        <span class="num" style="text-align: right">操作</span>
      </div>
      <div
        v-for="(song, i) in list"
        :key="`${song.id ?? i}-${song.title}`"
        class="table-row song-row"
        style="grid-template-columns: 56px 3fr 2fr 72px"
        :title="`${song.title}${song.artist ? ' - ' + song.artist : ''}（点击播放）`"
        @click="emit('play-list', { list, index: i })"
      >
        <span class="num" :class="{ lead: i === 0 }">{{ i + 1 }}</span>
        <span class="truncate">{{ song.title }}</span>
        <span class="truncate muted">{{ song.artist || '-' }}</span>
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

    <!-- 周搜索榜：关键词，点击搜索 -->
    <div v-else class="list-wrap">
      <div class="table rank">
      <div class="table-head" style="grid-template-columns: 56px 1fr 80px">
        <span class="num">排名</span>
        <span>搜索关键词</span>
        <span class="num" style="text-align: right">操作</span>
      </div>
      <div
        v-for="(it, i) in list"
        :key="it.keyword"
        class="table-row kw-row"
        style="grid-template-columns: 56px 1fr 80px"
        :title="`搜索「${it.keyword}」`"
        @click="emit('search', it.keyword)"
      >
        <span class="num" :class="{ lead: i === 0 }">{{ it.rank ?? i + 1 }}</span>
        <span class="truncate">{{ it.keyword }}</span>
        <span class="row-action">
          <button class="btn ghost-btn" @click.stop="emit('search', it.keyword)">
            <Icon name="search" :size="13" />
            搜索
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
.view-head {
  display: flex;
  align-items: baseline;
  gap: 16px;
  flex-wrap: wrap;
}
.tabs { display: flex; gap: 4px; }
.tab {
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--t), color var(--t);
}
.tab:hover { background: var(--surface-hover); color: var(--text); }
.tab.active { background: var(--surface-active); color: var(--text); font-weight: 600; }

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

.lead { color: var(--accent); font-weight: 700; }

.song-row { cursor: pointer; }
.kw-row { cursor: pointer; }
.row-action { display: flex; justify-content: flex-end; }
.row-action .play-btn {
  padding: 2px 8px;
  font-size: 12px;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--t), background var(--t);
}
.row-action .ghost-btn {
  padding: 2px 8px;
  font-size: 12px;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--t), background var(--t);
}
.song-row:hover .row-action .play-btn,
.kw-row:hover .row-action .ghost-btn { opacity: 1; }

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
</style>
