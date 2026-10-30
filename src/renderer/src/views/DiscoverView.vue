<script setup>
import { onMounted } from 'vue'
import Icon from '../components/Icon.vue'
import { recent, loadRecent, clearRecent, removeRecent, formatPlayedAt } from '../composables/recent'

const emit = defineEmits(['play'])

function play(t) {
  emit('play', {
    musicId: t.id,
    title: t.title,
    artist: t.artist,
    cover: t.cover,
    playId: t.playId,
    urlA: t.urlA,
    duration: t.duration,
    durationSec: t.durationSec,
    netdiskUrl: t.netdiskUrl
  })
}

function clearAll() {
  if (confirm('确定清空最近播放记录？')) clearRecent()
}
function remove(id) {
  removeRecent(id)
}

onMounted(loadRecent)
</script>

<template>
  <div class="view">
    <div class="view-head">
      <div>
        <h1>最近播放</h1>
        <p class="muted">{{ recent.loaded ? `共 ${recent.list.length} 首` : '加载中…' }}</p>
      </div>
      <button v-if="recent.list.length" class="btn btn-subtle danger" @click="clearAll">
        <Icon name="trash" :size="14" />
        清空
      </button>
    </div>

    <p v-if="recent.error" class="notice error">{{ recent.error }}</p>

    <!-- 加载中：骨架行，避免误显成「无记录」 -->
    <div v-else-if="recent.loading" class="table">
      <div class="table-head" style="grid-template-columns: 28px 3fr 2fr 64px 1.4fr 32px">
        <span class="num">#</span>
        <span>标题</span>
        <span>艺术家</span>
        <span class="num" style="text-align: right">时长</span>
        <span>最近播放</span>
        <span></span>
      </div>
      <div
        v-for="i in 6"
        :key="i"
        class="skeleton skel-row"
        style="grid-template-columns: 28px 3fr 2fr 64px 1.4fr 32px"
      ></div>
    </div>

    <div v-else-if="!recent.list.length" class="empty muted">
      <Icon name="discover" :size="30" />
      <p>还没有播放记录，播放一首歌后这里会自动出现。</p>
    </div>

    <div v-else class="table">
      <div class="table-head" style="grid-template-columns: 28px 3fr 2fr 64px 1.4fr 32px">
        <span class="num">#</span>
        <span>标题</span>
        <span>艺术家</span>
        <span class="num" style="text-align: right">时长</span>
        <span>最近播放</span>
        <span></span>
      </div>

      <div
        v-for="(t, i) in recent.list"
        :key="t.id"
        class="table-row"
        style="grid-template-columns: 28px 3fr 2fr 64px 1.4fr 32px"
        @click="play(t)"
      >
        <span class="num">{{ i + 1 }}</span>
        <span class="truncate">{{ t.title }}</span>
        <span class="truncate muted">{{ t.artist || '未知艺人' }}</span>
        <span class="num" style="text-align: right">{{ t.duration || '—' }}</span>
        <span class="truncate muted small">{{ formatPlayedAt(t.playedAt) }}</span>
        <button class="row-x" title="移除" @click.stop="remove(t.id)">
          <Icon name="close" :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.view-head h1 { margin: 0; }
.view-head .muted { margin: 4px 0 0; }

.danger { color: var(--text-2); }
.danger:hover { color: #e5484d; background: color-mix(in srgb, #e5484d 12%, transparent); }

.notice {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}
.notice.error { background: color-mix(in srgb, #e5484d 12%, transparent); color: #e5484d; }

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 64px 16px;
  text-align: center;
}

.small { font-size: 12px; }

.skel-row {
  height: 36px;
  margin: 2px 0;
}

.row-x {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  opacity: 0;
  cursor: pointer;
  transition: opacity var(--t), background var(--t), color var(--t);
}
.table-row:hover .row-x { opacity: 1; }
.row-x:hover { background: color-mix(in srgb, #e5484d 14%, transparent); color: #e5484d; }
</style>
