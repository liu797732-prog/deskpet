import { EventEmitter } from 'events'
import { powerMonitor } from 'electron'

export type PetState = 'active' | 'idle'

export interface StateChangeEvent {
  state: PetState
}

export interface MilestoneEvent {
  type: 'idle-long' | 'user-back' | 'late-night'
}

class StatusMonitor extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private currentState: PetState = 'active'
  private idleThresholdSeconds = 20 * 60 // 20分钟不动
  private idleNotified = false // 20分钟发呆提醒是否已触发
  private lateNightNotified = false

  start() {
    if (this.timer) return
    this.timer = setInterval(() => this.check(), 5000)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private check() {
    const idleSeconds = powerMonitor.getSystemIdleTime()

    // 20分钟不动 → 触发自言自语
    if (idleSeconds >= this.idleThresholdSeconds && !this.idleNotified) {
      this.idleNotified = true
      this.currentState = 'idle'
      this.emit('state-change', { state: 'idle' } as StateChangeEvent)
      this.emit('milestone', { type: 'idle-long' } as MilestoneEvent)
    }

    // 用户回来动鼠标了
    if (idleSeconds < 10 && this.currentState === 'idle') {
      this.currentState = 'active'
      this.idleNotified = false
      this.emit('state-change', { state: 'active' } as StateChangeEvent)
      this.emit('milestone', { type: 'user-back' } as MilestoneEvent)
    }

    // 深夜关怀（>23:00 且用户活跃），过了早上6点自动重置
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 23) {
      this.lateNightNotified = false // 白天重置
    }
    if ((hour >= 23 || hour < 6) && !this.lateNightNotified && idleSeconds < 60) {
      this.lateNightNotified = true
      this.emit('milestone', { type: 'late-night' })
    }
  }

  getState(): PetState {
    return this.currentState
  }
}

export const statusMonitor = new StatusMonitor()
