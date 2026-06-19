import {
  ArrowDownwardRounded,
  ArrowUpwardRounded,
  CloudDownloadRounded,
  CloudUploadRounded,
  LinkRounded,
  MemoryRounded,
} from '@mui/icons-material'
import {
  Box,
  Grid,
  PaletteColor,
  Paper,
  Typography,
  alpha,
  useTheme,
} from '@mui/material'
import { ReactNode, memo, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { TrafficErrorBoundary } from '@/components/shared/traffic-error-boundary'
import { useVerge } from '@/hooks/use-app-config'
import { useConnectionSummaryData } from '@/hooks/use-connection-data'
import { useMemoryData } from '@/hooks/use-memory-data'
import { useTrafficData } from '@/hooks/use-traffic-data'
import { useVisibility } from '@/hooks/use-visibility'
import parseTraffic from '@/utils/parse-traffic'

import {
  EnhancedCanvasTrafficGraph,
  type EnhancedCanvasTrafficGraphRef,
} from './enhanced-canvas-traffic-graph'

interface StatCardProps {
  icon: ReactNode
  title: string
  value: string | number
  unit: string
  color: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'
  onClick?: () => void
}

// 全局变量类型定义
declare global {
  interface Window {
    animationFrameId?: number
    lastTrafficData?: {
      up: number
      down: number
    }
  }
}

// 统计卡片组件 - 3D立体微卡片
const CompactStatCard = memo(
  ({ icon, title, value, unit, color, onClick }: StatCardProps) => {
    const theme = useTheme()
    const isDark = theme.palette.mode === 'dark'

    // 获取调色板颜色 - 使用useMemo避免重复计算
    const colorValue = useMemo(() => {
      const palette = theme.palette
      if (
        color in palette &&
        palette[color as keyof typeof palette] &&
        'main' in (palette[color as keyof typeof palette] as PaletteColor)
      ) {
        return (palette[color as keyof typeof palette] as PaletteColor).main
      }
      return palette.primary.main
    }, [theme.palette, color])

    return (
      <Paper
        elevation={0}
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          borderRadius: 2,
          // 3D透视
          transform: 'perspective(600px) translateZ(0)',
          transformStyle: 'preserve-3d',
          // 深度背景渐变
          bgcolor: isDark ? alpha(colorValue, 0.06) : alpha('#ffffff', 0.85),
          backgroundImage: isDark
            ? `linear-gradient(145deg, ${alpha(colorValue, 0.1)}, ${alpha(colorValue, 0.02)} 50%)`
            : `linear-gradient(145deg, ${alpha('#ffffff', 0.95)}, ${alpha(colorValue, 0.06)} 60%)`,
          // 3D 边框用 inset shadow 实现，不改变卡片盒模型尺寸
          // 多层3D阴影
          boxShadow: isDark
            ? [
                `0 1px 3px ${alpha('#000000', 0.2)}`,
                `0 4px 10px ${alpha('#000000', 0.15)}`,
                `0 8px 20px ${alpha('#000000', 0.12)}`,
                `inset 0 0 0 1px ${alpha(colorValue, 0.18)}`,
                `inset 0 1px 0 ${alpha('#ffffff', 0.06)}`,
                `inset 0 -1px 0 ${alpha('#000000', 0.1)}`,
              ].join(', ')
            : [
                `0 1px 2px ${alpha(colorValue, 0.04)}`,
                `0 3px 8px ${alpha(colorValue, 0.06)}`,
                `0 8px 18px ${alpha(colorValue, 0.05)}`,
                `inset 0 0 0 1px ${alpha(colorValue, 0.12)}`,
                `inset 0 1px 0 ${alpha('#ffffff', 0.7)}`,
                `inset 0 -1px 0 ${alpha('#000000', 0.03)}`,
              ].join(', '),
          padding: '8px',
          transition:
            'transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s cubic-bezier(.2,.8,.2,1)',
          cursor: onClick ? 'pointer' : 'default',
          overflow: 'hidden',
          // 顶部高光弧线
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 12,
            right: 12,
            top: 0,
            height: 1.5,
            borderRadius: '0 0 999px 999px',
            background: isDark
              ? `linear-gradient(90deg, transparent, ${alpha(colorValue, 0.5)}, transparent)`
              : `linear-gradient(90deg, transparent, ${alpha('#ffffff', 0.8)}, transparent)`,
            pointerEvents: 'none',
          },
          // 底部色彩光斑
          '&::after': {
            content: '""',
            position: 'absolute',
            left: '15%',
            right: '15%',
            bottom: -3,
            height: 6,
            borderRadius: '50%',
            background: `radial-gradient(ellipse, ${alpha(colorValue, 0.1)}, transparent 70%)`,
            filter: 'blur(3px)',
            pointerEvents: 'none',
          },
          '&:hover': onClick
            ? {
                transform:
                  'perspective(600px) translateZ(6px) translateY(-2px)',
                bgcolor: isDark
                  ? alpha(colorValue, 0.1)
                  : alpha('#ffffff', 0.92),
                boxShadow: isDark
                  ? [
                      `0 2px 5px ${alpha('#000000', 0.25)}`,
                      `0 8px 16px ${alpha('#000000', 0.2)}`,
                      `0 16px 32px ${alpha('#000000', 0.15)}`,
                      `0 0 14px ${alpha(colorValue, 0.15)}`,
                      `inset 0 0 0 1px ${alpha(colorValue, 0.28)}`,
                      `inset 0 1px 0 ${alpha('#ffffff', 0.08)}`,
                      `inset 0 -1px 0 ${alpha('#000000', 0.12)}`,
                    ].join(', ')
                  : [
                      `0 2px 4px ${alpha(colorValue, 0.06)}`,
                      `0 6px 14px ${alpha(colorValue, 0.1)}`,
                      `0 14px 28px ${alpha(colorValue, 0.07)}`,
                      `0 0 10px ${alpha(colorValue, 0.06)}`,
                      `inset 0 0 0 1px ${alpha(colorValue, 0.22)}`,
                      `inset 0 1px 0 ${alpha('#ffffff', 0.8)}`,
                      `inset 0 -1px 0 ${alpha('#000000', 0.04)}`,
                    ].join(', '),
              }
            : {
                transform: 'perspective(600px) translateZ(3px)',
              },
        }}
        onClick={onClick}
      >
        {/* 图标容器 - 3D 浮雕效果 */}
        <Box
          sx={{
            mr: 1,
            ml: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: '50%',
            flexShrink: 0,
            background: isDark
              ? `linear-gradient(145deg, ${alpha(colorValue, 0.22)}, ${alpha(colorValue, 0.06)})`
              : `linear-gradient(145deg, ${alpha('#ffffff', 0.8)}, ${alpha(colorValue, 0.1)})`,
            border: '1px solid',
            borderColor: isDark
              ? `${alpha(colorValue, 0.3)} ${alpha(colorValue, 0.08)} ${alpha('#000000', 0.2)} ${alpha(colorValue, 0.08)}`
              : `${alpha('#ffffff', 0.8)} ${alpha(colorValue, 0.1)} ${alpha(colorValue, 0.05)} ${alpha(colorValue, 0.1)}`,
            color: colorValue,
            boxShadow: isDark
              ? `0 2px 5px ${alpha(colorValue, 0.15)}, inset 0 1px 0 ${alpha('#ffffff', 0.08)}, inset 0 -1px 1px ${alpha('#000000', 0.15)}`
              : `0 1px 3px ${alpha(colorValue, 0.08)}, inset 0 1px 0 ${alpha('#ffffff', 0.6)}, inset 0 -1px 1px ${alpha(colorValue, 0.04)}`,
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 1,
              borderRadius: 'inherit',
              background: `radial-gradient(circle at 35% 30%, ${alpha(colorValue, isDark ? 0.1 : 0.06)}, transparent 65%)`,
              pointerEvents: 'none',
            },
          }}
        >
          {icon}
        </Box>

        {/* 文本内容 */}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" noWrap>
            {title}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline' }}>
            <Typography
              variant="body1"
              noWrap
              sx={{
                mr: 0.5,
                fontWeight: 'bold',
                textShadow: isDark
                  ? `0 1px 2px ${alpha('#000000', 0.3)}`
                  : `0 1px 0 ${alpha('#ffffff', 0.6)}`,
              }}
            >
              {value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {unit}
            </Typography>
          </Box>
        </Box>
      </Paper>
    )
  },
)

