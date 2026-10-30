<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import pkg from '../../../package.json'
import TitleBar from './components/TitleBar.vue'
import Sidebar from './components/Sidebar.vue'
import Icon from './components/Icon.vue'
import SearchBox from './components/SearchBox.vue'
import PlayerSheet from './components/PlayerSheet.vue'
import { playList, playTrack, playLocalList } from './composables/player'
import DiscoverView from './views/DiscoverView.vue'
import HotView from './views/HotView.vue'
import LibraryView from './views/LibraryView.vue'
import ChartsView from './views/ChartsView.vue'
import AboutView from './views/AboutView.vue'
import SettingsView from './views/SettingsView.vue'
import SearchView from './views/SearchView.vue'

const collapsed = ref(false)

const views = {
  discover: { title: '最近播放', component: DiscoverView },
  hot: { title: '热门推荐', component: HotView },
  library: { title: '本地音乐', component: LibraryView },
  charts: { title: '排行榜', component: ChartsView },
  about: { title: '关于', component: AboutView },
  settings: { title: '设置', component: SettingsView },
  search: { title: '搜索结果', component: SearchView }
}

// 前进 / 后退：视图级历史栈，条目为 { key, payload }
const history = ref([{ key: 'discover', payload: null }])
const future = ref([])

const current = computed(() => history.value[history.value.length - 1] ?? { key: 'discover', payload: null })
const canBack = computed(() => history.value.length > 1)
const canForward = computed(() => future.value.length > 0)
const currentTitle = computed(() => {
  const { key, payload } = current.value
  return key === 'search' && payload?.keyword ? `搜索：${payload.keyword}` : views[key]?.title ?? ''
})
const CurrentView = computed(() => views[current.value.key]?.component ?? views.discover.component)
// 关键词变化时需要重建组件实例，否则同一路由下换词不会触发重新请求；
// reloadCount 变化同样会重建实例，用于「刷新当前页」按钮
const reloadCount = ref(0)
const viewKey = computed(
  () => `${current.value.key}|${current.value.payload?.keyword ?? ''}|${reloadCount.value}`
)

function reload() {
  reloadCount.value += 1
}
const viewProps = computed(() =>
  current.value.key === 'search' ? { keyword: current.value.payload?.keyword ?? '' } : {}
)

function samePayload(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}
function navigate(key, payload = null) {
  if (current.value.key === key && samePayload(current.value.payload, payload)) return
  history.value.push({ key, payload })
  future.value = []
}
function back() {
  if (!canBack.value) return
  future.value.unshift(history.value.pop())
}
function forward() {
  if (!canForward.value) return
  history.value.push(future.value.shift())
}
function search(keyword) {
  navigate('search', { keyword: String(keyword ?? '').trim() })
}

// 切换视图 / 换关键词时把内容区滚回顶部，避免新结果停在上一页的滚动位置
const contentEl = ref(null)
watch(viewKey, async () => {
  await nextTick()
  contentEl.value?.scrollTo({ top: 0 })
})

// 歌曲类条目（带 musicId）直接进播放器；关键词类才走搜索
function playItem(track) {
  playTrack(track)
}

function playListAt(payload) {
  // 本地音乐列表（带 path）走本地文件播放，不请求在线直链
  if (payload?.local) playLocalList(payload.list, payload.index ?? 0)
  else playList(payload?.list, payload?.index ?? 0)
}

const groups = [
  {
    title: '在线',
    items: [
      { key: 'discover', label: '最近播放', icon: 'discover' },
      { key: 'hot', label: '热门推荐', icon: 'hot' },
      { key: 'charts', label: '排行榜', icon: 'charts' }
    ]
  },
  {
    title: '我的资料库',
    items: [{ key: 'library', label: '本地音乐', icon: 'library' }]
  }
]
</script>

<template>
  <div class="app-root">
    <TitleBar />

    <div class="layout">
      <Sidebar
        :groups="groups"
        :current="current.key"
        :collapsed="collapsed"
        @toggle="collapsed = !collapsed"
        @navigate="(key) => navigate(key)"
      />

      <main class="main">
        <header class="topbar">
          <div class="nav-btns">
            <button class="icon-btn" :disabled="!canBack" title="后退" @click="back">
              <Icon name="back" :size="16" />
            </button>
            <button class="icon-btn" :disabled="!canForward" title="前进" @click="forward">
              <Icon name="forward" :size="16" />
            </button>
            <button class="icon-btn" title="刷新当前页" @click="reload">
              <Icon name="refresh" :size="16" />
            </button>
          </div>
          <span class="topbar-title truncate">{{ currentTitle }}</span>
          <div class="spacer"></div>
          <SearchBox @search="search" @play="playItem" />
          <span class="muted">v{{ pkg.version }}</span>
        </header>

        <section ref="contentEl" class="content">
          <transition name="view" mode="out-in">
            <component
              :is="CurrentView"
              :key="viewKey"
              v-bind="viewProps"
              @search="search"
              @play="playItem"
              @play-list="playListAt"
            />
          </transition>
        </section>
      </main>
    </div>

    <PlayerSheet />
  </div>
</template>

<style scoped>
.app-root { height: 100%; display: flex; flex-direction: column; }
.layout { flex: 1; display: flex; min-height: 0; }

.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.topbar {
  height: 46px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.nav-btns { display: flex; gap: 2px; }
.topbar-title { font-size: 14px; font-weight: 600; min-width: 0; }

/* 底部留白：避免列表最后一行被「迷你播放条」压住（58px 条 + 14px 边距） */
.content { flex: 1; padding: 20px 24px 92px; overflow: auto; }
</style>
