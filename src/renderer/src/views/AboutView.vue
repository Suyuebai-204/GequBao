<script setup>
import pkg from '../../../../package.json'
import Icon from '../components/Icon.vue'

const APP_NAME = '歌曲宝PC'
const DEVELOPER = '苏月白'
const REPO_URL = 'https://github.com/Suyuebai-204/GequBao'
const SITE_URL = 'https://www.gequbao.com'

const stack = [
  { label: 'Electron', desc: '跨平台桌面壳' },
  { label: 'Vue 3', desc: '界面与状态' },
  { label: 'Vite', desc: '构建工具' },
  { label: 'Node.js', desc: '主进程与爬取' },
  { label: 'tesseract.js', desc: '验证码识别' },
  { label: 'music-metadata', desc: '本地音频元数据' }
]

function open(url) {
  window.api?.openExternal?.(url)
}
</script>

<template>
  <div class="view">
    <h1>关于</h1>
    <p class="muted">软件信息与开源仓库</p>

    <div class="col" style="gap: 14px; max-width: 620px">
      <!-- 软件信息 -->
      <section class="card col" style="gap: 12px">
        <div class="row" style="gap: 12px">
          <div class="logo">
            <Icon name="music" :size="22" />
          </div>
          <div class="col" style="gap: 2px">
            <span style="font-size: 16px; font-weight: 700">{{ APP_NAME }}</span>
            <span class="muted">v{{ pkg.version }} · {{ DEVELOPER }} 制作</span>
          </div>
        </div>
        <p class="muted" style="font-size: 13px; line-height: 1.6">
          一款简洁的桌面音乐播放器：支持在线搜索、热门推荐、排行榜、歌词浮层与本地音乐库。
        </p>
      </section>

      <!-- 开源仓库 -->
      <section class="card col" style="gap: 12px">
        <h2>开源仓库</h2>
        <div class="row" style="gap: 8px">
          <button class="btn btn-primary" @click="open(REPO_URL)">
            <Icon name="link" :size="14" />
            GitHub 仓库
          </button>
          <button class="btn" @click="open(SITE_URL)">
            <Icon name="discover" :size="14" />
            数据来源站点
          </button>
        </div>
        <p class="muted small truncate">{{ REPO_URL }}</p>
      </section>

      <!-- 技术栈 -->
      <section class="card col" style="gap: 12px">
        <h2>技术栈</h2>
        <div class="stack-grid">
          <div v-for="item in stack" :key="item.label" class="stack-item">
            <span class="badge">{{ item.label }}</span>
            <span class="muted small">{{ item.desc }}</span>
          </div>
        </div>
      </section>

      <!-- 声明 -->
      <section class="card col" style="gap: 8px">
        <h2>声明</h2>
        <p class="muted" style="font-size: 13px; line-height: 1.7">
          本软件为学习交流用途的个人项目，音频数据均来自第三方公开站点，版权归原始权利方所有。
          请支持正版音乐。如果你是权利方并对内容有异议，请通过仓库 Issue 联系。
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.logo {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  background: var(--surface-active);
  color: var(--accent);
}
.stack-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px 16px;
}
.stack-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-active);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.small { font-size: 12px; }
.btn { display: inline-flex; align-items: center; gap: 6px; }
</style>
