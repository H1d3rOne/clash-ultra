import {
  DeleteForeverRounded,
  KeyboardArrowRightRounded,
  PlaylistAddRounded,
  TableChartRounded,
  TableRowsRounded,
  ViewColumnRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  ButtonGroup,
  Fab,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Zoom,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { useCallback, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { closeAllConnections } from 'tauri-plugin-mihomo-api'

import {
  BaseEmpty,
  BasePage,
  BaseSearchBox,
  BaseStyledSelect,
  type SearchState,
  VirtualList,
} from '@/components/base'
import {
  ConnectionDetail,
  ConnectionDetailRef,
} from '@/components/connection/connection-detail'
import { ConnectionRowItem } from '@/components/connection/connection-row-item'
import {
  getConnectionStartTime,
  useConnectionRowViews,
} from '@/components/connection/connection-row-view'
import { ConnectionTable } from '@/components/connection/connection-table'
import { useVerge } from '@/hooks/use-app-config'
import { useConnectionData } from '@/hooks/use-connection-data'
import { useConnectionSetting } from '@/hooks/use-connection-setting'
import { useTrafficData } from '@/hooks/use-traffic-data'
import { useVisibility } from '@/hooks/use-visibility'
import { enhanceProfiles } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import {
  addHostToDefaultRuleTemplate,
  addRuleToDefaultRuleTemplate,
  getDefaultRuleTemplateStrategyOptions,
} from '@/utils/default-rule-template'
import parseTraffic from '@/utils/parse-traffic'

type OrderFunc = (list: IConnectionsItem[]) => IConnectionsItem[]
type ConnectionRuleMenuType =
  | 'host'
  | 'destination-ip'
  | 'process-name'
  | 'process-path'

const ORDER_OPTIONS = [
  {
    id: 'default',
    labelKey: 'connections.components.order.default',
    fn: (list: IConnectionsItem[]) =>
      list.sort(
        (a, b) => getConnectionStartTime(b) - getConnectionStartTime(a),
      ),
  },
  {
    id: 'uploadSpeed',
    labelKey: 'connections.components.order.uploadSpeed',
    fn: (list: IConnectionsItem[]) =>
      list.sort((a, b) => (b.curUpload ?? 0) - (a.curUpload ?? 0)),
  },
  {
    id: 'downloadSpeed',
    labelKey: 'connections.components.order.downloadSpeed',
    fn: (list: IConnectionsItem[]) =>
      list.sort((a, b) => (b.curDownload ?? 0) - (a.curDownload ?? 0)),
  },
] as const

type OrderKey = (typeof ORDER_OPTIONS)[number]['id']

const orderFunctionMap = ORDER_OPTIONS.reduce<Record<OrderKey, OrderFunc>>(
  (acc, option) => {
    acc[option.id] = option.fn
    return acc
  },
  {} as Record<OrderKey, OrderFunc>,
)

const normalizeConnectionHost = (value?: string) => {
  const raw = value?.trim()
  if (!raw) return ''

  try {
    const parsed = new URL(raw.includes('://') ? raw : `http://${raw}`)
    return parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '')
  } catch {
    const host = raw
      .split('/')[0]
      .replace(/^\[|\]$/g, '')
      .replace(/:\d+$/, '')
      .replace(/\.$/, '')

    return host
  }
}

const isIpAddressLike = (host: string) =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(host) ||
  (/^[0-9a-f:]+$/i.test(host) && host.includes(':'))

const getConnectionHostName = (connection?: IConnectionsItem | null) => {
  const candidates = [
    connection?.metadata.host,
    connection?.metadata.remoteDestination,
  ]

  for (const candidate of candidates) {
    const host = normalizeConnectionHost(candidate).toLowerCase()

    if (host && !isIpAddressLike(host)) return host
  }

  return ''
}

const normalizeConnectionIp = (value?: string) => {
  const raw = value?.trim()
  if (!raw) return ''

  const withoutCidr = raw.split('/')[0]
  const bracketedIp = withoutCidr.match(/^\[([^\]]+)\](?::\d+)?$/)?.[1]
  const ipv4WithPort = withoutCidr.match(/^((?:\d{1,3}\.){3}\d{1,3}):\d+$/)?.[1]
  const ip = bracketedIp || ipv4WithPort || withoutCidr.replace(/^\[|\]$/g, '')

  return isIpAddressLike(ip) ? ip : ''
}

