import { EventEmitter } from 'events'
import activeWindow from 'active-win'
import { powerMonitor } from 'electron'

// 应用分类白名单（active-win 返回的进程名不含 .exe）
const FOCUS_APPS = new Set([
  'code', 'visualstudio', 'rider64', 'idea64',
  'webstorm64', 'pycharm64', 'clion64',
  'excel', 'winword', 'powerpnt', 'onenote',
  'photoshop', 'illustrator', 'figma', 'xd',
  'premiere', 'afterfx', 'blender',
  'notepad++', 'obs64', 'obs', 'msedge', 'doubao',
  'notepad', 'cmd', 'powershell',
  // 中文系统本地化进程名
  '记事本', 'windows 命令处理程序'
])

const DISTRACT_APPS = new Set([
  'chrome', 'firefox',
  'wechat', 'qq', 'weixin',
  'bilibili', 'douyin'
])

// 这些进程忽略不计（DevTools、系统窗口等）
const IGNORE_APPS = new Set([
  'electron', 'explorer', 'system',
  'applicationframehost', 'shellexperiencehost'
])

export type PetState = 'focus' | 'break' | 'slack' | 'away' | 'unknown'

export interface StateChangeEvent {
  state: PetState
  appName: string
  appTitle: string
  durationInState: number
}

export interface MilestoneEvent {
  type: 'focus-milestone' | 'late-night' | 'welcome-back'
  minutes?: number
}

class StatusMonitor extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private currentState: PetState = 'unknown'
  private stateEnterTime: number = Date.now()
  private lastApp: string = ''
  private sampleInterval = 2000

  // 里程碑触发记录（避免重复触发）
  private triggeredMilestones = new Set<number>()
  private lateNightNotified = false
  private idleStreak = 0 // 连续空闲采样次数

  // 参数（正式值）
  private slackThresholdMinutes = 15
  private awayThresholdSeconds = 300 // 空闲5分钟算离开
  private focusMilestones = [25, 50] as const // 25分钟加油、50分钟休息

  start() {
    if (this.timer) return
    this.timer = setInterval(() => this.sample(), this.sampleInterval)
    console.log('[StatusMonitor] started')
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async sample() {
    try {
      // 先检查空闲时间（连续3次采样都超阈值才进入away，避免抖动）
      const idleSeconds = powerMonitor.getSystemIdleTime()
      if (idleSeconds >= this.awayThresholdSeconds) {
        this.idleStreak++
        if (this.idleStreak >= 3 && this.currentState !== 'away') {
          const durationInState = Math.round((Date.now() - this.stateEnterTime) / 1000)
          this.currentState = 'away'
          this.stateEnterTime = Date.now()
          this.emit('state-change', {
            state: 'away', appName: '', appTitle: '', durationInState
          } as StateChangeEvent)
          console.log(`[StatusMonitor] -> away (idle ${idleSeconds}s, streak=${this.idleStreak})`)
          return
        }
      } else {
        this.idleStreak = 0
      }

      // 从 away 回来 → welcome-back，先退出 away 状态
      if (this.currentState === 'away') {
        if (idleSeconds < 10) {
          this.emit('milestone', { type: 'welcome-back' } as MilestoneEvent)
          this.currentState = 'unknown' // 重置，让下面的逻辑重新判断
          this.stateEnterTime = Date.now()
          this.triggeredMilestones.clear()
        } else {
          return // 还在 away，继续等
        }
      }

      const win = await activeWindow()
      if (!win) return

      const appName = (win.owner?.name || '').toLowerCase()
      const appTitle = win.title || ''

      if (Math.random() < 0.05) {
        console.log(`[StatusMonitor] detected: "${appName}" | idle: ${idleSeconds}s | title: "${appTitle.slice(0, 40)}"`)
      }

      if (IGNORE_APPS.has(appName)) return

      const isFocus = FOCUS_APPS.has(appName)
      const isDistract = DISTRACT_APPS.has(appName)

      if (!isFocus && !isDistract && appName !== this.lastApp) {
        console.log(`[StatusMonitor] 未分类应用: "${appName}"`)
      }
      this.lastApp = appName

      const now = Date.now()
      let newState: PetState

      if (isFocus) {
        newState = 'focus'
      } else if (isDistract || !isFocus) {
        if (this.currentState === 'focus') {
          newState = 'break'
        } else if (this.currentState === 'break') {
          const inBreakMinutes = (now - this.stateEnterTime) / 60000
          newState = inBreakMinutes >= this.slackThresholdMinutes ? 'slack' : 'break'
        } else if (this.currentState === 'slack') {
          newState = 'slack'
        } else {
          newState = 'break'
        }
      }

      // 状态变化
      if (newState !== this.currentState) {
        const durationInState = Math.round((now - this.stateEnterTime) / 1000)
        const prevState = this.currentState
        this.currentState = newState
        this.stateEnterTime = now
        this.triggeredMilestones.clear() // 新状态重置里程碑

        this.emit('state-change', {
          state: newState, appName, appTitle, durationInState
        } as StateChangeEvent)
        console.log(`[StatusMonitor] ${prevState} -> ${newState} (${appName})`)
      }

      // 专注里程碑检测
      if (this.currentState === 'focus') {
        const focusMinutes = Math.round((Date.now() - this.stateEnterTime) / 60000)
        for (const m of this.focusMilestones) {
          if (focusMinutes === m && !this.triggeredMilestones.has(m)) {
            this.triggeredMilestones.add(m)
            this.emit('milestone', { type: 'focus-milestone', minutes: m })
            console.log(`[StatusMonitor] focus milestone: ${m}min`)
          }
        }
      }

      // 深夜关怀（>23:00 且用户活跃）
      const hour = new Date().getHours()
      if ((hour >= 23 || hour < 6) && !this.lateNightNotified && this.currentState !== 'away') {
        this.lateNightNotified = true
        this.emit('milestone', { type: 'late-night' })
      }

    } catch (err) {
      console.error('[StatusMonitor] sample error:', err)
    }
  }

  getState(): PetState {
    return this.currentState
  }
}

export const statusMonitor = new StatusMonitor()
