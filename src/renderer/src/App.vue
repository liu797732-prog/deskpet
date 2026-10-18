<template>
  <div class="pet-container">
    <!-- 气泡对话框 -->
    <div v-if="bubbleText" class="bubble">
      {{ bubbleText }}
    </div>
    <!-- 状态栏独立窗口模式下这里不渲染 -->
    <PetCanvas @pet-click="onPetClick" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import PetCanvas from './components/PetCanvas.vue'
import { petStats, startStats, feed, bath, pet } from './pet-stats'

const bubbleText = ref('')
const showStatus = ref(false)
const manualStatus = ref(false) // 用户手动开关

// 低状态时自动显示独立状态栏窗口
setInterval(() => {
  // 自动显示/隐藏（用户手动开启后不自动关）
  if (!manualStatus.value) {
    const low = petStats.hunger < 20 || petStats.mood < 20 || petStats.clean < 20
    if (low !== showStatus.value) {
      showStatus.value = low
      ;(window as any).petAPI?.toggleStatus(low)
    }
  }
  // 数值同步到状态栏由主进程直推（pet:stats-changed），这里不再中转
}, 2000)

let bubbleTimer: ReturnType<typeof setTimeout> | null = null

// 台词池
const dialogues: Record<string, string[]> = {
  random: [
    '在干嘛呢',
    '陪我玩',
    '想你啦',
    '好无聊',
    '嘿嘿嘿',
    '今天开心吗',
    '看你好久了'
  ]
}

const milestoneDialogues: Record<string, string[]> = {
  idleLong: [
    '好无聊呀',
    '发呆中…',
    '哼歌ing',
    '数天花板',
    '啊~好困',
    '石头剪刀布',
    '影子动了'
  ],
  userBack: [
    '哟，回来啦',
    '哼，才回来',
    '抓到你了',
    '终于理我了',
    '你去哪了',
    '等你好久',
    '哼唧'
  ],
  lateNight: [
    '早点睡吧',
    '注意身体',
    '别熬夜啦'
  ]
}

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

function showBubble(text: string, duration = 3500) {
  bubbleText.value = text
  if (bubbleTimer) clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => {
    bubbleText.value = ''
  }, duration)
}

const headReactions = [
  '好舒服~',
  '再摸摸嘛',
  '呼噜噜',
  '嘿嘿~'
]

const bodyReactions = [
  '呀，好痒！',
  '你干嘛~',
  '唔，别碰',
  '喂喂！'
]

function onPetClick(area: string = 'body') {
  const lines = area === 'head' ? headReactions : bodyReactions
  showBubble(pickRandom(lines), 2500)
  // 摸摸加成由主进程结算，渲染层不再直接改数值
  pet()
}

onMounted(() => {
  // 拦截右键，弹出自定义菜单
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    ;(window as any).petAPI?.showContextMenu()
  })

  // 启动后不自动打招呼，等状态变化再开口

  // 随机闲聊：每30-60分钟主动说一句
  function scheduleRandomChat() {
    const delay = (30 + Math.random() * 30) * 60 * 1000 // 30-60分钟
    setTimeout(() => {
      if (dialogues.random?.length) {
        showBubble(pickRandom(dialogues.random), 3500)
      }
      scheduleRandomChat()
    }, delay)
  }
  scheduleRandomChat()

  // 监听里程碑事件
  const api = (window as any).petAPI
  if (api?.onMilestone) {
    api.onMilestone((event: any) => {
      let lines: string[] = []
      if (event.type === 'idle-long') lines = milestoneDialogues.idleLong
      else if (event.type === 'user-back') lines = milestoneDialogues.userBack
      else if (event.type === 'late-night') lines = milestoneDialogues.lateNight
      if (lines.length > 0) showBubble(pickRandom(lines), 4000)
    })
  }

  // 启动数值衰减
  startStats()

  // 监听右键菜单操作
  if (api?.onMenuAction) {
    api.onMenuAction((action: string) => {
      if (action === 'feed') {
        feed()
        showBubble('好吃！', 2500)
      } else if (action === 'bath') {
        bath()
        showBubble('洗香香', 2500)
      } else if (action === 'talk') {
        showBubble(pickRandom(dialogues.random || ['嗯？']), 2500)
      } else if (action === 'toggle-status') {
        showStatus.value = !showStatus.value
        manualStatus.value = showStatus.value
        ;(window as any).petAPI?.toggleStatus(showStatus.value)
      }
    })
  }

  // 低状态提醒：每30秒检查，同一状态10分钟内不重复
  const lastLowWarn: Record<string, number> = {}
  setInterval(() => {
    const now = Date.now()
    const cooldown = 10 * 60 * 1000 // 10分钟

    if (petStats.hunger < 20) {
      const key = 'hunger'
      if (!lastLowWarn[key] || now - lastLowWarn[key] > cooldown) {
        lastLowWarn[key] = now
        showBubble(pickRandom(['好饿…', '肚子叫了', '想吃东西']), 3000)
      }
    } else if (petStats.clean < 20) {
      const key = 'clean'
      if (!lastLowWarn[key] || now - lastLowWarn[key] > cooldown) {
        lastLowWarn[key] = now
        showBubble(pickRandom(['脏脏的…', '想洗澡', '身上痒']), 3000)
      }
    } else if (petStats.mood < 20) {
      const key = 'mood'
      if (!lastLowWarn[key] || now - lastLowWarn[key] > cooldown) {
        lastLowWarn[key] = now
        showBubble(pickRandom(['好无聊…', '陪陪我', '不开心']), 3000)
      }
    }
  }, 30000)
})
</script>

<style scoped>
.pet-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.bubble {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 8px 14px;
  font-size: 13px;
  color: #333;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.bubble::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: white;
  border-right: 1px solid #ddd;
  border-bottom: 1px solid #ddd;
}
</style>
