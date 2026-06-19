import {
  CheckCircleOutlineRounded,
  NetworkCheckRounded,
  SpeedRounded,
} from '@mui/icons-material'
import {
  alpha,
  Box,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  styled,
  type SxProps,
  type Theme,
  Tooltip,
} from '@mui/material'
import { useState, type MouseEvent } from 'react'

import { BaseLoading } from '@/components/base'
import { useProxyDelayState } from '@/hooks/use-proxy-delay-state'
import { useProxySpeedState } from '@/hooks/use-proxy-speed-state'
import delayManager from '@/services/delay'
import speedManager from '@/services/speed'

import { ProxySpeedErrorDialog } from './proxy-speed-error-dialog'

interface Props {
  group: IProxyGroupItem
  proxy: IProxyItem
  selected: boolean
  showType?: boolean
  multiSelected?: boolean
  selectedCount?: number
  onCheckSelectedDelay?: () => void
  onCheckSelectedSpeed?: () => void
  onExportToClipboard?: (name: string, useSelectedBatch: boolean) => void
  onDeleteNodes?: (name: string, useSelectedBatch: boolean) => void
  onToggleMultiSelect?: (
    name: string,
    event?: MouseEvent<HTMLDivElement>,
  ) => void
  testDisabled?: boolean
  profileUid?: string
  sx?: SxProps<Theme>
  onClick?: (name: string, event?: MouseEvent<HTMLDivElement>) => void
}

const Widget = styled(Box)(() => ({
  minWidth: 34,
  height: 18,
  padding: '0 5px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  fontSize: 10,
  fontWeight: 700,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  userSelect: 'none',
  cursor: 'pointer',
  borderRadius: 999,
  transition:
    'color 140ms ease, background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease',
  '& .the-action-icon': {
    fontSize: 12,
  },
  '&:hover': {
    transform: 'translateY(-1px)',
  },
}))

const TypeBox = styled('span')(({ theme }) => ({
  display: 'inline-block',
  border: '1px solid #ccc',
  borderColor: alpha(theme.palette.text.secondary, 0.36),
  color: alpha(theme.palette.text.secondary, 0.42),
  borderRadius: 4,
  fontSize: 10,
  marginRight: '4px',
  padding: '0 2px',
  lineHeight: 1.25,
}))

