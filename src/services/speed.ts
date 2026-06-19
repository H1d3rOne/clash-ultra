import { cmdTestProxySpeed, cmdTestProxySpeedBatch } from '@/services/cmds'
import { debugLog } from '@/utils/debug'

const hashKey = (name: string, group: string) => `${group ?? ''}::${name}`
const CACHE_TTL = 30 * 60 * 1000

export const DEFAULT_SPEED_TEST_TIMEOUT = 15000
export const DEFAULT_SPEED_TEST_CONCURRENCY = 1
export const MIN_SPEED_TEST_TIMEOUT = 3000
export const MAX_SPEED_TEST_TIMEOUT = 120000
export const MAX_SPEED_TEST_CONCURRENCY = 10

export interface SpeedUpdate {
  speedBps: number
  bytes?: number
  elapsedMs?: number
  updatedAt: number
  error?: string
  sourceUrl?: string
  fallbackIndex?: number
}

class SpeedManager {
  private cache = new Map<string, SpeedUpdate>()
  private listenerMap = new Map<string, (update: SpeedUpdate) => void>()

  normalizeTimeout(timeout?: number) {
    const value = Number(timeout)
    if (!Number.isFinite(value)) return DEFAULT_SPEED_TEST_TIMEOUT
    return Math.min(
      Math.max(Math.round(value), MIN_SPEED_TEST_TIMEOUT),
      MAX_SPEED_TEST_TIMEOUT,
    )
  }

  normalizeConcurrency(concurrency?: number) {
    const value = Number(concurrency)
    if (!Number.isFinite(value)) return DEFAULT_SPEED_TEST_CONCURRENCY
    return Math.min(
      Math.max(Math.round(value), DEFAULT_SPEED_TEST_CONCURRENCY),
      MAX_SPEED_TEST_CONCURRENCY,
    )
  }

  setListener(
    name: string,
    group: string,
    listener: (update: SpeedUpdate) => void,
  ) {
    this.listenerMap.set(hashKey(name, group), listener)
  }

  removeListener(name: string, group: string) {
    this.listenerMap.delete(hashKey(name, group))
  }

  setSpeed(
    name: string,
    group: string,
    speedBps: number,
    meta?: Partial<Omit<SpeedUpdate, 'speedBps' | 'updatedAt'>>,
  ): SpeedUpdate {
    const key = hashKey(name, group)
    const update: SpeedUpdate = {
      speedBps,
      bytes: meta?.bytes,
      elapsedMs: meta?.elapsedMs,
      error: meta?.error,
      sourceUrl: meta?.sourceUrl,
      fallbackIndex: meta?.fallbackIndex,
      updatedAt: Date.now(),
    }

    this.cache.set(key, update)
    this.listenerMap.get(key)?.(update)
    return update
  }

  getSpeedUpdate(name: string, group: string) {
    const key = hashKey(name, group)
    const entry = this.cache.get(key)
    if (!entry) return undefined

    if (Date.now() - entry.updatedAt > CACHE_TTL) {
      this.cache.delete(key)
      return undefined
    }

    return { ...entry }
  }

  async checkSpeed(
    name: string,
    group: string,
    timeout = DEFAULT_SPEED_TEST_TIMEOUT,
    profileUid?: string,
  ): Promise<SpeedUpdate> {
    const actualTimeout = this.normalizeTimeout(timeout)
    debugLog(
      `[SpeedManager] 开始测速，代理: ${name}, 组: ${group}, 超时: ${actualTimeout}ms`,
    )
    this.setSpeed(name, group, -2)

    try {
      const result = await cmdTestProxySpeed(
        name,
        undefined,
        actualTimeout,
        20 * 1024 * 1024,
        profileUid,
      )
      debugLog(
        `[SpeedManager] 测速完成，代理: ${name}, 速度: ${result.speedBps} B/s`,
      )
      return this.setSpeed(name, group, result.speedBps, {
        bytes: result.bytes,
        elapsedMs: result.elapsedMs,
        sourceUrl: result.sourceUrl,
        fallbackIndex: result.fallbackIndex,
      })
    } catch (error: any) {
      console.error(`[SpeedManager] 测速失败，代理: ${name}`, error)
      return this.setSpeed(name, group, -3, {
        error: String(
          error?.message || error || error?.toString?.() || 'speed test failed',
        ),
      })
    }
  }

  async checkListSpeed(
    nameList: string[],
    group: string,
    timeout = DEFAULT_SPEED_TEST_TIMEOUT,
    concurrency = DEFAULT_SPEED_TEST_CONCURRENCY,
    profileUid?: string,
  ) {
    const names = Array.from(new Set(nameList.filter(Boolean)))
    names.forEach((name) => this.setSpeed(name, group, -2))
    if (!names.length) return

    const actualTimeout = this.normalizeTimeout(timeout)
    const actualConcurrency = Math.min(
      this.normalizeConcurrency(concurrency),
      names.length,
    )

    try {
      const resultItems = await cmdTestProxySpeedBatch(
        names,
        undefined,
        actualTimeout,
        20 * 1024 * 1024,
        actualConcurrency,
        profileUid,
      )
      const returned = new Set<string>()

      resultItems.forEach((item) => {
        returned.add(item.proxyName)
        if (item.result) {
          this.setSpeed(item.proxyName, group, item.result.speedBps, {
            bytes: item.result.bytes,
            elapsedMs: item.result.elapsedMs,
            sourceUrl: item.result.sourceUrl,
            fallbackIndex: item.result.fallbackIndex,
          })
          return
        }

        this.setSpeed(item.proxyName, group, -3, {
          error: item.error || 'speed test failed',
        })
      })

      names.forEach((name) => {
        if (returned.has(name)) return
        this.setSpeed(name, group, -3, {
          error: 'speed test returned no result',
        })
      })
    } catch (error: any) {
      const message = String(
        error?.message || error || error?.toString?.() || 'speed test failed',
      )
      names.forEach((name) => {
        this.setSpeed(name, group, -3, { error: message })
      })
    }
  }

  formatSpeed(speedBps: number) {
    if (speedBps === -1) return '-'
    if (speedBps === -2) return 'testing'
    if (speedBps === -3) return 'Error'
    if (!Number.isFinite(speedBps) || speedBps <= 0) return '-'

    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
    let value = speedBps
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex += 1
    }

    const precision = unitIndex === 0 || value >= 100 ? 0 : 1
    return `${value.toFixed(precision)} ${units[unitIndex]}`
  }

  formatSpeedColor(speedBps: number) {
    if (speedBps === -3) return 'error.main'
    if (speedBps < 0) return ''
    if (speedBps < 256 * 1024) return 'error.main'
    if (speedBps < 1024 * 1024) return 'warning.main'
    if (speedBps < 5 * 1024 * 1024) return 'primary.main'
    return 'success.main'
  }
}

export default new SpeedManager()
