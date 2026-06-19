import type { SvgIconComponent } from '@mui/icons-material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ComputerRounded from '@mui/icons-material/ComputerRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import HubRoundedIcon from '@mui/icons-material/HubRounded'
import LanOutlined from '@mui/icons-material/LanOutlined'
import LanRounded from '@mui/icons-material/LanRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import {
  Box,
  Button,
  ButtonGroup,
  Collapse,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import yaml from 'js-yaml'
import {
  type FC,
  type MouseEvent as ReactMouseEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  closeAllConnections,
  selectNodeForGroup,
} from 'tauri-plugin-mihomo-api'

import { BaseDialog, BasePage, DialogRef } from '@/components/base'
import { ProviderButton } from '@/components/proxy/provider-button'
import { ProxyChain } from '@/components/proxy/proxy-chain'
import { ProxyHead } from '@/components/proxy/proxy-head'
import { ProxyItemMini } from '@/components/proxy/proxy-item-mini'
import { SysproxyViewer } from '@/components/setting/mods/sysproxy-viewer'
import ProxyControlSwitches from '@/components/shared/proxy-control-switches'
import { useVerge } from '@/hooks/use-app-config'
import { useClash } from '@/hooks/use-clash'
import {
  useConnectionActiveData,
  useConnectionData,
} from '@/hooks/use-connection-data'
import { useProfiles } from '@/hooks/use-profiles'
import { useSystemProxyState } from '@/hooks/use-system-proxy-state'
import { useSystemState } from '@/hooks/use-system-state'
import { useVisibility } from '@/hooks/use-visibility'
import {
  useAppRefreshers,
  useClashConfigData,
  useProxiesData,
} from '@/providers/app-data-context'
import {
  getRuntimeProxyChainConfig,
  isPortInUse,
  patchProfilesConfig,
  readProfileFile,
  patchClashMode,
  updateProxyChainConfigInRuntime,
} from '@/services/cmds'
import delayManager from '@/services/delay'
import { showNotice } from '@/services/notice-service'
import speedManager from '@/services/speed'
import { isValidPort } from '@/utils/network'

type ProxyMode = 'system' | 'port' | 'tun'
type ClashMode = 'rule' | 'global' | 'direct'
type ListenerType = 'mixed' | 'http' | 'socks'
type PortProxyRouteMode = 'rule' | 'global' | 'direct'
type PortProxySortType = 0 | 1 | 2

type PortProxyForm = {
  name: string
  type: ListenerType
  port: string
  routeMode: PortProxyRouteMode
  subscriptionUid: string
  nodeGroup: string
  proxy: string
  udp: boolean
}

type PortProxyChainConfig = {
  enabled?: boolean
  nodes?: string[]
}

type PortProxyItem = {
  id: string
  enabled: boolean
  name: string
  type: ListenerType
  listen: string
  port: number
  routeMode: PortProxyRouteMode
  subscriptionUid: string
  subscriptionName: string
  nodeGroup: string
  proxy: string
  udp?: boolean
  chain?: PortProxyChainConfig
  selected?: Array<{ name?: string; now?: string }>
}

type SubscriptionProxyGroup = {
  name: string
  all: { name: string; type?: string; history?: any[] }[]
}

type SubscriptionOption = {
  uid: string
  name: string
  /** 兼容层：是否与原项目 profiles.current 对齐。只用于运行时名称映射，不在 UI 展示。 */
  isCurrent: boolean
  groups: SubscriptionProxyGroup[] | null
}

type ProxyChainItem = {
  id: string
  name: string
  type?: string
  delay?: number
}

type PortProxyDynamicRoute = {
  groupName: string
  nodeName: string
  runtimeGroupName?: string
  runtimeNodeName?: string
  route: string[]
  rule: string
  rulePayload: string
  connectionId: string
}

type CachedPortProxyDynamicRoute = PortProxyDynamicRoute & {
  updatedAt: number
}

type RawProfileConfig = {
  proxies?: Array<{ name?: string; type?: string; history?: any[] }>
  'proxy-groups'?: Array<{
    name?: string
    proxies?: Array<string | { name?: string }>
    all?: Array<string | { name?: string }>
    use?: Array<string | { name?: string }>
  }>
}

type PortProxyHeadState = {
  open?: boolean
  showType: boolean
  sortType: PortProxySortType
  filterText: string
  filterMatchCase?: boolean
  filterMatchWholeWord?: boolean
  filterUseRegularExpression?: boolean
  textState: 'url' | 'filter' | null
  testUrl: string
}

type ProxyNodeGroupForFilter = {
  name: string
  all: Array<IProxyItem | { name: string; type?: string; history?: any[] }>
}

const DEFAULT_PORT_PROXY_HEAD_STATE: PortProxyHeadState = {
  open: true,
  showType: true,
  sortType: 0,
  filterText: '',
  filterMatchCase: false,
  filterMatchWholeWord: false,
  filterUseRegularExpression: false,
  textState: null,
  testUrl: '',
}

const DEFAULT_PORT_PROXY_LOCAL_LISTEN = '127.0.0.1'

const DEFAULT_FORM: PortProxyForm = {
  name: '',
  type: 'mixed',
  port: '',
  routeMode: 'rule',
  subscriptionUid: '',
  nodeGroup: '',
  proxy: '',
  udp: true,
}

const LISTENER_TYPES: Array<{ value: ListenerType; label: string }> = [
  { value: 'mixed', label: 'Mixed' },
  { value: 'http', label: 'HTTP' },
  { value: 'socks', label: 'SOCKS5' },
]
const LISTENER_TYPE_SET = new Set<string>(
  LISTENER_TYPES.map((item) => item.value),
)

const CLASH_MODES: ClashMode[] = ['rule', 'global', 'direct']
const CLASH_MODE_SET = new Set<string>(CLASH_MODES)
const PORT_PROXY_ROUTE_MODES: Array<{
  value: PortProxyRouteMode
  label: string
  description: string
}> = [
  {
    value: 'rule',
    label: '规则',
    description: '按订阅 rules / sub-rules 分流',
  },
  {
    value: 'global',
    label: '全局',
    description: '当前端口全部流量走该订阅的代理组',
  },
  {
    value: 'direct',
    label: '直连',
    description: '当前端口全部流量 DIRECT',
  },
]
const PORT_PROXY_ROUTE_MODE_SET = new Set<string>(
  PORT_PROXY_ROUTE_MODES.map((item) => item.value),
)
const PRESET_PROXY_NAMES = [
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
  'COMPATIBLE',
]
const CHAIN_DRAWER_WIDTH = 280

const isClashMode = (mode: unknown): mode is ClashMode =>
  typeof mode === 'string' && CLASH_MODE_SET.has(mode)

const isPortProxyRouteMode = (mode: unknown): mode is PortProxyRouteMode =>
  typeof mode === 'string' && PORT_PROXY_ROUTE_MODE_SET.has(mode)

const normalizePortProxyRouteMode = (mode: unknown): PortProxyRouteMode =>
  isPortProxyRouteMode(mode) ? mode : 'rule'

const getPortProxyRouteModeLabel = (mode: PortProxyRouteMode) =>
  PORT_PROXY_ROUTE_MODES.find((item) => item.value === mode)?.label ?? '规则'

const isPortProxyListener = (listener: IListenerItem) =>
  ['mixed', 'http', 'socks'].includes(listener.type)

const isListenerType = (type: unknown): type is ListenerType =>
  typeof type === 'string' && LISTENER_TYPE_SET.has(type)

