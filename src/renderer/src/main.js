import { createApp } from 'vue'
import App from './App.vue'
import { initTheme } from './composables/theme'
import { initPlayerSettings } from './composables/player'
import './assets/main.css'

initTheme()
initPlayerSettings()
createApp(App).mount('#app')
