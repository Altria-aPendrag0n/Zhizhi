import './styles/global.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { installGlobalErrorCapture } from './utils/global-errors'

// 挂载前先安装全局错误捕获：未捕获异常写入日志系统，随反馈导出上报
installGlobalErrorCapture()

const app = createApp(App)
app.use(createPinia())
app.use(router)
router.replace('/home')
app.mount('#app')
