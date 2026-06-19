import { useLockFn } from 'ahooks'
import { useCallback, useEffect, useReducer } from 'react'

import { useVerge } from '@/hooks/use-app-config'
import speedManager, { type SpeedUpdate } from '@/services/speed'

const PRESET_PROXY_NAMES = [
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
  'COMPATIBLE',
]

const identity = (_: SpeedUpdate, next: SpeedUpdate): SpeedUpdate => next

const INITIAL_SPEED: SpeedUpdate = { speedBps: -1, updatedAt: 0 }

export interface UseProxySpeedState {
  speedState: SpeedUpdate
  speedValue: number
  isPreset: boolean
  onSpeed: () => Promise<void>
}

export function useProxySpeedState(
  proxy: IProxyItem,
  groupName: string,
  profileUid?: string,
): UseProxySpeedState {
  const isPreset = PRESET_PROXY_NAMES.includes(proxy.name)
  const [speedState, setSpeedState] = useReducer(identity, INITIAL_SPEED)
  const { verge } = useVerge()
  const timeout = speedManager.normalizeTimeout(
    verge?.default_speed_test_timeout,
  )

  useEffect(() => {
    if (isPreset) return
    speedManager.setListener(proxy.name, groupName, setSpeedState)
    return () => {
      speedManager.removeListener(proxy.name, groupName)
    }
  }, [proxy.name, groupName, isPreset])

  const updateSpeed = useCallback(() => {
    if (!proxy || isPreset) return
    const cachedUpdate = speedManager.getSpeedUpdate(proxy.name, groupName)
    setSpeedState(cachedUpdate ?? INITIAL_SPEED)
  }, [proxy, groupName, isPreset])

  useEffect(() => {
    updateSpeed()
  }, [updateSpeed])

  const onSpeed = useLockFn(async () => {
    if (!proxy || isPreset) return
    setSpeedState({ speedBps: -2, updatedAt: Date.now() })
    setSpeedState(
      await speedManager.checkSpeed(proxy.name, groupName, timeout, profileUid),
    )
  })

  return {
    speedState,
    speedValue: speedState.speedBps,
    isPreset,
    onSpeed,
  }
}