export const ProxyItem = (props: Props) => {
  const {
    group,
    proxy,
    selected,
    showType = true,
    multiSelected = false,
    selectedCount = 0,
    onCheckSelectedDelay,
    onCheckSelectedSpeed,
    onExportToClipboard,
    onDeleteNodes,
    onToggleMultiSelect,
    testDisabled = false,
    profileUid,
    sx,
    onClick,
  } = props
  const [speedErrorOpen, setSpeedErrorOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<null | {
    mouseX: number
    mouseY: number
  }>(null)

  // -1/<=0 为不显示，-2 为 loading
  const { delayValue, isPreset, timeout, onDelay } = useProxyDelayState(
    proxy,
    group.name,
    profileUid,
  )
  const { speedState, speedValue, onSpeed } = useProxySpeedState(
    proxy,
    group.name,
    profileUid,
  )
  const canSelectNode = !isPreset && !proxy.provider
  const canTestProxy = canSelectNode && !testDisabled
  const speedSuccessTitle = [
    `下载速度：${speedManager.formatSpeed(speedValue)}`,
    speedState.sourceUrl ? `测速地址：${speedState.sourceUrl}` : '',
    typeof speedState.fallbackIndex === 'number' && speedState.fallbackIndex > 0
      ? `已自动回退到第 ${speedState.fallbackIndex + 1} 个测速源`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
  const speedErrorText = speedState.error || '测速失败'
  const speedErrorTitle = `${speedErrorText}\n\n点击查看完整错误，按住 Alt/Option 点击重新测速`
  const closeContextMenu = () => setContextMenu(null)
  const shouldUseSelectedBatch = multiSelected && selectedCount > 1
  const handleContextDelay = () => {
    closeContextMenu()
    if (shouldUseSelectedBatch && onCheckSelectedDelay) {
      onCheckSelectedDelay()
      return
    }
    onDelay()
  }
  const handleContextSpeed = () => {
    closeContextMenu()
    if (shouldUseSelectedBatch && onCheckSelectedSpeed) {
      onCheckSelectedSpeed()
      return
    }
    onSpeed()
  }
  const handleContextExport = () => {
    closeContextMenu()
    onExportToClipboard?.(proxy.name, shouldUseSelectedBatch)
  }
  const handleContextDelete = () => {
    closeContextMenu()
    onDeleteNodes?.(proxy.name, shouldUseSelectedBatch)
  }
  const disableContextTest =
    testDisabled || (!shouldUseSelectedBatch && !canTestProxy)

  return (
    <>
      <ListItem sx={sx}>
        <ListItemButton
          dense
          className="proxy-node-card"
          data-selected={selected ? 'true' : 'false'}
          data-multi-selected={multiSelected ? 'true' : 'false'}
          selected={selected}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setContextMenu(
              contextMenu === null
                ? {
                    mouseX: event.clientX + 2,
                    mouseY: event.clientY - 6,
                  }
                : null,
            )
          }}
          onClick={(event) => {
            if (
              (event.ctrlKey || event.metaKey || event.shiftKey) &&
              canSelectNode
            ) {
              event.preventDefault()
              onToggleMultiSelect?.(proxy.name, event)
              return
            }
            onClick?.(proxy.name, event)
          }}
          sx={[
            { borderRadius: 1 },
            ({ palette: { mode, primary } }) => {
              const bgcolor = mode === 'light' ? '#ffffff' : '#24252f'
              const selectColor =
                mode === 'light' ? primary.main : primary.light
              const showDelay = delayValue > 0
              const showSpeed = speedValue > 0 || speedValue === -3
              const cardSweepBackground =
                mode === 'light'
                  ? 'linear-gradient(105deg, transparent 0 36%, rgba(255, 255, 255, 0.74) 46%, rgba(126, 237, 222, 0.24) 52%, transparent 64% 100%)'
                  : 'linear-gradient(105deg, transparent 0 32%, rgba(92, 227, 210, 0.18) 41%, rgba(255, 255, 255, 0.58) 48%, rgba(126, 237, 222, 0.3) 55%, transparent 70% 100%)'

              return {
                position: 'relative',
                isolation: 'isolate',
                overflow: 'hidden',
                '&&&& > :not(.proxy-card-motion)': {
                  position: 'relative',
                  zIndex: 3,
                },
                '&& .proxy-card-motion': {
                  display: 'block',
                  position: 'absolute',
                  inset: '1px',
                  zIndex: 2,
                  pointerEvents: 'none',
                  opacity: '0 !important',
                  borderRadius: 'inherit',
                  background: `${cardSweepBackground} !important`,
                  mixBlendMode: 'normal',
                  filter:
                    mode === 'dark' ? 'blur(0.25px) saturate(1.08)' : 'none',
                  transform: 'translate3d(-44%, 0, 0)',
                  transition:
                    'opacity 180ms ease, transform 360ms ease !important',
                  willChange: 'opacity, transform',
                },
                '&&:hover > .proxy-card-motion': {
                  opacity: `${mode === 'dark' ? 0.74 : 0.62} !important`,
                  transform: 'translate3d(42%, 0, 0) !important',
                },
                '&:hover .the-check': {
                  display: !showDelay ? 'inline-flex' : 'none',
                },
                '&:hover .the-delay': {
                  display: showDelay ? 'inline-flex' : 'none',
                },
                '&:hover .the-speed-check': {
                  display: !showSpeed ? 'inline-flex' : 'none',
                },
                '&:hover .the-speed': {
                  display: showSpeed ? 'inline-flex' : 'none',
                },
                '&:hover .the-icon': {
                  display: multiSelected ? 'block' : 'none',
                },
                '&.Mui-selected': {
                  width: `calc(100% + 3px)`,
                  marginLeft: `-3px`,
                  borderLeft: `3px solid ${selectColor}`,
                  bgcolor:
                    mode === 'light'
                      ? alpha(primary.main, 0.15)
                      : alpha(primary.main, 0.35),
                },
                ...(multiSelected
                  ? {
                      width: `calc(100% + 3px)`,
                      marginLeft: `-3px`,
                      borderLeft: `3px solid ${selectColor}`,
                      boxShadow: `inset 0 0 0 1px ${alpha(selectColor, 0.5)}`,
                    }
                  : {}),
                backgroundColor: multiSelected
                  ? mode === 'light'
                    ? alpha(primary.main, 0.16)
                    : alpha(primary.main, 0.36)
                  : bgcolor,
                marginBottom: '8px',
                height: '40px',
              }
            },
          ]}
        >
          <Box aria-hidden className="proxy-card-motion" />
          <ListItemText
            title={proxy.name}
            secondary={
              <>
                <Box
                  sx={{
                    display: 'inline-block',
                    marginRight: '8px',
                    fontSize: '14px',
                    color: 'text.primary',
                  }}
                >
                  {proxy.name}
                  {showType && proxy.now && ` - ${proxy.now}`}
                </Box>
                {showType && !!proxy.provider && (
                  <TypeBox>{proxy.provider}</TypeBox>
                )}
                {showType && <TypeBox>{proxy.type}</TypeBox>}
                {showType && proxy.udp && <TypeBox>UDP</TypeBox>}
                {showType && proxy.xudp && <TypeBox>XUDP</TypeBox>}
                {showType && proxy.tfo && <TypeBox>TFO</TypeBox>}
                {showType && proxy.mptcp && <TypeBox>MPTCP</TypeBox>}
                {showType && proxy.smux && <TypeBox>SMUX</TypeBox>}
              </>
            }
          />

          <ListItemIcon
            sx={{
              justifyContent: 'flex-end',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 0.25,
              minWidth: 'auto',
              pl: 1,
              color: 'primary.main',
              display: isPreset ? 'none' : '',
            }}
          >
            {delayValue === -2 && (
              <Widget>
                <BaseLoading />
              </Widget>
            )}

            {canTestProxy && delayValue !== -2 && (
              // provider 的节点不支持检测
              <Widget
                className="the-check"
                title="测试延迟"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onDelay()
                }}
                sx={({ palette }) => ({
                  display: 'none', // hover 时显示
                  ':hover': { bgcolor: alpha(palette.primary.main, 0.15) },
                })}
              >
                <NetworkCheckRounded className="the-action-icon" />
                延迟
              </Widget>
            )}

            {delayValue > 0 && (
              // 显示延迟
              <Widget
                className="the-delay"
                title="重新测试延迟"
                onClick={(e) => {
                  if (!canTestProxy) return
                  e.preventDefault()
                  e.stopPropagation()
                  onDelay()
                }}
                sx={({ palette }) => ({
                  color: delayManager.formatDelayColor(delayValue, timeout),
                  ...(!proxy.provider
                    ? {
                        ':hover': {
                          bgcolor: alpha(palette.primary.main, 0.15),
                        },
                      }
                    : {}),
                })}
              >
                {delayManager.formatDelay(delayValue, timeout)}
              </Widget>
            )}

            {canTestProxy && speedValue === -2 && (
              <Widget>
                <BaseLoading />
              </Widget>
            )}

            {canTestProxy && speedValue === -1 && (
              <Widget
                className="the-speed-check"
                title="测试下载速度"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onSpeed()
                }}
                sx={({ palette }) => ({
                  display: 'none',
                  color: 'text.secondary',
                  ':hover': { bgcolor: alpha(palette.primary.main, 0.15) },
                })}
              >
                <SpeedRounded className="the-action-icon" />
                测速
              </Widget>
            )}

            {canTestProxy && speedValue > 0 && (
              <Tooltip title={speedSuccessTitle} placement="top">
                <Widget
                  className="the-speed"
                  title="重新测试下载速度"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onSpeed()
                  }}
                  sx={({ palette }) => ({
                    color: speedManager.formatSpeedColor(speedValue),
                    ':hover': { bgcolor: alpha(palette.primary.main, 0.15) },
                  })}
                >
                  {speedManager.formatSpeed(speedValue)}
                </Widget>
              </Tooltip>
            )}

            {canTestProxy && speedValue === -3 && (
              <Tooltip title={speedErrorTitle} placement="top">
                <Widget
                  className="the-speed"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (e.altKey) {
                      onSpeed()
                      return
                    }
                    setSpeedErrorOpen(true)
                  }}
                  sx={({ palette }) => ({
                    color: 'error.main',
                    cursor: 'pointer',
                    ':hover': { bgcolor: alpha(palette.error.main, 0.12) },
                  })}
                >
                  失败
                </Widget>
              </Tooltip>
            )}

            {delayValue !== -2 &&
              speedValue !== -2 &&
              delayValue <= 0 &&
              selected && (
                // 展示已选择的 icon
                <CheckCircleOutlineRounded
                  className="the-icon"
                  sx={{ fontSize: 16 }}
                />
              )}
          </ListItemIcon>
        </ListItemButton>
      </ListItem>
      <Menu
        open={contextMenu !== null}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        slotProps={{
          paper: {
            className: 'proxy-node-context-menu',
            sx: {
              width: 'auto',
              minWidth: 132,
              maxWidth: 220,
            },
          },
          list: { sx: { py: 0.5 } },
        }}
      >
        <MenuItem
          disabled={disableContextTest}
          onClick={handleContextDelay}
          dense
        >
          {shouldUseSelectedBatch
            ? `测试已选 ${selectedCount} 个节点延迟`
            : '测试延迟'}
        </MenuItem>
        <MenuItem
          disabled={disableContextTest}
          onClick={handleContextSpeed}
          dense
        >
          {shouldUseSelectedBatch
            ? `测试已选 ${selectedCount} 个节点速度`
            : '测试速度'}
        </MenuItem>
        <MenuItem
          disabled={!onExportToClipboard}
          onClick={handleContextExport}
          dense
        >
          {shouldUseSelectedBatch
            ? `导出已选 ${selectedCount} 个节点到剪贴板`
            : '导出到剪贴板'}
        </MenuItem>
        <MenuItem
          disabled={!onDeleteNodes}
          onClick={handleContextDelete}
          sx={{ color: 'error.main' }}
          dense
        >
          {shouldUseSelectedBatch ? `删除已选 ${selectedCount} 个节点` : '删除'}
        </MenuItem>
      </Menu>
      <ProxySpeedErrorDialog
        open={speedErrorOpen}
        proxyName={proxy.name}
        groupName={group.name}
        speedText={speedManager.formatSpeed(speedValue)}
        errorText={speedErrorText}
        onClose={() => setSpeedErrorOpen(false)}
        onRetry={() => {
          setSpeedErrorOpen(false)
          onSpeed()
        }}
      />
    </>
  )
}
