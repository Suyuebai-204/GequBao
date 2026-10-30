<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'

const emit = defineEmits(['search', 'play'])

const rootEl = ref(null)
const inputEl = ref(null)
const keyword = ref('')
const focused = ref(false)
const activeIndex = ref(-1)

const suggests = ref([])
const suggestLoading = ref(false)
const suggestError = ref('')

const hots = ref([])
const hotLoaded = ref(false)
const hotLoading = ref(false)

let timer = null
let seq = 0

const trimmed = computed(() => keyword.value.trim())
const open = computed(() => focused.value)
const showHot = computed(() => !trimmed.value && (hotLoading.value || hots.value.length > 0))
// 下拉里可被键盘选中的项（输入框内容本身始终算一项）
const options = computed(() => suggests.value.slice(0, 10))

watch(trimmed, (kw) => {
  clearTimeout(timer)
  activeIndex.value = -1
  suggests.value = []
  suggestError.value = ''
  if (!kw) return
  timer = setTimeout(() => loadSuggest(kw), 220)
})

async function loadSuggest(kw) {
  const id = ++seq
  suggestLoading.value = true
  try {
    const res = await window.api.search.suggest(kw)
    if (id !== seq) return
    if (res?.ok) {
      suggests.value = Array.isArray(res.data) ? res.data : []
    } else {
      suggests.value = []
      suggestError.value = res?.error || ''
    }
  } catch (error) {
    if (id === seq) {
      suggests.value = []
      suggestError.value = error?.message || '建议获取失败'
    }
  } finally {
    if (id === seq) suggestLoading.value = false
  }
}

async function loadHot(force = false) {
  if (hotLoaded.value && !force) return
  hotLoading.value = true
  try {
    const res = await window.api.search.hot()
    if (res?.ok) hots.value = Array.isArray(res.data) ? res.data : []
  } catch {
    hots.value = []
  } finally {
    hotLoading.value = false
    hotLoaded.value = true
  }
}

function onFocus() {
  focused.value = true
  loadHot()
}

function onOutside(e) {
  if (!rootEl.value?.contains(e.target)) focused.value = false
}

function pick(value) {
  const kw = String(value ?? keyword.value).trim()
  if (!kw) return
  keyword.value = kw
  focused.value = false
  suggests.value = []
  clearTimeout(timer)
  // 收起面板同时失焦，这样下次聚焦/输入能正常重新展开建议
  inputEl.value?.blur()
  emit('search', kw)
}

// 歌曲类建议（有 musicId）直接进播放器；关键词类才发起搜索
function pickSuggestion(item) {
  if (!item) return
  if (item.type === 'song' && item.musicId) {
    focused.value = false
    suggests.value = []
    clearTimeout(timer)
    inputEl.value?.blur()
    keyword.value = item.searchKeyword || item.label
    emit('play', {
      musicId: item.musicId,
      title: item.searchKeyword || item.label,
      artist: ''
    })
    return
  }
  pick(item.searchKeyword || item.label)
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    focused.value = false
    inputEl.value?.blur()
    return
  }

  // 回车必须先处理：没有建议时也要能直接搜（之前被下面的提前 return 挡掉了）
  if (e.key === 'Enter') {
    e.preventDefault()
    const item = activeIndex.value >= 0 ? options.value[activeIndex.value] : null
    if (item) pickSuggestion(item)
    else pick(keyword.value)
    return
  }

  if (!options.value.length) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % options.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = activeIndex.value <= 0 ? options.value.length - 1 : activeIndex.value - 1
  }
}

// 点击面板外关闭：延迟绑定，避免输入框首次点击时就把面板关掉
let bound = false
function bindOutside() {
  if (bound) return
  bound = true
  document.addEventListener('mousedown', onOutside, true)
}

const unwatchFocus = watch(focused, (v) => {
  if (v) bindOutside()
})

onBeforeUnmount(() => {
  unwatchFocus()
  clearTimeout(timer)
  document.removeEventListener('mousedown', onOutside, true)
})
</script>

