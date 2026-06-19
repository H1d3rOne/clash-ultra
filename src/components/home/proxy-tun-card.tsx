import {
  ComputerRounded,
  SettingsEthernetRounded,
  TroubleshootRounded,
  HelpOutlineRounded,
  SvgIconComponent,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  Typography,
  Stack,
  Paper,
  Tooltip,
  alpha,
  useTheme,
  Fade,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { useState, useMemo, memo, FC } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { closeAllConnections } from 'tauri-plugin-mihomo-api'

import { Switch } from '@/components/base'
import ProxyControlSwitches from '@/components/shared/proxy-control-switches'
import { useVerge } from '@/hooks/use-app-config'
import { useClash } from '@/hooks/use-clash'
import { useSystemProxyState } from '@/hooks/use-system-proxy-state'
import { useSystemState } from '@/hooks/use-system-state'
import { showNotice } from '@/services/notice-service'

const LOCAL_STORAGE_TAB_KEY = 'clash-ultra-proxy-active-tab'

interface TabButtonProps {
  isActive: boolean
  onClick: () => void
  icon: SvgIconComponent
  label: string
  hasIndicator?: boolean
}

// Tab组件
const TabButton: FC<TabButtonProps> = memo(
  ({ isActive, onClick, icon: Icon, label, hasIndicator = false }) => (
    <Paper
      elevation={isActive ? 2 : 0}
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        px: 2,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        bgcolor: isActive ? 'primary.main' : 'background.paper',
        color: isActive ? 'primary.contrastText' : 'text.primary',
        borderRadius: 1.5,
        flex: 1,
        maxWidth: 160,
        transition: 'all 0.2s ease-in-out',
        position: 'relative',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: 1,
        },
        '&:after': isActive
          ? {
              content: '""',
              position: 'absolute',
              bottom: -9,
              left: '50%',
              width: 2,
              height: 9,
              bgcolor: 'primary.main',
              transform: 'translateX(-50%)',
            }
          : {},
      }}
    >
      <Icon fontSize="small" />
      <Typography variant="body2" sx={{ fontWeight: isActive ? 600 : 400 }}>
        {label}
      </Typography>
      {hasIndicator && (
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: isActive ? '#fff' : 'success.main',
            position: 'absolute',
            top: 8,
            right: 8,
          }}
        />
      )}
    </Paper>
  ),
)

interface TabDescriptionProps {
  description: string
  tooltipTitle: string
}

// 描述文本组件
const TabDescription: FC<TabDescriptionProps> = memo(
  ({ description, tooltipTitle }) => (
    <Fade in={true} timeout={200}>
      <Typography
        variant="caption"
        component="div"
        sx={{
          width: '95%',
          textAlign: 'center',
          color: 'text.secondary',
          p: 0.8,
          borderRadius: 1,
          borderColor: 'primary.main',
          borderWidth: 1,
          borderStyle: 'solid',
          backgroundColor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          wordBreak: 'break-word',
          hyphens: 'auto',
        }}
      >
        {description}
        <Tooltip title={tooltipTitle}>
          <HelpOutlineRounded
            sx={{ fontSize: 14, opacity: 0.7, flexShrink: 0 }}
          />
        </Tooltip>
      </Typography>
    </Fade>
  ),
)

