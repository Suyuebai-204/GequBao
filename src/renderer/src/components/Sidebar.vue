<script setup>
import Icon from './Icon.vue'

defineProps({
  groups: { type: Array, required: true },
  current: { type: String, required: true },
  collapsed: { type: Boolean, default: false }
})
defineEmits(['toggle', 'navigate'])
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <div class="sidebar-head">
      <button class="icon-btn" title="展开/收起导航" @click="$emit('toggle')">
        <Icon name="menu" :size="16" />
      </button>
      <span class="head-title">音乐</span>
    </div>

    <nav class="nav">
      <template v-for="group in groups" :key="group.title">
        <p class="group-title">{{ collapsed ? '•' : group.title }}</p>
        <button
          v-for="item in group.items"
          :key="item.key"
          class="nav-item"
          :class="{ active: item.key === current }"
          :title="item.label"
          @click="$emit('navigate', item.key)"
        >
          <Icon :name="item.icon" :size="16" />
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </template>
    </nav>

    <div class="sidebar-foot">
      <button
        class="nav-item"
        :class="{ active: current === 'about' }"
        title="关于"
        @click="$emit('navigate', 'about')"
      >
        <Icon name="info" :size="16" />
        <span class="nav-label">关于</span>
      </button>
      <button
        class="nav-item"
        :class="{ active: current === 'settings' }"
        title="设置"
        @click="$emit('navigate', 'settings')"
      >
        <Icon name="settings" :size="16" />
        <span class="nav-label">设置</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--sidebar);
  border-right: 1px solid var(--border);
  transition: width var(--t);
}
.sidebar.collapsed { width: 56px; }

.sidebar-head {
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
}
.head-title { font-size: 13px; font-weight: 600; color: var(--text-2); white-space: nowrap; }

.nav {
  flex: 1;
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: auto;
}
.group-title {
  margin: 12px 0 4px 8px;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}
/* Fluent NavigationView：34px 行高（与图标按钮同高）+ 左侧 3px 强调条 */
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--control-h-lg);
  padding: 0 8px;
  border: 0;
  border-left: 3px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--t), color var(--t), border-color var(--t);
}
.nav-item:hover { background: var(--surface-hover); color: var(--text); }
.nav-item:active { background: var(--surface-active); }
.nav-item.active {
  color: var(--text);
  background: var(--surface-active);
  border-left-color: var(--accent);
}

.sidebar-foot {
  padding: 8px;
  border-top: 1px solid var(--border);
}

.collapsed .head-title,
.collapsed .nav-label { display: none; }
/* 收起态：菜单项、设置项、顶部按钮统一为居中且等宽（与 nav 的 8px 内距对齐） */
.collapsed .nav-item { justify-content: center; padding: 0; width: 100%; }
.collapsed .group-title { text-align: center; margin-inline: 0; }
.collapsed .sidebar-head { padding: 0; justify-content: center; }
.collapsed .sidebar-foot { padding-inline: 8px; }
</style>
