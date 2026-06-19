import {
  DirectionsRounded,
  LanguageRounded,
  MultipleStopRounded,
} from '@mui/icons-material'
import { Box, Paper, Stack, Typography, alpha, useTheme } from '@mui/material'
import { useLockFn } from 'ahooks'
import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { closeAllConnections } from 'tauri-plugin-mihomo-api'

import { useVerge } from '@/hooks/use-app-config'
import { useRuntimeConfig } from '@/hooks/use-clash'
import {
  useAppRefreshers,
  useClashConfigData,
  useCoreDataStatus,
} from '@/providers/app-data-context'
import { patchClashMode } from '@/services/cmds'
import type { TranslationKey } from '@/types/generated/i18n-keys'

const CLASH_MODES = ['rule', 'global', 'direct'] as const
type ClashMode = (typeof CLASH_MODES)[number]

const isClashMode = (mode: string): mode is ClashMode =>
  (CLASH_MODES as readonly string[]).includes(mode)

const toClashMode = (mode?: string | null) => {
  const normalized = mode?.toLowerCase()
  return normalized && isClashMode(normalized) ? normalized : undefined
}

const MODE_META: Record<
  ClashMode,
  { label: TranslationKey; description: TranslationKey }
> = {
  rule: {
    label: 'home.components.clashMode.labels.rule',
    description: 'home.components.clashMode.descriptions.rule',
  },
  global: {
    label: 'home.components.clashMode.labels.global',
    description: 'home.components.clashMode.descriptions.global',
  },
  direct: {
    label: 'home.components.clashMode.labels.direct',
    description: 'home.components.clashMode.descriptions.direct',
  },
}

const MODE_ICONS: Record<ClashMode, ReactNode> = {
  rule: <MultipleStopRounded fontSize="small" />,
  global: <LanguageRounded fontSize="small" />,
  direct: <DirectionsRounded fontSize="small" />,
}

