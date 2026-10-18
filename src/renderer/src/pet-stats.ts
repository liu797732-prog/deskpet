import { reactive } from 'vue'

export interface PetStats {
  hunger: number
  mood: number
  clean: number
  exp: number
  level: number
}

const STORAGE_KEY = 'qqpet-stats'

// 从 localStorage 恢复
function loadStats(): PetStats {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return { hunger: 80, mood: 80, clean: 90, exp: 0, level: 1 }
}

export const petStats = reactive<PetStats>(loadStats())

// 每10秒保存一次
setInterval(() => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    hunger: Math.round(petStats.hunger),
    mood: Math.round(petStats.mood),
    clean: Math.round(petStats.clean),
    exp: petStats.exp,
    level: petStats.level
  }))
}, 10000)

const DECAY = {
  hunger: 0.05,
  mood: 0.03,
  clean: 0.04,
}

let timer: ReturnType<typeof setInterval> | null = null

function clamp(v: number) {
  return Math.max(0, Math.min(100, v))
}

function tick() {
  petStats.hunger = clamp(petStats.hunger - DECAY.hunger)
  petStats.mood = clamp(petStats.mood - DECAY.mood)
  petStats.clean = clamp(petStats.clean - DECAY.clean)
  petStats.exp += 1

  const newLevel = Math.floor(petStats.exp / 600) + 1
  if (newLevel > petStats.level) {
    petStats.level = newLevel
  }
}

export function startStats() {
  if (timer) return
  timer = setInterval(tick, 1000)
}

export function feed() {
  petStats.hunger = clamp(petStats.hunger + 30)
  petStats.mood = clamp(petStats.mood + 5)
  petStats.exp += 10
}

export function bath() {
  petStats.clean = clamp(petStats.clean + 40)
  petStats.mood = clamp(petStats.mood + 10)
  petStats.exp += 10
}
