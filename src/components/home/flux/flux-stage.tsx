import {
  Box,
  Tooltip,
  Typography,
  alpha,
  keyframes,
  useTheme,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { ReactNode, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { useVerge } from '@/hooks/use-app-config'
import { useClash } from '@/hooks/use-clash'
import {
  useConnectionActiveData,
  useConnectionData,
} from '@/hooks/use-connection-data'
import { useMemoryData } from '@/hooks/use-memory-data'
import { useProfiles } from '@/hooks/use-profiles'
import { useVisibility } from '@/hooks/use-visibility'
import {
  useAppRefreshers,
  useClashConfigData,
  useProxiesData,
  useSystemData,
} from '@/providers/app-data-context'
import delayManager from '@/services/delay'
import parseTraffic from '@/utils/parse-traffic'
import {
  formatRuntimeConnectionRouteLabel,
  findLatestPortProxyRuntimeConnectionRoute,
  findLatestRuntimeConnectionRoute,
  stripRuntimeProfilePrefix,
} from '@/utils/proxy-runtime-connection'

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`

const travel = keyframes`
  from { offset-distance: 0%; }
  to { offset-distance: 100%; }
`

const catBlink = keyframes`
  0%, 86%, 100% { transform: scaleY(1); }
  88% { transform: scaleY(0.08); }
  90% { transform: scaleY(1); }
  92% { transform: scaleY(0.14); }
  94% { transform: scaleY(1); }
`

const catEyeSparkleBlink = keyframes`
  0%, 86%, 100% {
    opacity: 0.78;
    transform: scaleY(1);
  }
  88%, 92% {
    opacity: 0;
    transform: scaleY(0.12);
  }
  90%, 94% {
    opacity: 0.78;
    transform: scaleY(1);
  }
`

const catBlinkLine = keyframes`
  0%, 86%, 90.8%, 94.8%, 100% { opacity: 0; }
  88.2%, 92.2% { opacity: 0.54; }
`

// viewBox 坐标：宽 1200、竖直中线 160（高 320，preserveAspectRatio none 拉伸填充）
const VB_W = 1200
const VB_H = 320
const VB_MID_Y = 160
const FLUX_STAGE_HEIGHT = 270
// 轨道百分比分布范围
const TRACK_START = 7
const TRACK_END = 93
const FLUX_DOT_DURATION = 3.2
const PARALLEL_HOST_LEFT = 8
const PARALLEL_CORE_LEFT = 30
const PARALLEL_PROXY_CENTER_LEFT = 62
const PARALLEL_PROXY_BAND_LEFT = 50
const PARALLEL_PROXY_BAND_RIGHT = 74
const PARALLEL_INTERNET_LEFT = 90

const orbLeftPercent = (index: number, count: number) =>
  count <= 1
    ? 50
    : TRACK_START + (TRACK_END - TRACK_START) * (index / (count - 1))

// 在两点之间绘制带轻微起伏的链路光束
const buildBeam = (x0: number, x1: number) => {
  const dx = x1 - x0
  return `M${x0},${VB_MID_Y} C${x0 + dx * 0.35},${VB_MID_Y - 12} ${
    x1 - dx * 0.35
  },${VB_MID_Y + 12} ${x1},${VB_MID_Y}`
}

type ProxyBeamKind = 'toProxy' | 'fromProxy'

const resolveBeamSign = (
  y0: number,
  y1: number,
  kind: ProxyBeamKind,
  branchSign = 0,
) => {
  if (branchSign !== 0) return branchSign
  const midOffset = (y0 + y1) / 2 - VB_MID_Y
  if (Math.abs(midOffset) > 1) return Math.sign(midOffset)
  return kind === 'toProxy' ? -1 : 1
}

const getProxyBeamControls = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  kind: ProxyBeamKind,
  branchSign = 0,
) => {
  const dx = x1 - x0
  const sign = resolveBeamSign(y0, y1, kind, branchSign)
  const bow = Math.min(24, Math.max(10, Math.abs(dx) * 0.018))

  if (kind === 'toProxy') {
    return {
      c1x: x0 + dx * 0.42,
      c1y: y0 + sign * bow,
      c2x: x1 - dx * 0.32,
      c2y: y1,
    }
  }

  return {
    c1x: x0 + dx * 0.32,
    c1y: y0,
    c2x: x1 - dx * 0.42,
    c2y: y1 + sign * bow,
  }
}

// 代理节点前后使用三次贝塞尔，保证在代理节点处近似水平衔接，避免生硬折线感
const buildProxyBeam = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  kind: ProxyBeamKind,
  branchSign = 0,
) => {
  const { c1x, c1y, c2x, c2y } = getProxyBeamControls(
    x0,
    y0,
    x1,
    y1,
    kind,
    branchSign,
  )
  return `M${x0},${y0} C${c1x},${c1y} ${c2x},${c2y} ${x1},${y1}`
}

const percentToViewBoxX = (percent: number) => (VB_W / 100) * percent
const percentToViewBoxY = (percent: number) => (VB_H / 100) * percent
const getProxyBeamLength = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  kind: ProxyBeamKind,
  branchSign = 0,
) => {
  const { c1x, c1y, c2x, c2y } = getProxyBeamControls(
    x0,
    y0,
    x1,
    y1,
    kind,
    branchSign,
  )
  let length = 0
  let prevX = x0
  let prevY = y0

  for (let i = 1; i <= 18; i++) {
    const t = i / 18
    const mt = 1 - t
    const x =
      mt * mt * mt * x0 +
      3 * mt * mt * t * c1x +
      3 * mt * t * t * c2x +
      t * t * t * x1
    const y =
      mt * mt * mt * y0 +
      3 * mt * mt * t * c1y +
      3 * mt * t * t * c2y +
      t * t * t * y1
    length += Math.hypot(x - prevX, y - prevY)
    prevX = x
    prevY = y
  }

  return length
}

const getFluxDotDuration = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  baseLength: number,
  kind: ProxyBeamKind,
  branchSign = 0,
) =>
  Number(
    (
      (FLUX_DOT_DURATION *
        getProxyBeamLength(x0, y0, x1, y1, kind, branchSign)) /
      baseLength
    ).toFixed(2),
  )

const getParallelProxyMetrics = (count: number) => {
  const safeCount = Math.max(1, count)
  // 固定高度内做自适应并联矩阵：少量时保持纵向并联，数量增多后自动增加列数并缩放节点，
  // 每个代理节点仍然都是「内核 → 代理 → 互联网」的独立并联支路，不画代理节点之间的连线。
  const columns = safeCount <= 4 ? 1 : Math.min(6, Math.ceil(safeCount / 4))
  const rows = Math.ceil(safeCount / columns)
  const presetNodeSize =
    safeCount <= 2
      ? 64
      : safeCount === 3
        ? 52
        : safeCount === 4
          ? 42
          : safeCount <= 6
            ? 42
            : safeCount <= 8
              ? 36
              : safeCount <= 12
                ? 34
                : safeCount <= 16
                  ? 30
                  : safeCount <= 24
                    ? 26
                    : 22
  const verticalFitSize = Math.floor(
    (FLUX_STAGE_HEIGHT * 0.68) / rows - (rows <= 4 ? 8 : 2),
  )
  const nodeSize = Math.max(18, Math.min(presetNodeSize, verticalFitSize))
  const gapX =
    columns <= 1
      ? 0
      : (PARALLEL_PROXY_BAND_RIGHT - PARALLEL_PROXY_BAND_LEFT) / (columns - 1)
  const topRange = (() => {
    if (rows <= 1) return [50]
    const labelExtra = nodeSize <= 32 ? 0 : 12
    const topPadding = ((nodeSize / 2 + 8) / FLUX_STAGE_HEIGHT) * 100
    const bottomPadding =
      ((nodeSize / 2 + labelExtra + 8) / FLUX_STAGE_HEIGHT) * 100
    const minEdge = rows <= 2 ? 30 : rows === 3 ? 22 : rows === 4 ? 17 : 13
    const start = Math.min(44, Math.max(minEdge, topPadding))
    const end = Math.max(56, Math.min(100 - minEdge, 100 - bottomPadding))
    return Array.from(
      { length: rows },
      (_, index) => start + ((end - start) * index) / (rows - 1),
    )
  })()

  return { columns, rows, nodeSize, gapX, topRange }
}

const getParallelProxyPosition = (index: number, count: number) => {
  const { columns, rows, gapX, topRange } = getParallelProxyMetrics(count)
  const row = Math.floor(index / columns)
  const column = index % columns
  const usedColumnsInRow = Math.min(columns, count - row * columns)
  const centeredColumn =
    usedColumnsInRow <= 1 ? 0 : column - (usedColumnsInRow - 1) / 2
  const top =
    topRange[row] ?? (rows <= 1 ? 50 : 18 + (66 * row) / Math.max(rows - 1, 1))

  return {
    left: PARALLEL_PROXY_CENTER_LEFT + centeredColumn * gapX,
    top,
  }
}

interface OrbProps {
  left: string
  top?: string
  size: number
  badge?: string
  compact?: boolean
  accent: string
  active?: boolean
  spinning?: boolean
  onClick?: () => void
  icon: ReactNode
  title: string
  caption: string
  tooltip?: string
  animated?: boolean
}

const Orb = ({
  left,
  top = '50%',
  size,
  badge,
  compact,
  accent,
  active,
  spinning,
  onClick,
  icon,
  title,
  caption,
  tooltip,
  animated = true,
}: OrbProps) => {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const dense = Boolean(compact && size <= 56)
  const ultraDense = Boolean(compact && size <= 32)
  const showTitle = !ultraDense
  const showCaption = !dense
  const hasText = Boolean(title || caption)
  const glassLine = alpha(isDark ? '#ffffff' : '#1e2a4a', isDark ? 0.18 : 0.2)
  const glassHighlight = alpha('#ffffff', isDark ? 0.18 : 0.92)
  const amber = isDark ? '#ffc76b' : '#d98b1e'
  const amberGlow = alpha(amber, isDark ? 0.24 : 0.18)
  const glassTint = alpha(accent, active ? (isDark ? 0.2 : 0.16) : 0.08)
  const glassShadow = active
    ? [
        `inset 0 0 0 1px ${alpha('#ffffff', isDark ? 0.14 : 0.72)}`,
        `inset ${Math.max(4, size * 0.06)}px ${Math.max(
          4,
          size * 0.08,
        )}px ${Math.max(12, size * 0.2)}px ${alpha('#ffffff', isDark ? 0.13 : 0.58)}`,
        `inset -${Math.max(8, size * 0.12)}px -${Math.max(
          10,
          size * 0.14,
        )}px ${Math.max(18, size * 0.28)}px ${alpha(accent, isDark ? 0.22 : 0.13)}`,
        `inset 0 -${Math.max(14, size * 0.22)}px ${Math.max(
          26,
          size * 0.48,
        )}px ${amberGlow}`,
        `0 ${Math.max(10, size * 0.16)}px ${Math.max(26, size * 0.48)}px ${alpha(
          accent,
          isDark ? 0.28 : 0.18,
        )}`,
        `0 ${Math.max(8, size * 0.12)}px ${Math.max(24, size * 0.4)}px ${alpha(
          amber,
          isDark ? 0.14 : 0.1,
        )}`,
        `0 4px 14px ${alpha('#000000', isDark ? 0.34 : 0.1)}`,
      ].join(', ')
    : [
        `inset 0 0 0 1px ${alpha('#ffffff', isDark ? 0.1 : 0.58)}`,
        `inset ${Math.max(3, size * 0.05)}px ${Math.max(
          3,
          size * 0.06,
        )}px ${Math.max(10, size * 0.18)}px ${alpha('#ffffff', isDark ? 0.1 : 0.46)}`,
        `inset -${Math.max(6, size * 0.1)}px -${Math.max(
          8,
          size * 0.12,
        )}px ${Math.max(16, size * 0.24)}px ${alpha(accent, isDark ? 0.11 : 0.08)}`,
        `0 9px 24px ${alpha('#000000', isDark ? 0.28 : 0.08)}`,
      ].join(', ')

  const orb = (
    <Box
      sx={{
        position: 'absolute',
        left,
        top,
        transform: `translate(-50%, -${size / 2}px)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: dense ? 0.85 : compact ? 0.65 : 1.1,
        zIndex: 1,
        maxWidth: ultraDense ? 76 : dense ? 104 : compact ? 140 : 200,
      }}
    >
      <Box
        onClick={onClick}
        sx={{
          width: size,
          height: size,
          aspectRatio: '1 / 1',
          flex: '0 0 auto',
          boxSizing: 'border-box',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          cursor: onClick ? 'pointer' : 'default',
          isolation: 'isolate',
          overflow: 'visible',
          color: accent,
          background: isDark
            ? [
                `radial-gradient(circle at 27% 16%, ${alpha('#ffffff', 0.42)}, ${alpha('#ffffff', 0.12)} 18%, transparent 36%)`,
                `radial-gradient(circle at 42% 32%, ${alpha('#ffffff', 0.16)}, transparent 30%)`,
                `radial-gradient(circle at 70% 78%, ${alpha(amber, active ? 0.26 : 0.15)}, transparent 44%)`,
                `radial-gradient(circle at 82% 86%, ${alpha(accent, active ? 0.28 : 0.14)}, transparent 46%)`,
                `conic-gradient(from 215deg at 52% 54%, transparent 0deg, ${alpha(accent, 0.12)} 64deg, ${alpha(amber, 0.16)} 138deg, transparent 228deg, ${alpha('#ffffff', 0.1)} 310deg, transparent 360deg)`,
                `linear-gradient(145deg, ${alpha('#ffffff', 0.16)}, ${alpha('#ffffff', 0.04)} 45%, ${alpha('#ffffff', 0.09)})`,
                alpha('#101827', 0.42),
              ].join(', ')
            : [
                `radial-gradient(circle at 27% 15%, ${alpha('#ffffff', 0.98)}, ${alpha('#ffffff', 0.54)} 18%, transparent 38%)`,
                `radial-gradient(circle at 38% 34%, ${alpha('#ffffff', 0.5)}, transparent 30%)`,
                `radial-gradient(circle at 70% 78%, ${alpha(amber, active ? 0.28 : 0.16)}, transparent 45%)`,
                `radial-gradient(circle at 82% 92%, ${alpha(accent, active ? 0.22 : 0.12)}, transparent 48%)`,
                `conic-gradient(from 215deg at 52% 54%, transparent 0deg, ${alpha(accent, 0.08)} 62deg, ${alpha(amber, 0.18)} 146deg, transparent 230deg, ${alpha('#ffffff', 0.42)} 314deg, transparent 360deg)`,
                `linear-gradient(145deg, ${alpha('#ffffff', 0.78)}, ${alpha('#ffffff', 0.34)} 52%, ${glassTint})`,
              ].join(', '),
          backdropFilter: 'blur(22px) saturate(1.45)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.45)',
          border: '1px solid',
          borderColor: active ? alpha(accent, isDark ? 0.44 : 0.38) : glassLine,
          boxShadow: glassShadow,
          transition:
            'transform .25s cubic-bezier(.2,.8,.2,1), border-color .25s ease, box-shadow .25s ease, background .25s ease',
          '& .flux-stage-orb__icon, & .flux-stage-orb__badge': {
            zIndex: 3,
          },
          '& .flux-stage-orb__lens': {
            zIndex: 1,
          },
          '& .flux-stage-orb__icon': {
            filter: `drop-shadow(0 2px 4px ${alpha('#000000', isDark ? 0.34 : 0.14)}) drop-shadow(0 0 ${Math.max(8, size * 0.12)}px ${alpha(accent, isDark ? 0.28 : 0.16)})`,
            textShadow: `0 1px 3px ${alpha('#000000', isDark ? 0.35 : 0.12)}`,
          },
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 1,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            zIndex: 0,
            background: [
              `radial-gradient(circle at 28% 18%, ${glassHighlight}, ${alpha('#ffffff', isDark ? 0.1 : 0.34)} 24%, transparent 54%)`,
              `linear-gradient(135deg, ${glassHighlight}, transparent 44%)`,
              `linear-gradient(315deg, ${alpha(amber, active ? 0.2 : 0.1)}, ${alpha(accent, active ? 0.16 : 0.08)} 42%, transparent 62%)`,
            ].join(', '),
            opacity: isDark ? 0.46 : 0.78,
            maskImage:
              'radial-gradient(circle at 32% 24%, #000 0 34%, transparent 62%)',
            WebkitMaskImage:
              'radial-gradient(circle at 32% 24%, #000 0 34%, transparent 62%)',
            transition: 'opacity .25s ease',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: spinning ? -12 : 3,
            borderRadius: spinning ? '50%' : 'inherit',
            pointerEvents: 'none',
            zIndex: 1,
            border: spinning
              ? `1px dashed ${alpha(accent, 0.35)}`
              : `1px solid ${alpha('#ffffff', isDark ? 0.14 : 0.48)}`,
            boxShadow: spinning
              ? `0 0 ${Math.max(18, size * 0.24)}px ${alpha(accent, isDark ? 0.18 : 0.12)}, inset 0 0 ${Math.max(18, size * 0.24)}px ${alpha(amber, isDark ? 0.08 : 0.06)}`
              : `inset 0 -10px 22px ${alpha(amber, isDark ? 0.12 : 0.08)}, inset 0 8px 18px ${alpha('#ffffff', isDark ? 0.06 : 0.22)}`,
            animation:
              spinning && animated ? `${spin} 24s linear infinite` : 'none',
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
            },
          },
          '&:hover': onClick
            ? {
                transform: 'translateY(-2px) scale(1.06)',
                borderColor: alpha(accent, isDark ? 0.58 : 0.5),
                boxShadow: [
                  `inset 0 0 0 1px ${alpha('#ffffff', isDark ? 0.18 : 0.76)}`,
                  `inset ${Math.max(5, size * 0.07)}px ${Math.max(
                    5,
                    size * 0.09,
                  )}px ${Math.max(14, size * 0.22)}px ${alpha('#ffffff', isDark ? 0.17 : 0.68)}`,
                  `inset -${Math.max(9, size * 0.13)}px -${Math.max(
                    12,
                    size * 0.16,
                  )}px ${Math.max(20, size * 0.3)}px ${alpha(accent, isDark ? 0.28 : 0.16)}`,
                  `inset 0 -${Math.max(16, size * 0.24)}px ${Math.max(
                    28,
                    size * 0.5,
                  )}px ${alpha(amber, isDark ? 0.28 : 0.16)}`,
                  `0 ${Math.max(14, size * 0.18)}px ${Math.max(
                    30,
                    size * 0.54,
                  )}px ${alpha(accent, isDark ? 0.38 : 0.24)}`,
                  `0 ${Math.max(8, size * 0.12)}px ${Math.max(
                    26,
                    size * 0.42,
                  )}px ${alpha(amber, isDark ? 0.22 : 0.14)}`,
                  `0 0 0 5px ${alpha(accent, isDark ? 0.08 : 0.06)}`,
                ].join(', '),
                '&::before': {
                  opacity: isDark ? 0.62 : 0.9,
                },
              }
            : {},
        }}
      >
        <Box
          className="flux-stage-orb__lens"
          sx={{
            position: 'absolute',
            inset: Math.max(4, size * 0.08),
            borderRadius: 'inherit',
            pointerEvents: 'none',
            background: [
              `radial-gradient(circle at 28% 18%, ${alpha('#ffffff', isDark ? 0.36 : 0.86)}, transparent 28%)`,
              `radial-gradient(circle at 62% 72%, ${alpha(amber, isDark ? 0.2 : 0.16)}, transparent 42%)`,
              `radial-gradient(circle at 70% 78%, ${alpha(accent, isDark ? 0.16 : 0.1)}, transparent 46%)`,
              `linear-gradient(150deg, transparent 18%, ${alpha('#ffffff', isDark ? 0.08 : 0.26)} 42%, transparent 58%)`,
            ].join(', '),
            boxShadow: [
              `inset 0 0 ${Math.max(12, size * 0.2)}px ${alpha('#ffffff', isDark ? 0.08 : 0.36)}`,
              `inset 0 -${Math.max(8, size * 0.13)}px ${Math.max(16, size * 0.24)}px ${alpha(amber, isDark ? 0.12 : 0.1)}`,
            ].join(', '),
            mixBlendMode: isDark ? 'screen' : 'soft-light',
            opacity: active ? 0.78 : 0.58,
          }}
        />
        <Box
          className="flux-stage-orb__icon"
          sx={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </Box>
        {badge && (
          <Box
            className="flux-stage-orb__badge"
            sx={{
              position: 'absolute',
              left: '50%',
              bottom: dense ? -5 : compact ? -6 : -7,
              transform: 'translateX(-50%)',
              px: dense ? 0.55 : 0.7,
              py: 0.15,
              minWidth: dense ? 28 : compact ? 32 : 36,
              borderRadius: 999,
              fontSize: dense ? 8.5 : compact ? 9 : 10,
              fontWeight: 900,
              lineHeight: 1.2,
              textAlign: 'center',
              color: isDark ? '#061510' : '#ffffff',
              backgroundColor: accent,
              border: '1px solid',
              borderColor: alpha(isDark ? '#ffffff' : '#000000', 0.18),
              boxShadow: `0 0 14px ${alpha(accent, 0.42)}`,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {badge}
          </Box>
        )}
      </Box>
      {hasText && (
        <Box sx={{ textAlign: 'center', minWidth: 0 }}>
          {showTitle && title && (
            <Typography
              noWrap
              title={title}
              sx={{
                fontSize: dense ? 9.5 : compact ? 11.5 : 13,
                fontWeight: 700,
                lineHeight: dense ? 1.08 : compact ? 1.2 : 1.35,
                maxWidth: dense ? 96 : compact ? 140 : 190,
              }}
            >
              {title}
            </Typography>
          )}
          {showCaption && caption && (
            <Typography
              noWrap
              title={caption}
              sx={{
                fontSize: compact ? 9.5 : 10.5,
                fontWeight: 600,
                letterSpacing: compact ? '0.25px' : '0.5px',
                lineHeight: compact ? 1.2 : 1.35,
                color: 'text.secondary',
                maxWidth: compact ? 140 : 190,
              }}
            >
              {caption}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  )

  return tooltip ? (
    <Tooltip title={<Box sx={{ whiteSpace: 'pre-line' }}>{tooltip}</Box>} arrow>
      {orb}
    </Tooltip>
  ) : (
    orb
  )
}

const iconSx = (color: string, size: number) => ({
  width: size,
  height: size,
  color,
})

const HostIcon = (
  <Box
    component="svg"
    viewBox="0 0 24 24"
    fill="none"
    sx={iconSx('currentColor', 30)}
  >
    <rect
      x="3"
      y="4"
      width="18"
      height="13"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M8 21h8M12 17v4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </Box>
)

const NetIcon = (
  <Box
    component="svg"
    viewBox="0 0 24 24"
    fill="none"
    sx={iconSx('currentColor', 30)}
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M3 12h18M12 3c3 3.5 3 14 0 18-3-4-3-14.5 0-18z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </Box>
)

const coreIcon = (color: string, animated = true) => (
  <Box
    component="svg"
    viewBox="0 0 512 512"
    fill="none"
    sx={{
      ...iconSx(color, 54),
      overflow: 'visible',
      '& .flux-core-cat-eye': {
        transformBox: 'fill-box',
        transformOrigin: 'center',
        animation: animated
          ? `${catBlink} 5.4s cubic-bezier(0.42, 0, 0.18, 1) infinite`
          : 'none',
      },
      '& .flux-core-cat-eye--right': {
        animationDelay: '0.035s',
      },
      '& .flux-core-cat-eye-sparkle': {
        transformBox: 'fill-box',
        transformOrigin: 'center',
        animation: animated
          ? `${catEyeSparkleBlink} 5.4s cubic-bezier(0.42, 0, 0.18, 1) infinite`
          : 'none',
      },
      '& .flux-core-cat-eye-sparkle--right': {
        animationDelay: '0.035s',
      },
      '& .flux-core-cat-blink-line': {
        animation: animated
          ? `${catBlinkLine} 5.4s ease-in-out infinite`
          : 'none',
      },
      '& .flux-core-cat-blink-line--right': {
        animationDelay: '0.035s',
      },
      '@media (prefers-reduced-motion: reduce)': {
        '& .flux-core-cat-eye, & .flux-core-cat-eye-sparkle, & .flux-core-cat-blink-line':
          {
            animation: 'none',
          },
      },
    }}
  >
    <path
      fill="currentColor"
      d="M112 216 L88 88 L200 152 Q256 136 312 152 L424 88 L400 216 Q456 272 440 336 Q416 416 328 440 Q256 464 184 440 Q96 416 72 336 Q56 272 112 216 Z"
    />
    <g fill={alpha('#061510', 0.76)}>
      <ellipse
        className="flux-core-cat-eye"
        cx="192"
        cy="280"
        rx="15"
        ry="22"
      />
      <ellipse
        className="flux-core-cat-eye flux-core-cat-eye--right"
        cx="320"
        cy="280"
        rx="15"
        ry="22"
      />
    </g>
    <g fill={alpha('#ffffff', 0.82)}>
      <ellipse
        className="flux-core-cat-eye-sparkle"
        cx="186"
        cy="270"
        rx="4.2"
        ry="6.4"
      />
      <ellipse
        className="flux-core-cat-eye-sparkle flux-core-cat-eye-sparkle--right"
        cx="314"
        cy="270"
        rx="4.2"
        ry="6.4"
      />
    </g>
    <g
      className="flux-core-cat-blink-lines"
      stroke={alpha('#061510', 0.58)}
      strokeWidth="10"
      strokeLinecap="round"
      fill="none"
    >
      <path
        className="flux-core-cat-blink-line"
        d="M174 282 Q192 272 210 282"
      />
      <path
        className="flux-core-cat-blink-line flux-core-cat-blink-line--right"
        d="M302 282 Q320 272 338 282"
      />
    </g>
    <g stroke="currentColor" strokeWidth="16" strokeLinecap="round" fill="none">
      <path d="M128 328 Q64 320 16 304" />
      <path d="M128 360 Q64 368 16 384" />
      <path d="M384 328 Q448 320 496 304" />
      <path d="M384 360 Q448 368 496 384" />
    </g>
  </Box>
)

const nodeIcon = (color: string, size: number) => (
  <Box component="svg" viewBox="0 0 24 24" fill="none" sx={iconSx(color, size)}>
    <path
      d="M5 12.5C7 8 10 6 12 6s5 2 7 6.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <circle cx="12" cy="16" r="2" stroke="currentColor" strokeWidth="1.6" />
  </Box>
)

const PacketIcon = ({
  id,
  d,
  delay,
  duration,
  accent,
  glow,
}: {
  id: string
  d: string
  delay: number
  duration: number
  accent: string
  glow: string
}) => (
  <g
    key={`packet-${id}`}
    className="flux-packet"
    style={{
      offsetPath: `path('${d}')`,
      offsetRotate: 'auto',
      animationDelay: `${delay}s`,
      animationDuration: `${duration}s`,
      filter: `drop-shadow(0 2px 5px ${glow}) drop-shadow(0 0 10px ${glow})`,
    }}
  >
    <g className="flux-packet__glyph" transform="translate(-10 -7)">
      <path
        d="M2.2 3.8c0-1.15.93-2.08 2.08-2.08h9.2L18 6.25v5.05c0 1.15-.93 2.08-2.08 2.08H4.28A2.08 2.08 0 0 1 2.2 11.3Z"
        fill={accent}
        fillOpacity="0.94"
      />
      <path
        d="M13.48 1.72v3.1c0 .8.65 1.43 1.44 1.43H18Z"
        fill="#fff"
        fillOpacity="0.42"
      />
      <path
        d="M4.35 4.25h6.2"
        stroke="#fff"
        strokeOpacity="0.95"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M4.35 6.95h2.1M8.05 6.95h2.1M11.75 6.95h2.1"
        stroke="#fff"
        strokeOpacity="0.78"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <path
        d="M4.35 9.55h3.25M9.2 9.55h4.55"
        stroke="#fff"
        strokeOpacity="0.88"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <path
        d="M15 8.55 17.3 10.3 15 12.05"
        stroke="#fff"
        strokeOpacity="0.9"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.95 2.9c3.2-1.05 8.5-.8 11.25.1"
        stroke="#fff"
        strokeOpacity="0.34"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </g>
  </g>
)

interface FlowOrb {
  key: string
  left?: string
  top?: string
  size: number
  badge?: string
  compact?: boolean
  accent: string
  active: boolean
  spinning?: boolean
  onClick?: () => void
  icon: ReactNode
  title: string
  caption: string
  tooltip?: string
  animated?: boolean
}

interface NodeDescriptor {
  title: string
  caption: string
  active: boolean
  badge?: string
  tooltip?: string
}

interface FlowSegment {
  id: string
  d: string
  c0: string
  c1: string
  delay?: number
  duration?: number
}

interface ChainNode {
  groupName: string
  name: string
  record: IProxyItem | null
  delay: number
}

export const FluxStage = () => {
  const { t } = useTranslation()
  const theme = useTheme()
  const navigate = useNavigate()
  const isDark = theme.palette.mode === 'dark'
  const pageVisible = useVisibility()

  const { verge } = useVerge()
  const lightweightOptimizations =
    verge?.enable_ui_lightweight_optimizations ?? true
  const lightweightPageActive = lightweightOptimizations ? pageVisible : true
  const fluxMotionEnabled = lightweightPageActive
  const { version: coreVersion } = useClash()
  const { proxies } = useProxiesData()
  const { clashConfig } = useClashConfigData()
  const { refreshProxy } = useAppRefreshers()
  const { systemProxyAddress } = useSystemData()
  const { profiles } = useProfiles()
  const {
    response: { data: memory },
  } = useMemoryData({ enabled: lightweightPageActive })
  const {
    response: { data: fullConnections },
  } = useConnectionData({ enabled: !lightweightOptimizations })
  const {
    response: { data: activeConnections },
  } = useConnectionActiveData({
    enabled: lightweightOptimizations ? lightweightPageActive : false,
  })
  const connections = lightweightOptimizations
    ? activeConnections
    : fullConnections
  const currentProfileUid = profiles?.current ?? ''

  const mint = isDark ? '#5af0c8' : theme.palette.success.main
  const blue = isDark ? '#5b8cff' : theme.palette.primary.main
  const purple = isDark ? '#b78cff' : theme.palette.secondary.main

  const mode = clashConfig?.mode?.toLowerCase() || 'rule'
  const isGlobalMode = mode === 'global'
  const isDirectMode = mode === 'direct'
  const systemMixedPort =
    verge?.verge_mixed_port ?? clashConfig?.mixedPort ?? 7897

  // 与 CurrentProxyCard 相同的端口代理视图判定
  const enabledPortProxies = useMemo(
    () =>
      (verge?.port_proxies ?? []).filter(
        (item) =>
          item?.enabled &&
          typeof item.port === 'number' &&
          Number.isFinite(item.port),
      ),
    [verge?.port_proxies],
  )
  const isPortProxyView =
    enabledPortProxies.length > 0 &&
    !verge?.enable_system_proxy &&
    !verge?.enable_tun_mode
  const isAnyProxyEntryActive = Boolean(
    verge?.enable_system_proxy ||
      verge?.enable_tun_mode ||
      enabledPortProxies.length > 0,
  )

  const runtimeProfileNames = useMemo(
    () =>
      (profiles?.items ?? [])
        .map((item) => item?.name?.trim())
        .filter((name): name is string => Boolean(name)),
    [profiles?.items],
  )
  const profileNameByUid = useMemo(
    () =>
      new Map(
        (profiles?.items ?? [])
          .filter((item): item is IProfileItem => Boolean(item?.uid))
          .map((item) => [item.uid, item.name?.trim() || item.uid]),
      ),
    [profiles?.items],
  )
  const activeEntryProfileName = useMemo(() => {
    const configuredUid = verge?.enable_tun_mode
      ? verge?.tun_proxy_profile_uid
      : verge?.enable_system_proxy
        ? verge?.system_proxy_profile_uid
        : ''
    const fallbackUid = currentProfileUid
    return (
      (configuredUid ? profileNameByUid.get(configuredUid) : '') ||
      (fallbackUid ? profileNameByUid.get(fallbackUid) : '') ||
      ''
    )
  }, [
    profileNameByUid,
    currentProfileUid,
    verge?.enable_system_proxy,
    verge?.enable_tun_mode,
    verge?.system_proxy_profile_uid,
    verge?.tun_proxy_profile_uid,
  ])
  const activeEntryRuntimeRoute = useMemo(() => {
    if (isPortProxyView || !isAnyProxyEntryActive) return null
    if (!verge?.enable_system_proxy && !verge?.enable_tun_mode) return null

    return findLatestRuntimeConnectionRoute(connections?.activeConnections, {
      mode: verge?.enable_tun_mode ? 'tun' : 'system',
      mixedPort: systemMixedPort,
      profileNames: runtimeProfileNames,
    })
  }, [
    connections?.activeConnections,
    isAnyProxyEntryActive,
    isPortProxyView,
    runtimeProfileNames,
    systemMixedPort,
    verge?.enable_system_proxy,
    verge?.enable_tun_mode,
  ])

  // 系统代理 / TUN 只展示活跃连接实际命中的链路，避免把配置选择误当成真实出口。
  const chainNodes = useMemo<ChainNode[]>(() => {
    if (!activeEntryRuntimeRoute) return []

    const records = proxies?.records || {}
    const toNode = (name: string, groupName: string): ChainNode => {
      const record = (records[name] as IProxyItem | undefined) ?? null
      const delay = record ? delayManager.getDelayFix(record, groupName) : -1
      return { groupName, name, record, delay }
    }

    return activeEntryRuntimeRoute.route.map((name, index, route) =>
      toNode(
        name,
        index === route.length - 1
          ? activeEntryRuntimeRoute.groupName
          : route[index - 1] || name,
      ),
    )
  }, [activeEntryRuntimeRoute, proxies])

  const exitNode =
    !isPortProxyView && chainNodes.length
      ? chainNodes[chainNodes.length - 1]
      : null
  const exitDelay = exitNode?.delay ?? -1

  const delayColorKey = (
    delayManager.formatDelayColor(exitDelay) || 'primary.main'
  ).split('.')[0] as 'success' | 'warning' | 'error' | 'primary'
  const delayColor =
    theme.palette[delayColorKey]?.main ?? theme.palette.primary.main

  const handleRetestDelay = useLockFn(async () => {
    if (!exitNode?.name || !exitNode.groupName || isDirectMode) return
    const timeout = verge?.default_latency_timeout || 10000
    try {
      await delayManager.checkDelay(exitNode.name, exitNode.groupName, timeout)
    } finally {
      refreshProxy()
    }
  })

  const goToNode = useCallback(() => {
    navigate(isPortProxyView ? '/ports' : '/proxies')
  }, [navigate, isPortProxyView])

  // 入口（本机）说明
  const entryCaption = useMemo(() => {
    if (verge?.enable_tun_mode) return 'TUN 虚拟网卡'
    if (verge?.enable_system_proxy) return systemProxyAddress || '系统代理'
    if (enabledPortProxies.length > 0)
      return `端口代理 ×${enabledPortProxies.length}`
    return '未启用代理入口'
  }, [
    verge?.enable_tun_mode,
    verge?.enable_system_proxy,
    systemProxyAddress,
    enabledPortProxies.length,
  ])

  const [memUsed, memUnit] = parseTraffic(memory?.inuse || 0)
  const connCount = connections?.activeConnections?.length ?? 0

  const modeLabel = isDirectMode
    ? t('home.components.clashMode.labels.direct')
    : isGlobalMode
      ? t('home.components.clashMode.labels.global')
      : t('home.components.clashMode.labels.rule')

  const portProxyRuntimeRouteMap = useMemo(() => {
    const routeMap = new Map<
      string,
      ReturnType<typeof findLatestPortProxyRuntimeConnectionRoute>
    >()
    const activeConnections = connections?.activeConnections ?? []

    for (const portProxy of enabledPortProxies) {
      const key = portProxy.id || `${portProxy.port ?? ''}`
      if (!key) continue

      const route = findLatestPortProxyRuntimeConnectionRoute(
        activeConnections,
        portProxy,
        runtimeProfileNames,
      )
      if (route) routeMap.set(key, route)
    }

    return routeMap
  }, [connections?.activeConnections, enabledPortProxies, runtimeProfileNames])

  const activeEntryNodeOrbInfo = useMemo(() => {
    if (verge?.enable_tun_mode) {
      const inboundName = activeEntryRuntimeRoute?.inboundName?.trim()
      const inboundPort = activeEntryRuntimeRoute?.inboundPort?.trim()
      return {
        title: inboundName || '虚拟网卡代理',
        badge: inboundPort || 'TUN',
        profileName: activeEntryProfileName,
      }
    }

    if (verge?.enable_system_proxy) {
      const inboundPort = activeEntryRuntimeRoute?.inboundPort?.trim()
      return {
        title: '系统代理',
        badge: inboundPort || String(systemMixedPort),
        profileName: activeEntryProfileName,
      }
    }

    return {
      title: '',
      badge: undefined,
      profileName: '',
    }
  }, [
    activeEntryProfileName,
    activeEntryRuntimeRoute?.inboundName,
    activeEntryRuntimeRoute?.inboundPort,
    systemMixedPort,
    verge?.enable_system_proxy,
    verge?.enable_tun_mode,
  ])

  // 节点轨道描述（端口代理视图 / 链路节点 / 占位）
  const nodeDescriptors = useMemo<NodeDescriptor[]>(() => {
    if (!isAnyProxyEntryActive) {
      return [{ title: '', caption: '', active: false }]
    }

    if (isPortProxyView) {
      return enabledPortProxies.map((item) => {
        const port = String(item.port)
        const title = item.name?.trim() || `端口代理 ${port}`
        const route = portProxyRuntimeRouteMap.get(
          item.id || `${item.port ?? ''}`,
        )
        const subscriptionName =
          item.subscriptionName?.trim() || item.subscriptionUid?.trim() || ''
        const caption =
          formatRuntimeConnectionRouteLabel(route) || '等待真实流量匹配'
        const nodeName = route?.displayNodeName || route?.nodeName || ''
        const groupName = route?.displayGroupName || route?.groupName || ''
        return {
          title,
          caption,
          badge: port,
          active: true,
          tooltip: [
            `代理：${title}`,
            `端口：${port}`,
            subscriptionName ? `订阅：${subscriptionName}` : '',
            nodeName ? `节点：${nodeName}` : '节点：等待真实流量匹配',
            groupName ? `节点组：${groupName}` : '',
            route?.rule ? `规则：${route.rule}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        }
      })
    }

    if (verge?.enable_system_proxy || verge?.enable_tun_mode) {
      const exit = chainNodes[chainNodes.length - 1]
      const displayNodeName =
        activeEntryRuntimeRoute?.displayNodeName ||
        activeEntryRuntimeRoute?.nodeName ||
        ''
      const displayGroupName = activeEntryRuntimeRoute?.groupName
        ? stripRuntimeProfilePrefix(
            activeEntryRuntimeRoute.groupName,
            runtimeProfileNames,
          )
        : ''
      const nodeInfo = displayNodeName
        ? `${displayNodeName}${displayGroupName ? ` · ${displayGroupName}` : ''}`
        : '等待真实流量匹配'
      const profilePrefix = activeEntryNodeOrbInfo.profileName
        ? `${activeEntryNodeOrbInfo.profileName} · `
        : ''
      const caption =
        exit?.name === 'DIRECT' || isDirectMode
          ? `${profilePrefix}DIRECT · 直连模式`
          : `${profilePrefix}${nodeInfo}`
      const proxyTypeName = verge?.enable_tun_mode ? '虚拟网卡代理' : '系统代理'

      return [
        {
          title: activeEntryNodeOrbInfo.title,
          caption,
          badge: activeEntryNodeOrbInfo.badge,
          active: isAnyProxyEntryActive,
          tooltip: [
            `代理：${proxyTypeName}`,
            activeEntryNodeOrbInfo.profileName
              ? `订阅：${activeEntryNodeOrbInfo.profileName}`
              : '',
            activeEntryNodeOrbInfo.badge
              ? `端口：${activeEntryNodeOrbInfo.badge}`
              : '',
            `节点：${nodeInfo}`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ]
    }

    const exit = chainNodes[chainNodes.length - 1]
    const type = exit.record?.type ? String(exit.record.type) : ''
    const role =
      activeEntryRuntimeRoute?.rule ||
      (chainNodes.length > 1 ? '链式代理出口' : exit.groupName)
    const caption = isDirectMode
      ? '直连模式'
      : `${role}${type ? ` · ${type}` : ''}`
    return [
      {
        title:
          activeEntryRuntimeRoute?.displayNodeName ||
          activeEntryRuntimeRoute?.nodeName ||
          '',
        caption,
        active: Boolean(exit.name),
      },
    ]
  }, [
    activeEntryNodeOrbInfo.badge,
    activeEntryNodeOrbInfo.profileName,
    activeEntryNodeOrbInfo.title,
    activeEntryRuntimeRoute,
    chainNodes,
    enabledPortProxies,
    isDirectMode,
    isAnyProxyEntryActive,
    isPortProxyView,
    portProxyRuntimeRouteMap,
    runtimeProfileNames,
    verge?.enable_system_proxy,
    verge?.enable_tun_mode,
  ])

  const isParallelPortView = isPortProxyView && nodeDescriptors.length > 1
  const parallelProxyMetrics = useMemo(
    () => getParallelProxyMetrics(nodeDescriptors.length),
    [nodeDescriptors.length],
  )
  const parallelProxyPositions = useMemo(
    () =>
      nodeDescriptors.map((_, index) =>
        getParallelProxyPosition(index, nodeDescriptors.length),
      ),
    [nodeDescriptors],
  )
  const nodeSize = isParallelPortView
    ? parallelProxyMetrics.nodeSize
    : nodeDescriptors.length > 1
      ? 78
      : 92

  // 组装流向轨道：本机 → Mihomo 内核 → [节点…] → 互联网
  const hostOrb: FlowOrb = {
    key: 'host',
    size: 76,
    accent: mint,
    active: isAnyProxyEntryActive,
    icon: HostIcon,
    title: '本机',
    caption: entryCaption,
  }
  const coreOrb: FlowOrb = {
    key: 'core',
    size: 108,
    accent: mint,
    active: true,
    spinning: true,
    animated: fluxMotionEnabled,
    icon: coreIcon(mint, fluxMotionEnabled),
    title: 'Mihomo 内核',
    caption: `${coreVersion || '-'} · ${memUsed}${memUnit} · ${connCount} 连接`,
  }
  const internetOrb: FlowOrb = {
    key: 'internet',
    size: 76,
    accent: purple,
    active: false,
    icon: NetIcon,
    title: '互联网',
    caption: modeLabel,
  }
  const proxyOrbs: FlowOrb[] = nodeDescriptors.map((n, i) => {
    const position = parallelProxyPositions[i]
    return {
      key: `node-${i}`,
      left: isParallelPortView && position ? `${position.left}%` : undefined,
      top: isParallelPortView && position ? `${position.top}%` : undefined,
      size: nodeSize,
      badge: n.badge,
      compact: isParallelPortView,
      accent: blue,
      active: n.active,
      onClick: goToNode,
      icon: nodeIcon(
        blue,
        isParallelPortView
          ? Math.max(14, Math.min(30, nodeSize * 0.52))
          : nodeSize > 80
            ? 36
            : Math.max(22, nodeSize * 0.5),
      ),
      title: n.title,
      caption: n.caption,
      tooltip: n.tooltip,
    }
  })
  const flowOrbs: FlowOrb[] = isParallelPortView
    ? [
        {
          ...hostOrb,
          left: `${PARALLEL_HOST_LEFT}%`,
          top: '50%',
        },
        {
          ...coreOrb,
          left: `${PARALLEL_CORE_LEFT}%`,
          top: '50%',
        },
        ...proxyOrbs,
        {
          ...internetOrb,
          left: `${PARALLEL_INTERNET_LEFT}%`,
          top: '50%',
        },
      ]
    : [hostOrb, coreOrb, ...proxyOrbs, internetOrb]

  const orbCount = flowOrbs.length
  const orbColors = flowOrbs.map((o) => o.accent)

  // 相邻节点之间的光束保持原来的光束样式。
  // 多端口代理时是并联：本机 → 内核，然后内核分别连到每个代理节点，
  // 每个代理节点再分别连到互联网；不画代理节点之间的连接线。
  const segments: FlowSegment[] = []
  if (isParallelPortView) {
    const coreX = percentToViewBoxX(PARALLEL_CORE_LEFT)
    const hostX = percentToViewBoxX(PARALLEL_HOST_LEFT)
    const internetX = percentToViewBoxX(PARALLEL_INTERNET_LEFT)
    const midY = percentToViewBoxY(50)
    const baseLength = Math.abs(coreX - hostX)

    segments.push({
      id: 'flux-seg-host-core',
      d: buildBeam(hostX, coreX),
      c0: mint,
      c1: mint,
      delay: 0,
      duration: FLUX_DOT_DURATION,
    })

    parallelProxyPositions.forEach((position, index) => {
      const proxyX = percentToViewBoxX(position.left)
      const proxyY = percentToViewBoxY(position.top)
      const branchSign =
        Math.abs(proxyY - midY) < 1 ? 0 : Math.sign(proxyY - midY)

      segments.push(
        {
          id: `flux-seg-core-proxy-${index}`,
          d: buildProxyBeam(coreX, midY, proxyX, proxyY, 'toProxy', branchSign),
          c0: mint,
          c1: blue,
          // 内核 → 各代理节点的小球统一从内核球同时发出，
          // 动画时长按路径长度换算，保证速度与「本机 → 内核」一致。
          delay: 0,
          duration: getFluxDotDuration(
            coreX,
            midY,
            proxyX,
            proxyY,
            baseLength,
            'toProxy',
            branchSign,
          ),
        },
        {
          id: `flux-seg-proxy-internet-${index}`,
          d: buildProxyBeam(
            proxyX,
            proxyY,
            internetX,
            midY,
            'fromProxy',
            branchSign,
          ),
          c0: blue,
          c1: purple,
          // 代理节点 → 互联网的小球也统一同时发出，速度同样保持一致。
          delay: 0,
          duration: getFluxDotDuration(
            proxyX,
            proxyY,
            internetX,
            midY,
            baseLength,
            'fromProxy',
            branchSign,
          ),
        },
      )
    })
  } else {
    const hostCoreLength = Math.abs(
      percentToViewBoxX(orbLeftPercent(1, orbCount)) -
        percentToViewBoxX(orbLeftPercent(0, orbCount)),
    )
    for (let i = 0; i < orbCount - 1; i++) {
      const x0 = percentToViewBoxX(orbLeftPercent(i, orbCount))
      const x1 = percentToViewBoxX(orbLeftPercent(i + 1, orbCount))
      const isProxySideBeam = i >= 1
      const proxyBeamKind: ProxyBeamKind = i === 1 ? 'toProxy' : 'fromProxy'
      const d = isProxySideBeam
        ? buildProxyBeam(x0, VB_MID_Y, x1, VB_MID_Y, proxyBeamKind)
        : buildBeam(x0, x1)
      segments.push({
        id: `flux-seg-${i}`,
        d,
        c0: orbColors[i],
        c1: orbColors[i + 1],
        duration: isProxySideBeam
          ? getFluxDotDuration(
              x0,
              VB_MID_Y,
              x1,
              VB_MID_Y,
              hostCoreLength,
              proxyBeamKind,
            )
          : undefined,
      })
    }
  }

  // 出口节点轨道下标（互联网前一个）
  const exitOrbIndex = orbCount - 2
  const exitLeftPercent = orbLeftPercent(exitOrbIndex, orbCount)
  const showDelayBadge =
    !isPortProxyView &&
    !isDirectMode &&
    Boolean(exitNode?.name) &&
    exitNode?.name !== 'DIRECT'

  return (
    <Box
      sx={{
        position: 'relative',
        height: FLUX_STAGE_HEIGHT,
        mb: 1.5,
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* 链路光束 */}
      <Box
        component="svg"
        viewBox="0 0 1200 320"
        preserveAspectRatio="none"
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
          '& .flux-packet': {
            animation: fluxMotionEnabled
              ? `${travel} ${FLUX_DOT_DURATION}s linear infinite`
              : 'none',
            transformBox: 'fill-box',
            transformOrigin: 'center',
            willChange: fluxMotionEnabled ? 'offset-distance' : 'auto',
            opacity: fluxMotionEnabled ? 1 : 0,
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
              opacity: 0,
            },
          },
          '& .flux-packet__glyph': {
            paintOrder: 'stroke',
            stroke: alpha(theme.palette.common.white, isDark ? 0.18 : 0.62),
            strokeWidth: 0.65,
          },
        }}
      >
        <defs>
          {segments.map((s) => (
            <linearGradient key={s.id} id={s.id} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={s.c0} stopOpacity="0.18" />
              <stop offset="100%" stopColor={s.c1} stopOpacity="0.7" />
            </linearGradient>
          ))}
        </defs>
        {segments.map((s) => (
          <path
            key={s.id}
            d={s.d}
            fill="none"
            stroke={`url(#${s.id})`}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {segments.map((s, i) => (
          <PacketIcon
            key={`packet-${s.id}`}
            id={s.id}
            d={s.d}
            delay={s.delay ?? -i * 0.8}
            duration={s.duration ?? FLUX_DOT_DURATION}
            accent={s.c1}
            glow={alpha(s.c1, isDark ? 0.56 : 0.34)}
          />
        ))}
      </Box>

      {/* 流向轨道节点 */}
      {flowOrbs.map((o, i) => (
        <Orb
          key={o.key}
          left={o.left ?? `${orbLeftPercent(i, orbCount)}%`}
          top={o.top}
          size={o.size}
          badge={o.badge}
          compact={o.compact}
          accent={o.accent}
          active={o.active}
          spinning={o.spinning}
          onClick={o.onClick}
          icon={o.icon}
          title={o.title}
          caption={o.caption}
          tooltip={o.tooltip}
          animated={o.animated ?? fluxMotionEnabled}
        />
      ))}

      {/* 出口节点延迟徽章（点击重测） */}
      {showDelayBadge && (
        <Tooltip title="点击重新测试出口节点延迟" arrow>
          <Box
            onClick={handleRetestDelay}
            sx={{
              position: 'absolute',
              left: `${exitLeftPercent}%`,
              top: '20%',
              transform: 'translate(-50%, -50%)',
              zIndex: 2,
              px: 1.6,
              py: 0.55,
              borderRadius: 999,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: delayColor,
              backgroundColor: alpha(delayColor, isDark ? 0.1 : 0.08),
              border: `1px solid ${alpha(delayColor, 0.4)}`,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: `0 0 22px ${alpha(delayColor, 0.25)}`,
              transition: 'box-shadow .2s ease',
              '&:hover': {
                boxShadow: `0 0 30px ${alpha(delayColor, 0.45)}`,
              },
            }}
          >
            {delayManager.formatDelay(exitDelay)}
          </Box>
        </Tooltip>
      )}
    </Box>
  )
}
