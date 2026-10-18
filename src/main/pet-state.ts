import { EventEmitter } from 'events'
import { safeStorage } from 'electron'
import { createHmac, randomBytes } from 'crypto'
import Store from 'electron-store'

export interface PetStats {
  hunger: number
  mood: number
  clean: number
  exp: number
  level: number
}

export type PetStatAction = 'feed' | 'bath' | 'pet'

interface StoredPetState {
  /** Monotonic write counter; signed together with stats. */
  v: number
  stats: PetStats
  /** HMAC-SHA256 over canonical stats payload + v. */
  sig: string
}

const STORE_NAME = 'pet-state'
const TICK_MS = 1000
const SAVE_INTERVAL_MS = 10_000

// 与原 renderer 版 pet-stats.ts 完全一致的数值
const DECAY = { hunger: 0.05, mood: 0.03, clean: 0.04 } as const
const EXP_PER_TICK = 1
const EXP_PER_LEVEL = 600
const ACTION_EFFECTS: Record<PetStatAction, { hunger?: number; mood?: number; clean?: number; exp: number }> = {
  feed: { hunger: 30, mood: 5, exp: 10 },
  bath: { clean: 40, mood: 10, exp: 10 },
  pet: { mood: 3, exp: 5 }
}

const clamp = (v: number) => Math.max(0, Math.min(100, v))
const levelFor = (exp: number) => Math.floor(exp / EXP_PER_LEVEL) + 1

const DEFAULT_STATS: PetStats = { hunger: 80, mood: 80, clean: 90, exp: 0, level: 1 }

/** 稳定序列化：字段顺序固定，保证签名可复现。 */
const canonicalStats = (s: PetStats) =>
  JSON.stringify({
    clean: Math.round(s.clean * 1000),
    exp: Math.round(s.exp),
    hunger: Math.round(s.hunger * 1000),
    level: s.level,
    mood: Math.round(s.mood * 1000)
  })

interface PetStateSchema {
  /** safeStorage(DPAPI) 加密后的 HMAC 密钥（hex 字符串），base64 包装 */
  sigKeyEnc?: string
  /** safeStorage 不可用时的降级存储（明文 hex）——仍然挡住随手改 JSON */
  sigKeyPlain?: string
  state?: StoredPetState
}

type PetStateStore = Store<PetStateSchema>

class PetState extends EventEmitter {
  private store: PetStateStore | null = null
  private stats: PetStats = { ...DEFAULT_STATS }
  private version = 0
  private keyHex = ''
  private tickTimer: NodeJS.Timeout | null = null
  private saveTimer: NodeJS.Timeout | null = null
  private started = false

  start(): void {
    if (this.started) return
    this.started = true
    this.store = new Store<PetStateSchema>({ name: STORE_NAME })
    this.keyHex = this.loadOrCreateKey()
    this.stats = this.loadStats()
    this.tickTimer = setInterval(() => this.tick(), TICK_MS)
    this.saveTimer = setInterval(() => this.save(), SAVE_INTERVAL_MS)
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    if (this.tickTimer) clearInterval(this.tickTimer)
    if (this.saveTimer) clearInterval(this.saveTimer)
    this.tickTimer = null
    this.saveTimer = null
    this.save()
  }

  get(): PetStats {
    // 对外只暴露防御性拷贝
    return { ...this.stats }
  }

  action(action: PetStatAction): PetStats {
    const effect = ACTION_EFFECTS[action]
    if (!effect) return this.get()
    if (effect.hunger) this.stats.hunger = clamp(this.stats.hunger + effect.hunger)
    if (effect.mood) this.stats.mood = clamp(this.stats.mood + effect.mood)
    if (effect.clean) this.stats.clean = clamp(this.stats.clean + effect.clean)
    this.stats.exp += effect.exp
    this.recomputeLevel()
    this.save()
    this.emitChange()
    return this.get()
  }

  private tick(): void {
    this.stats.hunger = clamp(this.stats.hunger - DECAY.hunger)
    this.stats.mood = clamp(this.stats.mood - DECAY.mood)
    this.stats.clean = clamp(this.stats.clean - DECAY.clean)
    this.stats.exp += EXP_PER_TICK
    this.recomputeLevel()
    this.emitChange()
  }

  private recomputeLevel(): void {
    this.stats.level = levelFor(this.stats.exp)
  }

  private emitChange(): void {
    this.emit('changed', this.get())
  }

  private sign(v: number, stats: PetStats): string {
    return createHmac('sha256', this.keyHex).update(`${v}|${canonicalStats(stats)}`).digest('base64')
  }

  private loadOrCreateKey(): string {
    if (!this.store) throw new Error('pet-state: store not ready')
    const canEncrypt = safeStorage.isEncryptionAvailable()
    if (canEncrypt) {
      const wrapped = this.store.get('sigKeyEnc')
      if (wrapped) {
        try {
          return safeStorage.decryptString(Buffer.from(wrapped, 'base64'))
        } catch (err) {
          console.warn('pet-state: failed to decrypt stored key, regenerating', err)
        }
      }
      const keyHex = randomBytes(32).toString('hex')
      this.store.set('sigKeyEnc', safeStorage.encryptString(keyHex).toString('base64'))
      return keyHex
    }
    // 降级：明文存 key（至少挡住手改 JSON；没有 DPAPI 时别无他法）
    console.warn('pet-state: safeStorage unavailable, storing HMAC key in plain text')
    const existing = this.store.get('sigKeyPlain')
    if (existing) return existing
    const keyHex = randomBytes(32).toString('hex')
    this.store.set('sigKeyPlain', keyHex)
    return keyHex
  }

  private loadStats(): PetStats {
    if (!this.store) return { ...DEFAULT_STATS }
    const stored = this.store.get('state')
    if (!stored || typeof stored.v !== 'number' || !stored.stats || !stored.sig) {
      return { ...DEFAULT_STATS }
    }
    const expected = this.sign(stored.v, stored.stats as PetStats)
    if (expected !== stored.sig) {
      console.warn('pet-state: saved stats failed signature check, resetting to defaults')
      return { ...DEFAULT_STATS }
    }
    const s = stored.stats as PetStats
    return {
      hunger: clamp(Number(s.hunger) || 0),
      mood: clamp(Number(s.mood) || 0),
      clean: clamp(Number(s.clean) || 0),
      exp: Math.max(0, Number(s.exp) || 0),
      level: Math.max(1, Number(s.level) || 1)
    }
  }

  private save(): void {
    if (!this.store) return
    this.version += 1
    const record: StoredPetState = {
      v: this.version,
      stats: { ...this.stats },
      sig: this.sign(this.version, this.stats)
    }
    this.store.set('state', record)
  }
}

export const petState = new PetState()
