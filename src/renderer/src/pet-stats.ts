import { reactive } from 'vue'

export interface PetStats {
  hunger: number
  mood: number
  clean: number
  exp: number
  level: number
}

const DEFAULTS: PetStats = { hunger: 80, mood: 80, clean: 90, exp: 0, level: 1 }

// 本地仅作显示缓存；唯一事实来源在主进程（含签名存档，防篡改）
export const petStats = reactive<PetStats>({ ...DEFAULTS })

export type PetStatAction = 'feed' | 'bath' | 'pet'

export function startStats(): void {
  const api = (window as any).petAPI
  if (!api) return
  // 初始值
  api
    .getStats?.()
    .then((s: PetStats) => {
      if (s) Object.assign(petStats, s)
    })
    .catch(() => {})
  // 后续变化全部由主进程推送
  api.onStatsChanged?.((s: PetStats) => {
    if (s) Object.assign(petStats, s)
  })
}

export function statAction(action: PetStatAction): void {
  ;(window as any).petAPI?.statAction?.(action)
}

export function feed(): void {
  statAction('feed')
}

export function bath(): void {
  statAction('bath')
}

/** 摸摸宠物（原先是渲染层直接改数值，现在也走主进程） */
export function pet(): void {
  statAction('pet')
}
