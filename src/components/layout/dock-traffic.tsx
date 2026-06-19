import {
  ArrowDownwardRounded,
  ArrowUpwardRounded,
  MemoryRounded,
  SpeedRounded,
} from '@mui/icons-material'
import { Box, Typography, alpha } from '@mui/material'
import type { ReactNode, RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LightweightTrafficErrorBoundary } from '@/components/shared/traffic-error-boundary'
import { useVerge } from '@/hooks/use-app-config'
import { useMemoryData } from '@/hooks/use-memory-data'
import { useTrafficData } from '@/hooks/use-traffic-data'
import { useVisibility } from '@/hooks/use-visibility'
import { getSystemUsage } from '@/services/cmds'
import parseTraffic from '@/utils/parse-traffic'

const MAX_POINTS = 15
const SPARK_WIDTH = 60
const SPARK_HEIGHT = 22

const useElementInViewport = (ref: RefObject<HTMLElement | null>) => {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(Boolean(entry?.isIntersecting))
      },
      { threshold: 0.01 },
    )
    observer.observe(element)

    return () => observer.disconnect()
  }, [ref])

  return visible
}

interface SparklineProps {
  up: number
  down: number
  upColor: string
  downColor: string
  lightweightOptimizations: boolean
}

const drawCurve = (
  ctx: CanvasRenderingContext2D,
  buffer: number[],
  max: number,
  color: string,
) => {
  const stepX = SPARK_WIDTH / (MAX_POINTS - 1)
  const offsetX = SPARK_WIDTH - (buffer.length - 1) * stepX

  ctx.beginPath()
  buffer.forEach((v, i) => {
    const x = offsetX + i * stepX
    const y = SPARK_HEIGHT - 2 - (v / max) * (SPARK_HEIGHT - 4)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()

  ctx.lineTo(SPARK_WIDTH, SPARK_HEIGHT)
  ctx.lineTo(offsetX, SPARK_HEIGHT)
  ctx.closePath()
  const gradient = ctx.createLinearGradient(0, 0, 0, SPARK_HEIGHT)
  gradient.addColorStop(0, alpha(color, 0.26))
  gradient.addColorStop(1, alpha(color, 0))
  ctx.fillStyle = gradient
  ctx.fill()
}

const Sparkline = ({
  up,
  down,
  upColor,
  downColor,
  lightweightOptimizations,
}: SparklineProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const upBufferRef = useRef<number[]>([])
  const downBufferRef = useRef<number[]>([])
  const lastIdleSampleRef = useRef(false)

  useEffect(() => {
    const idle = up === 0 && down === 0
    if (lightweightOptimizations && idle && lastIdleSampleRef.current) return
    lastIdleSampleRef.current = idle
    const upBuffer = upBufferRef.current
    const downBuffer = downBufferRef.current
    upBuffer.push(up)
    downBuffer.push(down)
    if (upBuffer.length > MAX_POINTS) upBuffer.shift()
    if (downBuffer.length > MAX_POINTS) downBuffer.shift()

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    if (canvas.width !== SPARK_WIDTH * dpr) {
      canvas.width = SPARK_WIDTH * dpr
      canvas.height = SPARK_HEIGHT * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, SPARK_WIDTH, SPARK_HEIGHT)

    if (upBuffer.length < 2) return

    // 1KB 下限避免空闲时曲线贴顶；上下行共享同一刻度
    const max = Math.max(...upBuffer, ...downBuffer, 1024)
    drawCurve(ctx, downBuffer, max, downColor)
    drawCurve(ctx, upBuffer, max, upColor)
  }, [up, down, upColor, downColor, lightweightOptimizations])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: SPARK_WIDTH, height: SPARK_HEIGHT, display: 'block' }}
    />
  )
}

interface RateProps {
  icon: typeof ArrowUpwardRounded
  value: string
  unit: string
  active: boolean
  color: 'primary' | 'secondary'
}

const Rate = ({ icon: Icon, value, unit, active, color }: RateProps) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
    <Icon sx={{ fontSize: 15 }} color={active ? color : 'disabled'} />
    <Typography
      component="span"
      color={color}
      sx={{
        fontSize: 12.5,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        minWidth: 34,
        textAlign: 'right',
      }}
    >
      {value}
    </Typography>
    <Typography
      component="span"
      sx={{
        fontSize: 10.5,
        fontWeight: 600,
        color: 'text.secondary',
        minWidth: 28,
        textAlign: 'right',
      }}
    >
      {unit}/s
    </Typography>
  </Box>
)

const capsuleSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1.25,
  px: 1.5,
  py: '7px',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  backgroundColor: 'transparent',
}

