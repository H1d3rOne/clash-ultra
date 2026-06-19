import { MihomoWebSocket } from 'tauri-plugin-mihomo-api'
import type { Traffic } from 'tauri-plugin-mihomo-api'

import { useMihomoWsSubscription } from './use-mihomo-ws-subscription'
import { useTrafficMonitorEnhanced } from './use-traffic-monitor'

const FALLBACK_TRAFFIC: ITrafficItem = {
  up: 0,
  down: 0,
  upTotal: 0,
  downTotal: 0,
}
let lastTrafficSignature = ''

const shouldSkipDuplicateTraffic = (traffic: ITrafficItem) => {
  const signature = `${traffic.up}:${traffic.down}:${traffic.upTotal ?? 0}:${traffic.downTotal ?? 0}`

  if (signature === lastTrafficSignature) {
    return true
  }

  lastTrafficSignature = signature
  return false
}

const normalizeTraffic = (traffic: ITrafficItem): Traffic => ({
  up: traffic.up,
  down: traffic.down,
  upTotal: traffic.upTotal ?? 0,
  downTotal: traffic.downTotal ?? 0,
})

export const useTrafficData = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled ?? true

  const {
    graphData: { appendData },
  } = useTrafficMonitorEnhanced({ subscribe: false, enabled })
  const { response, refresh } = useMihomoWsSubscription<ITrafficItem>({
    storageKey: 'mihomo_traffic_date',
    buildSubscriptKey: (date) => (enabled ? `getClashTraffic-${date}` : null),
    fallbackData: FALLBACK_TRAFFIC,
    connect: () => MihomoWebSocket.connect_traffic(),
    throttleMs: 200,
    setupHandlers: ({ next, scheduleReconnect }) => ({
      handleMessage: (data) => {
        if (data.startsWith('Websocket error')) {
          next(data, FALLBACK_TRAFFIC)
          void scheduleReconnect()
          return
        }

        try {
          const parsed = JSON.parse(data) as ITrafficItem
          if (shouldSkipDuplicateTraffic(parsed)) {
            return
          }
          const normalized = normalizeTraffic(parsed)
          appendData(normalized)
          next(null, normalized)
        } catch (error) {
          next(error, FALLBACK_TRAFFIC)
        }
      },
    }),
  })

  return { response, refreshGetClashTraffic: refresh }
}
