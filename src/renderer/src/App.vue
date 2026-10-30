<script setup>
import TitleBar from './components/TitleBar.vue'
import Versions from './components/Versions.vue'
</script>

<template>
  <TitleBar />

  <div class="app-body">
    <section class="hero">
      <h1>Vue Windows App</h1>
      <p>基于 Electron + Vue 3 + Vite 的 Windows 桌面应用骨架。</p>
    </section>

    <section class="cards">
      <article class="card">
        <h2>自绘标题栏</h2>
        <p>无边框窗口，通过 preload 暴露的 IPC 通道完成最小化、最大化与关闭。</p>
      </article>
      <article class="card">
        <h2>开发热更新</h2>
        <p><code>npm run dev</code> 启动后，渲染层支持热更新，主进程改动自动重启。</p>
      </article>
      <article class="card">
        <h2>一键打包</h2>
        <p><code>npm run build:win</code> 输出 NSIS 安装包与免安装便携版 exe。</p>
      </article>
    </section>

    <Versions />
  </div>
</template>