const createPortProxyId = () =>
  `port-proxy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const listenerToPortProxy = (
  listener: IListenerItem,
  index: number,
): PortProxyItem => ({
  id: createPortProxyId(),
  enabled: true,
  name: listener.name || `port-${listener.type}-${listener.port || index}`,
  type: isListenerType(listener.type) ? listener.type : 'mixed',
  listen: listener.listen || DEFAULT_PORT_PROXY_LOCAL_LISTEN,
  port: Number(listener.port),
  routeMode:
    listener.proxy === 'DIRECT' ? 'direct' : listener.proxy ? 'global' : 'rule',
  subscriptionUid: '',
  subscriptionName: '',
  nodeGroup: '',
  proxy: listener.proxy || '',
  udp: listener.type === 'http' ? false : (listener.udp ?? true),
})

const normalizePortProxy = (
  proxy: IVergePortProxy,
  index: number,
): PortProxyItem | null => {
  if (!isListenerType(proxy.type) || !proxy.port) return null

  return {
    id: proxy.id || `port-proxy-${index}-${proxy.port}`,
    enabled: proxy.enabled ?? true,
    name: proxy.name || `port-${proxy.type}-${proxy.port}`,
    type: proxy.type,
    listen: proxy.listen || DEFAULT_PORT_PROXY_LOCAL_LISTEN,
    port: Number(proxy.port),
    routeMode: normalizePortProxyRouteMode(proxy.routeMode),
    subscriptionUid: proxy.subscriptionUid || '',
    subscriptionName: proxy.subscriptionName || '',
    nodeGroup: proxy.nodeGroup || '',
    proxy: proxy.proxy || '',
    udp: proxy.type === 'http' ? false : (proxy.udp ?? true),
    chain: proxy.chain,
    selected: proxy.selected,
  }
}

const getPortProxyKey = (proxy: PortProxyItem) => proxy.id

const proxyChainItemsFromNames = (names: string[] | undefined) =>
  (names ?? [])
    .filter((name): name is string => Boolean(name))
    .map((name, index) => ({
      id: `${name}_${index}`,
      name,
    }))

const proxyChainNamesFromItems = (items: ProxyChainItem[]) =>
  items.map((item) => item.name).filter(Boolean)

const areProxyChainNamesEqual = (
  left: string[] | undefined,
  right: string[] | undefined,
) => {
  const leftNames = left ?? []
  const rightNames = right ?? []
  return (
    leftNames.length === rightNames.length &&
    leftNames.every((name, index) => name === rightNames[index])
  )
}

const withPortProxyChain = (
  proxy: PortProxyItem,
  items: ProxyChainItem[],
  enabled = proxy.chain?.enabled ?? false,
): PortProxyItem => ({
  ...proxy,
  chain: {
    ...(proxy.chain ?? {}),
    enabled,
    nodes: proxyChainNamesFromItems(items),
  },
})

const makeUniqueName = (
  proxies: PortProxyItem[],
  type: ListenerType,
  port: number,
) => {
  const used = new Set(proxies.map((item) => item.name).filter(Boolean))
  const base = `port-${type}-${port}`
  if (!used.has(base)) return base

  let suffix = 2
  while (used.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

const normalizeProxyMode = (verge?: IVergeConfig): ProxyMode => {
  if (verge?.enable_tun_mode) return 'tun'
  if (verge?.enable_system_proxy) return 'system'
  return 'port'
}

const buildCurrentSubscriptionGroups = (
  groups: IProxyGroupItem[],
): SubscriptionProxyGroup[] =>
  groups
    .filter((group) => Array.isArray(group.all))
    .map((group) => ({
      name: group.name,
      all: (group.all ?? []).map((node) => ({
        name: node.name,
        type: node.type,
        history: node.history,
      })),
    }))

const parseSubscriptionGroups = (content: string): SubscriptionProxyGroup[] => {
  const parsed = yaml.load(content) as RawProfileConfig | null
  const proxyMap = new Map<
    string,
    { name: string; type?: string; history?: any[] }
  >()

  for (const proxy of parsed?.proxies ?? []) {
    if (proxy?.name) {
      proxyMap.set(proxy.name, {
        name: proxy.name,
        type: proxy.type,
        history: proxy.history,
      })
    }
  }

  return (parsed?.['proxy-groups'] ?? [])
    .map((group) => {
      const rawNodes = group.proxies ?? group.all ?? group.use ?? []
      const all = rawNodes
        .map((node) => (typeof node === 'string' ? node : node?.name))
        .filter((name): name is string => Boolean(name))
        .map((name) => proxyMap.get(name) ?? { name })

      return group.name && all.length > 0 ? { name: group.name, all } : null
    })
    .filter((group): group is SubscriptionProxyGroup => Boolean(group))
}

const getTestableNodeNames = (
  nodes: Array<{ name?: string; provider?: string }>,
) =>
  nodes
    .filter(
      (node) =>
        Boolean(node?.name) &&
        !node.provider &&
        !PRESET_PROXY_NAMES.includes(node.name!),
    )
    .map((node) => node.name!)

const getSubscriptionRuntimePrefix = (
  subscription?: SubscriptionOption | null,
) => (subscription && !subscription.isCurrent ? `${subscription.name} - ` : '')

const toSubscriptionRuntimeName = (
  subscription: SubscriptionOption | undefined | null,
  name: string,
) => {
  const prefix = getSubscriptionRuntimePrefix(subscription)
  if (
    !prefix ||
    !name ||
    PRESET_PROXY_NAMES.includes(name) ||
    name.startsWith(prefix)
  ) {
    return name
  }

  return `${prefix}${name}`
}

const getPortProxyDisplayName = (
  portProxy: Pick<PortProxyItem, 'id' | 'name' | 'port'>,
) =>
  portProxy.name?.trim() ||
  (portProxy.port ? String(portProxy.port) : portProxy.id || '端口代理')

const getPortProxyRuntimePrefix = (
  subscription: SubscriptionOption | undefined | null,
  portProxy: PortProxyItem,
) => {
  const subscriptionName =
    subscription?.name ||
    portProxy.subscriptionName ||
    portProxy.subscriptionUid ||
    '未命名订阅'

  return `${subscriptionName}(${getPortProxyDisplayName(portProxy)}) - `
}

const toPortProxyRuntimeGroupName = (
  subscription: SubscriptionOption | undefined | null,
  portProxy: PortProxyItem,
  groupName: string,
) => {
  const prefix = getPortProxyRuntimePrefix(subscription, portProxy)
  if (!groupName || groupName.startsWith(prefix)) return groupName

  return `${prefix}${groupName}`
}

const toPortProxyDisplayName = (
  subscription: SubscriptionOption | undefined | null,
  portProxy: PortProxyItem,
  runtimeName: string,
) => {
  const portPrefix = getPortProxyRuntimePrefix(subscription, portProxy)
  if (runtimeName.startsWith(portPrefix)) {
    return runtimeName.slice(portPrefix.length)
  }

  const subscriptionPrefix = getSubscriptionRuntimePrefix(subscription)
  if (subscriptionPrefix && runtimeName.startsWith(subscriptionPrefix)) {
    return runtimeName.slice(subscriptionPrefix.length)
  }

  return runtimeName
}

const PORT_PROXY_ROUTE_KEEP_LAST_MS = 60_000

const sameStringArray = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false
  }
  return true
}

const samePortProxyDynamicRoute = (
  left?: PortProxyDynamicRoute,
  right?: PortProxyDynamicRoute,
) =>
  left === right ||
  Boolean(
    left &&
      right &&
      left.groupName === right.groupName &&
      left.nodeName === right.nodeName &&
      left.runtimeGroupName === right.runtimeGroupName &&
      left.runtimeNodeName === right.runtimeNodeName &&
      left.rule === right.rule &&
      left.rulePayload === right.rulePayload &&
      left.connectionId === right.connectionId &&
      sameStringArray(left.route, right.route),
  )

const samePortProxyDynamicRoutes = (
  left: Record<string, PortProxyDynamicRoute>,
  right: Record<string, PortProxyDynamicRoute>,
) => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) =>
    samePortProxyDynamicRoute(left[key], right[key]),
  )
}

const stripCachedPortProxyRoutes = (
  cached: Record<string, CachedPortProxyDynamicRoute>,
) =>
  Object.fromEntries(
    Object.entries(cached).map(([key, { updatedAt: _updatedAt, ...route }]) => [
      key,
      route,
    ]),
  )

const buildPortProxyDynamicRoutes = (
  portProxies: PortProxyItem[],
  subscriptionOptions: SubscriptionOption[],
  activeConnections: IConnectionsItem[] = [],
  closedConnections: IConnectionsItem[] = [],
) => {
  const routes: Record<string, PortProxyDynamicRoute> = {}
  const allConnections =
    closedConnections.length > 0
      ? [...closedConnections, ...activeConnections]
      : activeConnections

  for (const portProxy of portProxies) {
    const listenerName = portProxy.name || `port-${portProxy.port}`
    let matched: IConnectionsItem | undefined

    for (let i = allConnections.length - 1; i >= 0; i--) {
      const conn = allConnections[i]
      const metadata = conn.metadata
      if (
        metadata.inboundName === listenerName ||
        metadata.inboundPort === String(portProxy.port)
      ) {
        matched = conn
        break
      }
    }

    if (!matched) continue

    const route = [...(matched.chains ?? [])].reverse()
    const subscription = subscriptionOptions.find(
      (item) => item.uid === portProxy.subscriptionUid,
    )
    const subscriptionGroups = subscription?.groups ?? []
    const runtimePrefix = getPortProxyRuntimePrefix(subscription, portProxy)
    const subscriptionRuntimePrefix = getSubscriptionRuntimePrefix(subscription)
    const toRuntimeName = (name: string) => {
      if (!name) return name
      if (name.startsWith(runtimePrefix)) return name
      if (
        subscriptionRuntimePrefix &&
        name.startsWith(subscriptionRuntimePrefix)
      ) {
        return name
      }
      return `${runtimePrefix}${name}`
    }
    const toDisplayName = (name: string) =>
      runtimePrefix && name.startsWith(runtimePrefix)
        ? name.slice(runtimePrefix.length)
        : subscriptionRuntimePrefix &&
            name.startsWith(subscriptionRuntimePrefix)
          ? name.slice(subscriptionRuntimePrefix.length)
          : name
    const matchedGroup = route
      .map((runtimeName) => ({
        runtimeName,
        group: subscriptionGroups.find(
          (group) =>
            group.name === runtimeName ||
            toRuntimeName(group.name) === runtimeName,
        ),
      }))
      .find((item) => item.group)
    const runtimeGroupName = matchedGroup?.runtimeName
    const runtimeNodeName = route[route.length - 1]
    const groupName =
      matchedGroup?.group?.name || matched.rulePayload || matched.rule || '-'
    const nodeName = runtimeNodeName
      ? toDisplayName(runtimeNodeName)
      : groupName || '-'
    routes[portProxy.id] = {
      groupName,
      nodeName,
      runtimeGroupName,
      runtimeNodeName,
      route,
      rule: matched.rule,
      rulePayload: matched.rulePayload,
      connectionId: matched.id,
    }
  }

  return routes
}

interface TabButtonProps {
  isActive: boolean
  onClick: () => void
  icon: SvgIconComponent
  label: string
  hasIndicator?: boolean
  disabled?: boolean
}

const TabButton: FC<TabButtonProps> = memo(
  ({
    isActive,
    onClick,
    icon: Icon,
    label,
    hasIndicator = false,
    disabled,
  }) => (
    <Paper
      elevation={isActive ? 2 : 0}
      onClick={disabled ? undefined : onClick}
      sx={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        px: 2,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        background: isActive
          ? (theme) =>
              `linear-gradient(180deg, ${alpha(
                theme.palette.primary.main,
                0.18,
              )} 0%, ${alpha(theme.palette.primary.main, 0.08)} 100%)`
          : 'background.paper',
        color: isActive ? 'primary.main' : 'text.primary',
        border: '1px solid',
        borderColor: isActive
          ? 'primary.main'
          : hasIndicator
            ? 'success.main'
            : 'divider',
        borderRadius: 1.5,
        flex: 1,
        minWidth: 150,
        maxWidth: 190,
        opacity: disabled ? 0.55 : 1,
        transition: 'all 0.2s ease-in-out',
        position: 'relative',
        boxShadow: isActive
          ? (theme) => `0 4px 14px ${alpha(theme.palette.primary.main, 0.16)}`
          : hasIndicator
            ? (theme) =>
                `inset 0 0 0 1px ${alpha(theme.palette.success.main, 0.24)}`
            : 'none',
        '&:hover': disabled
          ? {}
          : {
              bgcolor: isActive
                ? (theme) => alpha(theme.palette.primary.main, 0.16)
                : (theme) => alpha(theme.palette.primary.main, 0.06),
              transform: 'translateY(-1px)',
              boxShadow: isActive
                ? (theme) =>
                    `0 5px 16px ${alpha(theme.palette.primary.main, 0.2)}`
                : hasIndicator
                  ? (theme) =>
                      `inset 0 0 0 1px ${alpha(theme.palette.success.main, 0.24)}`
                  : 1,
            },
        '&:after': isActive
          ? {
              content: '""',
              position: 'absolute',
              bottom: -4,
              left: '50%',
              width: 9,
              height: 9,
              borderRadius: '50%',
              bgcolor: 'success.main',
              transform: 'translateX(-50%)',
              boxShadow: (theme) =>
                `0 0 0 3px ${alpha(theme.palette.success.main, 0.16)}`,
            }
          : {},
      }}
    >
      <Icon fontSize="small" />
      <Typography variant="body2" sx={{ fontWeight: isActive ? 700 : 400 }}>
        {label}
      </Typography>
    </Paper>
  ),
)

const PortsPage = () => {
  const { t } = useTranslation()
  const theme = useTheme()
  const { clash, mutateClash } = useClash()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const lightweightOptimizations =
    verge?.enable_ui_lightweight_optimizations ?? true
  const { clashConfig } = useClashConfigData()
  const { refreshClashConfig, refreshProxy } = useAppRefreshers()
  const { proxies } = useProxiesData()
  const pageVisible = useVisibility()
  const {
    response: { data: connectionData },
  } = useConnectionData({ enabled: !lightweightOptimizations })
  const {
    response: { data: activeConnectionData },
  } = useConnectionActiveData({
    enabled: lightweightOptimizations ? pageVisible : false,
  })
  const { profiles, mutateProfiles } = useProfiles()
  const profileItems = profiles?.items
  const currentProfileUid = profiles?.current
  const { indicator: systemProxyIndicator, toggleSystemProxy } =
    useSystemProxyState()
  const { isTunModeAvailable } = useSystemState()

  const sysproxyRef = useRef<DialogRef>(null)
  const initializedProxyModeRef = useRef(false)
  const handleProxyError = useCallback((err: Error) => {
    showNotice.error(err)
  }, [])

  const [proxyMode, setProxyMode] = useState<ProxyMode>('port')
  const [form, setForm] = useState<PortProxyForm>(DEFAULT_FORM)
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [portProxies, setPortProxies] = useState<PortProxyItem[]>([])
  const [selectedPortProxyId, setSelectedPortProxyId] = useState<string | null>(
    null,
  )
  const [portProxyChainDrafts, setPortProxyChainDrafts] = useState<
    Record<string, ProxyChainItem[]>
  >({})
  const [expandedPortProxyIds, setExpandedPortProxyIds] = useState<
    Record<string, boolean>
  >({})
  const [portProxyHeadStates, setPortProxyHeadStates] = useState<
    Record<string, PortProxyHeadState>
  >({})
  const [chainGroupHeadStates, setChainGroupHeadStates] = useState<
    Record<string, PortProxyHeadState>
  >({})
  const [expandedChainGroupNames, setExpandedChainGroupNames] = useState<
    Record<string, boolean>
  >({})
  const [selectedNodeNames, setSelectedNodeNames] = useState<
    Record<string, string[]>
  >({})
  const lastSelectedNodeRef = useRef<Record<string, string>>({})
  const [subscriptionGroupsMap, setSubscriptionGroupsMap] = useState<
    Record<string, SubscriptionProxyGroup[]>
  >({})
  // 链式代理只作为右侧临时配置面板：每次进入页面默认关闭，
  // 只能由右上角“链式代理”按钮显式打开。
  const [isChainMode, setIsChainMode] = useState(false)
  const [proxyChain, setProxyChain] = useState<ProxyChainItem[]>(() => {
    try {
      const saved = localStorage.getItem('proxy-chain-items')
      return saved ? (JSON.parse(saved) as ProxyChainItem[]) : []
    } catch {
      return []
    }
  })
  const [chainTargetGroupName, setChainTargetGroupName] = useState(() => {
    try {
      return localStorage.getItem('proxy-chain-group') ?? ''
    } catch {
      return ''
    }
  })
  const [chainConfigData, dispatchChainConfigData] = useReducer(
    (_: string | null, action: string | null) => action,
    null as string | null,
  )

  const updateChainConfigData = useCallback((value: string | null) => {
    dispatchChainConfigData(value)
  }, [])

  useEffect(() => {
    if (initializedProxyModeRef.current || !verge) return
    initializedProxyModeRef.current = true
    // 根据当前运行状态初始化一次页签；后续页签切换不能被开关状态反向覆盖。
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setProxyMode(normalizeProxyMode(verge))
  }, [verge])

  useEffect(() => {
    if (!verge) return

    const configuredPortProxies = Array.isArray(verge.port_proxies)
      ? verge.port_proxies
          .map((item, index) => normalizePortProxy(item, index))
          .filter((item): item is PortProxyItem => Boolean(item))
      : (clash?.listeners ?? [])
          .filter(isPortProxyListener)
          .map(listenerToPortProxy)

    // 从 应用配置同步完整端口代理列表；旧版本没有 port_proxies 时，从现有 listeners 迁移。
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setPortProxies(configuredPortProxies)
  }, [clash?.listeners, verge])

  useEffect(() => {
    if (portProxies.length === 0) {
      if (selectedPortProxyId !== null) {
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setSelectedPortProxyId(null)
      }
      return
    }

    if (
      !selectedPortProxyId ||
      !portProxies.some((item) => item.id === selectedPortProxyId)
    ) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setSelectedPortProxyId(portProxies[0].id)
    }
  }, [portProxies, selectedPortProxyId])

  useEffect(() => {
    const subscriptionItems =
      profileItems?.filter((item) =>
        ['remote', 'local'].includes(item.type ?? ''),
      ) ?? []

    if (subscriptionItems.length === 0) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setSubscriptionGroupsMap({})
      return
    }

    let cancelled = false

    const loadSubscriptionGroups = async () => {
      const entries = await Promise.all(
        subscriptionItems.map(async (item) => {
          try {
            const content = await readProfileFile(item.uid)
            return [item.uid, parseSubscriptionGroups(content)] as const
          } catch (error) {
            console.error(
              'Failed to read subscription profile:',
              item.uid,
              error,
            )
            return [item.uid, []] as const
          }
        }),
      )

      if (!cancelled) {
        setSubscriptionGroupsMap(Object.fromEntries(entries))
      }
    }

    loadSubscriptionGroups()

    return () => {
      cancelled = true
    }
  }, [profileItems])

  useEffect(() => {
    if (proxyChain.length > 0) {
      localStorage.setItem('proxy-chain-items', JSON.stringify(proxyChain))
    } else {
      localStorage.removeItem('proxy-chain-items')
    }
  }, [proxyChain])

  useEffect(() => {
    if (!isChainMode || proxyMode === 'port') {
      updateChainConfigData(null)
      return
    }

    let cancelled = false

    const fetchChainConfig = async () => {
      try {
        const exitNode = localStorage.getItem('proxy-chain-exit-node')
        if (!exitNode) {
          if (!cancelled) updateChainConfigData('')
          return
        }

        const configData = await getRuntimeProxyChainConfig(exitNode)
        if (!cancelled) updateChainConfigData(configData || '')
      } catch (error) {
        console.error('Failed to get runtime proxy chain config:', error)
        if (!cancelled) updateChainConfigData('')
      }
    }

    fetchChainConfig()

    return () => {
      cancelled = true
    }
  }, [isChainMode, proxyMode, updateChainConfigData])

  const normalizedClashMode = clashConfig?.mode?.toLowerCase()
  const currentClashMode = isClashMode(normalizedClashMode)
    ? normalizedClashMode
    : 'rule'
  const allowLanEnabled = Boolean(clash?.['allow-lan'])
  const portProxyRuntimeListen = allowLanEnabled
    ? '0.0.0.0'
    : DEFAULT_PORT_PROXY_LOCAL_LISTEN
  const isPortProxyRuntimeActive =
    portProxies.some((item) => item.enabled) &&
    !verge?.enable_system_proxy &&
    !verge?.enable_tun_mode
  const isPortProxyTabActive = proxyMode === 'port'

  const proxyGroups = useMemo<IProxyGroupItem[]>(
    () => proxies?.groups ?? [],
    [proxies],
  )

  const selectableGroups = useMemo(
    () => proxyGroups.filter((group) => Array.isArray(group.all)),
    [proxyGroups],
  )

  useEffect(() => {
    if (!isPortProxyRuntimeActive || currentClashMode === 'rule') return

    void (async () => {
      try {
        if (verge?.auto_close_connection) {
          closeAllConnections()
        }
        await patchClashMode('rule')
        refreshClashConfig()
        showNotice.info('端口代理已开启，已切换为规则模式')
      } catch (error) {
        console.error('Failed to force rule mode for port proxy:', error)
      }
    })()
  }, [
    currentClashMode,
    isPortProxyRuntimeActive,
    refreshClashConfig,
    verge?.auto_close_connection,
  ])

  const subscriptionOptions = useMemo<SubscriptionOption[]>(() => {
    const currentGroups = buildCurrentSubscriptionGroups(selectableGroups)
    const currentUid = currentProfileUid ?? ''
    const enabledProfileUids = verge?.enabled_profile_uids ?? []
    const enabledUidSet = new Set(enabledProfileUids)
    const profileOptions =
      profileItems
        ?.filter(
          (item) =>
            ['remote', 'local'].includes(item.type ?? '') &&
            enabledUidSet.has(item.uid),
        )
        .map((item) => ({
          uid: item.uid,
          name: item.name || item.uid,
          isCurrent: item.uid === currentUid,
          groups:
            item.uid === currentUid
              ? currentGroups
              : (subscriptionGroupsMap[item.uid] ?? []),
        })) ?? []

    if (
      currentUid &&
      enabledUidSet.has(currentUid) &&
      !profileOptions.some((item) => item.uid === currentUid)
    ) {
      return [
        {
          uid: currentUid,
          name: currentUid,
          isCurrent: true,
          groups: currentGroups,
        },
        ...profileOptions,
      ]
    }

    return profileOptions
  }, [
    currentProfileUid,
    profileItems,
    selectableGroups,
    subscriptionGroupsMap,
    verge?.enabled_profile_uids,
  ])

  const portProxyCount = portProxies.length
  const enabledPortProxyCount = portProxies.filter(
    (item) => item.enabled,
  ).length
  const allPortProxiesEnabled =
    portProxyCount > 0 && enabledPortProxyCount === portProxyCount
  const somePortProxiesEnabled = enabledPortProxyCount > 0
  const portProxyIndicator =
    enabledPortProxyCount > 0 &&
    !systemProxyIndicator &&
    !verge?.enable_tun_mode
  const activeProxyModeLabel = systemProxyIndicator
    ? '系统代理'
    : verge?.enable_tun_mode
      ? '虚拟网卡代理'
      : portProxyIndicator
        ? '端口代理'
        : '未开启'
  const isPortProxyAvailable = proxyMode === 'port'
  const selectedPortProxy = useMemo(
    () =>
      selectedPortProxyId
        ? (portProxies.find((item) => item.id === selectedPortProxyId) ?? null)
        : null,
    [portProxies, selectedPortProxyId],
  )
  const selectedPortProxyChain = useMemo(() => {
    if (!selectedPortProxy) return []
    return (
      portProxyChainDrafts[selectedPortProxy.id] ??
      proxyChainItemsFromNames(selectedPortProxy.chain?.nodes)
    )
  }, [portProxyChainDrafts, selectedPortProxy])
  const selectedPortProxyChainNames = useMemo(
    () => proxyChainNamesFromItems(selectedPortProxyChain),
    [selectedPortProxyChain],
  )
  const isSelectedPortProxyChainDirty = useMemo(
    () =>
      Boolean(selectedPortProxy) &&
      !areProxyChainNamesEqual(
        selectedPortProxy?.chain?.nodes,
        selectedPortProxyChainNames,
      ),
    [selectedPortProxy, selectedPortProxyChainNames],
  )
  const isSelectedPortProxyChainConnected = Boolean(
    selectedPortProxy?.chain?.enabled && !isSelectedPortProxyChainDirty,
  )
  const activeProxyChain =
    proxyMode === 'port' ? selectedPortProxyChain : proxyChain

  const fullPortProxyDynamicRoutes = useMemo(
    () =>
      buildPortProxyDynamicRoutes(
        portProxies,
        subscriptionOptions,
        connectionData?.activeConnections ?? [],
        connectionData?.closedConnections ?? [],
      ),
    [
      connectionData?.activeConnections,
      connectionData?.closedConnections,
      portProxies,
      subscriptionOptions,
    ],
  )
  const activePortProxyDynamicRoutes = useMemo(
    () =>
      buildPortProxyDynamicRoutes(
        portProxies,
        subscriptionOptions,
        activeConnectionData?.activeConnections ?? [],
      ),
    [activeConnectionData?.activeConnections, portProxies, subscriptionOptions],
  )
  const routeCacheRef = useRef<Record<string, CachedPortProxyDynamicRoute>>({})
  const [
    lightweightPortProxyDynamicRoutes,
    setLightweightPortProxyDynamicRoutes,
  ] = useState<Record<string, PortProxyDynamicRoute>>({})

  useEffect(() => {
    if (!lightweightOptimizations) {
      routeCacheRef.current = {}
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setLightweightPortProxyDynamicRoutes((previous) =>
        Object.keys(previous).length > 0 ? {} : previous,
      )
      return
    }

    const now = Date.now()
    const portProxyIds = new Set(portProxies.map((item) => item.id))
    const nextCached: Record<string, CachedPortProxyDynamicRoute> = {}

    for (const portProxy of portProxies) {
      const latestRoute = activePortProxyDynamicRoutes[portProxy.id]
      if (latestRoute) {
        nextCached[portProxy.id] = { ...latestRoute, updatedAt: now }
        continue
      }

      const cachedRoute = routeCacheRef.current[portProxy.id]
      if (
        cachedRoute &&
        now - cachedRoute.updatedAt <= PORT_PROXY_ROUTE_KEEP_LAST_MS
      ) {
        nextCached[portProxy.id] = cachedRoute
      }
    }

    for (const [key, route] of Object.entries(routeCacheRef.current)) {
      if (!portProxyIds.has(key)) continue
      if (nextCached[key]) continue
      if (now - route.updatedAt <= PORT_PROXY_ROUTE_KEEP_LAST_MS) {
        nextCached[key] = route
      }
    }

    routeCacheRef.current = nextCached
    const nextRoutes = stripCachedPortProxyRoutes(nextCached)
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setLightweightPortProxyDynamicRoutes((previous) =>
      samePortProxyDynamicRoutes(previous, nextRoutes) ? previous : nextRoutes,
    )
  }, [activePortProxyDynamicRoutes, lightweightOptimizations, portProxies])

  useEffect(() => {
    if (!lightweightOptimizations) return
    const cachedRoutes = Object.values(routeCacheRef.current)
    if (cachedRoutes.length === 0) return

    const now = Date.now()
    const nextExpireAt = Math.min(
      ...cachedRoutes.map(
        (route) => route.updatedAt + PORT_PROXY_ROUTE_KEEP_LAST_MS,
      ),
    )
    const timeout = window.setTimeout(
      () => {
        const currentNow = Date.now()
        const nextCached = Object.fromEntries(
          Object.entries(routeCacheRef.current).filter(
            ([, route]) =>
              currentNow - route.updatedAt <= PORT_PROXY_ROUTE_KEEP_LAST_MS,
          ),
        )
        routeCacheRef.current = nextCached
        const nextRoutes = stripCachedPortProxyRoutes(nextCached)
        setLightweightPortProxyDynamicRoutes((previous) =>
          samePortProxyDynamicRoutes(previous, nextRoutes)
            ? previous
            : nextRoutes,
        )
      },
      Math.max(0, nextExpireAt - now) + 50,
    )

    return () => window.clearTimeout(timeout)
  }, [lightweightOptimizations, lightweightPortProxyDynamicRoutes])

  const portProxyDynamicRoutes = lightweightOptimizations
    ? lightweightPortProxyDynamicRoutes
    : fullPortProxyDynamicRoutes

  const updateSelectedPortProxyChain = useCallback(
    (chain: ProxyChainItem[]) => {
      if (!selectedPortProxyId) return
      setPortProxyChainDrafts((prev) => ({
        ...prev,
        [selectedPortProxyId]: chain,
      }))
    },
    [selectedPortProxyId],
  )

  const getDisplaySubscription = useCallback(
    (portProxy: PortProxyItem) =>
      portProxy.subscriptionName ||
      subscriptionOptions.find((item) => item.uid === portProxy.subscriptionUid)
        ?.name ||
      '未选择订阅',
    [subscriptionOptions],
  )

  const getDisplayNodeGroup = useCallback(
    (portProxy: PortProxyItem) => {
      if (portProxy.chain?.enabled) return '端口级链式代理'
      if (portProxy.routeMode === 'direct') return 'DIRECT'
      if (portProxy.routeMode === 'global') {
        return portProxyDynamicRoutes[portProxy.id]?.groupName || '全局代理组'
      }
      return portProxyDynamicRoutes[portProxy.id]?.groupName || '等待流量匹配'
    },
    [portProxyDynamicRoutes],
  )

  const getDisplayNode = useCallback(
    (portProxy: PortProxyItem) => {
      if (portProxy.chain?.enabled) {
        const chainNodes = portProxy.chain.nodes?.filter(Boolean) ?? []
        return chainNodes.length > 0 ? chainNodes.join(' -> ') : '等待配置链路'
      }
      if (portProxy.routeMode === 'direct') return 'DIRECT'
      if (portProxy.routeMode === 'global') {
        return portProxyDynamicRoutes[portProxy.id]?.nodeName || '等待全局连接'
      }
      return portProxyDynamicRoutes[portProxy.id]?.nodeName || '等待流量匹配'
    },
    [portProxyDynamicRoutes],
  )

  const getPortProxyGroup = useCallback(
    (portProxy: PortProxyItem) => {
      if (portProxy.routeMode === 'direct') return null
      const subscriptionGroups =
        subscriptionOptions.find(
          (item) => item.uid === portProxy.subscriptionUid,
        )?.groups ?? []
      const dynamicGroupName = portProxyDynamicRoutes[portProxy.id]?.groupName
      const dynamicGroup = dynamicGroupName
        ? subscriptionGroups.find((group) => group.name === dynamicGroupName)
        : null
      if (dynamicGroup) return dynamicGroup

      if (portProxy.routeMode === 'global') {
        return (
          subscriptionGroups.find((group) => group.name === portProxy.proxy) ??
          subscriptionGroups[0] ??
          null
        )
      }

      return null
    },
    [portProxyDynamicRoutes, subscriptionOptions],
  )

  const getSavedPortProxyNodeName = useCallback(
    (portProxy: PortProxyItem, groupName: string) => {
      const subscription = subscriptionOptions.find(
        (item) => item.uid === portProxy.subscriptionUid,
      )
      const runtimeGroupName = toPortProxyRuntimeGroupName(
        subscription,
        portProxy,
        groupName,
      )
      const savedNow = portProxy.selected?.find(
        (item) => item.name === runtimeGroupName || item.name === groupName,
      )?.now

      return savedNow
        ? toPortProxyDisplayName(subscription, portProxy, savedNow)
        : ''
    },
    [subscriptionOptions],
  )

  const togglePortProxyExpanded = useCallback((id: string) => {
    setExpandedPortProxyIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const updatePortProxyNode = useLockFn(
    async (index: number, group: SubscriptionProxyGroup, node: IProxyItem) => {
      const portProxy = portProxies[index]
      if (!portProxy || !group?.name || !node?.name) return

      const subscription = subscriptionOptions.find(
        (item) => item.uid === portProxy.subscriptionUid,
      )
      const runtimeGroupName = toPortProxyRuntimeGroupName(
        subscription,
        portProxy,
        group.name,
      )
      const runtimeNodeName = toSubscriptionRuntimeName(subscription, node.name)

      try {
        await selectNodeForGroup(runtimeGroupName, runtimeNodeName)
        const selected = [...(portProxy.selected ?? [])]
        const selectedIndex = selected.findIndex(
          (item) => item.name === runtimeGroupName,
        )
        const nextSelected = { name: runtimeGroupName, now: runtimeNodeName }
        if (selectedIndex >= 0) {
          selected[selectedIndex] = nextSelected
        } else {
          selected.push(nextSelected)
        }

        const nextPortProxies = portProxies.map((item, itemIndex) =>
          itemIndex === index ? { ...item, selected } : item,
        )
        await savePortProxies(nextPortProxies, '')
        await refreshProxy()
        if (verge?.auto_close_connection) closeAllConnections()
        showNotice.success(
          `${portProxy.name || `port-${portProxy.port}`} 的动态节点组 ${group.name} 已切换到 ${node.name}`,
        )
      } catch (error: any) {
        showNotice.error(error)
      }
    },
  )

  const getPortProxyHeadState = useCallback(
    (key: string): PortProxyHeadState =>
      portProxyHeadStates[key] ?? DEFAULT_PORT_PROXY_HEAD_STATE,
    [portProxyHeadStates],
  )

  const setPortProxyHeadState = useCallback(
    (key: string, patch: Partial<PortProxyHeadState>) => {
      setPortProxyHeadStates((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] ?? DEFAULT_PORT_PROXY_HEAD_STATE),
          ...patch,
        },
      }))
    },
    [],
  )

  const getChainGroupHeadState = useCallback(
    (key: string): PortProxyHeadState =>
      chainGroupHeadStates[key] ?? DEFAULT_PORT_PROXY_HEAD_STATE,
    [chainGroupHeadStates],
  )

  const setChainGroupHeadState = useCallback(
    (key: string, patch: Partial<PortProxyHeadState>) => {
      setChainGroupHeadStates((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] ?? DEFAULT_PORT_PROXY_HEAD_STATE),
          ...patch,
        },
      }))
    },
    [],
  )

  const toggleChainGroupExpanded = useCallback((groupName: string) => {
    setExpandedChainGroupNames((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }))
  }, [])

  const getSelectedNodeNames = useCallback(
    (key: string, availableNames?: string[]) => {
      const names = selectedNodeNames[key] ?? []
      if (!availableNames) return names
      const availableNameSet = new Set(availableNames)
      return names.filter((name) => availableNameSet.has(name))
    },
    [selectedNodeNames],
  )

  const getSelectedNodeCount = useCallback(
    (key: string, availableNames?: string[]) =>
      getSelectedNodeNames(key, availableNames).length,
    [getSelectedNodeNames],
  )

  const isNodeMultiSelected = useCallback(
    (key: string, nodeName: string) =>
      getSelectedNodeNames(key).includes(nodeName),
    [getSelectedNodeNames],
  )

  const selectSingleNode = useCallback((key: string, nodeName: string) => {
    setSelectedNodeNames((prev) => ({ ...prev, [key]: [nodeName] }))
    lastSelectedNodeRef.current[key] = nodeName
  }, [])

  const toggleNodeSelection = useCallback(
    (
      key: string,
      nodeName: string,
      orderedNames: string[],
      event?: ReactMouseEvent<HTMLDivElement>,
    ) => {
      setSelectedNodeNames((prev) => {
        const current = prev[key] ?? []
        if (event?.shiftKey) {
          const anchorName = lastSelectedNodeRef.current[key] ?? nodeName
          const anchorIndex = orderedNames.indexOf(anchorName)
          const targetIndex = orderedNames.indexOf(nodeName)

          if (anchorIndex >= 0 && targetIndex >= 0) {
            const [start, end] =
              anchorIndex <= targetIndex
                ? [anchorIndex, targetIndex]
                : [targetIndex, anchorIndex]
            const rangeNames = orderedNames.slice(start, end + 1)
            return {
              ...prev,
              [key]: Array.from(new Set([...current, ...rangeNames])),
            }
          }
        }

        const next = current.includes(nodeName)
          ? current.filter((name) => name !== nodeName)
          : [...current, nodeName]
        lastSelectedNodeRef.current[key] = nodeName
        return { ...prev, [key]: next }
      })
    },
    [],
  )

  const getFilteredPortProxyNodes = useCallback(
    (
      group: ProxyNodeGroupForFilter,
      headState: PortProxyHeadState,
    ): IProxyItem[] => {
      let nodes = group.all as IProxyItem[]
      const query = headState.filterText.trim()
      if (query) {
        const flags = headState.filterMatchCase ? '' : 'i'
        let regex: RegExp | null = null
        if (headState.filterUseRegularExpression) {
          try {
            regex = new RegExp(query, flags)
          } catch {
            return []
          }
        }
        nodes = nodes.filter((node) => {
          const name = headState.filterMatchCase
            ? node.name
            : node.name.toLowerCase()
          const text = headState.filterMatchCase ? query : query.toLowerCase()
          if (regex) return regex.test(node.name)
          if (headState.filterMatchWholeWord) return name === text
          return name.includes(text)
        })
      }

      if (headState.sortType === 1) {
        return [...nodes].sort(
          (a, b) =>
            delayManager.getDelayFix(a, group.name) -
            delayManager.getDelayFix(b, group.name),
        )
      }
      if (headState.sortType === 2) {
        return [...nodes].sort((a, b) => a.name.localeCompare(b.name))
      }
      return nodes
    },
    [],
  )

  const checkPortProxyGroupDelay = useLockFn(
    async (group: ProxyNodeGroupForFilter, selectionKey?: string) => {
      const names = getTestableNodeNames(group.all)
      const selectedNames = selectionKey
        ? getSelectedNodeNames(selectionKey, names)
        : []
      const targetNames = selectedNames.length > 0 ? selectedNames : names
      await delayManager.checkListDelay(
        targetNames,
        group.name,
        verge?.default_latency_timeout || 10000,
      )
    },
  )

  const checkPortProxyGroupSpeed = useLockFn(
    async (group: ProxyNodeGroupForFilter, selectionKey?: string) => {
      const names = getTestableNodeNames(group.all)
      const selectedNames = selectionKey
        ? getSelectedNodeNames(selectionKey, names)
        : []
      const targetNames = selectedNames.length > 0 ? selectedNames : names
      await speedManager.checkListSpeed(
        targetNames,
        group.name,
        speedManager.normalizeTimeout(verge?.default_speed_test_timeout),
        speedManager.normalizeConcurrency(
          verge?.default_speed_test_concurrency,
        ),
      )
    },
  )

  const systemProxyPort =
    verge?.verge_mixed_port ?? clashConfig?.mixedPort ?? 7897

  const enabledSubscriptionUidSet = useMemo(
    () => new Set(subscriptionOptions.map((item) => item.uid)),
    [subscriptionOptions],
  )

  const resolveEntryProfileUid = useCallback(
    (configuredUid?: string) => {
      if (configuredUid && enabledSubscriptionUidSet.has(configuredUid)) {
        return configuredUid
      }
      if (
        currentProfileUid &&
        enabledSubscriptionUidSet.has(currentProfileUid)
      ) {
        return currentProfileUid
      }
      return subscriptionOptions[0]?.uid ?? ''
    },
    [currentProfileUid, enabledSubscriptionUidSet, subscriptionOptions],
  )

  const systemProxyProfileUid = resolveEntryProfileUid(
    verge?.system_proxy_profile_uid,
  )
  const tunProxyProfileUid = resolveEntryProfileUid(
    verge?.tun_proxy_profile_uid,
  )

  const saveEntryProfileUid = useCallback(
    async (mode: Extract<ProxyMode, 'system' | 'tun'>, uid: string) => {
      if (!uid) return false
      const key =
        mode === 'system' ? 'system_proxy_profile_uid' : 'tun_proxy_profile_uid'
      const currentValue =
        mode === 'system'
          ? verge?.system_proxy_profile_uid
          : verge?.tun_proxy_profile_uid
      if (currentValue === uid) return true

      const patch = { [key]: uid } as Partial<IVergeConfig>
      mutateVerge((prev) => (prev ? { ...prev, ...patch } : prev))
      await patchVerge(patch)
      return true
    },
    [mutateVerge, patchVerge, verge],
  )

  const syncEntryRuntimeProfile = useCallback(
    async (uid: string, label: string) => {
      if (!uid) {
        showNotice.error(`请先在订阅菜单启用至少一个订阅，再开启${label}`)
        return false
      }
      if (currentProfileUid === uid) return true

      const success = await patchProfilesConfig({ current: uid })
      await Promise.all([mutateProfiles(), mutateClash()])
      if (!success) {
        showNotice.error(`${label}订阅配置校验失败`)
        return false
      }
      if (verge?.auto_close_connection) {
        closeAllConnections()
      }
      return true
    },
    [
      currentProfileUid,
      mutateClash,
      mutateProfiles,
      verge?.auto_close_connection,
    ],
  )

  const handleEntryProfileChange = useLockFn(
    async (mode: Extract<ProxyMode, 'system' | 'tun'>, uid: string) => {
      const label = mode === 'system' ? '系统代理' : '虚拟网卡代理'
      const isRunning =
        mode === 'system' ? systemProxyIndicator : !!verge?.enable_tun_mode
      if (isRunning && !(await syncEntryRuntimeProfile(uid, label))) return
      await saveEntryProfileUid(mode, uid)
      showNotice.success(`${label}运行订阅已切换`)
    },
  )

  const switchProxyMode = useCallback(
    (mode: ProxyMode) => {
      if (mode !== proxyMode) setProxyMode(mode)
    },
    [proxyMode],
  )

  const selectPortProxyCard = useCallback(
    (id: string) => {
      if (!isPortProxyAvailable) return
      setSelectedPortProxyId(id)
    },
    [isPortProxyAvailable],
  )

  const handleSystemProxyToggle = useLockFn(async (checked: boolean) => {
    try {
      if (checked) {
        if (!systemProxyProfileUid) {
          showNotice.error('请先在订阅菜单启用至少一个订阅，再开启系统代理')
          return
        }
        if (portProxies.some((item) => item.enabled)) {
          await savePortProxies(
            portProxies.map((item) => ({ ...item, enabled: false })),
            '',
          )
        }
        if (verge?.enable_tun_mode) {
          mutateVerge((prev) =>
            prev ? { ...prev, enable_tun_mode: false } : prev,
          )
          await patchVerge({ enable_tun_mode: false })
        }
        await saveEntryProfileUid('system', systemProxyProfileUid)
        if (
          !(await syncEntryRuntimeProfile(systemProxyProfileUid, '系统代理'))
        ) {
          return
        }
      }
      await toggleSystemProxy(checked)
    } catch (err: any) {
      showNotice.error(err)
    }
  })

  const handleBeforeTunToggle = useLockFn(async (checked: boolean) => {
    if (!checked) return

    if (!tunProxyProfileUid) {
      throw new Error('请先在订阅菜单启用至少一个订阅，再开启虚拟网卡代理')
    }
    if (systemProxyIndicator) {
      await toggleSystemProxy(false)
    }
    if (portProxies.some((item) => item.enabled)) {
      await savePortProxies(
        portProxies.map((item) => ({ ...item, enabled: false })),
        '',
      )
    }
    await saveEntryProfileUid('tun', tunProxyProfileUid)
    if (!(await syncEntryRuntimeProfile(tunProxyProfileUid, '虚拟网卡代理'))) {
      throw new Error('虚拟网卡代理订阅配置校验失败')
    }
  })

  const onChangeClashMode = useLockFn(async (mode: ClashMode) => {
    if (isPortProxyRuntimeActive && mode !== 'rule') {
      showNotice.info('端口代理已开启时只能使用规则模式')
      return
    }
    if (mode === currentClashMode) return
    if (verge?.auto_close_connection) {
      closeAllConnections()
    }
    await patchClashMode(mode)
    refreshClashConfig()
  })

  const onToggleChainMode = useLockFn(async () => {
    const next = !isChainMode
    if (next && proxyMode === 'port') {
      const targetId = selectedPortProxyId ?? portProxies[0]?.id ?? null
      if (targetId) {
        setSelectedPortProxyId(targetId)
        setExpandedPortProxyIds((prev) => ({ ...prev, [targetId]: true }))
      }
    }
    setIsChainMode(next)

    if (!next && proxyMode !== 'port') {
      await updateProxyChainConfigInRuntime(null).catch((error) => {
        console.error('Failed to clear chain configuration:', error)
      })
    }
  })

  const chainSourceGroups = useMemo<IProxyGroupItem[]>(() => {
    if (currentClashMode === 'global') {
      const nodes = (proxies?.proxies ?? []).filter(
        (node: IProxyItem) =>
          node?.name && !['DIRECT', 'REJECT'].includes(node.name),
      )
      return nodes.length
        ? [
            {
              ...(proxies?.global ?? {}),
              name: 'GLOBAL',
              type: 'Selector',
              now: proxies?.global?.now ?? '',
              all: nodes,
            } as IProxyGroupItem,
          ]
        : []
    }
    if (currentClashMode === 'direct') return []
    return selectableGroups.filter((group) => group.type === 'Selector')
  }, [currentClashMode, proxies?.global, proxies?.proxies, selectableGroups])

  const safeChainTargetGroupName = useMemo(() => {
    if (currentClashMode === 'global') return undefined
    if (
      chainTargetGroupName &&
      chainSourceGroups.some((group) => group.name === chainTargetGroupName)
    ) {
      return chainTargetGroupName
    }
    return chainSourceGroups[0]?.name
  }, [chainSourceGroups, chainTargetGroupName, currentClashMode])

  const addNodeToProxyChain = useCallback(
    (group: { name: string }, node: IProxyItem, portProxyId?: string) => {
      if (!node?.name) return
      const latestHistory = node.history?.[node.history.length - 1]
      const nextItem: ProxyChainItem = {
        id: `${node.name}_${Date.now()}`,
        name: node.name,
        type: node.type,
        delay: latestHistory?.delay,
      }

      if (proxyMode === 'port') {
        const targetId = portProxyId ?? selectedPortProxyId
        if (!targetId) {
          showNotice.info('请先选择一个端口代理')
          return
        }
        const targetPortProxy = portProxies.find((item) => item.id === targetId)
        setSelectedPortProxyId(targetId)
        setPortProxyChainDrafts((prev) => {
          const current =
            prev[targetId] ??
            proxyChainItemsFromNames(targetPortProxy?.chain?.nodes)
          if (current.some((item) => item.name === node.name)) {
            showNotice.info(`节点 ${node.name} 已在该端口链式代理中`)
            return prev
          }
          return {
            ...prev,
            [targetId]: [...current, nextItem],
          }
        })
        return
      }

      if (currentClashMode !== 'global') {
        setChainTargetGroupName(group.name)
        localStorage.setItem('proxy-chain-group', group.name)
      }

      setProxyChain((prev) => {
        if (prev.some((item) => item.name === node.name)) {
          showNotice.info(`节点 ${node.name} 已在链式代理中`)
          return prev
        }

        return [...prev, nextItem]
      })
    },
    [currentClashMode, portProxies, proxyMode, selectedPortProxyId],
  )

  const savePortProxies = useLockFn(
    async (
      nextPortProxies: PortProxyItem[],
      successMessage = 'shared.feedback.notifications.common.saveSuccess',
    ) => {
      try {
        await patchVerge({ port_proxies: nextPortProxies })
        setPortProxies(nextPortProxies)
        mutateVerge((prev) =>
          prev ? { ...prev, port_proxies: nextPortProxies } : prev,
        )
        if (verge?.auto_close_connection) closeAllConnections()
        await mutateClash()
        if (successMessage) showNotice.success(successMessage)
        return true
      } catch (err: any) {
        showNotice.error(err)
        await mutateClash()
        await mutateVerge()
        return false
      }
    },
  )

  const clearPortProxyChainDraft = useCallback((id: string) => {
    setPortProxyChainDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const connectSelectedPortProxyChain = useLockFn(async () => {
    if (!selectedPortProxy) {
      showNotice.info('请先选择一个端口代理')
      return
    }
    if (selectedPortProxyChain.length < 2) {
      showNotice.error('链式代理至少需要2个节点')
      return
    }

    const nextPortProxies = portProxies.map((item) =>
      item.id === selectedPortProxy.id
        ? {
            ...withPortProxyChain(item, selectedPortProxyChain, true),
            enabled: true,
          }
        : item,
    )

    await deactivateSystemAndTunForPortProxy()

    const saved = await savePortProxies(
      nextPortProxies,
      `${selectedPortProxy.name || `port-${selectedPortProxy.port}`} 的端口级全局链式代理已连接`,
    )
    if (saved) clearPortProxyChainDraft(selectedPortProxy.id)
  })

  const disconnectSelectedPortProxyChain = useLockFn(async () => {
    if (!selectedPortProxy) {
      showNotice.info('请先选择一个端口代理')
      return
    }

    const nextPortProxies = portProxies.map((item) =>
      item.id === selectedPortProxy.id
        ? withPortProxyChain(item, selectedPortProxyChain, false)
        : item,
    )

    const saved = await savePortProxies(
      nextPortProxies,
      `${selectedPortProxy.name || `port-${selectedPortProxy.port}`} 的端口级全局链式代理已断开`,
    )
    if (saved) clearPortProxyChainDraft(selectedPortProxy.id)
  })

  const clearSelectedPortProxyChain = useLockFn(async () => {
    if (!selectedPortProxy) {
      showNotice.info('请先选择一个端口代理')
      return
    }

    const nextPortProxies = portProxies.map((item) =>
      item.id === selectedPortProxy.id
        ? {
            ...item,
            chain: {
              ...(item.chain ?? {}),
              enabled: false,
              nodes: [],
            },
          }
        : item,
    )

    const saved = await savePortProxies(
      nextPortProxies,
      `${selectedPortProxy.name || `port-${selectedPortProxy.port}`} 的链式代理已清空`,
    )
    if (saved) clearPortProxyChainDraft(selectedPortProxy.id)
  })

  const closeFormDialog = () => {
    setFormDialogOpen(false)
    setEditingIndex(null)
    setForm(DEFAULT_FORM)
  }

  const deactivateSystemAndTunForPortProxy = useCallback(async () => {
    if (systemProxyIndicator) {
      await toggleSystemProxy(false)
    }
    if (verge?.enable_tun_mode) {
      mutateVerge((prev) => (prev ? { ...prev, enable_tun_mode: false } : prev))
      await patchVerge({ enable_tun_mode: false })
    }
  }, [
    mutateVerge,
    patchVerge,
    systemProxyIndicator,
    toggleSystemProxy,
    verge?.enable_tun_mode,
  ])

  const openAddDialog = () => {
    setEditingIndex(null)
    setForm((prev) => ({
      ...DEFAULT_FORM,
      type: prev.type,
      routeMode: prev.routeMode || DEFAULT_FORM.routeMode,
      subscriptionUid:
        prev.subscriptionUid || subscriptionOptions[0]?.uid || '',
    }))
    setFormDialogOpen(true)
  }

  const openEditDialog = (index: number) => {
    const proxy = portProxies[index]
    if (!proxy) return

    const subscriptionUid =
      proxy.subscriptionUid || subscriptionOptions[0]?.uid || ''
    setEditingIndex(index)
    setForm({
      name: proxy.name ?? '',
      type: proxy.type,
      port: proxy.port ? String(proxy.port) : '',
      routeMode: proxy.routeMode ?? DEFAULT_FORM.routeMode,
      subscriptionUid,
      nodeGroup: proxy.nodeGroup ?? '',
      proxy: proxy.proxy ?? '',
      udp: proxy.udp ?? true,
    })
    setFormDialogOpen(true)
  }

  const deletePortProxy = (index: number) => {
    void savePortProxies(portProxies.filter((_, i) => i !== index))
  }

  const handleSubmitPortProxy = useLockFn(async () => {
    if (!isValidPort(form.port)) {
      showNotice.error('无效的端口号')
      return
    }

    if (subscriptionOptions.length === 0) {
      showNotice.error('请先到订阅菜单启用至少一个订阅')
      return
    }

    const selectedSubscription = subscriptionOptions.find(
      (item) => item.uid === form.subscriptionUid,
    )
    if (!form.subscriptionUid || !selectedSubscription) {
      showNotice.error('请先选择订阅')
      return
    }

    const port = Number(form.port)
    const duplicatedPort = portProxies.some(
      (item, index) => index !== editingIndex && item.port === port,
    )
    if (duplicatedPort) {
      showNotice.error(`端口 ${port} 已在当前列表中存在`)
      return
    }

    const previous =
      editingIndex === null ? undefined : portProxies[editingIndex]
    const nextEnabled = previous?.enabled ?? true
    const portChanged = previous?.port !== port
    if (nextEnabled && (!previous || portChanged)) {
      const inUse = await isPortInUse(port)
      if (inUse) {
        showNotice.error('settings.modals.clashPort.messages.portInUse', {
          port,
        })
        return
      }
    }

    const name =
      form.name.trim() || makeUniqueName(portProxies, form.type, port)
    const duplicatedName = portProxies.some(
      (item, index) => index !== editingIndex && item.name === name,
    )
    if (duplicatedName) {
      showNotice.error(`名称 ${name} 已存在`)
      return
    }

    const nextPortProxy: PortProxyItem = {
      id: previous?.id ?? createPortProxyId(),
      enabled: nextEnabled,
      name,
      type: form.type,
      listen: previous?.listen ?? DEFAULT_PORT_PROXY_LOCAL_LISTEN,
      port,
      routeMode: form.routeMode,
      subscriptionUid: selectedSubscription.uid,
      subscriptionName: selectedSubscription.name,
      nodeGroup: previous?.nodeGroup ?? '',
      proxy: previous?.proxy ?? '',
      chain: previous?.chain,
      selected: previous?.selected,
      ...(form.type !== 'http' ? { udp: form.udp } : {}),
    }

    const nextPortProxies =
      editingIndex === null
        ? [...portProxies, nextPortProxy]
        : portProxies.map((item, index) =>
            index === editingIndex ? nextPortProxy : item,
          )

    if (nextPortProxies.some((item) => item.enabled)) {
      await deactivateSystemAndTunForPortProxy()
    }

    const saved = await savePortProxies(nextPortProxies)
    if (saved) closeFormDialog()
  })

  const togglePortProxy = useLockFn(async (index: number, enabled: boolean) => {
    const proxy = portProxies[index]
    if (!proxy) return

    const nextPortProxies = portProxies.map((item, i) =>
      i === index ? { ...item, enabled } : item,
    )

    if (enabled) {
      await deactivateSystemAndTunForPortProxy()
    }

    await savePortProxies(
      nextPortProxies,
      `${proxy.name || `port-${proxy.port}`}（${portProxyRuntimeListen}:${proxy.port}）已${enabled ? '开启' : '关闭'}`,
    )
  })

  const changePortProxyRouteMode = useLockFn(
    async (index: number, routeMode: PortProxyRouteMode) => {
      const proxy = portProxies[index]
      if (!proxy || proxy.routeMode === routeMode) return
      if (proxy.chain?.enabled) {
        showNotice.info(
          '该端口已连接链式代理，请先断开链式代理后再切换路由策略',
        )
        return
      }

      const nextPortProxies = portProxies.map((item, itemIndex) =>
        itemIndex === index ? { ...item, routeMode } : item,
      )

      const saved = await savePortProxies(
        nextPortProxies,
        `${proxy.name || `port-${proxy.port}`} 已切换为${getPortProxyRouteModeLabel(routeMode)}模式`,
      )
      if (saved && proxy.enabled) {
        refreshClashConfig()
      }
    },
  )

  const toggleAllPortProxies = useLockFn(async (enabled: boolean) => {
    if (!isPortProxyAvailable || portProxies.length === 0) return

    if (enabled) {
      await deactivateSystemAndTunForPortProxy()
    }

    await savePortProxies(
      portProxies.map((item) => ({ ...item, enabled })),
      `所有端口代理已${enabled ? '开启' : '关闭'}`,
    )
  })

  const pageHeader = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <ProviderButton />
      <ButtonGroup size="small">
        {CLASH_MODES.map((mode) => {
          const disabledByPortMode = isPortProxyTabActive && mode !== 'rule'
          const active = isPortProxyTabActive
            ? mode === 'rule'
            : mode === currentClashMode

          return (
            <Button
              key={mode}
              variant={active ? 'contained' : 'outlined'}
              disabled={disabledByPortMode}
              onClick={() => {
                if (!disabledByPortMode) onChangeClashMode(mode)
              }}
              sx={{ textTransform: 'capitalize' }}
            >
              {t(`proxies.page.modes.${mode}`)}
            </Button>
          )
        })}
      </ButtonGroup>
      <Button
        size="small"
        variant={isChainMode ? 'contained' : 'outlined'}
        onClick={onToggleChainMode}
        startIcon={
          isChainMode ? (
            <LanRounded fontSize="small" />
          ) : (
            <LanOutlined fontSize="small" />
          )
        }
      >
        {t('proxies.page.actions.toggleChain')}
      </Button>
      {isPortProxyTabActive && (
        <Typography variant="caption" color="text.secondary">
          顶层保持规则；每个端口可单独切换规则/全局/直连
        </Typography>
      )}
    </Box>
  )

  return (
    <BasePage
      title={t('layout.components.navigation.tabs.ports')}
      contentStyle={{ height: 'calc(100% - 24px)' }}
      header={pageHeader}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          height: '100%',
          minHeight: 0,
          alignItems: 'stretch',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            overflow: 'auto',
            pr: isChainMode ? 0.5 : 0,
            transition: 'padding-right 0.22s ease-in-out',
          }}
        >
          <Stack spacing={1.5}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Stack spacing={1.5}>
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
                    isActive={proxyMode === 'system'}
                    onClick={() => switchProxyMode('system')}
                    icon={ComputerRounded}
                    label="系统代理"
                    hasIndicator={systemProxyIndicator}
                  />
                  <TabButton
                    isActive={proxyMode === 'port'}
                    onClick={() => switchProxyMode('port')}
                    icon={HubRoundedIcon}
                    label="端口代理"
                    hasIndicator={portProxyIndicator}
                  />
                  <TabButton
                    isActive={proxyMode === 'tun'}
                    onClick={() => switchProxyMode('tun')}
                    icon={LanRounded}
                    label="虚拟网卡代理"
                    hasIndicator={verge?.enable_tun_mode && isTunModeAvailable}
                  />
                </Stack>

                <Box
                  sx={{
                    mt: 0,
                    p: 1,
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                    borderRadius: 2,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      textAlign: 'center',
                      color:
                        activeProxyModeLabel === '未开启'
                          ? 'text.secondary'
                          : 'primary.main',
                      fontWeight: 800,
                    }}
                  >
                    当前使用：{activeProxyModeLabel}
                    {' · '}
                    {proxyMode === 'system'
                      ? `正在查看系统代理，切换到此页签不会自动开启。当前端口：${systemProxyPort}`
                      : proxyMode === 'tun'
                        ? '正在查看虚拟网卡代理，不单独指定端口。'
                        : `正在查看端口代理，当前 ${portProxyCount} 个，已开启 ${enabledPortProxyCount} 个。`}
                  </Typography>
                </Box>
              </Stack>
            </Paper>

            {proxyMode === 'system' && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack spacing={1.25}>
                  <Stack
                    direction="row"
                    sx={{
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        系统代理
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        与原系统代理功能保持一致，当前端口：{systemProxyPort}
                      </Typography>
                    </Box>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: 'center' }}
                    >
                      <Switch
                        checked={systemProxyIndicator}
                        disabled={
                          !systemProxyIndicator &&
                          subscriptionOptions.length === 0
                        }
                        onChange={(_, checked) =>
                          handleSystemProxyToggle(checked)
                        }
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<SettingsRoundedIcon />}
                        onClick={() => sysproxyRef.current?.open()}
                      >
                        系统代理设置
                      </Button>
                    </Stack>
                  </Stack>
                  <FormControl size="small" fullWidth>
                    <InputLabel>运行订阅</InputLabel>
                    <Select
                      label="运行订阅"
                      value={systemProxyProfileUid}
                      disabled={subscriptionOptions.length === 0}
                      onChange={(event) =>
                        handleEntryProfileChange(
                          'system',
                          event.target.value as string,
                        )
                      }
                    >
                      {subscriptionOptions.map((item) => (
                        <MenuItem key={item.uid} value={item.uid}>
                          {item.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {subscriptionOptions.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      请先到订阅菜单启用订阅，系统代理开启时会使用这里选择的订阅生成运行配置。
                    </Typography>
                  )}
                </Stack>
              </Paper>
            )}

            {proxyMode === 'port' && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack spacing={1.25}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: 'center' }}
                    >
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        已配置端口代理
                      </Typography>
                      <Chip size="small" label={`${portProxyCount} 个端口`} />
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <Stack
                        direction="row"
                        spacing={0.75}
                        sx={{ alignItems: 'center' }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          总开关
                        </Typography>
                        <Switch
                          size="small"
                          checked={allPortProxiesEnabled}
                          color={
                            somePortProxiesEnabled && !allPortProxiesEnabled
                              ? 'warning'
                              : 'primary'
                          }
                          disabled={
                            !isPortProxyAvailable || portProxyCount === 0
                          }
                          onChange={(_, checked) =>
                            toggleAllPortProxies(checked)
                          }
                        />
                      </Stack>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<AddRoundedIcon />}
                        disabled={!isPortProxyAvailable}
                        onClick={openAddDialog}
                      >
                        添加端口代理
                      </Button>
                    </Stack>
                  </Stack>
                  <Divider />
                  {portProxies.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      暂无端口代理，请点击“添加端口代理”创建。
                    </Typography>
                  ) : (
                    <Stack spacing={1}>
                      {portProxies.map((portProxy, index) => {
                        const portProxyKey = getPortProxyKey(portProxy)
                        const expanded = !!expandedPortProxyIds[portProxyKey]
                        const selectedForChain =
                          selectedPortProxyId === portProxyKey
                        const portProxyChain =
                          portProxyChainDrafts[portProxyKey] ??
                          proxyChainItemsFromNames(portProxy.chain?.nodes)
                        const portProxyDynamicRoute =
                          portProxyDynamicRoutes[portProxyKey]
                        const portProxyGroup = getPortProxyGroup(portProxy)
                        const portProxySubscription = subscriptionOptions.find(
                          (item) => item.uid === portProxy.subscriptionUid,
                        )
                        const portProxyGroups = isChainMode
                          ? (portProxySubscription?.groups ?? [])
                          : portProxyGroup
                            ? [portProxyGroup]
                            : []
                        const routeModeDisabled = Boolean(
                          portProxy.chain?.enabled,
                        )

                        return (
                          <Box
                            key={portProxyKey}
                            className="port-proxy-card"
                            data-selected={
                              selectedForChain && proxyMode === 'port'
                                ? 'true'
                                : undefined
                            }
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1.5,
                              overflow: 'hidden',
                              opacity: isPortProxyAvailable ? 1 : 0.58,
                              bgcolor: 'background.paper',
                              transition:
                                'border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
                            }}
                          >
                            <Box
                              onClick={() => selectPortProxyCard(portProxyKey)}
                              sx={{
                                display: 'grid',
                                gridTemplateColumns:
                                  'auto minmax(0, 1fr) max-content',
                                gridTemplateAreas: {
                                  xs: '"switch title actions" "meta meta meta"',
                                  sm: '"switch title actions" "meta meta actions"',
                                },
                                columnGap: 0.75,
                                rowGap: 0.35,
                                alignItems: 'center',
                                p: 1,
                                cursor: isPortProxyAvailable
                                  ? 'pointer'
                                  : 'default',
                                bgcolor:
                                  selectedForChain && proxyMode === 'port'
                                    ? alpha(theme.palette.primary.main, 0.08)
                                    : 'background.paper',
                                boxShadow:
                                  selectedForChain && proxyMode === 'port'
                                    ? `inset 3px 0 0 ${theme.palette.primary.main}`
                                    : 'none',
                                transition:
                                  'background-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
                              }}
                            >
                              <Box sx={{ gridArea: 'switch' }}>
                                <Switch
                                  size="small"
                                  checked={portProxy.enabled}
                                  disabled={!isPortProxyAvailable}
                                  onChange={(_, checked) =>
                                    togglePortProxy(index, checked)
                                  }
                                />
                              </Box>
                              <Box
                                sx={{
                                  gridArea: 'title',
                                  minWidth: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.75,
                                }}
                              >
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography sx={{ fontWeight: 700 }} noWrap>
                                    {portProxy.name || `port-${portProxy.port}`}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    noWrap
                                    component="div"
                                  >
                                    端口：{portProxyRuntimeListen}:
                                    {portProxy.port}
                                  </Typography>
                                </Box>
                                {portProxy.chain?.enabled && (
                                  <Chip
                                    size="small"
                                    label="链式代理"
                                    color="primary"
                                    variant="outlined"
                                    sx={{ flexShrink: 0 }}
                                  />
                                )}
                              </Box>
                              <Box
                                sx={{
                                  gridArea: 'meta',
                                  minWidth: 0,
                                  pl: { xs: 0, sm: 6 },
                                }}
                              >
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  noWrap
                                  component="div"
                                >
                                  订阅：{getDisplaySubscription(portProxy)}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  noWrap
                                  component="div"
                                >
                                  节点组：{getDisplayNodeGroup(portProxy)}
                                </Typography>
                                <Tooltip
                                  title={getDisplayNode(portProxy)}
                                  placement="top"
                                >
                                  <Typography variant="body2" noWrap>
                                    节点：{getDisplayNode(portProxy)}
                                  </Typography>
                                </Tooltip>
                                <Box
                                  onClick={(event) => event.stopPropagation()}
                                  sx={{ mt: 0.65 }}
                                >
                                  <ButtonGroup
                                    size="small"
                                    sx={{
                                      '& .MuiButton-root': {
                                        minWidth: 42,
                                        px: 0.75,
                                        py: 0.2,
                                        fontSize: 11,
                                        lineHeight: 1.25,
                                      },
                                    }}
                                  >
                                    {PORT_PROXY_ROUTE_MODES.map((item) => {
                                      const active =
                                        portProxy.routeMode === item.value
                                      return (
                                        <Tooltip
                                          key={item.value}
                                          title={
                                            routeModeDisabled
                                              ? '链式代理已接管该端口，断开后可切换'
                                              : item.description
                                          }
                                        >
                                          <span>
                                            <Button
                                              variant={
                                                active
                                                  ? 'contained'
                                                  : 'outlined'
                                              }
                                              disabled={
                                                !isPortProxyAvailable ||
                                                routeModeDisabled
                                              }
                                              onClick={(event) => {
                                                event.stopPropagation()
                                                changePortProxyRouteMode(
                                                  index,
                                                  item.value,
                                                )
                                              }}
                                            >
                                              {item.label}
                                            </Button>
                                          </span>
                                        </Tooltip>
                                      )
                                    })}
                                  </ButtonGroup>
                                </Box>
                              </Box>
                              <Stack
                                direction="row"
                                spacing={0.15}
                                sx={{
                                  gridArea: 'actions',
                                  alignItems: 'center',
                                  justifyContent: 'flex-end',
                                  justifySelf: 'end',
                                  alignSelf: 'center',
                                  width: 'max-content',
                                  minWidth: 0,
                                  flexShrink: 0,
                                }}
                              >
                                <Chip
                                  size="small"
                                  label={String(portProxy.type).toUpperCase()}
                                  variant="outlined"
                                  sx={{ mr: 0.25, flexShrink: 0 }}
                                />
                                <IconButton
                                  size="small"
                                  color="primary"
                                  sx={{ p: 0.5, flexShrink: 0 }}
                                  disabled={!isPortProxyAvailable}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    selectPortProxyCard(portProxyKey)
                                    openEditDialog(index)
                                  }}
                                >
                                  <EditRoundedIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  color="error"
                                  sx={{ p: 0.5, flexShrink: 0 }}
                                  disabled={!isPortProxyAvailable}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    deletePortProxy(index)
                                  }}
                                >
                                  <DeleteRoundedIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  sx={{
                                    p: 0.5,
                                    flexShrink: 0,
                                    transform: expanded
                                      ? 'rotate(180deg)'
                                      : 'rotate(0deg)',
                                    transition: 'transform 0.2s ease-in-out',
                                  }}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    selectPortProxyCard(portProxyKey)
                                    togglePortProxyExpanded(portProxyKey)
                                  }}
                                >
                                  <ExpandMoreRoundedIcon fontSize="small" />
                                </IconButton>
                              </Stack>
                            </Box>
                            <Collapse
                              in={expanded}
                              timeout="auto"
                              unmountOnExit
                            >
                              <Divider />
                              {portProxyGroups.length > 0 ? (
                                <Stack spacing={1} sx={{ p: 1, pt: 1.25 }}>
                                  {portProxyGroups.map((portProxyGroup) => {
                                    const groupKey = `${portProxyKey}:${portProxyGroup.name}`
                                    const chainGroupKey = `port-chain:${groupKey}`
                                    const groupExpanded = isChainMode
                                      ? (expandedChainGroupNames[
                                          chainGroupKey
                                        ] ?? portProxyGroups.length === 1)
                                      : true
                                    const headState =
                                      getPortProxyHeadState(groupKey)
                                    const portProxySelectionKey = `${
                                      isChainMode ? 'port-chain' : 'port'
                                    }:${groupKey}`
                                    const portProxyTestableNames =
                                      getTestableNodeNames(portProxyGroup.all)
                                    const portProxyNodes =
                                      getFilteredPortProxyNodes(
                                        portProxyGroup,
                                        headState,
                                      )
                                    const portProxyNodeNames =
                                      portProxyNodes.map((node) => node.name)
                                    const savedPortProxyNodeName =
                                      getSavedPortProxyNodeName(
                                        portProxy,
                                        portProxyGroup.name,
                                      )
                                    const selectedPortProxyNodeName =
                                      portProxyDynamicRoute?.nodeName ||
                                      savedPortProxyNodeName
                                    const groupForRender = {
                                      name: portProxyGroup.name,
                                      type: 'Selector',
                                      now:
                                        selectedPortProxyNodeName ||
                                        portProxyGroup.name,
                                      all: portProxyGroup.all,
                                    } as IProxyGroupItem

                                    return (
                                      <Box
                                        key={groupKey}
                                        sx={{
                                          border: isChainMode
                                            ? '1px solid'
                                            : 'none',
                                          borderColor: 'divider',
                                          borderRadius: 1,
                                          overflow: 'hidden',
                                        }}
                                      >
                                        <ListItemButton
                                          dense
                                          onClick={
                                            isChainMode
                                              ? () =>
                                                  toggleChainGroupExpanded(
                                                    chainGroupKey,
                                                  )
                                              : undefined
                                          }
                                          sx={{
                                            bgcolor: 'background.default',
                                            borderRadius: isChainMode ? 0 : 1,
                                            mb: isChainMode ? 0 : 1,
                                            cursor: isChainMode
                                              ? 'pointer'
                                              : 'default',
                                          }}
                                        >
                                          <ListItemText
                                            disableTypography
                                            primary={
                                              <Typography
                                                component="span"
                                                sx={{ fontWeight: 700 }}
                                              >
                                                {portProxyGroup.name}
                                              </Typography>
                                            }
                                            secondary={
                                              <Box
                                                component="span"
                                                sx={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: 1,
                                                }}
                                              >
                                                <Chip
                                                  size="small"
                                                  variant="outlined"
                                                  label="Selector"
                                                />
                                                <Typography
                                                  component="span"
                                                  variant="caption"
                                                  color="text.secondary"
                                                  noWrap
                                                >
                                                  {isChainMode
                                                    ? '链式代理节点选择（全部节点组）'
                                                    : getDisplayNode(portProxy)}
                                                </Typography>
                                              </Box>
                                            }
                                          />
                                          <Chip
                                            size="small"
                                            label={`${portProxyGroup.all.length}`}
                                            sx={{
                                              mr: isChainMode ? 0.5 : 0,
                                              bgcolor: (theme) =>
                                                alpha(
                                                  theme.palette.primary.main,
                                                  0.1,
                                                ),
                                              color: 'primary.main',
                                            }}
                                          />
                                          {isChainMode && (
                                            <ExpandMoreRoundedIcon
                                              fontSize="small"
                                              sx={{
                                                transform: groupExpanded
                                                  ? 'rotate(180deg)'
                                                  : 'rotate(0deg)',
                                                transition:
                                                  'transform 0.2s ease-in-out',
                                              }}
                                            />
                                          )}
                                        </ListItemButton>
                                        <Collapse
                                          in={groupExpanded}
                                          timeout="auto"
                                          unmountOnExit
                                        >
                                          {isChainMode && <Divider />}
                                          <Box sx={{ p: isChainMode ? 1 : 0 }}>
                                            <ProxyHead
                                              sx={{
                                                pl: 0,
                                                pr: 0,
                                                mt: 0.5,
                                                mb: 1,
                                              }}
                                              groupName={portProxyGroup.name}
                                              headState={headState}
                                              onLocation={() => {}}
                                              onCheckDelay={() =>
                                                checkPortProxyGroupDelay(
                                                  portProxyGroup,
                                                  portProxySelectionKey,
                                                )
                                              }
                                              onCheckSpeed={() =>
                                                checkPortProxyGroupSpeed(
                                                  portProxyGroup,
                                                  portProxySelectionKey,
                                                )
                                              }
                                              selectedCount={getSelectedNodeCount(
                                                portProxySelectionKey,
                                                portProxyTestableNames,
                                              )}
                                              onHeadState={(patch) =>
                                                setPortProxyHeadState(
                                                  groupKey,
                                                  patch,
                                                )
                                              }
                                            />
                                            <Box
                                              sx={{
                                                display: 'grid',
                                                gridTemplateColumns:
                                                  'repeat(2, minmax(0, 1fr))',
                                                gap: 1,
                                              }}
                                            >
                                              {portProxyNodes.map((node) => (
                                                <ProxyItemMini
                                                  key={`${groupKey}-${node.name}`}
                                                  group={groupForRender}
                                                  proxy={node}
                                                  selected={
                                                    isChainMode
                                                      ? portProxyChain.some(
                                                          (item) =>
                                                            item.name ===
                                                            node.name,
                                                        )
                                                      : portProxyDynamicRoute?.nodeName ===
                                                          node.name ||
                                                        selectedPortProxyNodeName ===
                                                          node.name
                                                  }
                                                  showType={headState.showType}
                                                  multiSelected={isNodeMultiSelected(
                                                    portProxySelectionKey,
                                                    node.name,
                                                  )}
                                                  onToggleMultiSelect={(
                                                    name,
                                                    event,
                                                  ) =>
                                                    toggleNodeSelection(
                                                      portProxySelectionKey,
                                                      name,
                                                      portProxyNodeNames,
                                                      event,
                                                    )
                                                  }
                                                  profileUid={
                                                    isChainMode
                                                      ? portProxy.subscriptionUid
                                                      : undefined
                                                  }
                                                  onClick={(name) => {
                                                    selectSingleNode(
                                                      portProxySelectionKey,
                                                      name,
                                                    )
                                                    if (isChainMode) {
                                                      addNodeToProxyChain(
                                                        portProxyGroup,
                                                        node,
                                                        portProxyKey,
                                                      )
                                                      return
                                                    }
                                                    updatePortProxyNode(
                                                      index,
                                                      portProxyGroup,
                                                      node,
                                                    )
                                                  }}
                                                />
                                              ))}
                                            </Box>
                                          </Box>
                                        </Collapse>
                                      </Box>
                                    )
                                  })}
                                </Stack>
                              ) : (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ p: 1.5 }}
                                >
                                  {isChainMode
                                    ? '该端口代理的订阅暂无可用于链式代理的节点。'
                                    : portProxy.routeMode === 'direct'
                                      ? '该端口代理当前为直连模式，流量会直接 DIRECT，不需要选择节点组。'
                                      : '未找到该端口代理当前/上次命中的节点组。'}
                                </Typography>
                              )}
                            </Collapse>
                          </Box>
                        )
                      })}
                    </Stack>
                  )}
                </Stack>
              </Paper>
            )}

            {proxyMode === 'tun' && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack spacing={1.25}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      虚拟网卡代理
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      与首页虚拟网卡模式保持一致，不单独指定端口。
                    </Typography>
                  </Box>
                  <FormControl size="small" fullWidth>
                    <InputLabel>运行订阅</InputLabel>
                    <Select
                      label="运行订阅"
                      value={tunProxyProfileUid}
                      disabled={subscriptionOptions.length === 0}
                      onChange={(event) =>
                        handleEntryProfileChange(
                          'tun',
                          event.target.value as string,
                        )
                      }
                    >
                      {subscriptionOptions.map((item) => (
                        <MenuItem key={item.uid} value={item.uid}>
                          {item.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {subscriptionOptions.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      请先到订阅菜单启用订阅，虚拟网卡代理开启时会使用这里选择的订阅生成运行配置。
                    </Typography>
                  )}
                  <ProxyControlSwitches
                    label={t('settings.sections.system.toggles.tunMode')}
                    noRightPadding
                    onBeforeTunToggle={handleBeforeTunToggle}
                    onError={handleProxyError}
                  />
                </Stack>
              </Paper>
            )}

            {isChainMode && proxyMode !== 'port' && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack spacing={1.25}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      链式代理节点
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      展开下面的节点组，点击节点后会加入右侧链式代理链路。
                    </Typography>
                  </Box>
                  {currentClashMode === 'direct' ? (
                    <Typography variant="body2" color="text.secondary">
                      直连模式下不配置链式代理，请切换到规则或全局模式。
                    </Typography>
                  ) : chainSourceGroups.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      暂无可用于链式代理的节点组。
                    </Typography>
                  ) : (
                    <Stack spacing={1}>
                      {chainSourceGroups.map((group) => {
                        const expanded = !!expandedChainGroupNames[group.name]
                        const headState = getChainGroupHeadState(group.name)
                        const chainSelectionKey = `chain:${group.name}`
                        const chainTestableNames = getTestableNodeNames(
                          group.all,
                        )
                        const nodes = getFilteredPortProxyNodes(
                          group,
                          headState,
                        )
                        const chainNodeNames = nodes.map((node) => node.name)

                        return (
                          <Box
                            key={group.name}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1.5,
                              overflow: 'hidden',
                              bgcolor: 'background.paper',
                            }}
                          >
                            <ListItemButton
                              dense
                              onClick={() =>
                                toggleChainGroupExpanded(group.name)
                              }
                              sx={{ bgcolor: 'background.default' }}
                            >
                              <ListItemText
                                disableTypography
                                primary={
                                  <Typography
                                    component="span"
                                    sx={{ fontWeight: 700 }}
                                  >
                                    {group.name}
                                  </Typography>
                                }
                                secondary={
                                  <Box
                                    component="span"
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 1,
                                      minWidth: 0,
                                    }}
                                  >
                                    <Chip
                                      size="small"
                                      variant="outlined"
                                      label={group.type || 'Selector'}
                                    />
                                    <Typography
                                      component="span"
                                      variant="caption"
                                      color="text.secondary"
                                      noWrap
                                    >
                                      {group.now || '-'}
                                    </Typography>
                                  </Box>
                                }
                              />
                              <Chip
                                size="small"
                                label={`${group.all.length}`}
                                sx={{
                                  mr: 0.5,
                                  bgcolor: (theme) =>
                                    alpha(theme.palette.primary.main, 0.1),
                                  color: 'primary.main',
                                }}
                              />
                              <ExpandMoreRoundedIcon
                                fontSize="small"
                                sx={{
                                  transform: expanded
                                    ? 'rotate(180deg)'
                                    : 'rotate(0deg)',
                                  transition: 'transform 0.2s ease-in-out',
                                }}
                              />
                            </ListItemButton>

                            <Collapse
                              in={expanded}
                              timeout="auto"
                              unmountOnExit
                            >
                              <Divider />
                              <Box sx={{ p: 1, pt: 1.25 }}>
                                <ProxyHead
                                  sx={{ pl: 0, pr: 0, mt: 0.5, mb: 1 }}
                                  groupName={group.name}
                                  headState={headState}
                                  onLocation={() => {}}
                                  onCheckDelay={() =>
                                    checkPortProxyGroupDelay(
                                      group,
                                      chainSelectionKey,
                                    )
                                  }
                                  onCheckSpeed={() =>
                                    checkPortProxyGroupSpeed(
                                      group,
                                      chainSelectionKey,
                                    )
                                  }
                                  selectedCount={getSelectedNodeCount(
                                    chainSelectionKey,
                                    chainTestableNames,
                                  )}
                                  onHeadState={(patch) =>
                                    setChainGroupHeadState(group.name, patch)
                                  }
                                />
                                <Box
                                  sx={{
                                    display: 'grid',
                                    gridTemplateColumns:
                                      'repeat(2, minmax(0, 1fr))',
                                    gap: 1,
                                  }}
                                >
                                  {nodes.map((node) => (
                                    <ProxyItemMini
                                      key={`${group.name}-${node.name}`}
                                      group={group}
                                      proxy={node}
                                      selected={proxyChain.some(
                                        (item) => item.name === node.name,
                                      )}
                                      showType={headState.showType}
                                      multiSelected={isNodeMultiSelected(
                                        chainSelectionKey,
                                        node.name,
                                      )}
                                      onToggleMultiSelect={(name, event) =>
                                        toggleNodeSelection(
                                          chainSelectionKey,
                                          name,
                                          chainNodeNames,
                                          event,
                                        )
                                      }
                                      onClick={(name) => {
                                        selectSingleNode(
                                          chainSelectionKey,
                                          name,
                                        )
                                        addNodeToProxyChain(group, node)
                                      }}
                                    />
                                  ))}
                                </Box>
                              </Box>
                            </Collapse>
                          </Box>
                        )
                      })}
                    </Stack>
                  )}
                </Stack>
              </Paper>
            )}
          </Stack>
        </Box>
        {isChainMode && (
          <Box
            sx={{
              width: CHAIN_DRAWER_WIDTH,
              flex: `0 0 ${CHAIN_DRAWER_WIDTH}px`,
              minWidth: CHAIN_DRAWER_WIDTH,
              maxWidth: CHAIN_DRAWER_WIDTH,
              height: '100%',
              minHeight: 0,
              p: 1,
              boxSizing: 'border-box',
              borderLeft: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.default',
              overflow: 'hidden',
            }}
          >
            <Stack spacing={1} sx={{ height: '100%', minHeight: 0 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0,
                  gap: 1,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 600 }}
                    noWrap
                  >
                    {t('proxies.page.actions.toggleChain')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {proxyMode === 'port'
                      ? '端口级全局链式代理：该端口流量直接走链路'
                      : '展开左侧代理节点，点击节点加入链路'}
                  </Typography>
                </Box>
                <Tooltip title="关闭链式代理">
                  <IconButton size="small" onClick={onToggleChainMode}>
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>

              {proxyMode !== 'port' && currentClashMode === 'direct' && (
                <Typography variant="body2" color="text.secondary">
                  直连模式下不配置链式代理，请切换到规则或全局模式。
                </Typography>
              )}

              {proxyMode === 'port' && selectedPortProxy && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  当前端口：
                  {selectedPortProxy.name || `port-${selectedPortProxy.port}`}（
                  {portProxyRuntimeListen}:{selectedPortProxy.port}）
                  {isSelectedPortProxyChainDirty
                    ? '，有未应用变更'
                    : isSelectedPortProxyChainConnected
                      ? '，链式代理已连接'
                      : '，链式代理未连接'}
                </Typography>
              )}

              {proxyMode === 'port' && !selectedPortProxy ? (
                <Typography variant="body2" color="text.secondary">
                  请先在左侧选择一个端口代理。
                </Typography>
              ) : (
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ProxyChain
                    key={
                      proxyMode === 'port'
                        ? selectedPortProxy?.id || 'no-port'
                        : 'global-chain'
                    }
                    proxyChain={activeProxyChain}
                    onUpdateChain={
                      proxyMode === 'port'
                        ? updateSelectedPortProxyChain
                        : setProxyChain
                    }
                    chainConfigData={
                      proxyMode === 'port' ? null : chainConfigData
                    }
                    mode={currentClashMode}
                    selectedGroup={
                      proxyMode === 'port' ? null : safeChainTargetGroupName
                    }
                    isConnectedOverride={
                      proxyMode === 'port'
                        ? isSelectedPortProxyChainConnected
                        : undefined
                    }
                    connectDisabled={
                      proxyMode === 'port' ? !selectedPortProxy : undefined
                    }
                    onConnectChain={
                      proxyMode === 'port'
                        ? connectSelectedPortProxyChain
                        : undefined
                    }
                    onDisconnectChain={
                      proxyMode === 'port'
                        ? disconnectSelectedPortProxyChain
                        : undefined
                    }
                    onClearChain={
                      proxyMode === 'port'
                        ? clearSelectedPortProxyChain
                        : undefined
                    }
                  />
                </Box>
              )}
            </Stack>
          </Box>
        )}
      </Box>

      <BaseDialog
        open={formDialogOpen}
        title={editingIndex === null ? '新建端口代理' : '编辑端口代理'}
        okBtn={editingIndex === null ? '添加' : '保存'}
        cancelBtn={t('shared.actions.cancel')}
        contentSx={{ width: 520 }}
        onClose={closeFormDialog}
        onCancel={closeFormDialog}
        onOk={handleSubmitPortProxy}
      >
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <TextField
            size="small"
            label="名称（可选）"
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="port-mixed-7890"
          />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 1.25,
            }}
          >
            <FormControl size="small">
              <InputLabel>类型</InputLabel>
              <Select
                label="类型"
                value={form.type}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    type: e.target.value as ListenerType,
                  }))
                }
              >
                {LISTENER_TYPES.map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {item.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="端口"
              type="number"
              value={form.port}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, port: e.target.value }))
              }
              placeholder="7890"
            />
            <FormControl size="small">
              <InputLabel>路由策略</InputLabel>
              <Select
                label="路由策略"
                value={form.routeMode}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    routeMode: e.target.value as PortProxyRouteMode,
                  }))
                }
              >
                {PORT_PROXY_ROUTE_MODES.map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {item.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                UDP
              </Typography>
              <Switch
                size="small"
                checked={form.udp}
                disabled={form.type === 'http'}
                onChange={(_, checked) =>
                  setForm((prev) => ({ ...prev, udp: checked }))
                }
              />
            </Stack>
          </Box>
          <FormControl size="small">
            <InputLabel>订阅</InputLabel>
            <Select
              label="订阅"
              value={form.subscriptionUid}
              disabled={subscriptionOptions.length === 0}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  subscriptionUid: e.target.value as string,
                  nodeGroup: '',
                  proxy: '',
                }))
              }
            >
              {subscriptionOptions.map((item) => (
                <MenuItem key={item.uid} value={item.uid}>
                  {item.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary">
            路由策略只影响当前端口，不修改 Mihomo
            顶层运行模式；监听地址跟随设置里的“允许局域网连接”（当前：
            {portProxyRuntimeListen}）。
            若该端口开启链式代理，则链式代理优先接管流量。
          </Typography>
        </Stack>
      </BaseDialog>

      <SysproxyViewer ref={sysproxyRef} />
    </BasePage>
  )
}

export default PortsPage
