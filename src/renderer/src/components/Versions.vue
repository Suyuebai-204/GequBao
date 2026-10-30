<script setup>
import { ref } from 'vue'

const versions = ref(window.electron?.process?.versions ?? {})
</script>

<template>
  <section class="versions">
    <h2>运行环境</h2>
    <ul>
      <li><span>Electron</span><code>{{ versions.electron ?? '-' }}</code></li>
      <li><span>Chromium</span><code>{{ versions.chrome ?? '-' }}</code></li>
      <li><span>Node.js</span><code>{{ versions.node ?? '-' }}</code></li>
      <li><span>V8</span><code>{{ versions.v8 ?? '-' }}</code></li>
    </ul>
  </section>
</template>

<style scoped>
.versions h2 {
  margin: 0 0 12px;
  font-size: 14px;
  color: #9a9ab0;
  font-weight: 500;
}

.versions ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 24px;
}

.versions li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.versions span {
  color: #9a9ab0;
}

.versions code {
  padding: 2px 8px;
  border-radius: 4px;
  background: #2c2c37;
  color: #8bc9ff;
}
</style>
