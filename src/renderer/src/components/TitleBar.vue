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
    <span class="title">Vue Windows App - Test</span>

    <div class="actions">
      <button class="btn" title="最小化" @click="minimize()">
        <svg viewBox="0 0 10 10" width="10" height="10">
          <path d="M0 5h10v1H0z" fill="currentColor" />
        </svg>
      </button>

      <button class="btn" :title="maximized ? '向下还原' : '最大化'" @click="toggleMaximize()">
        <svg viewBox="0 0 10 10" width="10" height="10">
          <path v-if="maximized" d="M2 1h7v7H2z M1 2v7h7" fill="none" stroke="currentColor" />
          <rect v-else x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
        </svg>
      </button>

      <button class="btn btn-close" title="关闭" @click="close()">
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
  background: #23232c;
  border-bottom: 1px solid #33333f;
  -webkit-app-region: drag;
  user-select: none;
}

.title {
  padding-left: 12px;
  font-size: 13px;
  color: #cfcfe0;
}

.actions {
  display: flex;
  -webkit-app-region: no-drag;
}

.btn {
  width: 46px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #cfcfe0;
  cursor: pointer;
}

.btn:hover {
  background: #33333f;
}

.btn-close:hover {
  background: #e81123;
  color: #fff;
}
</style>