const getIpRuleType = (ip: string) =>
  ip.includes(':') ? 'IP-CIDR6' : 'IP-CIDR'

const getIpRulePayload = (ip: string) => `${ip}/${ip.includes(':') ? 128 : 32}`

const getConnectionDestinationIp = (connection?: IConnectionsItem | null) =>
  normalizeConnectionIp(connection?.metadata.destinationIP)

const getConnectionProcessName = (connection?: IConnectionsItem | null) =>
  connection?.metadata.process?.trim() || ''

const getConnectionProcessPath = (connection?: IConnectionsItem | null) =>
  connection?.metadata.processPath?.trim() || ''

const EMPTY_CONNECTIONS: IConnectionsItem[] = []
const ConnectionsPage = () => {
  const { t } = useTranslation()
  const [match, setMatch] = useState<(input: string) => boolean>(
    () => () => true,
  )
  const [hasSearch, setHasSearch] = useState(false)
  const [curOrderOpt, setCurOrderOpt] = useState<OrderKey>('default')
  const [connectionsType, setConnectionsType] = useState<'active' | 'closed'>(
    'active',
  )
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number
    mouseY: number
    connection: IConnectionsItem
  } | null>(null)
  const [ruleTargetMenu, setRuleTargetMenu] = useState<{
    anchorEl: HTMLElement
    type: ConnectionRuleMenuType
  } | null>(null)

  const pageVisible = useVisibility()
  const {
    response: { data: connections },
    clearClosedConnections,
  } = useConnectionData({ enabled: pageVisible })
  const {
    response: { data: traffic },
  } = useTrafficData({ enabled: pageVisible })

  const [setting, setSetting] = useConnectionSetting()
  const { verge, mutateVerge, patchVerge } = useVerge()

  const isTableLayout = setting.layout === 'table'

  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState(false)

  const selectedConnections =
    connectionsType === 'active'
      ? (connections?.activeConnections ?? EMPTY_CONNECTIONS)
      : (connections?.closedConnections ?? EMPTY_CONNECTIONS)

  const filterConn = useMemo(() => {
    const orderFunc = orderFunctionMap[curOrderOpt]

    if (isTableLayout && !hasSearch) return selectedConnections
    if (!hasSearch) return orderFunc([...selectedConnections])

    const matchConns = selectedConnections.filter((conn) => {
      const { host, destinationIP, process, processPath } = conn.metadata
      return (
        match(host || '') ||
        match(destinationIP || '') ||
        match(process || '') ||
        match(processPath || '')
      )
    })

    return orderFunc ? orderFunc(matchConns) : matchConns
  }, [selectedConnections, isTableLayout, hasSearch, match, curOrderOpt])

  const displayRows = useConnectionRowViews(
    isTableLayout ? EMPTY_CONNECTIONS : filterConn,
  )

  const detailRef = useRef<ConnectionDetailRef>(null!)

  const selectConnectionsType = useCallback(
    (type: 'active' | 'closed') => {
      if (type === connectionsType) return
      detailRef.current?.close()
      setIsColumnManagerOpen(false)
      setConnectionsType(type)
    },
    [connectionsType],
  )

  const closeContextMenu = useCallback(() => {
    setRuleTargetMenu(null)
    setContextMenu(null)
  }, [])

  const handleConnectionContextMenu = useCallback(
    (event: MouseEvent, connection: IConnectionsItem) => {
      event.preventDefault()
      event.stopPropagation()
      setContextMenu({
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
        connection,
      })
    },
    [],
  )

  const contextMenuHost = getConnectionHostName(contextMenu?.connection)
  const contextMenuProcessName = getConnectionProcessName(
    contextMenu?.connection,
  )
  const contextMenuDestinationIp = getConnectionDestinationIp(
    contextMenu?.connection,
  )
  const contextMenuProcessPath = getConnectionProcessPath(
    contextMenu?.connection,
  )
  const hostRuleStrategyOptions = useMemo(() => {
    try {
      return getDefaultRuleTemplateStrategyOptions(verge?.default_rule_template)
    } catch {
      return []
    }
  }, [verge?.default_rule_template])

  const addConnectionHostToDefaultRuleTemplate = useLockFn(
    async (target: string) => {
      const host = getConnectionHostName(contextMenu?.connection)
      closeContextMenu()

      if (!host) {
        showNotice.error('该连接没有可添加的主机名')
        return
      }

      try {
        const result = addHostToDefaultRuleTemplate(
          verge?.default_rule_template,
          host,
          target,
        )

        if (!result.added) {
          showNotice.info(`默认规则模板中已存在 ${host} → ${target}`)
          return
        }

        await patchVerge({ default_rule_template: result.template })
        mutateVerge((prev) =>
          prev ? { ...prev, default_rule_template: result.template } : prev,
        )

        if (await enhanceProfiles()) {
          showNotice.success(`已将 ${host} 添加到默认规则模板 → ${target}`)
        } else {
          showNotice.info(`已添加 ${host}，但重新应用运行配置校验未通过`)
        }
      } catch (err) {
        showNotice.error('添加到默认规则模板失败', err)
      }
    },
  )

  const openRuleTargetMenu = (
    event: MouseEvent<HTMLElement>,
    type: ConnectionRuleMenuType,
  ) => {
    if (!hostRuleStrategyOptions.length) {
      showNotice.error('当前启用的规则模板没有可用策略')
      return
    }

    setRuleTargetMenu({
      anchorEl: event.currentTarget,
      type,
    })
  }

  const addConnectionDestinationIpToDefaultRuleTemplate = useLockFn(
    async (target: string) => {
      const destinationIp = getConnectionDestinationIp(contextMenu?.connection)
      closeContextMenu()

      if (!destinationIp) {
        showNotice.error('该连接没有可添加的目标 IP')
        return
      }

      try {
        const ruleType = getIpRuleType(destinationIp)
        const result = addRuleToDefaultRuleTemplate(
          verge?.default_rule_template,
          ruleType,
          getIpRulePayload(destinationIp),
          target,
        )

        if (!result.added) {
          showNotice.info(
            `默认规则模板中已存在目标 IP ${destinationIp} → ${target}`,
          )
          return
        }

        await patchVerge({ default_rule_template: result.template })
        mutateVerge((prev) =>
          prev ? { ...prev, default_rule_template: result.template } : prev,
        )

        if (await enhanceProfiles()) {
          showNotice.success(
            `已将目标 IP ${destinationIp} 添加到默认规则模板 → ${target}`,
          )
        } else {
          showNotice.info(
            `已添加目标 IP ${destinationIp} → ${target}，但重新应用运行配置校验未通过`,
          )
        }
      } catch (err) {
        showNotice.error('添加目标 IP 到默认规则模板失败', err)
      }
    },
  )

  const addConnectionProcessNameToDefaultRuleTemplate = useLockFn(
    async (target: string) => {
      const processName = getConnectionProcessName(contextMenu?.connection)
      closeContextMenu()

      if (!processName) {
        showNotice.error('该连接没有可添加的进程名称')
        return
      }

      try {
        const result = addRuleToDefaultRuleTemplate(
          verge?.default_rule_template,
          'PROCESS-NAME',
          processName,
          target,
        )

        if (!result.added) {
          showNotice.info(
            `默认规则模板中已存在进程名称 ${processName} → ${target}`,
          )
          return
        }

        await patchVerge({ default_rule_template: result.template })
        mutateVerge((prev) =>
          prev ? { ...prev, default_rule_template: result.template } : prev,
        )

        if (await enhanceProfiles()) {
          showNotice.success(
            `已将进程名称 ${processName} 添加到默认规则模板 → ${target}`,
          )
        } else {
          showNotice.info(
            `已添加进程名称 ${processName} → ${target}，但重新应用运行配置校验未通过`,
          )
        }
      } catch (err) {
        showNotice.error('添加进程名称到默认规则模板失败', err)
      }
    },
  )

  const addConnectionProcessPathToDefaultRuleTemplate = useLockFn(
    async (target: string) => {
      const processPath = getConnectionProcessPath(contextMenu?.connection)
      closeContextMenu()

      if (!processPath) {
        showNotice.error('该连接没有可添加的进程路径')
        return
      }

      try {
        const result = addRuleToDefaultRuleTemplate(
          verge?.default_rule_template,
          'PROCESS-PATH',
          processPath,
          target,
        )

        if (!result.added) {
          showNotice.info(
            `默认规则模板中已存在进程路径 ${processPath} → ${target}`,
          )
          return
        }

        await patchVerge({ default_rule_template: result.template })
        mutateVerge((prev) =>
          prev ? { ...prev, default_rule_template: result.template } : prev,
        )

        if (await enhanceProfiles()) {
          showNotice.success(`已将进程路径添加到默认规则模板 → ${target}`)
        } else {
          showNotice.info(
            `已添加进程路径 → ${target}，但重新应用运行配置校验未通过`,
          )
        }
      } catch (err) {
        showNotice.error('添加进程路径到默认规则模板失败', err)
      }
    },
  )

  const showDetailById = useCallback(
    (id: string) => {
      const connection = filterConn.find((item) => item.id === id)
      if (connection) {
        detailRef.current?.open(connection, connectionsType === 'closed')
      }
    },
    [connectionsType, filterConn],
  )

  const onCloseAll = useLockFn(closeAllConnections)

  const handleSearch = useCallback(
    (match: (content: string) => boolean, state: SearchState) => {
      setMatch(() => match)
      setHasSearch(state.text.length > 0)
    },
    [],
  )

  const handleConnectionRowContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>, id: string) => {
      const connection = filterConn.find((item) => item.id === id)
      if (connection) handleConnectionContextMenu(event, connection)
    },
    [filterConn, handleConnectionContextMenu],
  )

  const hasTableData = filterConn.length > 0

  return (
    <BasePage
      full
      title={
        <span style={{ whiteSpace: 'nowrap' }}>
          {t('connections.page.title')}
        </span>
      }
      contentStyle={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: '8px',
        minHeight: 0,
      }}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ mx: 1 }}>
            {t('shared.labels.downloaded')}:{' '}
            {parseTraffic(traffic?.downTotal || 0)}
          </Box>
          <Box sx={{ mx: 1 }}>
            {t('shared.labels.uploaded')}: {parseTraffic(traffic?.upTotal || 0)}
          </Box>
          <IconButton
            color="inherit"
            size="small"
            onClick={() =>
              setSetting((o) =>
                o?.layout !== 'table'
                  ? { ...o, layout: 'table' }
                  : { ...o, layout: 'list' },
              )
            }
          >
            {isTableLayout ? (
              <TableRowsRounded titleAccess={t('shared.actions.listView')} />
            ) : (
              <TableChartRounded titleAccess={t('shared.actions.tableView')} />
            )}
          </IconButton>
          <Button size="small" variant="contained" onClick={onCloseAll}>
            <span style={{ whiteSpace: 'nowrap' }}>
              {t('shared.actions.closeAll')}
            </span>
          </Button>
        </Box>
      }
    >
      <Box
        sx={{
          pt: 1,
          mb: 0.5,
          mx: '10px',
          minHeight: '36px',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          userSelect: 'text',
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        <ButtonGroup sx={{ mr: 1, flexBasis: 'content' }}>
          <Button
            size="small"
            variant={connectionsType === 'active' ? 'contained' : 'outlined'}
            onClick={() => selectConnectionsType('active')}
          >
            {t('connections.components.actions.active')}{' '}
            {connections?.activeConnections.length}
          </Button>
          <Button
            size="small"
            variant={connectionsType === 'closed' ? 'contained' : 'outlined'}
            onClick={() => selectConnectionsType('closed')}
          >
            {t('connections.components.actions.closed')}{' '}
            {connections?.closedConnections.length}
          </Button>
        </ButtonGroup>
        {!isTableLayout && (
          <BaseStyledSelect
            value={curOrderOpt}
            onChange={(e) => setCurOrderOpt(e.target.value as OrderKey)}
          >
            {ORDER_OPTIONS.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                <span style={{ fontSize: 14 }}>{t(option.labelKey)}</span>
              </MenuItem>
            ))}
          </BaseStyledSelect>
        )}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            '& > *': {
              flex: 1,
            },
          }}
        >
          <BaseSearchBox onSearch={handleSearch} />
        </Box>
        {isTableLayout && hasTableData && (
          <Tooltip title={t('connections.components.columnManager.title')}>
            <IconButton
              size="small"
              aria-label={t('connections.components.columnManager.title')}
              onClick={() => setIsColumnManagerOpen(true)}
              sx={{ flex: '0 0 auto' }}
            >
              <ViewColumnRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {!hasTableData ? (
        <BaseEmpty />
      ) : isTableLayout ? (
        <ConnectionTable
          connections={filterConn}
          onShowDetail={showDetailById}
          onContextMenu={handleConnectionContextMenu}
          columnManagerOpen={isColumnManagerOpen}
          onCloseColumnManager={() => setIsColumnManagerOpen(false)}
        />
      ) : (
        <VirtualList
          key={connectionsType}
          count={displayRows.length}
          estimateSize={56}
          renderItem={(i) => (
            <ConnectionRowItem
              row={displayRows[i]}
              closed={connectionsType === 'closed'}
              onShowDetail={showDetailById}
              onContextMenu={handleConnectionRowContextMenu}
            />
          )}
          style={{
            flex: 1,
            borderRadius: '8px',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        />
      )}
      <ConnectionDetail ref={detailRef} />
      <Menu
        open={Boolean(contextMenu)}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        slotProps={{
          paper: {
            sx: {
              minWidth: 220,
              width: 'auto',
            },
          },
        }}
      >
        <MenuItem
          disabled={!contextMenuHost}
          onClick={(event) => {
            if (!contextMenuHost) return
            openRuleTargetMenu(event, 'host')
          }}
        >
          <ListItemIcon>
            <PlaylistAddRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="添加主机名到默认规则模板"
            secondary={contextMenuHost || '无可用主机名'}
          />
          <KeyboardArrowRightRounded fontSize="small" />
        </MenuItem>
        <MenuItem
          disabled={!contextMenuDestinationIp}
          onClick={(event) => {
            if (!contextMenuDestinationIp) return
            openRuleTargetMenu(event, 'destination-ip')
          }}
        >
          <ListItemIcon>
            <PlaylistAddRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="添加目标 IP 到默认规则模板"
            secondary={contextMenuDestinationIp || '无可用目标 IP'}
          />
          <KeyboardArrowRightRounded fontSize="small" />
        </MenuItem>
        <MenuItem
          disabled={!contextMenuProcessName}
          onClick={(event) => {
            if (!contextMenuProcessName) return
            openRuleTargetMenu(event, 'process-name')
          }}
        >
          <ListItemIcon>
            <PlaylistAddRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="添加进程名称到默认规则模板"
            secondary={contextMenuProcessName || '无可用进程名称'}
          />
          <KeyboardArrowRightRounded fontSize="small" />
        </MenuItem>
        <MenuItem
          disabled={!contextMenuProcessPath}
          onClick={(event) => {
            if (!contextMenuProcessPath) return
            openRuleTargetMenu(event, 'process-path')
          }}
        >
          <ListItemIcon>
            <PlaylistAddRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="添加进程路径到默认规则模板"
            secondary={contextMenuProcessPath || '无可用进程路径'}
            slotProps={{
              secondary: {
                sx: {
                  maxWidth: 360,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
            }}
          />
          <KeyboardArrowRightRounded fontSize="small" />
        </MenuItem>
      </Menu>
      <Menu
        open={Boolean(ruleTargetMenu)}
        onClose={() => setRuleTargetMenu(null)}
        anchorEl={ruleTargetMenu?.anchorEl ?? null}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {hostRuleStrategyOptions.map((option) => (
          <MenuItem
            key={`${option.type}:${option.name}`}
            onClick={() => {
              if (ruleTargetMenu?.type === 'host') {
                void addConnectionHostToDefaultRuleTemplate(option.name)
              } else if (ruleTargetMenu?.type === 'destination-ip') {
                void addConnectionDestinationIpToDefaultRuleTemplate(
                  option.name,
                )
              } else if (ruleTargetMenu?.type === 'process-name') {
                void addConnectionProcessNameToDefaultRuleTemplate(option.name)
              } else if (ruleTargetMenu?.type === 'process-path') {
                void addConnectionProcessPathToDefaultRuleTemplate(option.name)
              }
            }}
          >
            <ListItemText
              primary={option.name}
              secondary={option.description}
              slotProps={{
                secondary: {
                  sx: {
                    maxWidth: 260,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  },
                },
              }}
            />
          </MenuItem>
        ))}
      </Menu>
      <Zoom
        in={connectionsType === 'closed' && filterConn.length > 0}
        unmountOnExit
      >
        <Fab
          size="medium"
          variant="extended"
          sx={{
            position: 'absolute',
            right: 16,
            bottom: isTableLayout ? 70 : 16,
          }}
          color="primary"
          onClick={() => clearClosedConnections()}
        >
          <DeleteForeverRounded sx={{ mr: 1 }} fontSize="small" />
          {t('shared.actions.clear')}
        </Fab>
      </Zoom>
    </BasePage>
  )
}

export default ConnectionsPage
