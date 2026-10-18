import { createApp } from 'vue'
import App from './App.vue'
import StatusWindow from './components/StatusWindow.vue'

// 根据 hash 判断是宠物窗口还是状态栏窗口
if (window.location.hash === '#/status') {
  createApp(StatusWindow).mount('#app')
} else {
  createApp(App).mount('#app')
}