// 添加显示名称
CompactStatCard.displayName = 'CompactStatCard'

export const EnhancedTrafficStats = () => {
  const { t } = useTranslation()
  const theme = useTheme()
  const { verge } = useVerge()
  const trafficRef = useRef<EnhancedCanvasTrafficGraphRef>(null)
  const pageVisible = useVisibility()

  // 是否显示流量图表
  const trafficGraph = verge?.traffic_graph ?? true

  const {
    response: { data: traffic },
  } = useTrafficData({ enabled: trafficGraph && pageVisible })

  const {
    response: { data: memory },
  } = useMemoryData({ enabled: pageVisible })

  const {
    response: { data: connectionSummary },
  } = useConnectionSummaryData({ enabled: pageVisible })

  // 使用useMemo计算解析后的流量数据
  const parsedData = useMemo(() => {
    const [up, upUnit] = parseTraffic(traffic?.up || 0)
    const [down, downUnit] = parseTraffic(traffic?.down || 0)
    const [inuse, inuseUnit] = parseTraffic(memory?.inuse || 0)
    const [uploadTotal, uploadTotalUnit] = parseTraffic(traffic?.upTotal || 0)
    const [downloadTotal, downloadTotalUnit] = parseTraffic(
      traffic?.downTotal || 0,
    )

    return {
      up,
      upUnit,
      down,
      downUnit,
      inuse,
      inuseUnit,
      uploadTotal,
      uploadTotalUnit,
      downloadTotal,
      downloadTotalUnit,
      connectionsCount: connectionSummary?.activeConnectionCount,
    }
  }, [traffic, memory, connectionSummary])

  const isDark = theme.palette.mode === 'dark'

  // 渲染流量图表 - 3D立体图表容器
  const trafficGraphComponent = useMemo(() => {
    if (!trafficGraph || !pageVisible) return null

    return (
      <Paper
        elevation={0}
        sx={{
          position: 'relative',
          height: 130,
          cursor: 'pointer',
          // 3D 边框用 inset shadow 实现，不改变图表盒模型尺寸
          borderRadius: 2,
          overflow: 'hidden',
          backgroundColor: isDark
            ? alpha('#12141f', 0.5)
            : alpha('#ffffff', 0.7),
          backgroundImage: isDark
            ? `linear-gradient(165deg, ${alpha('#ffffff', 0.04)}, transparent 40%)`
            : `linear-gradient(165deg, ${alpha('#ffffff', 0.6)}, transparent 40%)`,
          boxShadow: isDark
            ? [
                `0 2px 4px ${alpha('#000000', 0.15)}`,
                `0 6px 14px ${alpha('#000000', 0.12)}`,
                `inset 0 0 0 1px ${alpha(theme.palette.divider, 0.18)}`,
                `inset 0 1px 0 ${alpha('#ffffff', 0.04)}`,
                `inset 0 -1px 0 ${alpha('#000000', 0.08)}`,
              ].join(', ')
            : [
                `0 1px 2px ${alpha(theme.palette.primary.main, 0.03)}`,
                `0 4px 10px ${alpha(theme.palette.primary.main, 0.05)}`,
                `inset 0 0 0 1px ${alpha(theme.palette.divider, 0.12)}`,
                `inset 0 1px 0 ${alpha('#ffffff', 0.6)}`,
                `inset 0 -1px 0 ${alpha('#000000', 0.02)}`,
              ].join(', '),
          transform: 'perspective(600px) translateZ(0)',
          transition:
            'transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s cubic-bezier(.2,.8,.2,1)',
          '&:hover': {
            transform: 'perspective(600px) translateZ(4px)',
            boxShadow: isDark
              ? [
                  `0 4px 8px ${alpha('#000000', 0.2)}`,
                  `0 10px 22px ${alpha('#000000', 0.16)}`,
                  `inset 0 0 0 1px ${alpha(theme.palette.divider, 0.22)}`,
                  `inset 0 1px 0 ${alpha('#ffffff', 0.06)}`,
                ].join(', ')
              : [
                  `0 2px 4px ${alpha(theme.palette.primary.main, 0.05)}`,
                  `0 8px 18px ${alpha(theme.palette.primary.main, 0.08)}`,
                  `inset 0 0 0 1px ${alpha(theme.palette.divider, 0.16)}`,
                  `inset 0 1px 0 ${alpha('#ffffff', 0.7)}`,
                ].join(', '),
          },
        }}
        onClick={() => trafficRef.current?.toggleStyle()}
      >
        <div style={{ height: '100%', position: 'relative' }}>
          <EnhancedCanvasTrafficGraph ref={trafficRef} />
        </div>
      </Paper>
    )
  }, [
    trafficGraph,
    pageVisible,
    theme.palette.divider,
    theme.palette.primary.main,
    isDark,
  ])

  // 使用useMemo计算统计卡片配置
  const statCards = useMemo(
    () => [
      {
        icon: <ArrowUpwardRounded fontSize="small" />,
        title: t('home.components.traffic.metrics.uploadSpeed'),
        value: parsedData.up,
        unit: `${parsedData.upUnit}/s`,
        color: 'secondary' as const,
      },
      {
        icon: <ArrowDownwardRounded fontSize="small" />,
        title: t('home.components.traffic.metrics.downloadSpeed'),
        value: parsedData.down,
        unit: `${parsedData.downUnit}/s`,
        color: 'primary' as const,
      },
      {
        icon: <LinkRounded fontSize="small" />,
        title: t('home.components.traffic.metrics.activeConnections'),
        value: parsedData.connectionsCount,
        unit: '',
        color: 'success' as const,
      },
      {
        icon: <CloudUploadRounded fontSize="small" />,
        title: t('shared.labels.uploaded'),
        value: parsedData.uploadTotal,
        unit: parsedData.uploadTotalUnit,
        color: 'secondary' as const,
      },
      {
        icon: <CloudDownloadRounded fontSize="small" />,
        title: t('shared.labels.downloaded'),
        value: parsedData.downloadTotal,
        unit: parsedData.downloadTotalUnit,
        color: 'primary' as const,
      },
      {
        icon: <MemoryRounded fontSize="small" />,
        title: t('home.components.traffic.metrics.memoryUsage'),
        value: parsedData.inuse,
        unit: parsedData.inuseUnit,
        color: 'error' as const,
        onClick: undefined,
      },
    ],
    [t, parsedData],
  )

  return (
    <TrafficErrorBoundary
      onError={(error, errorInfo) => {
        console.error('[EnhancedTrafficStats] 组件错误:', error, errorInfo)
      }}
    >
      <Grid container spacing={1} columns={{ xs: 8, sm: 8, md: 12 }}>
        {trafficGraph && (
          <Grid size={12}>
            {/* 流量图表区域 */}
            {trafficGraphComponent}
          </Grid>
        )}
        {/* 统计卡片区域 */}
        {statCards.map((card) => (
          <Grid key={card.title} size={4}>
            <CompactStatCard {...(card as StatCardProps)} />
          </Grid>
        ))}
      </Grid>
    </TrafficErrorBoundary>
  )
}
