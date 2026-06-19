import {
  ExpandLessRounded,
  ExpandMoreRounded,
  InboxRounded,
} from '@mui/icons-material'
import {
  alpha,
  Box,
  ListItemText,
  ListItemButton,
  Typography,
  styled,
  Chip,
  Tooltip,
} from '@mui/material'
import { memo, useMemo, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { useVerge } from '@/hooks/use-app-config'
import { useIconCache } from '@/hooks/use-icon-cache'
import { useThemeMode } from '@/services/states'

import { ProxyHead } from './proxy-head'
import { ProxyItem } from './proxy-item'
import { ProxyItemMini } from './proxy-item-mini'
import { HeadState } from './use-head-state'
import type { IRenderItem } from './use-render-list'

interface RenderProps {
  item: IRenderItem
  indent: boolean
  isChainMode?: boolean
  onLocation: (group: IRenderItem['group']) => void
  onCheckAll: (groupName: string) => void
  onCheckSpeed?: (groupName: string) => void
  getSelectedNodeCount?: (groupName: string) => number
  isNodeMultiSelected?: (groupName: string, nodeName: string) => boolean
  onClearSelectedNodes?: (groupName: string) => void
  onExportNodes?: (
    groupName: string,
    nodeName: string,
    useSelectedBatch: boolean,
  ) => void
  onDeleteNodes?: (
    groupName: string,
    nodeName: string,
    useSelectedBatch: boolean,
  ) => void
  onSelectSingleNode?: (groupName: string, nodeName: string) => void
  onToggleNodeSelection?: (
    groupName: string,
    nodeName: string,
    event?: MouseEvent<HTMLDivElement>,
  ) => void
  onHeadState: (groupName: string, patch: Partial<HeadState>) => void
  onChangeProxy: (
    group: IRenderItem['group'],
    proxy: IRenderItem['proxy'] & { name: string },
  ) => void
  testDisabled?: boolean
  profileUid?: string
  getGroupDisplayName?: (groupName: string) => string
}

export const ProxyRender = memo(function ProxyRender(props: RenderProps) {
  const { t } = useTranslation()
  const {
    indent,
    item,
    onLocation,
    onCheckAll,
    onCheckSpeed,
    getSelectedNodeCount,
    isNodeMultiSelected,
    onExportNodes,
    onDeleteNodes,
    onSelectSingleNode,
    onToggleNodeSelection,
    onHeadState,
    onChangeProxy,
    testDisabled = false,
    profileUid,
    getGroupDisplayName,
    isChainMode: _ = false,
  } = props
  const { type, group, headState, proxy, proxyCol } = item
  const { verge } = useVerge()
  const enable_group_icon = verge?.enable_group_icon ?? true
  const mode = useThemeMode()
  const isDark = mode === 'light' ? false : true
  const itembackgroundcolor = isDark ? '#282A36' : '#ffffff'
  const iconCachePath = useIconCache({
    icon: group.icon,
    cacheKey: group.name.replaceAll(' ', ''),
    enabled: enable_group_icon,
  })

  const showType = headState?.showType
  const displayGroupName = getGroupDisplayName?.(group.name) || group.name
  const selectedCount = getSelectedNodeCount?.(group.name) ?? 0
  const proxyColItemsMemo = useMemo(() => {
    if (type !== 4 || !proxyCol) {
      return null
    }

    return proxyCol.map((proxyItem) => (
      <ProxyItemMini
        key={`${item.key}-${proxyItem?.name ?? 'unknown'}`}
        group={group}
        proxy={proxyItem!}
        selected={group.now === proxyItem?.name}
        showType={showType}
        multiSelected={
          proxyItem?.name
            ? isNodeMultiSelected?.(group.name, proxyItem.name)
            : false
        }
        selectedCount={selectedCount}
        testDisabled={testDisabled}
        profileUid={profileUid}
        onCheckSelectedDelay={() => onCheckAll(group.name)}
        onCheckSelectedSpeed={
          onCheckSpeed ? () => onCheckSpeed(group.name) : undefined
        }
        onExportToClipboard={(name, useSelectedBatch) =>
          onExportNodes?.(group.name, name, useSelectedBatch)
        }
        onDeleteNodes={(name, useSelectedBatch) =>
          onDeleteNodes?.(group.name, name, useSelectedBatch)
        }
        onToggleMultiSelect={(name, event) =>
          onToggleNodeSelection?.(group.name, name, event)
        }
        onClick={(name) => {
          onSelectSingleNode?.(group.name, name)
          onChangeProxy(group, proxyItem!)
        }}
      />
    ))
  }, [
    type,
    proxyCol,
    item.key,
    group,
    showType,
    selectedCount,
    isNodeMultiSelected,
    testDisabled,
    profileUid,
    onCheckAll,
    onCheckSpeed,
    onExportNodes,
    onDeleteNodes,
    onToggleNodeSelection,
    onSelectSingleNode,
    onChangeProxy,
  ])

  if (type === 0) {
    return (
      <ListItemButton
        dense
        className="proxy-group-card"
        style={{
          background: itembackgroundcolor,
          height: '100%',
          margin: '8px 8px',
          borderRadius: '8px',
        }}
        sx={({ palette: { mode, primary } }) => {
          const cardSweepBackground =
            mode === 'light'
              ? 'linear-gradient(105deg, transparent 0 36%, rgba(255, 255, 255, 0.74) 46%, rgba(126, 237, 222, 0.24) 52%, transparent 64% 100%)'
              : 'linear-gradient(105deg, transparent 0 32%, rgba(92, 227, 210, 0.18) 41%, rgba(255, 255, 255, 0.58) 48%, rgba(126, 237, 222, 0.3) 55%, transparent 70% 100%)'

          return {
            position: 'relative',
            isolation: 'isolate',
            overflow: 'hidden',
            transition:
              'background 180ms ease, box-shadow 180ms ease, transform 180ms ease',
            '&&&&:hover': {
              transform: 'translateY(-1px)',
              boxShadow:
                mode === 'dark'
                  ? `inset 3px 0 0 ${alpha(
                      primary.light,
                      0.72,
                    )}, 0 12px 30px rgba(0, 0, 0, 0.2), 0 0 24px ${alpha(
                      primary.light,
                      0.1,
                    )}`
                  : `inset 3px 0 0 ${alpha(
                      primary.main,
                      0.62,
                    )}, 0 12px 28px ${alpha(primary.main, 0.12)}`,
            },
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
              filter: mode === 'dark' ? 'blur(0.25px) saturate(1.08)' : 'none',
              transform: 'translate3d(-44%, 0, 0)',
              transition: 'opacity 180ms ease, transform 360ms ease !important',
              willChange: 'opacity, transform',
            },
            '&&:hover > .proxy-card-motion': {
              opacity: `${mode === 'dark' ? 0.74 : 0.62} !important`,
              transform: 'translate3d(42%, 0, 0) !important',
            },
          }
        }}
        onClick={() => onHeadState(group.name, { open: !headState?.open })}
      >
        <Box aria-hidden className="proxy-card-motion" />
        {enable_group_icon &&
          group.icon &&
          group.icon.trim().startsWith('http') && (
            <img
              src={iconCachePath === '' ? group.icon : iconCachePath}
              width="32px"
              style={{ marginRight: '12px', borderRadius: '6px' }}
            />
          )}
        {enable_group_icon &&
          group.icon &&
          group.icon.trim().startsWith('data') && (
            <img
              src={group.icon}
              width="32px"
              style={{ marginRight: '12px', borderRadius: '6px' }}
            />
          )}
        {enable_group_icon &&
          group.icon &&
          group.icon.trim().startsWith('<svg') && (
            <img
              src={`data:image/svg+xml;base64,${btoa(group.icon)}`}
              width="32px"
            />
          )}
        <ListItemText
          primary={<StyledPrimary>{displayGroupName}</StyledPrimary>}
          secondary={
            <Box
              sx={{
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                pt: '2px',
              }}
            >
              <Box component="span" sx={{ marginTop: '2px' }}>
                <StyledTypeBox>{group.type}</StyledTypeBox>
                <StyledSubtitle sx={{ color: 'text.secondary' }}>
                  {group.now}
                </StyledSubtitle>
              </Box>
            </Box>
          }
          slotProps={{
            secondary: {
              component: 'div',
              sx: { display: 'flex', alignItems: 'center', color: '#ccc' },
            },
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title={t('proxies.page.labels.proxyCount')} arrow>
            <Chip
              size="small"
              label={`${group.all.length}`}
              sx={{
                mr: 1,
                backgroundColor: (theme) =>
                  alpha(theme.palette.primary.main, 0.1),
                color: (theme) => theme.palette.primary.main,
              }}
            />
          </Tooltip>
          {headState?.open ? <ExpandLessRounded /> : <ExpandMoreRounded />}
        </Box>
      </ListItemButton>
    )
  }

  if (type === 1) {
    return (
      <ProxyHead
        sx={{ pl: 2, pr: 3, mt: indent ? 1 : 0.5, mb: 1 }}
        url={group.testUrl}
        groupName={group.name}
        headState={headState!}
        onLocation={() => onLocation(group)}
        onCheckDelay={() => onCheckAll(group.name)}
        onCheckSpeed={onCheckSpeed ? () => onCheckSpeed(group.name) : undefined}
        selectedCount={selectedCount}
        onHeadState={(p) => onHeadState(group.name, p)}
      />
    )
  }

  if (type === 2) {
    return (
      <ProxyItem
        group={group}
        proxy={proxy!}
        selected={group.now === proxy?.name}
        showType={headState?.showType}
        multiSelected={
          proxy?.name ? isNodeMultiSelected?.(group.name, proxy.name) : false
        }
        selectedCount={selectedCount}
        testDisabled={testDisabled}
        profileUid={profileUid}
        onCheckSelectedDelay={() => onCheckAll(group.name)}
        onCheckSelectedSpeed={
          onCheckSpeed ? () => onCheckSpeed(group.name) : undefined
        }
        onExportToClipboard={(name, useSelectedBatch) =>
          onExportNodes?.(group.name, name, useSelectedBatch)
        }
        onDeleteNodes={(name, useSelectedBatch) =>
          onDeleteNodes?.(group.name, name, useSelectedBatch)
        }
        onToggleMultiSelect={(name, event) =>
          onToggleNodeSelection?.(group.name, name, event)
        }
        sx={{ py: 0, pl: 2 }}
        onClick={(name) => {
          onSelectSingleNode?.(group.name, name)
          onChangeProxy(group, proxy!)
        }}
      />
    )
  }

  if (type === 3) {
    return (
      <Box
        sx={{
          py: 2,
          pl: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <InboxRounded sx={{ fontSize: '2.5em', color: 'inherit' }} />
        <Typography sx={{ color: 'inherit' }}>No Proxies</Typography>
      </Box>
    )
  }

  if (type === 4) {
    return (
      <Box
        sx={{
          height: 56,
          display: 'grid',
          gap: 1,
          pl: 2,
          pr: 2,
          pb: 1,
          gridTemplateColumns: `repeat(${item.col! || 2}, 1fr)`,
        }}
      >
        {proxyColItemsMemo}
      </Box>
    )
  }

  return null
})

const StyledPrimary = styled('span')`
  font-size: 16px;
  font-weight: 700;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`
const StyledSubtitle = styled('span')`
  font-size: 13px;
  overflow: hidden;
  color: text.secondary;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const StyledTypeBox = styled(Box)(({ theme }) => ({
  display: 'inline-block',
  border: '1px solid #ccc',
  borderColor: alpha(theme.palette.primary.main, 0.5),
  color: alpha(theme.palette.primary.main, 0.8),
  borderRadius: 4,
  fontSize: 10,
  padding: '0 4px',
  lineHeight: 1.5,
  marginRight: '8px',
}))