const TrafficCapsule = () => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const pageVisible = useVisibility()
  const capsuleRef = useRef<HTMLDivElement | null>(null)
  const capsuleVisible = useElementInViewport(capsuleRef)

  const showGraph = verge?.traffic_graph ?? true
  const lightweightOptimizations =
    verge?.enable_ui_lightweight_optimizations ?? true
  const trafficEnabled = lightweightOptimizations
    ? pageVisible && capsuleVisible
    : true

  const {
    response: { data: traffic },
  } = useTrafficData({ enabled: trafficEnabled })

  const up = traffic?.up || 0
  const down = traffic?.down || 0
  const [upValue, upUnit] = parseTraffic(up)
  const [downValue, downUnit] = parseTraffic(down)

  return (
    <Box
      ref={capsuleRef}
      title={`${t('home.components.traffic.metrics.uploadSpeed')} / ${t(
        'home.components.traffic.metrics.downloadSpeed',
      )}`}
      sx={capsuleSx}
    >
      {showGraph && (
        <Sparkline
          up={up}
          down={down}
          upColor="#f59e0b"
          downColor="#3b82f6"
          lightweightOptimizations={lightweightOptimizations}
        />
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
        <Rate
          icon={ArrowUpwardRounded}
          value={upValue}
          unit={upUnit}
          active={up > 0}
          color="secondary"
        />
        <Rate
          icon={ArrowDownwardRounded}
          value={downValue}
          unit={downUnit}
          active={down > 0}
          color="primary"
        />
      </Box>
    </Box>
  )
}

interface MetricProps {
  icon: ReactNode
  value: string
  unit: string
  title?: string
  mirror?: boolean
}

const Metric = ({ icon, value, unit, title, mirror }: MetricProps) => (
  <Box
    title={title}
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0.5,
      flexDirection: mirror ? 'row-reverse' : 'row',
    }}
  >
    {icon}
    <Typography
      component="span"
      sx={{
        fontSize: 12.5,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        minWidth: 34,
        textAlign: mirror ? 'left' : 'right',
      }}
    >
      {value}
    </Typography>
    <Typography
      component="span"
      sx={{
        fontSize: 10.5,
        fontWeight: 600,
        color: 'text.secondary',
        minWidth: 28,
        textAlign: mirror ? 'right' : 'left',
      }}
    >
      {unit}
    </Typography>
  </Box>
)

const SystemCapsule = () => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const pageVisible = useVisibility()
  const capsuleRef = useRef<HTMLDivElement | null>(null)
  const capsuleVisible = useElementInViewport(capsuleRef)

  const showMemory = verge?.enable_memory_usage ?? true
  const lightweightOptimizations =
    verge?.enable_ui_lightweight_optimizations ?? true
  const metricsEnabled = lightweightOptimizations
    ? pageVisible && capsuleVisible
    : true

  const {
    response: { data: memory },
  } = useMemoryData({ enabled: metricsEnabled && showMemory })
  const [memValue, memUnit] = parseTraffic(memory?.inuse || 0)

  const [cpu, setCpu] = useState(0)
  useEffect(() => {
    if (!metricsEnabled) return
    let alive = true
    const tick = async () => {
      try {
        const usage = await getSystemUsage()
        if (alive) {
          if (lightweightOptimizations) {
            setCpu((previous) =>
              Math.round(previous) === Math.round(usage) ? previous : usage,
            )
          } else {
            setCpu(usage)
          }
        }
      } catch {
        // 忽略采样失败
      }
    }
    void tick()
    const timer = setInterval(tick, lightweightOptimizations ? 5000 : 2000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [lightweightOptimizations, metricsEnabled])

  return (
    <Box
      ref={capsuleRef}
      title={t('home.components.systemInfo.title')}
      sx={capsuleSx}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
        <Metric
          title="CPU"
          icon={<SpeedRounded sx={{ fontSize: 15, color: 'text.secondary' }} />}
          value={cpu.toFixed(0)}
          unit="%"
        />
        {showMemory && (
          <Metric
            title={t('home.components.traffic.metrics.memoryUsage')}
            icon={
              <MemoryRounded sx={{ fontSize: 15, color: 'text.secondary' }} />
            }
            value={memValue}
            unit={memUnit}
          />
        )}
      </Box>
    </Box>
  )
}

interface Props {
  side: 'up' | 'down'
}

export const DockTraffic = ({ side }: Props) => (
  <LightweightTrafficErrorBoundary>
    {side === 'up' ? <TrafficCapsule /> : <SystemCapsule />}
  </LightweightTrafficErrorBoundary>
)