export const ProxyTunCard: FC = () => {
  const { t } = useTranslation()
  const theme = useTheme()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<string>(
    () => localStorage.getItem(LOCAL_STORAGE_TAB_KEY) || 'system',
  )

  const { verge, mutateVerge, patchVerge } = useVerge()
  const { mutateClash } = useClash()
  const { isTunModeAvailable } = useSystemState()
  const { configState: systemProxyConfigState, toggleSystemProxy } =
    useSystemProxyState()

  const { enable_tun_mode } = verge ?? {}
  const portProxies = useMemo(
    () => verge?.port_proxies ?? [],
    [verge?.port_proxies],
  )
  const portProxyCount = portProxies.length
  const enabledPortProxyCount = useMemo(
    () => portProxies.filter((item) => item?.enabled).length,
    [portProxies],
  )
  const somePortProxiesEnabled = enabledPortProxyCount > 0
  const allPortProxiesEnabled =
    portProxyCount > 0 && enabledPortProxyCount === portProxyCount
  const isPortProxyRuntimeActive =
    somePortProxiesEnabled && !systemProxyConfigState && !enable_tun_mode

  const handleError = (err: unknown) => {
    showNotice.error(err)
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    localStorage.setItem(LOCAL_STORAGE_TAB_KEY, tab)
  }

  const goToPorts = () => {
    navigate('/ports')
  }

  const toggleAllPortProxies = useLockFn(async (enabled: boolean) => {
    if (portProxyCount === 0) {
      goToPorts()
      return
    }

    if (enabled) {
      if (systemProxyConfigState) {
        await toggleSystemProxy(false)
      }
      if (enable_tun_mode) {
        mutateVerge((prev) =>
          prev ? { ...prev, enable_tun_mode: false } : prev,
        )
        await patchVerge({ enable_tun_mode: false })
      }
    }

    const nextPortProxies = portProxies.map((item) => ({
      ...item,
      enabled,
    }))

    await patchVerge({ port_proxies: nextPortProxies })
    mutateVerge((prev) =>
      prev ? { ...prev, port_proxies: nextPortProxies } : prev,
    )
    if (verge?.auto_close_connection) closeAllConnections()
    await mutateClash()
    showNotice.success(`所有端口代理已${enabled ? '开启' : '关闭'}`)
  })

  const tabDescription = useMemo(() => {
    if (activeTab === 'system') {
      return {
        text: systemProxyConfigState
          ? t('home.components.proxyTun.status.systemProxyEnabled')
          : t('home.components.proxyTun.status.systemProxyDisabled'),
        tooltip: t('home.components.proxyTun.tooltips.systemProxy'),
      }
    }

    if (activeTab === 'port') {
      if (portProxyCount === 0) {
        return {
          text: '暂无端口代理，请到代理页面添加端口代理',
          tooltip:
            '端口代理可以创建多个独立监听端口，每个端口可以绑定自己的订阅、规则或链式出口。',
        }
      }
      if (isPortProxyRuntimeActive) {
        return {
          text: '不同的端口表示不同的的代理入口',
          tooltip:
            '端口代理模式下，已开启的每个端口都会作为一个独立入口监听流量。',
        }
      }
      if (somePortProxiesEnabled) {
        return {
          text: `${enabledPortProxyCount} 个端口代理已开启，但当前被系统代理或虚拟网卡模式覆盖`,
          tooltip:
            '系统代理、端口代理、虚拟网卡代理同时只能实际使用一种；开启端口代理会自动关闭系统代理和虚拟网卡。',
        }
      }
      return {
        text: `已配置 ${portProxyCount} 个端口代理，当前未开启`,
        tooltip:
          '开启后会监听对应端口；如果需要新增或编辑端口，请进入代理页面管理。',
      }
    }

    return {
      text: !isTunModeAvailable
        ? t('home.components.proxyTun.status.tunModeServiceRequired')
        : enable_tun_mode
          ? t('home.components.proxyTun.status.tunModeEnabled')
          : t('home.components.proxyTun.status.tunModeDisabled'),
      tooltip: t('home.components.proxyTun.tooltips.tunMode'),
    }
  }, [
    activeTab,
    systemProxyConfigState,
    enable_tun_mode,
    isTunModeAvailable,
    portProxyCount,
    enabledPortProxyCount,
    somePortProxiesEnabled,
    isPortProxyRuntimeActive,
    t,
  ])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <TabButton
          isActive={activeTab === 'system'}
          onClick={() => handleTabChange('system')}
          icon={ComputerRounded}
          label={t('settings.sections.system.toggles.systemProxy')}
          hasIndicator={systemProxyConfigState}
        />
        <TabButton
          isActive={activeTab === 'port'}
          onClick={() => handleTabChange('port')}
          icon={SettingsEthernetRounded}
          label="端口代理"
        />
        <TabButton
          isActive={activeTab === 'tun'}
          onClick={() => handleTabChange('tun')}
          icon={TroubleshootRounded}
          label={t('settings.sections.system.toggles.tunMode')}
          hasIndicator={enable_tun_mode && isTunModeAvailable}
        />
      </Stack>

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
        <TabDescription
          description={tabDescription.text}
          tooltipTitle={tabDescription.tooltip}
        />
      </Box>

      <Box
        sx={{
          mt: 0,
          p: 1,
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          borderRadius: 2,
        }}
      >
        {activeTab === 'port' ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              p: 1,
              pr: 1,
              borderRadius: 1.5,
              bgcolor: isPortProxyRuntimeActive
                ? alpha(theme.palette.success.main, 0.07)
                : 'transparent',
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', mb: 0.25 }}
              >
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 500, fontSize: '15px' }}
                >
                  端口代理
                </Typography>
                <Chip
                  size="small"
                  label={`${enabledPortProxyCount}/${portProxyCount}`}
                  color={somePortProxiesEnabled ? 'success' : 'default'}
                  variant={somePortProxiesEnabled ? 'filled' : 'outlined'}
                />
              </Stack>
              {portProxyCount === 0 && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  暂无端口代理，请先添加配置
                </Typography>
              )}
            </Box>

            <Stack
              direction="row"
              spacing={0.5}
              sx={{ alignItems: 'center', flexShrink: 0 }}
            >
              <Button size="small" variant="outlined" onClick={goToPorts}>
                管理
              </Button>
              <Switch
                edge="end"
                checked={allPortProxiesEnabled}
                disabled={portProxyCount === 0}
                onChange={(_, checked) => toggleAllPortProxies(checked)}
              />
            </Stack>
          </Box>
        ) : (
          <ProxyControlSwitches
            onError={handleError}
            label={
              activeTab === 'system'
                ? t('settings.sections.system.toggles.systemProxy')
                : t('settings.sections.system.toggles.tunMode')
            }
            noRightPadding={true}
          />
        )}
      </Box>
    </Box>
  )
}