<template>
  <div ref="rootEl" class="search-box">
    <div class="field" :class="{ active: open }">
      <Icon class="lead" name="search" :size="14" />
      <input
        ref="inputEl"
        v-model="keyword"
        type="text"
        placeholder="搜索歌名 / 歌手"
        maxlength="35"
        autocomplete="off"
        spellcheck="false"
        @focus="onFocus"
        @keydown="onKeydown"
      />
      <button v-if="trimmed" class="clear" title="清空" @click="keyword = ''; $nextTick(() => inputEl?.focus())">
        <Icon name="close" :size="12" />
      </button>
    </div>

    <div v-if="open" class="panel">
      <!-- 建议 -->
      <template v-if="trimmed">
        <!-- 第一行永远是「搜索原词」，没有建议时也能一键搜 -->
        <button class="panel-item search-row" @click="pick(keyword)">
          <Icon class="item-icon" name="search" :size="14" />
          <span class="truncate">搜索「{{ trimmed }}」</span>
          <span class="tag muted">回车</span>
        </button>

        <p class="panel-title">
          <span>搜索建议</span>
          <span v-if="suggestLoading" class="muted">加载中…</span>
        </p>

        <button
          v-for="(item, i) in options"
          :key="`${item.type}-${item.id ?? i}-${item.label}`"
          class="panel-item"
          :class="{ hover: i === activeIndex }"
          @mouseenter="activeIndex = i"
          @click="pickSuggestion(item)"
        >
          <Icon class="item-icon" :name="item.type === 'song' ? 'library' : 'search'" :size="14" />
          <span class="truncate">{{ item.label }}</span>
          <span class="tag" :class="{ play: item.type === 'song' }">
            {{ item.type === 'song' ? '播放' : '搜索' }}
          </span>
        </button>

        <p v-if="!suggestLoading && !options.length && !suggestError" class="panel-empty muted">
          没有匹配的建议，回车直接搜索
        </p>
        <p v-if="suggestError" class="panel-empty muted">建议获取失败：{{ suggestError }}</p>
      </template>

      <!-- 热词 -->
      <template v-else>
        <p class="panel-title">
          <Icon name="hot" :size="13" />
          <span>大家都在搜</span>
          <span class="spacer"></span>
          <button class="refresh muted" title="换一批" @mousedown.prevent @click.stop="loadHot(true)">
            换一批
          </button>
        </p>

        <div v-if="hotLoading && !hots.length" class="hot-grid">
          <span v-for="i in 8" :key="i" class="skeleton hot-skeleton"></span>
        </div>
        <div v-else-if="hots.length" class="hot-grid">
          <button
            v-for="(word, i) in hots"
            :key="`${word}-${i}`"
            class="hot-chip"
            :class="{ top: i < 3 }"
            @click="pick(word)"
          >
            <span class="hot-index">{{ i + 1 }}</span>
            <span class="truncate">{{ word }}</span>
          </button>
        </div>
        <p v-else class="panel-empty muted">暂无热词，可直接输入关键词</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.search-box { position: relative; width: 240px; flex-shrink: 0; }

/* Fluent 搜索框：灰底 + 4px 圆角 + 聚焦时底部强调线 */
.field {
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--control-h);
  padding: 0 8px;
  border: 1px solid transparent;
  border-bottom: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  transition: border-color var(--t), background var(--t);
}
.field:hover { background: var(--surface-active); }
.field.active {
  background: var(--surface);
  border-bottom-color: var(--accent);
}
.lead { flex-shrink: 0; color: var(--text-3); }

.field input,
.field input:focus {
  width: 100%;
  height: auto;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 13px;
  outline: 0;
}
.field input::placeholder { color: var(--text-3); }

.clear {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition: background var(--t), color var(--t);
}
.clear:hover { background: var(--surface-active); color: var(--text); }

.panel {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 30;
  width: 320px;
  max-height: 380px;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-3);
  animation: fade-up 0.16s var(--ease) both;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  padding: 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}
.spacer { flex: 1; }
.refresh {
  border: 0;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-3);
}
.refresh:hover { color: var(--accent); }

.panel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.panel-item:hover,
.panel-item.hover { background: var(--surface-active); }
.item-icon { flex-shrink: 0; color: var(--text-3); }
.tag { flex-shrink: 0; margin-left: auto; padding-left: 8px; font-size: 11px; color: var(--text-3); }
.tag.play { color: var(--accent); }

/* 置顶的「搜索原词」行：轻微强调，区别于普通建议 */
.search-row {
  background: var(--surface-2);
  font-weight: 600;
}
.search-row:hover { background: var(--surface-active); }
.search-row .item-icon { color: var(--accent); }

.panel-empty { margin: 0; padding: 8px; font-size: 12px; text-align: center; }

.hot-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.hot-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  transition: border-color var(--t), color var(--t), background var(--t);
}
.hot-chip:hover { border-color: var(--accent); color: var(--accent); }
.hot-index { font-variant-numeric: tabular-nums; color: var(--text-3); font-size: 11px; }
.hot-chip.top .hot-index { color: var(--danger); }
.hot-skeleton { display: inline-block; width: 72px; height: 24px; border-radius: 999px; }
</style>
