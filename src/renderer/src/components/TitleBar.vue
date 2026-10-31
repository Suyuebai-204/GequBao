<script setup>
import { onMounted, ref } from 'vue'

const maximized = ref(false)

const minimize = () => window.api?.window.minimize()
const toggleMaximize = () => window.api?.window.toggleMaximize()
const close = () => window.api?.window.close()

onMounted(async () => {
  if (!window.api) return
  const state = await window.api.window.state()
  maximized.value = state.maximized
  window.api.window.onStateChanged((state) => {
    maximized.value = state.maximized
  })
})
</script>

<template>
  <header class="titlebar">
    <span class="title">歌曲宝PC - 苏月白制作</span>

    <div class="actions">
      <button class="caption-btn" title="最小化" @click="minimize()">
        <svg viewBox="0 0 10 10" width="10" height="10">
          <path d="M0 5h10v1H0z" fill="currentColor" />
        </svg>
      </button>

      <button class="caption-btn" :title="maximized ? '向下还原' : '最大化'" @click="toggleMaximize()">
        <svg viewBox="0 0 10 10" width="10" height="10">
          <path v-if="maximized" d="M2 1h7v7H2z M1 2v7h7" fill="none" stroke="currentColor" />
          <rect v-else x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
        </svg>
      </button>

      <button class="caption-btn caption-close" title="关闭" @click="close()">
        <svg viewBox="0 0 10 10" width="10" height="10">
          <path d="M1 0L0 1L4 5L0 9l1 1l4-4l4 4l1-1L6 5l4-4L9 0L5 4z" fill="currentColor" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--titlebar);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
  user-select: none;
}

.title {
  padding-left: 12px;
  font-size: 12px;
  color: var(--text-3);
}

.actions {
  display: flex;
  -webkit-app-region: no-drag;
}

/* 系统标题栏按钮：46×32 直角、hover 浅底、关闭按钮 hover 变红 */
.caption-btn {
  width: 46px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-2);
  cursor: default;
  transition: background var(--t), color var(--t);
}

.caption-btn:hover {
  background: var(--caption-hover);
  color: var(--text);
}

.caption-btn:active {
  background: var(--surface-active);
}

.caption-close:hover {
  background: var(--caption-close);
  color: #fff;
}

.caption-close:active {
  background: #b52a1c;
  color: #fff;
}
</style>