export const ClashModeCard = () => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const accent = theme.palette.primary.main
  const { verge } = useVerge()
  const { clashConfig } = useClashConfigData()
  const { isCoreDataPending } = useCoreDataStatus()
  const { refreshClashConfig } = useAppRefreshers()

  const controllerMode = toClashMode(clashConfig?.mode)
  const { data: runtimeConfig, isPending: isRuntimeConfigPending } =
    useRuntimeConfig(!controllerMode)
  const runtimeMode = toClashMode(runtimeConfig?.mode)
  const currentMode = controllerMode ?? runtimeMode

  const modeDescription = currentMode
    ? t(MODE_META[currentMode].description)
    : isCoreDataPending || isRuntimeConfigPending
      ? '\u00A0'
      : t('home.components.clashMode.errors.communication')

  // 切换模式的处理函数
  const onChangeMode = useLockFn(async (mode: ClashMode) => {
    if (mode === currentMode) return
    if (verge?.auto_close_connection) {
      closeAllConnections()
    }

    try {
      await patchClashMode(mode)
      // 使用共享的刷新方法
      refreshClashConfig()
    } catch (error) {
      console.error('Failed to change mode:', error)
    }
  })

  // 按钮样式 - 3D立体微按钮
  const getButtonSx = (mode: ClashMode) => {
    const isActive = mode === currentMode
    return {
      cursor: 'pointer',
      px: 2,
      py: 1.2,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      bgcolor: isActive ? accent : 'background.paper',
      color: isActive ? theme.palette.primary.contrastText : 'text.primary',
      borderRadius: 1.5,
      position: 'relative' as const,
      overflow: 'visible' as const,
      transform: 'perspective(400px) translateZ(0)',
      transformStyle: 'preserve-3d' as const,
      boxShadow: isActive
        ? isDark
          ? [
              `inset 0 0 0 1px ${alpha('#ffffff', 0.08)}`,
              `0 2px 6px ${alpha(accent, 0.25)}`,
              `0 6px 14px ${alpha(accent, 0.15)}`,
              `inset 0 1px 0 ${alpha('#ffffff', 0.08)}`,
            ].join(', ')
          : [
              `inset 0 0 0 1px ${alpha('#ffffff', 0.3)}`,
              `0 2px 6px ${alpha(accent, 0.15)}`,
              `0 6px 14px ${alpha(accent, 0.1)}`,
              `inset 0 1px 0 ${alpha('#ffffff', 0.3)}`,
            ].join(', ')
        : isDark
          ? [
              `inset 0 0 0 1px ${alpha(accent, 0.14)}`,
              `0 1px 3px ${alpha('#000000', 0.1)}`,
              `0 3px 8px ${alpha('#000000', 0.08)}`,
              `inset 0 1px 0 ${alpha('#ffffff', 0.04)}`,
              `inset 0 -1px 0 ${alpha('#000000', 0.06)}`,
            ].join(', ')
          : [
              `inset 0 0 0 1px ${alpha(accent, 0.1)}`,
              `0 1px 2px ${alpha('#000000', 0.04)}`,
              `0 3px 8px ${alpha('#000000', 0.03)}`,
              `inset 0 1px 0 ${alpha('#ffffff', 0.5)}`,
              `inset 0 -1px 0 ${alpha('#000000', 0.02)}`,
            ].join(', '),
      transition:
        'transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s cubic-bezier(.2,.8,.2,1)',
      '&:hover': {
        transform: isActive
          ? 'perspective(400px) translateZ(4px) translateY(-2px)'
          : 'perspective(400px) translateZ(6px) translateY(-2px)',
        boxShadow: isActive
          ? isDark
            ? [
                `0 4px 10px ${alpha(accent, 0.3)}`,
                `0 10px 22px ${alpha(accent, 0.2)}`,
                `inset 0 1px 0 ${alpha('#ffffff', 0.1)}`,
              ].join(', ')
            : [
                `0 4px 10px ${alpha(accent, 0.2)}`,
                `0 10px 22px ${alpha(accent, 0.12)}`,
                `inset 0 1px 0 ${alpha('#ffffff', 0.4)}`,
              ].join(', ')
          : isDark
            ? [
                `0 2px 5px ${alpha('#000000', 0.15)}`,
                `0 6px 14px ${alpha('#000000', 0.1)}`,
                `inset 0 1px 0 ${alpha('#ffffff', 0.06)}`,
                `inset 0 -1px 0 ${alpha('#000000', 0.08)}`,
              ].join(', ')
            : [
                `0 2px 4px ${alpha('#000000', 0.05)}`,
                `0 6px 14px ${alpha('#000000', 0.04)}`,
                `inset 0 1px 0 ${alpha('#ffffff', 0.6)}`,
                `inset 0 -1px 0 ${alpha('#000000', 0.03)}`,
              ].join(', '),
      },
      '&:active': {
        transform: 'perspective(400px) translateZ(-2px) translateY(1px)',
        boxShadow: isActive
          ? `0 1px 3px ${alpha(accent, 0.15)}, inset 0 1px 0 ${alpha('#ffffff', 0.06)}`
          : `0 1px 2px ${alpha('#000000', 0.04)}, inset 0 1px 0 ${alpha('#ffffff', 0.3)}`,
      },
      '&::after': isActive
        ? {
            content: '""',
            position: 'absolute',
            bottom: -16,
            left: '50%',
            width: 2,
            height: 16,
            bgcolor: accent,
            transform: 'translateX(-50%)',
            borderRadius: 1,
          }
        : {},
    }
  }

  // 描述样式
  const descriptionStyles = {
    width: '95%',
    textAlign: 'center',
    color: 'text.secondary',
    p: 0.8,
    borderRadius: 1,
    borderColor: 'primary.main',
    borderWidth: 1,
    borderStyle: 'solid',
    backgroundColor: 'background.paper',
    wordBreak: 'break-word',
    hyphens: 'auto',
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* 模式选择按钮组 */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          py: 1,
          position: 'relative',
          zIndex: 2,
        }}
      >
        {CLASH_MODES.map((mode) => (
          <Paper
            key={mode}
            elevation={0}
            onClick={() => onChangeMode(mode)}
            sx={getButtonSx(mode)}
          >
            {MODE_ICONS[mode]}
            <Typography
              variant="body2"
              sx={{
                textTransform: 'capitalize',
                fontWeight: mode === currentMode ? 600 : 400,
              }}
            >
              {t(MODE_META[mode].label)}
            </Typography>
          </Paper>
        ))}
      </Stack>

      {/* 说明文本区域 */}
      <Box
        sx={{
          width: '100%',
          my: 1,
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          overflow: 'visible',
        }}
      >
        <Typography variant="caption" component="div" sx={descriptionStyles}>
          {modeDescription}
        </Typography>
      </Box>
    </Box>
  )
}
