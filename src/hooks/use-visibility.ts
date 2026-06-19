import { useSyncExternalStore } from 'react'

type VisibilityListener = () => void

const visibilityListeners = new Set<VisibilityListener>()

const readVisibility = () =>
  typeof document === 'undefined'
    ? true
    : document.visibilityState === 'visible'

let visibleSnapshot = readVisibility()
let visibilityEventsBound = false

const notifyVisibilityListeners = () => {
  visibilityListeners.forEach((listener) => listener())
}

const updateVisibilitySnapshot = (next = readVisibility()) => {
  if (visibleSnapshot === next) return
  visibleSnapshot = next
  notifyVisibilityListeners()
}

const handleVisibilityChange = () => updateVisibilitySnapshot()
const handleFocus = () => updateVisibilitySnapshot(true)
const handlePointerDown = () => updateVisibilitySnapshot(true)

const bindVisibilityEvents = () => {
  if (visibilityEventsBound || typeof document === 'undefined') return

  document.addEventListener('focus', handleFocus)
  document.addEventListener('pointerdown', handlePointerDown)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  visibilityEventsBound = true
}

const unbindVisibilityEventsIfIdle = () => {
  if (
    !visibilityEventsBound ||
    visibilityListeners.size > 0 ||
    typeof document === 'undefined'
  ) {
    return
  }

  document.removeEventListener('focus', handleFocus)
  document.removeEventListener('pointerdown', handlePointerDown)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  visibilityEventsBound = false
}

const subscribeVisibility = (listener: VisibilityListener) => {
  visibleSnapshot = readVisibility()
  visibilityListeners.add(listener)
  bindVisibilityEvents()

  return () => {
    visibilityListeners.delete(listener)
    unbindVisibilityEventsIfIdle()
  }
}

export const useVisibility = () =>
  useSyncExternalStore(
    subscribeVisibility,
    () => visibleSnapshot,
    () => true,
  )
