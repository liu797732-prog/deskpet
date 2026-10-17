<template>
  <div class="pet-container">
    <!-- 气泡对话框 -->
    <div v-if="bubbleText" class="bubble">
      {{ bubbleText }}
    </div>
    <!-- 宠物状态栏（低状态或手动开启时显示） -->
    <div v-if="showStatus" class="status-bar">
      <div class="exp-row">
        <span class="level-badge">Lv.{{ petStats.level }}</span>
        <div class="bar exp-bar"><div class="fill exp" :style="{ width: expPercent + '%' }"></div></div>
      </div>
      <div class="stat">
        <span class="stat-icon">🍖</span>
        <div class="bar"><div class="fill hunger" :style="{ width: petStats.hunger + '%' }"></div></div>
        <span class="stat-num">{{ Math.round(petStats.hunger) }}</span>
      </div>
      <div class="stat">
        <span class="stat-icon">💛</span>
        <div class="bar"><div class="fill mood" :style="{ width: petStats.mood + '%' }"></div></div>
        <span class="stat-num">{{ Math.round(petStats.mood) }}</span>
      </div>
      <div class="stat">
        <span class="stat-icon">🛁</span>
        <div class="bar"><div class="fill clean" :style="{ width: petStats.clean + '%' }"></div></div>
        <span class="stat-num">{{ Math.round(petStats.clean) }}</span>
      </div>
    </div>
    <!-- 宠物渲染区 -->
    <PetCanvas ref="petCanvasRef" @pet-click="onPetClick" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import PetCanvas from './components/PetCanvas.vue'
import { petStats, startStats, feed, bath } from './pet-stats'

const petCanvasRef = ref<InstanceType<typeof PetCanvas> | null>(null)
const bubbleText = ref('')
const currentState = ref('unknown')
const showStatus = ref(false)

// 低状态时自动显示状态栏
setInterval(() => {
  if (petStats.hunger < 20 || petStats.mood < 20 || petStats.clean < 20) {
    showStatus.value = true
  }
}, 5000)

// 经验条进度：当前等级内经验 / 600
const expPercent = computed(() => {
  return Math.round((petStats.exp % 600) / 600 * 100)
})

let bubbleTimer: ReturnType<typeof setTimeout> | null = null

// 简单台词池（从 dialogue-library.md 摘选）
const dialogues: Record<string, string[]> = {
  focus: [
    '已经专注好一阵了，加油！',
    '我在旁边安静陪着你~',
    '认真做事的样子不错哦'
  ],
  break: [
    '查资料呢？慢慢来不急~',
    '切出去看看，是在找灵感吧？'
  ],
  slack: [
    '嗯？已经过了好久了哦……作业写完了吗？',
    '我数着呢，别摸太久呀~',
    '偶尔放松可以，但别忘了正事哦'
  ],
  away: [
    '人去哪了……不会把我忘了吧？',
    '一个人好无聊啊……'
  ],
  random: [
    '你今天过得怎么样？',
    '我偷偷观察你好久啦~',
    '无聊ing……陪我玩一下嘛',
    '你说我要是能自己开可乐就好了',
    '今天的我比昨天又可爱了一点点'
  ]
}

const milestoneDialogues: Record<string, string[]> = {
  focus25: [
    '已经专注25分钟啦！很棒哦~',
    '坚持住！你已经专注很久了呢',
    '25分钟了哦，要不要伸个懒腰？'
  ],
  focus50: [
    '已经50分钟了！坐太久啦，站起来动一动吧？',
    '半小时又半小时……该休息一下眼睛了',
    '劳逸结合！去喝口水吧~'
  ],
  lateNight: [
    '这么晚了还在忙吗？注意身体哦',
    '夜深了……早点休息吧，我会想你的',
    '熬夜伤身体，明天再继续也可以呀'
  ],
  welcomeBack: [
    '你回来啦！我等你好久了~',
    '欢迎回来！刚才去哪了呀？',
    '终于回来啦，我一个人好无聊'
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
  '嘿嘿，好舒服~',
  '再摸一下嘛~',
  '呼噜呼噜……好惬意',
  '脸红红的……才不是害羞！'
]

const bodyReactions = [
  '呀！别碰那里，好痒！',
  '你干嘛啦~',
  '唔……突然戳我干嘛',
  '喂喂，突然袭击是犯规的！'
]

function onPetClick(area: string = 'body') {
  const lines = area === 'head' ? headReactions : bodyReactions
  showBubble(pickRandom(lines), 2500)
  petStats.mood = Math.min(100, petStats.mood + 3)
  petStats.exp += 5
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

  // 监听主进程推送的状态变化
  const api = (window as any).petAPI
  if (api?.onStateChange) {
    api.onStateChange((event: any) => {
      currentState.value = event.state
      const lines = dialogues[event.state]
      if (lines && lines.length > 0) {
        showBubble(pickRandom(lines), 3500)
      }
    })
  }

  // 监听里程碑事件
  if (api?.onMilestone) {
    api.onMilestone((event: any) => {
      let lines: string[] = []
      if (event.type === 'focus-milestone' && event.minutes === 25) lines = milestoneDialogues.focus25
      else if (event.type === 'focus-milestone' && event.minutes === 50) lines = milestoneDialogues.focus50
      else if (event.type === 'late-night') lines = milestoneDialogues.lateNight
      else if (event.type === 'welcome-back') lines = milestoneDialogues.welcomeBack
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
        showBubble('哇！好吃好吃~ 谢谢你！', 3000)
      } else if (action === 'bath') {
        bath()
        showBubble('洗香香~ 嘿嘿', 3000)
      } else if (action === 'talk') {
        showBubble(pickRandom(dialogues.random || ['你找我呀？']), 3000)
      } else if (action === 'toggle-status') {
        showStatus.value = !showStatus.value
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
        showBubble(pickRandom(['肚子好饿……', '提不起劲……给我点吃的好不好？', '咕咕咕……肚子在叫了']), 3500)
      }
    } else if (petStats.clean < 20) {
      const key = 'clean'
      if (!lastLowWarn[key] || now - lastLowWarn[key] > cooldown) {
        lastLowWarn[key] = now
        showBubble(pickRandom(['我脏脏的了……', '好想洗澡呀', '身上痒痒的……']), 3500)
      }
    } else if (petStats.mood < 20) {
      const key = 'mood'
      if (!lastLowWarn[key] || now - lastLowWarn[key] > cooldown) {
        lastLowWarn[key] = now
        showBubble(pickRandom(['你好久没理我了……', '有点无聊……', '陪陪我嘛']), 3500)
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

.status-bar {
  position: absolute;
  left: 2px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  padding: 4px 6px;
  z-index: 20;
}

.exp-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.exp-bar {
  flex: 1;
}

.fill.exp { background: #a29bfe; }

.level-badge {
  font-size: 10px;
  font-weight: bold;
  color: #666;
  white-space: nowrap;
}

.stat {
  display: flex;
  align-items: center;
  gap: 3px;
}

.stat-icon {
  font-size: 10px;
}

.bar {
  width: 30px;
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s;
}

.fill.hunger { background: #ff9f43; }
.fill.mood { background: #f368e0; }
.fill.clean { background: #48dbfb; }

.stat-num {
  font-size: 9px;
  color: #888;
  min-width: 14px;
  text-align: right;
}
</style>
