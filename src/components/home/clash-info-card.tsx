import { DeveloperBoardOutlined } from '@mui/icons-material'
import { Divider, Stack, Typography } from '@mui/material'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { useVerge } from '@/hooks/use-app-config'
import { useClash } from '@/hooks/use-clash'
import { useVisibility } from '@/hooks/use-visibility'
import {
  useClashConfigData,
  useRulesData,
  useSystemData,
  useUptimeData,
} from '@/providers/app-data-context'

import { EnhancedCard } from './enhanced-card'

type UptimeTickListener = () => void

let currentUptimeTick = Date.now()
let uptimeTickTimer: number | null = null
const uptimeTickListeners = new Set<UptimeTickListener>()

const subscribeUptimeTick = (listener: UptimeTickListener) => {
  uptimeTickListeners.add(listener)
  currentUptimeTick = Date.now()

  if (uptimeTickTimer === null) {
    uptimeTickTimer = window.setInterval(() => {
      currentUptimeTick = Date.now()
      uptimeTickListeners.forEach((notify) => notify())
    }, 1000)
  }

  return () => {
    uptimeTickListeners.delete(listener)
    if (uptimeTickListeners.size === 0 && uptimeTickTimer !== null) {
      window.clearInterval(uptimeTickTimer)
      uptimeTickTimer = null
    }
  }
}

const subscribeDisabledUptimeTick = () => () => {}
const getUptimeTickSnapshot = () => currentUptimeTick

const useUptimeTick = (enabled: boolean) =>
  useSyncExternalStore(
    enabled ? subscribeUptimeTick : subscribeDisabledUptimeTick,
    getUptimeTickSnapshot,
    getUptimeTickSnapshot,
  )

// 将毫秒转换为时:分:秒格式的函数
const formatUptime = (uptimeMs: number) => {
  const hours = Math.floor(uptimeMs / 3600000)
  const minutes = Math.floor((uptimeMs % 3600000) / 60000)
  const seconds = Math.floor((uptimeMs % 60000) / 1000)
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export const ClashInfoCard = () => {
  const { t } = useTranslation()
  const { version: clashVersion } = useClash()
  const { clashConfig } = useClashConfigData()
  const { rules } = useRulesData()
  const { uptime } = useUptimeData()
  const { systemProxyAddress } = useSystemData()
  const { verge } = useVerge()
  const pageVisible = useVisibility()
  const lightweightOptimizations =
    verge?.enable_ui_lightweight_optimizations ?? true
  const baseUptimeRef = useRef(uptime)
  const baseTimestampRef = useRef(0)
  const now = useUptimeTick(lightweightOptimizations ? pageVisible : true)

  useEffect(() => {
    baseUptimeRef.current = uptime
    baseTimestampRef.current = Date.now()
  }, [uptime])

  const liveUptime = baseTimestampRef.current
    ? baseUptimeRef.current + now - baseTimestampRef.current
    : uptime

  // 使用useMemo缓存格式化后的uptime，避免频繁计算
  const formattedUptime = useMemo(() => formatUptime(liveUptime), [liveUptime])

  // 使用备忘录组件内容，减少重新渲染
  const cardContent = useMemo(() => {
    if (!clashConfig) return null

    return (
      <Stack spacing={1.5}>
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">
            {t('home.components.clashInfo.fields.coreVersion')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
            {clashVersion || '-'}
          </Typography>
        </Stack>
        <Divider />
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">
            {t('home.components.clashInfo.fields.systemProxyAddress')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
            {systemProxyAddress}
          </Typography>
        </Stack>
        <Divider />
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">
            {t('home.components.clashInfo.fields.mixedPort')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
            {clashConfig.mixedPort || '-'}
          </Typography>
        </Stack>
        <Divider />
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">
            {t('home.components.clashInfo.fields.uptime')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
            {formattedUptime}
          </Typography>
        </Stack>
        <Divider />
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">
            {t('home.components.clashInfo.fields.rulesCount')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
            {rules.length}
          </Typography>
        </Stack>
      </Stack>
    )
  }, [
    clashConfig,
    clashVersion,
    t,
    formattedUptime,
    rules.length,
    systemProxyAddress,
  ])

  return (
    <EnhancedCard
      title={t('home.components.clashInfo.title')}
      icon={<DeveloperBoardOutlined />}
      iconColor="warning"
      action={null}
    >
      {cardContent}
    </EnhancedCard>
  )
}
