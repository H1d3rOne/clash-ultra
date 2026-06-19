import {
  AccessTimeOutlined,
  CancelOutlined,
  CheckCircleOutlined,
  DeleteRounded,
  EditRounded,
  HelpOutlined,
  KeyboardArrowRightRounded,
  PlaylistAddRounded,
  PendingOutlined,
  RefreshRounded,
  SyncRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { useLockFn } from 'ahooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseEmpty, BasePage } from '@/components/base'
import { useVerge } from '@/hooks/use-app-config'
import { useClash } from '@/hooks/use-clash'
import { useConnectionData } from '@/hooks/use-connection-data'
import { useVisibility } from '@/hooks/use-visibility'
import { enhanceProfiles } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import {
  addHostToDefaultRuleTemplate,
  getDefaultRuleTemplateStrategyOptions,
} from '@/utils/default-rule-template'

interface UnlockItem {
  name: string
  status: string
  region?: string | null
  check_time?: string | null
  custom?: boolean
  target?: string | null
  sourceName?: string | null
}

const UNLOCK_RESULTS_STORAGE_KEY = 'clash_ultra_unlock_results'
const UNLOCK_RESULTS_TIME_KEY = 'clash_ultra_unlock_time'
const UNLOCK_DELETED_STORAGE_KEY = 'clash_ultra_unlock_deleted_items'
const SYSTEM_TEST_TARGET = '__system__'
const PORT_PROXY_LOCAL_LISTEN = '127.0.0.1'
const getPortProxyRuntimeListen = (allowLan?: boolean) =>
  allowLan ? '0.0.0.0' : PORT_PROXY_LOCAL_LISTEN
const normalizePortProxyTestHost = (listen?: string) => {
  if (!listen || listen === '0.0.0.0' || listen === '::') {
    return PORT_PROXY_LOCAL_LISTEN
  }
  return listen
}
const getPortProxyRouteModeLabel = (routeMode?: string) => {
  if (routeMode === 'global') return '端口级全局'
  if (routeMode === 'direct') return '端口级直连'
  return '订阅规则'
}
const UNLOCK_DARK_FEATHER_STYLE_ID = 'unlock-dark-feather-runtime'
const UNLOCK_DARK_FEATHER_RUNTIME_CSS = `
html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] body::before,
html[data-ultra-theme-mode="dark"] body:has(.unlock-page-shell)::before {
  background:
    radial-gradient(ellipse 58% 42% at 13% 8%, rgba(92, 227, 210, 0.052) 0%, transparent 58%),
    radial-gradient(ellipse 54% 40% at 88% 12%, rgba(104, 168, 255, 0.044) 0%, transparent 60%),
    radial-gradient(ellipse 70% 48% at 58% 105%, rgba(23, 175, 160, 0.038) 0%, transparent 62%),
    linear-gradient(135deg, #061414 0%, #0a1d21 54%, #0b1725 100%) !important;
  background-size: auto !important;
  background-position: center !important;
  opacity: 0.86 !important;
  will-change: filter, transform;
}

html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] body::after,
html[data-ultra-theme-mode="dark"] body:has(.unlock-page-shell)::after {
  background:
    radial-gradient(ellipse 68% 46% at 15% -8%, rgba(255, 255, 255, 0.008), transparent 66%),
    radial-gradient(ellipse 58% 42% at 92% 100%, rgba(104, 168, 255, 0.014), transparent 68%) !important;
  background-size: auto !important;
  opacity: 0.08 !important;
  filter: blur(24px) !important;
  mix-blend-mode: screen !important;
  transform: none !important;
}

html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout,
html[data-ultra-theme-mode="dark"] .layout:has(.unlock-page-shell) {
  background:
    radial-gradient(ellipse 56% 42% at 14% 8%, rgba(92, 227, 210, 0.038), transparent 62%),
    radial-gradient(ellipse 54% 40% at 90% 12%, rgba(104, 168, 255, 0.032), transparent 64%),
    linear-gradient(135deg, #061414 0%, #0a1d21 54%, #0b1725 100%) !important;
}

html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout::before,
html[data-ultra-theme-mode="dark"] .layout:has(.unlock-page-shell)::before {
  background: none !important;
  background-image: none !important;
  background-size: auto !important;
  background-position: center !important;
  mask-image: none !important;
  -webkit-mask-image: none !important;
  opacity: 0 !important;
  filter: none !important;
  transform: none !important;
}

html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout::after,
html[data-ultra-theme-mode="dark"] .layout:has(.unlock-page-shell)::after {
  background:
    radial-gradient(ellipse 76% 44% at 20% -12%, rgba(255, 255, 255, 0.006), transparent 70%),
    radial-gradient(ellipse 70% 48% at 86% 108%, rgba(104, 168, 255, 0.012), transparent 72%) !important;
  opacity: 0.08 !important;
  filter: blur(30px) !important;
  transform: none !important;
}

html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout .flux-main,
html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout .layout-content .flux-main,
html[data-ultra-theme-mode="dark"] .layout .flux-main:has(.unlock-page-shell) {
  background:
    radial-gradient(ellipse 58% 34% at 12% -8%, rgba(92, 227, 210, 0.026), transparent 68%),
    radial-gradient(ellipse 54% 34% at 96% 0%, rgba(104, 168, 255, 0.02), transparent 70%),
    rgba(7, 20, 24, 0.9) !important;
  box-shadow:
    0 14px 42px rgba(0, 0, 0, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.01) !important;
  backdrop-filter: blur(18px) saturate(114%) !important;
  -webkit-backdrop-filter: blur(18px) saturate(114%) !important;
}

html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout .flux-main::before,
html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout .layout-content .flux-main::before,
html[data-ultra-theme-mode="dark"] .layout .flux-main:has(.unlock-page-shell)::before {
  inset: -32% !important;
  background:
    radial-gradient(ellipse 64% 34% at 18% 0%, rgba(255, 255, 255, 0.01), transparent 72%),
    radial-gradient(ellipse 58% 34% at 88% 8%, rgba(104, 168, 255, 0.014), transparent 72%) !important;
  background-size: auto !important;
  opacity: 0.12 !important;
  filter: blur(28px) !important;
  transform: none !important;
}

html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .unlock-page-shell .base-container > section::before,
html[data-ultra-theme-mode="dark"] .unlock-page-shell .base-container > section::after {
  background:
    radial-gradient(ellipse 62% 42% at 14% 0%, rgba(92, 227, 210, 0.018), transparent 72%),
    radial-gradient(ellipse 62% 42% at 90% 100%, rgba(104, 168, 255, 0.012), transparent 74%) !important;
  opacity: 0.1 !important;
  filter: blur(22px) !important;
  transform: none !important;
}

html[data-ultra-theme-mode="dark"] .unlock-page__control-panel,
html[data-ultra-theme-mode="dark"] .unlock-page__route-panel,
html[data-ultra-theme-mode="dark"] .unlock-page__item-card,
html[data-ultra-theme-mode="dark"] .unlock-page__item-card:hover {
  background:
    radial-gradient(ellipse 70% 42% at 20% -12%, rgba(255, 255, 255, 0.01), transparent 72%),
    linear-gradient(145deg, rgba(92, 227, 210, 0.016), rgba(7, 20, 24, 0.78)) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.01),
    0 1px 4px rgba(0, 0, 0, 0.1) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

html[data-ultra-theme-mode="dark"] .unlock-page__control-panel::before,
html[data-ultra-theme-mode="dark"] .unlock-page__route-panel::before,
html[data-ultra-theme-mode="dark"] .unlock-page__item-card::before,
html[data-ultra-theme-mode="dark"] .unlock-page__item-card:hover::before {
  background:
    radial-gradient(ellipse 78% 44% at 24% -18%, rgba(255, 255, 255, 0.012), transparent 76%),
    radial-gradient(ellipse 64% 42% at 92% 112%, rgba(104, 168, 255, 0.01), transparent 78%) !important;
  opacity: 0.42 !important;
  filter: blur(16px) !important;
  transform: none !important;
}

html[data-ultra-theme-mode="dark"] .unlock-page__control-panel::after,
html[data-ultra-theme-mode="dark"] .unlock-page__route-panel::after,
html[data-ultra-theme-mode="dark"] .unlock-page__item-card::after,
html[data-ultra-theme-mode="dark"] .unlock-page__item-card:hover::after {
  display: none !important;
  background: none !important;
  opacity: 0 !important;
}
`
const DEFAULT_UNLOCK_ITEM_NAMES = [
  '哔哩哔哩大陆',
  '哔哩哔哩港澳台',
  'ChatGPT iOS',
  'ChatGPT Web',
  'Claude',
  'Gemini',
  'YouTube Premium',
  'Bahamut Anime',
  'Netflix',
  'Disney+',
  'Prime Video',
  'Spotify',
  'TikTok',
]
const DEFAULT_UNLOCK_TARGETS: Record<string, string> = {
  哔哩哔哩大陆:
    'https://api.bilibili.com/pgc/player/web/playurl?avid=82846771&qn=0&type=&otype=json&ep_id=307247&fourk=1&fnver=0&fnval=16&module=bangumi',
  哔哩哔哩港澳台:
    'https://api.bilibili.com/pgc/player/web/playurl?avid=18281381&cid=29892777&qn=0&type=&otype=json&ep_id=183799&fourk=1&fnver=0&fnval=16&module=bangumi',
  'ChatGPT iOS': 'https://ios.chat.openai.com/',
  'ChatGPT Web': 'https://api.openai.com/compliance/cookie_requirements',
  Claude: 'https://claude.ai/cdn-cgi/trace',
  Gemini: 'https://gemini.google.com',
  'YouTube Premium': 'https://www.youtube.com/premium',
  'Bahamut Anime': 'https://ani.gamer.com.tw/',
  Netflix: 'https://www.netflix.com/title/81280792',
  'Disney+': 'https://www.disneyplus.com/',
  'Prime Video': 'https://www.primevideo.com',
  Spotify:
    'https://www.spotify.com/api/content/v1/country-selector?platform=web&format=json',
  TikTok: 'https://www.tiktok.com/cdn-cgi/trace',
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  Pending: 'tests.statuses.test.pending',
  Testing: 'tests.unlock.page.actions.testing',
  Yes: 'tests.statuses.test.yes',
  No: 'tests.statuses.test.no',
  Failed: 'tests.statuses.test.failed',
  Completed: 'tests.statuses.test.completed',
  'Disallowed ISP': 'tests.statuses.test.disallowedIsp',
  'Originals Only': 'tests.statuses.test.originalsOnly',
  'No (IP Banned By Disney+)': 'tests.statuses.test.noDisney',
  'Unsupported Country/Region': 'tests.statuses.test.unsupportedRegion',
  'Failed (Network Connection)': 'tests.statuses.test.failedNetwork',
}

const normalizeUnlockName = (name: string) => name.trim().toLowerCase()
const DEFAULT_UNLOCK_NAME_SET = new Set(
  DEFAULT_UNLOCK_ITEM_NAMES.map(normalizeUnlockName),
)
const isDefaultUnlockSourceName = (name: string) =>
  DEFAULT_UNLOCK_NAME_SET.has(normalizeUnlockName(name))
const getUnlockItemSourceName = (item: UnlockItem) =>
  item.sourceName || item.name
const getDefaultUnlockItemTarget = (item: UnlockItem) =>
  DEFAULT_UNLOCK_TARGETS[getUnlockItemSourceName(item)] || ''
const getUnlockItemKey = (item: UnlockItem) =>
  normalizeUnlockName(getUnlockItemSourceName(item))
const isDefaultUnlockItem = (item: UnlockItem) =>
  item.custom !== true && DEFAULT_UNLOCK_NAME_SET.has(getUnlockItemKey(item))
const normalizeUnlockTarget = (target?: string | null) =>
  typeof target === 'string' ? target.trim() : ''
const getUnlockItemTarget = (item: UnlockItem) =>
  normalizeUnlockTarget(item.target)
const getUnlockItemRuleHost = (item?: UnlockItem | null) => {
  if (!item) return ''

  const target = getUnlockItemTarget(item) || getDefaultUnlockItemTarget(item)
  const raw = target.trim() || item.name.trim()
  if (!raw) return ''

  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`)
    return parsed.hostname
      .replace(/^\[|\]$/g, '')
      .replace(/\.$/, '')
      .toLowerCase()
  } catch {
    return raw
      .split('/')[0]
      .replace(/^\[|\]$/g, '')
      .replace(/:\d+$/, '')
      .replace(/\.$/, '')
      .toLowerCase()
  }
}
const isRuleHostIpLike = (host: string) =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(host) ||
  (/^[0-9a-f:]+$/i.test(host) && host.includes(':'))
const usesBuiltInMediaCheck = (item: UnlockItem) => {
  if (!isDefaultUnlockItem(item)) return false

  const target = getUnlockItemTarget(item)
  const defaultTarget = normalizeUnlockTarget(getDefaultUnlockItemTarget(item))

  return !target || target === defaultTarget
}
const normalizeCustomUnlockItem = (item: UnlockItem): UnlockItem => {
  const sourceName = getUnlockItemSourceName(item)
  const isDefault =
    item.custom !== true && isDefaultUnlockSourceName(sourceName)
  const target = normalizeUnlockTarget(
    item.target ?? (isDefault ? getDefaultUnlockItemTarget(item) : item.name),
  )
  const name = item.name.trim() || sourceName || target

  return {
    ...item,
    name,
    custom: !isDefault,
    target,
    sourceName: isDefault && sourceName !== name ? sourceName : undefined,
  }
}
const isCustomUnlockItem = (item: UnlockItem) => !isDefaultUnlockItem(item)
const shouldUseUrlCheck = (item: UnlockItem) => !usesBuiltInMediaCheck(item)
const mergeUrlCheckResult = (
  item: UnlockItem,
  result: UnlockItem,
  target: string,
) =>
  normalizeCustomUnlockItem({
    ...item,
    status: result.status,
    region: result.region,
    check_time: result.check_time,
    target,
  })
const getUnlockErrorMessage = (err: any, fallback = '测试失败') =>
  err?.message || String(err || fallback)
const buildFailedUnlockItem = (item: UnlockItem, err: any) =>
  normalizeCustomUnlockItem({
    ...item,
    status: 'Failed',
    region: getUnlockErrorMessage(err),
    check_time: new Date().toLocaleString(),
  })
const resetStaleTestingItem = (item: UnlockItem) =>
  item.status === 'Testing'
    ? normalizeCustomUnlockItem({
        ...item,
        status: 'Pending',
        region: null,
      })
    : item
const loadDeletedUnlockItemKeys = () => {
  try {
    const raw = localStorage.getItem(UNLOCK_DELETED_STORAGE_KEY)
    if (!raw) return new Set<string>()

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set<string>()

    return new Set(
      parsed
        .filter((item): item is string => typeof item === 'string')
        .map(normalizeUnlockName),
    )
  } catch (err) {
    console.error('Failed to load deleted unlock items:', err)
    return new Set<string>()
  }
}
const saveDeletedUnlockItemKeys = (keys: Set<string>) => {
  try {
    localStorage.setItem(UNLOCK_DELETED_STORAGE_KEY, JSON.stringify([...keys]))
  } catch (err) {
    console.error('Failed to save deleted unlock items:', err)
  }
}
const filterDeletedUnlockItems = (
  items: UnlockItem[],
  deletedKeys: Set<string>,
) =>
  items.filter(
    (item) =>
      !isDefaultUnlockItem(item) || !deletedKeys.has(getUnlockItemKey(item)),
  )

const getStatusPriority = (status: string) =>
  status === 'Pending' || status === 'Testing' ? 0 : 1
const mergeOptionalFields = (preferred: UnlockItem, fallback: UnlockItem) => ({
  ...preferred,
  region: preferred.region ?? fallback.region,
  check_time: preferred.check_time ?? fallback.check_time,
})

const dedupeUnlockItems = (items: UnlockItem[]) => {
  const map = new Map<string, UnlockItem>()

  items.forEach((item) => {
    const normalizedItem = normalizeCustomUnlockItem(item)
    const key = getUnlockItemKey(normalizedItem)
    const existing = map.get(key)

    if (!existing) {
      map.set(key, normalizedItem)
      return
    }

    const existingPriority = getStatusPriority(existing.status)
    const itemPriority = getStatusPriority(normalizedItem.status)

    if (itemPriority > existingPriority) {
      map.set(key, mergeOptionalFields(normalizedItem, existing))
      return
    }

    if (itemPriority < existingPriority) {
      map.set(key, mergeOptionalFields(existing, normalizedItem))
      return
    }

    map.set(key, mergeOptionalFields(normalizedItem, existing))
  })

  return Array.from(map.values())
}

const UnlockPage = () => {
  const { t } = useTranslation()
  const theme = useTheme()
  const { clash } = useClash()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const pageVisible = useVisibility()
  const { response: connectionResponse } = useConnectionData({
    enabled: pageVisible,
  })
  const portProxyRuntimeListen = getPortProxyRuntimeListen(
    Boolean(clash?.['allow-lan']),
  )

  const [unlockItems, setUnlockItems] = useState<UnlockItem[]>([])
  const [isCheckingAll, setIsCheckingAll] = useState(false)
  const [loadingItems, setLoadingItems] = useState<string[]>([])
  const [testTarget, setTestTarget] = useState(SYSTEM_TEST_TARGET)
  const [customTarget, setCustomTarget] = useState('')
  const [isCheckingCustom, setIsCheckingCustom] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number
    mouseY: number
    item: UnlockItem
  } | null>(null)
  const [hostRuleTargetMenuAnchorEl, setHostRuleTargetMenuAnchorEl] =
    useState<HTMLElement | null>(null)
  const [editingItem, setEditingItem] = useState<UnlockItem | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingTarget, setEditingTarget] = useState('')

  const activePortProxies = useMemo(() => {
    return (verge?.port_proxies ?? []).filter(
      (item) =>
        item.enabled === true &&
        Boolean(item.port) &&
        ['mixed', 'http', 'socks'].includes(item.type || 'mixed'),
    )
  }, [verge?.port_proxies])
  const activePortProxyIds = useMemo(
    () =>
      new Set(
        activePortProxies
          .map((item) => item.id)
          .filter((id): id is string => Boolean(id)),
      ),
    [activePortProxies],
  )
  const resolvedTestTarget = useMemo(() => {
    if (testTarget === SYSTEM_TEST_TARGET) return testTarget
    return activePortProxyIds.has(testTarget) ? testTarget : SYSTEM_TEST_TARGET
  }, [activePortProxyIds, testTarget])

  const selectedPortProxy = useMemo(
    () => activePortProxies.find((item) => item.id === resolvedTestTarget),
    [activePortProxies, resolvedTestTarget],
  )
  const selectedPortProxySubscription = useMemo(() => {
    if (!selectedPortProxy) return ''
    return (
      selectedPortProxy.subscriptionName ||
      selectedPortProxy.subscriptionUid ||
      ''
    )
  }, [selectedPortProxy])
  const selectedPortProxyLastMatch = useMemo(() => {
    if (!selectedPortProxy) return null

    const activeConnections = connectionResponse.data?.activeConnections ?? []
    const closedConnections = connectionResponse.data?.closedConnections ?? []
    const allConnections = [...closedConnections, ...activeConnections]
    const listenerName =
      selectedPortProxy.name ||
      `port-${selectedPortProxy.type || 'mixed'}-${selectedPortProxy.port}`
    const matched = [...allConnections].reverse().find((conn) => {
      const metadata = conn.metadata as IConnectionsItem['metadata'] & {
        inboundName?: string
        inboundPort?: string
      }

      return (
        metadata.inboundName === listenerName ||
        metadata.inboundPort === String(selectedPortProxy.port)
      )
    })

    if (!matched) return null

    const route = [...(matched.chains ?? [])].reverse().filter(Boolean)
    const metadata = matched.metadata

    return {
      target:
        metadata.host ||
        metadata.remoteDestination ||
        metadata.destinationIP ||
        '-',
      process: metadata.process || metadata.processPath || '',
      rule: matched.rule || '-',
      rulePayload: matched.rulePayload || '-',
      routeText: route.length > 0 ? route.join(' -> ') : '-',
      lastNode: route.length > 0 ? route[route.length - 1] : '-',
      startedAt: matched.start,
    }
  }, [
    connectionResponse.data?.activeConnections,
    connectionResponse.data?.closedConnections,
    selectedPortProxy,
  ])
  const selectedPortProxyModeLabel = useMemo(() => {
    if (!selectedPortProxy) return ''
    if (selectedPortProxy.chain?.enabled) return '端口级全局链式代理'
    if (selectedPortProxySubscription) {
      return getPortProxyRouteModeLabel(selectedPortProxy.routeMode)
    }
    return '未绑定订阅'
  }, [selectedPortProxy, selectedPortProxySubscription])

  const ruleStrategyOptions = useMemo(() => {
    try {
      return getDefaultRuleTemplateStrategyOptions(verge?.default_rule_template)
    } catch {
      return []
    }
  }, [verge?.default_rule_template])

  const buildUnlockArgs = useCallback(() => {
    if (!selectedPortProxy?.port) return {}

    return {
      proxyHost: normalizePortProxyTestHost(portProxyRuntimeListen),
      proxyPort: selectedPortProxy.port,
      proxyType: selectedPortProxy.type === 'socks' ? 'socks' : 'http',
    }
  }, [portProxyRuntimeListen, selectedPortProxy])

  const sortItemsByName = useCallback((items: UnlockItem[]) => {
    return [...items].sort((a, b) => a.name.localeCompare(b.name))
  }, [])

  const mergeUnlockItems = useCallback(
    (defaults: UnlockItem[], existing?: UnlockItem[] | null) => {
      const normalizedDefaults = defaults.map(normalizeCustomUnlockItem)

      if (!existing || existing.length === 0) {
        return normalizedDefaults
      }

      const normalizedExisting = dedupeUnlockItems(existing)
      const existingMap = new Map(
        normalizedExisting.map((item) => [getUnlockItemKey(item), item]),
      )
      const merged = normalizedDefaults.map((item) => {
        const matchedItem = existingMap.get(getUnlockItemKey(item))
        if (matchedItem) {
          return normalizeCustomUnlockItem({
            ...matchedItem,
            sourceName: getUnlockItemSourceName(item),
          })
        }
        return item
      })

      const mergedNameSet = new Set(
        merged.map((item) => getUnlockItemKey(item)),
      )
      normalizedExisting.forEach((item) => {
        const itemKey = getUnlockItemKey(item)
        if (!mergedNameSet.has(itemKey)) {
          merged.push(item)
          mergedNameSet.add(itemKey)
        }
      })

      return merged
    },
    [],
  )

  // 保存测试结果到本地存储
  const saveResultsToStorage = useCallback(
    (items: UnlockItem[], time: string | null) => {
      try {
        localStorage.setItem(UNLOCK_RESULTS_STORAGE_KEY, JSON.stringify(items))
        if (time) {
          localStorage.setItem(UNLOCK_RESULTS_TIME_KEY, time)
        }
      } catch (err) {
        console.error('Failed to save results to storage:', err)
      }
    },
    [],
  )

  const persistUnlockItems = useCallback(
    (
      items: UnlockItem[],
      time: string | null = new Date().toLocaleString(),
    ) => {
      const nextItems = sortItemsByName(dedupeUnlockItems(items))

      setUnlockItems(nextItems)
      saveResultsToStorage(nextItems, time)
      return nextItems
    },
    [saveResultsToStorage, sortItemsByName],
  )

  const updateUnlockItems = useCallback(
    (
      updater: (items: UnlockItem[]) => UnlockItem[],
      time: string | null = new Date().toLocaleString(),
    ) => {
      setUnlockItems((prev) => {
        const nextItems = sortItemsByName(dedupeUnlockItems(updater(prev)))

        saveResultsToStorage(nextItems, time)
        return nextItems
      })
    },
    [saveResultsToStorage, sortItemsByName],
  )

  const markUnlockItemTesting = useCallback(
    (item: UnlockItem) => {
      const itemKey = getUnlockItemKey(item)

      updateUnlockItems(
        (items) =>
          items.map((current) =>
            getUnlockItemKey(current) === itemKey
              ? {
                  ...current,
                  status: 'Testing',
                  region: null,
                  check_time: new Date().toLocaleString(),
                }
              : current,
          ),
        null,
      )
    },
    [updateUnlockItems],
  )

  const loadResultsFromStorage = useCallback((): {
    items: UnlockItem[] | null
    time: string | null
  } => {
    try {
      const itemsJson = localStorage.getItem(UNLOCK_RESULTS_STORAGE_KEY)
      const time = localStorage.getItem(UNLOCK_RESULTS_TIME_KEY)

      if (itemsJson) {
        const parsedItems = JSON.parse(itemsJson) as UnlockItem[]
        const deletedKeys = loadDeletedUnlockItemKeys()

        return {
          items: filterDeletedUnlockItems(
            dedupeUnlockItems(parsedItems.map(resetStaleTestingItem)),
            deletedKeys,
          ),
          time,
        }
      }
    } catch (err) {
      console.error('Failed to load results from storage:', err)
    }

    return { items: null, time: null }
  }, [])

  const getUnlockItems = useCallback(
    async (
      existingItems: UnlockItem[] | null = null,
      existingTime: string | null = null,
    ) => {
      try {
        const defaultItems = await invoke<UnlockItem[]>('get_unlock_items')
        const deletedKeys = loadDeletedUnlockItemKeys()
        const mergedItems = filterDeletedUnlockItems(
          mergeUnlockItems(defaultItems, existingItems),
          deletedKeys,
        )
        const sortedItems = sortItemsByName(mergedItems)

        setUnlockItems(sortedItems)
        saveResultsToStorage(
          sortedItems,
          existingItems && existingItems.length > 0 ? existingTime : null,
        )
      } catch (err: any) {
        console.error('Failed to get unlock items:', err)
      }
    },
    [mergeUnlockItems, saveResultsToStorage, sortItemsByName],
  )

  useEffect(() => {
    void (async () => {
      const { items: storedItems, time: storedTime } = loadResultsFromStorage()

      if (storedItems && storedItems.length > 0) {
        setUnlockItems(sortItemsByName(storedItems))
        await getUnlockItems(storedItems, storedTime)
      } else {
        await getUnlockItems()
      }
    })()
  }, [getUnlockItems, loadResultsFromStorage, sortItemsByName])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-ultra-active-page', 'unlock')

    const mountFeatherStyle = () => {
      let styleElement = document.getElementById(UNLOCK_DARK_FEATHER_STYLE_ID)
      if (!(styleElement instanceof HTMLStyleElement)) {
        styleElement = document.createElement('style')
        styleElement.id = UNLOCK_DARK_FEATHER_STYLE_ID
      }
      if (styleElement.textContent !== UNLOCK_DARK_FEATHER_RUNTIME_CSS) {
        styleElement.textContent = UNLOCK_DARK_FEATHER_RUNTIME_CSS
      }
      // 放到 head 末尾，确保压过主题 preset / 自定义 CSS 的后置高光与纹理。
      if (document.head.lastElementChild !== styleElement) {
        document.head.appendChild(styleElement)
      }
    }

    mountFeatherStyle()
    const animationFrameId = window.requestAnimationFrame(mountFeatherStyle)
    const timeoutId = window.setTimeout(mountFeatherStyle, 120)
    const headObserver = new MutationObserver(() => {
      mountFeatherStyle()
    })
    headObserver.observe(document.head, { childList: true })

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.clearTimeout(timeoutId)
      headObserver.disconnect()
      document.getElementById(UNLOCK_DARK_FEATHER_STYLE_ID)?.remove()
      if (root.getAttribute('data-ultra-active-page') === 'unlock') {
        root.removeAttribute('data-ultra-active-page')
      }
    }
  }, [])

  const invokeWithTimeout = useCallback(
    async <T,>(cmd: string, args?: any, timeout = 15000): Promise<T> => {
      return Promise.race([
        invoke<T>(cmd, args),
        new Promise<T>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(t('tests.unlock.page.messages.detectionTimeout')),
              ),
            timeout,
          ),
        ),
      ])
    },
    [t],
  )

  const runUrlUnlockCheck = useCallback(
    async (item: UnlockItem) => {
      const target = getUnlockItemTarget(item)

      if (!target) {
        throw new Error('请输入域名或 URL')
      }

      const result = await invokeWithTimeout<UnlockItem>(
        'check_single_url',
        {
          target,
          ...buildUnlockArgs(),
        },
        20000,
      )

      return mergeUrlCheckResult(item, result, target)
    },
    [buildUnlockArgs, invokeWithTimeout],
  )

  // 执行全部项目检测
  const checkAllMedia = useLockFn(async () => {
    try {
      setIsCheckingAll(true)
      const testingTime = new Date().toLocaleString()
      const currentItems = unlockItems
      const builtInMediaItems = currentItems.filter(usesBuiltInMediaCheck)
      const urlItems = currentItems.filter(shouldUseUrlCheck)
      const builtInMediaKeySet = new Set(
        builtInMediaItems.map((item) => getUnlockItemKey(item)),
      )

      updateUnlockItems(
        (items) =>
          items.map((item) => ({
            ...item,
            status: 'Testing',
            region: null,
            check_time: testingTime,
          })),
        null,
      )

      const deletedKeys = loadDeletedUnlockItemKeys()
      const existingMap = new Map(
        currentItems.map((item) => [getUnlockItemKey(item), item]),
      )
      const checkedBuiltInItems =
        builtInMediaItems.length > 0
          ? filterDeletedUnlockItems(
              await invokeWithTimeout<UnlockItem[]>(
                'check_media_unlock',
                buildUnlockArgs(),
              ),
              deletedKeys,
            ).flatMap((item) => {
              const itemKey = getUnlockItemKey(item)
              const existingItem = existingMap.get(itemKey)

              if (!existingItem || !builtInMediaKeySet.has(itemKey)) {
                return []
              }

              return [
                normalizeCustomUnlockItem({
                  ...item,
                  name: existingItem.name,
                  sourceName: getUnlockItemSourceName(existingItem),
                  target: getUnlockItemTarget(existingItem),
                }),
              ]
            })
          : []
      const checkedUrlItems = await Promise.all(
        urlItems.map(async (item) => {
          try {
            return await runUrlUnlockCheck(item)
          } catch (err: any) {
            return normalizeCustomUnlockItem({
              ...item,
              status: 'Failed',
              region: err?.message || String(err || '测试失败'),
              check_time: new Date().toLocaleString(),
            })
          }
        }),
      )
      const sortedItems = sortItemsByName(
        dedupeUnlockItems([
          ...currentItems.map((currentItem) => {
            const currentItemKey = getUnlockItemKey(currentItem)

            return builtInMediaKeySet.has(currentItemKey)
              ? buildFailedUnlockItem(
                  currentItem,
                  new Error('未获取到该测试项结果'),
                )
              : currentItem
          }),
          ...checkedBuiltInItems,
          ...checkedUrlItems,
        ]),
      )
      const currentTime = new Date().toLocaleString()

      setUnlockItems(sortedItems)
      saveResultsToStorage(sortedItems, currentTime)
    } catch (err: any) {
      updateUnlockItems(
        (items) =>
          items.map((currentItem) =>
            currentItem.status === 'Testing'
              ? buildFailedUnlockItem(currentItem, err)
              : currentItem,
          ),
        new Date().toLocaleString(),
      )
      showNotice.error('tests.unlock.page.messages.detectionTimeout', err)
      console.error('Failed to check media unlock:', err)
    } finally {
      setIsCheckingAll(false)
    }
  })

  // 检测单个流媒体服务
  const checkSingleMedia = useCallback(
    async (item: UnlockItem) => {
      const itemKey = getUnlockItemKey(item)

      try {
        setLoadingItems((prev) =>
          prev.includes(item.name) ? prev : [...prev, item.name],
        )
        markUnlockItemTesting(item)

        const result = await invokeWithTimeout<UnlockItem[]>(
          'check_media_unlock',
          buildUnlockArgs(),
        )
        const dedupedResult = dedupeUnlockItems(result)

        const targetItem = dedupedResult.find(
          (resultItem: UnlockItem) => getUnlockItemKey(resultItem) === itemKey,
        )

        if (targetItem) {
          const nextTargetItem = normalizeCustomUnlockItem({
            ...targetItem,
            name: item.name,
            sourceName: getUnlockItemSourceName(item),
          })
          const currentTime = new Date().toLocaleString()

          updateUnlockItems(
            (items) =>
              items.map((currentItem: UnlockItem) =>
                getUnlockItemKey(currentItem) === itemKey
                  ? nextTargetItem
                  : currentItem,
              ),
            currentTime,
          )
        } else {
          updateUnlockItems(
            (items) =>
              items.map((currentItem: UnlockItem) =>
                getUnlockItemKey(currentItem) === itemKey
                  ? buildFailedUnlockItem(
                      currentItem,
                      new Error('未获取到该测试项结果'),
                    )
                  : currentItem,
              ),
            new Date().toLocaleString(),
          )
        }
      } catch (err: any) {
        updateUnlockItems(
          (items) =>
            items.map((currentItem: UnlockItem) =>
              getUnlockItemKey(currentItem) === itemKey
                ? buildFailedUnlockItem(currentItem, err)
                : currentItem,
            ),
          new Date().toLocaleString(),
        )
        showNotice.error(
          'tests.unlock.page.messages.detectionFailedWithName',
          { name: item.name },
          err,
        )
        console.error(`Failed to check ${item.name}:`, err)
      } finally {
        setLoadingItems((prev) => prev.filter((name) => name !== item.name))
      }
    },
    [
      buildUnlockArgs,
      invokeWithTimeout,
      markUnlockItemTesting,
      updateUnlockItems,
    ],
  )

  // 测试单个域名或 URL
  const checkCustomTarget = useLockFn(async () => {
    const target = customTarget.trim()
    let testingItem: UnlockItem | null = null

    if (!target) {
      showNotice.error('请输入域名或 URL')
      return
    }

    try {
      setIsCheckingCustom(true)
      const nextTestingItem = normalizeCustomUnlockItem({
        name: target,
        status: 'Testing',
        custom: true,
        target,
        check_time: new Date().toLocaleString(),
      })
      testingItem = nextTestingItem

      updateUnlockItems(
        (items) => [
          nextTestingItem,
          ...items.filter(
            (current) =>
              getUnlockItemKey(current) !== getUnlockItemKey(nextTestingItem),
          ),
        ],
        null,
      )

      const customResult = await runUrlUnlockCheck(nextTestingItem)
      updateUnlockItems(
        (items) => [
          customResult,
          ...items.filter(
            (current) =>
              getUnlockItemKey(current) !== getUnlockItemKey(customResult),
          ),
        ],
        new Date().toLocaleString(),
      )
      setCustomTarget('')
    } catch (err: any) {
      const failedItem = buildFailedUnlockItem(
        testingItem ??
          normalizeCustomUnlockItem({
            name: target,
            status: 'Testing',
            custom: true,
            target,
            check_time: new Date().toLocaleString(),
          }),
        err,
      )

      updateUnlockItems(
        (items) => [
          failedItem,
          ...items.filter(
            (current) =>
              getUnlockItemKey(current) !== getUnlockItemKey(failedItem),
          ),
        ],
        new Date().toLocaleString(),
      )
      showNotice.error('单个域名或 URL 测试失败', err)
      console.error('Failed to check custom target:', err)
    } finally {
      setIsCheckingCustom(false)
    }
  })

  // 重新测试自定义域名或 URL 项
  const checkCustomItem = useCallback(
    async (item: UnlockItem) => {
      const target = getUnlockItemTarget(item)
      const itemKey = getUnlockItemKey(item)

      if (!target) {
        showNotice.error('请输入域名或 URL')
        return
      }

      try {
        setLoadingItems((prev) =>
          prev.includes(item.name) ? prev : [...prev, item.name],
        )
        markUnlockItemTesting(item)

        const customResult = await runUrlUnlockCheck(item)
        updateUnlockItems(
          (items) => [
            customResult,
            ...items.filter((current) => getUnlockItemKey(current) !== itemKey),
          ],
          new Date().toLocaleString(),
        )
      } catch (err: any) {
        updateUnlockItems(
          (items) =>
            items.map((current) =>
              getUnlockItemKey(current) === itemKey
                ? buildFailedUnlockItem(current, err)
                : current,
            ),
          new Date().toLocaleString(),
        )
        showNotice.error('单个域名或 URL 测试失败', err)
        console.error(`Failed to check ${item.name}:`, err)
      } finally {
        setLoadingItems((prev) => prev.filter((name) => name !== item.name))
      }
    },
    [markUnlockItemTesting, runUrlUnlockCheck, updateUnlockItems],
  )

  const closeContextMenu = useCallback(() => {
    setHostRuleTargetMenuAnchorEl(null)
    setContextMenu(null)
  }, [])

  const contextMenuRuleHost = getUnlockItemRuleHost(contextMenu?.item)
  const canAddContextMenuRuleHost =
    Boolean(contextMenuRuleHost) && !isRuleHostIpLike(contextMenuRuleHost)

  const openHostRuleTargetMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!contextMenu?.item || !canAddContextMenuRuleHost) return

      if (!ruleStrategyOptions.length) {
        showNotice.error('当前启用的规则模板没有可用策略')
        return
      }

      setHostRuleTargetMenuAnchorEl(event.currentTarget)
    },
    [canAddContextMenuRuleHost, contextMenu?.item, ruleStrategyOptions.length],
  )

  const addUnlockHostToDefaultRuleTemplate = useLockFn(
    async (target: string) => {
      const host = getUnlockItemRuleHost(contextMenu?.item)
      closeContextMenu()

      if (!host || isRuleHostIpLike(host)) {
        showNotice.error('该测试项没有可添加的域名')
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
        showNotice.error('添加域名到默认规则模板失败', err)
      }
    },
  )

  const openEditCustomItem = useCallback(() => {
    if (!contextMenu?.item) return

    setEditingItem(contextMenu.item)
    setEditingName(contextMenu.item.name)
    setEditingTarget(getUnlockItemTarget(contextMenu.item))
    closeContextMenu()
  }, [closeContextMenu, contextMenu])

  const deleteCustomItem = useCallback(() => {
    if (!contextMenu?.item) return

    const targetKey = getUnlockItemKey(contextMenu.item)
    if (!isCustomUnlockItem(contextMenu.item)) {
      const deletedKeys = loadDeletedUnlockItemKeys()
      deletedKeys.add(targetKey)
      saveDeletedUnlockItemKeys(deletedKeys)
    }

    const nextItems = unlockItems.filter(
      (item) => getUnlockItemKey(item) !== targetKey,
    )

    persistUnlockItems(nextItems)
    closeContextMenu()
  }, [closeContextMenu, contextMenu, persistUnlockItems, unlockItems])

  const closeEditDialog = useCallback(() => {
    if (isCheckingCustom) return
    setEditingItem(null)
    setEditingName('')
    setEditingTarget('')
  }, [isCheckingCustom])

  const saveEditCustomItem = useLockFn(async () => {
    if (!editingItem) return

    const name = editingName.trim()
    const target = editingTarget.trim()
    const itemKey = getUnlockItemKey(editingItem)
    const sourceName = getUnlockItemSourceName(editingItem)
    const isDefaultSource = isDefaultUnlockSourceName(sourceName)

    if (!name) {
      showNotice.error('请输入测试项名称')
      return
    }

    if (!target && !isDefaultSource) {
      showNotice.error('请输入测试地址')
      return
    }

    const nextBaseItem = normalizeCustomUnlockItem({
      ...editingItem,
      name,
      sourceName: isDefaultSource ? sourceName : undefined,
      target,
      custom: !isDefaultSource,
    })

    if (!shouldUseUrlCheck(nextBaseItem)) {
      const nextItem = normalizeCustomUnlockItem(nextBaseItem)
      const nextItems = [
        nextItem,
        ...unlockItems.filter((item) => getUnlockItemKey(item) !== itemKey),
      ]

      persistUnlockItems(nextItems)
      setEditingItem(null)
      setEditingName('')
      setEditingTarget('')
      return
    }

    const testingItem = normalizeCustomUnlockItem({
      ...nextBaseItem,
      status: 'Testing',
      region: null,
      check_time: new Date().toLocaleString(),
    })

    updateUnlockItems(
      (items) => [
        testingItem,
        ...items.filter((item) => getUnlockItemKey(item) !== itemKey),
      ],
      null,
    )

    try {
      setIsCheckingCustom(true)
      setLoadingItems((prev) =>
        prev.includes(editingItem.name) ? prev : [...prev, editingItem.name],
      )
      const customResult = await runUrlUnlockCheck(testingItem)

      updateUnlockItems(
        (items) => [
          customResult,
          ...items.filter(
            (item) => getUnlockItemKey(item) !== getUnlockItemKey(testingItem),
          ),
        ],
        new Date().toLocaleString(),
      )
      setEditingItem(null)
      setEditingName('')
      setEditingTarget('')
    } catch (err: any) {
      showNotice.error('编辑测试项失败', err)
      console.error('Failed to edit custom target:', err)

      const failedItem = normalizeCustomUnlockItem({
        ...editingItem,
        name,
        sourceName: isDefaultSource ? sourceName : undefined,
        custom: !isDefaultSource,
        target,
        status: 'Failed',
        region: getUnlockErrorMessage(err),
        check_time: new Date().toLocaleString(),
      })

      updateUnlockItems(
        (items) => [
          failedItem,
          ...items.filter(
            (item) => getUnlockItemKey(item) !== getUnlockItemKey(testingItem),
          ),
        ],
        new Date().toLocaleString(),
      )
    } finally {
      setIsCheckingCustom(false)
      setLoadingItems((prev) =>
        prev.filter((name) => name !== editingItem.name),
      )
    }
  })

  // 状态颜色
  const getStatusColor = (status: string) => {
    if (status === 'Pending') return 'default'
    if (status === 'Testing') return 'info'
    if (status === 'Yes') return 'success'
    if (status === 'No') return 'error'
    if (status === 'Soon') return 'warning'
    if (status.includes('Failed')) return 'error'
    if (status === 'Completed') return 'info'
    if (
      status === 'Disallowed ISP' ||
      status === 'Blocked' ||
      status === 'Unsupported Country/Region'
    ) {
      return 'error'
    }
    return 'default'
  }

  // 状态图标
  const getStatusIcon = (status: string) => {
    if (status === 'Pending') return <PendingOutlined />
    if (status === 'Testing') return <SyncRounded />
    if (status === 'Yes') return <CheckCircleOutlined />
    if (status === 'No') return <CancelOutlined />
    if (status === 'Soon') return <AccessTimeOutlined />
    if (status.includes('Failed')) return <HelpOutlined />
    return <HelpOutlined />
  }

  // 边框色
  const getStatusBorderColor = (status: string) => {
    if (status === 'Yes') return theme.palette.success.main
    if (status === 'No') return theme.palette.error.main
    if (status === 'Soon') return theme.palette.warning.main
    if (status === 'Testing') return theme.palette.info.main
    if (status.includes('Failed')) return theme.palette.error.main
    if (status === 'Completed') return theme.palette.info.main
    return theme.palette.divider
  }

  const isDark = theme.palette.mode === 'dark'
  const getStatusAccentColor = (status: string) => {
    if (status === 'Yes') return isDark ? '#5eead4' : '#047857'
    if (status === 'No') return isDark ? '#fb7185' : '#be123c'
    if (status === 'Soon') return isDark ? '#fbbf24' : '#b45309'
    if (status === 'Testing') return isDark ? '#67e8f9' : '#0369a1'
    if (status.includes('Failed')) return isDark ? '#fb7185' : '#be123c'
    if (status === 'Completed') return isDark ? '#67e8f9' : '#0369a1'
    if (
      status === 'Disallowed ISP' ||
      status === 'Blocked' ||
      status === 'Unsupported Country/Region'
    ) {
      return isDark ? '#fb7185' : '#be123c'
    }
    return isDark ? '#cbd5e1' : '#475569'
  }
  const getStatusChipSx = (status: string) => {
    const accent = getStatusAccentColor(status)
    const pending = status === 'Pending'

    return {
      color: `${accent} !important`,
      border: `1px solid ${alpha(accent, isDark ? 0.52 : 0.36)} !important`,
      backgroundColor: `${alpha(
        accent,
        pending ? (isDark ? 0.12 : 0.08) : isDark ? 0.22 : 0.12,
      )} !important`,
      boxShadow: pending
        ? 'none'
        : `0 0 0 3px ${alpha(accent, isDark ? 0.1 : 0.07)} !important`,
      '& .MuiChip-icon': {
        color: `${accent} !important`,
      },
      '& .MuiChip-label': {
        fontWeight: pending ? 760 : 900,
      },
    }
  }
  const getResultChipSx = () => {
    const accent = isDark ? '#7dd3fc' : '#075985'

    return {
      color: `${accent} !important`,
      borderColor: `${alpha(accent, isDark ? 0.52 : 0.38)} !important`,
      backgroundColor: `${alpha(accent, isDark ? 0.16 : 0.08)} !important`,
      fontWeight: 850,
      boxShadow: `0 0 0 3px ${alpha(accent, isDark ? 0.07 : 0.045)}`,
    }
  }
  const editingWillUseUrlCheck = useMemo(() => {
    if (!editingItem) return false

    const sourceName = getUnlockItemSourceName(editingItem)
    const isDefaultSource = isDefaultUnlockSourceName(sourceName)

    return shouldUseUrlCheck(
      normalizeCustomUnlockItem({
        ...editingItem,
        name: editingName.trim() || editingItem.name,
        sourceName: isDefaultSource ? sourceName : undefined,
        target: editingTarget.trim(),
        custom: !isDefaultSource,
      }),
    )
  }, [editingItem, editingName, editingTarget])

  return (
    <BasePage
      className="unlock-page-shell"
      title={t('tests.unlock.page.title')}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            variant="contained"
            size="small"
            disabled={isCheckingAll}
            onClick={checkAllMedia}
            startIcon={
              isCheckingAll ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <RefreshRounded />
              )
            }
          >
            {isCheckingAll
              ? t('tests.unlock.page.actions.testing')
              : t('tests.page.actions.testAll')}
          </Button>
        </Box>
      }
    >
      <Box
        className="unlock-page__control-panel"
        sx={{
          mb: 1.5,
          p: 1.2,
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: isDark
            ? alpha(theme.palette.primary.main, 0.06)
            : alpha(theme.palette.primary.main, 0.04),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Typography
            sx={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            测试入口
          </Typography>
          <Select
            size="small"
            value={resolvedTestTarget}
            disabled={isCheckingAll || isCheckingCustom}
            onChange={(event) => setTestTarget(event.target.value)}
            MenuProps={{
              slotProps: {
                paper: {
                  sx: {
                    width: 'auto',
                    minWidth: 280,
                    maxWidth: 460,
                  },
                },
              },
            }}
            sx={{
              minWidth: 280,
              '& .MuiSelect-select': { py: '7px', fontSize: 12 },
            }}
          >
            <MenuItem value={SYSTEM_TEST_TARGET}>当前系统网络</MenuItem>
            {activePortProxies.map((item) => (
              <MenuItem key={item.id || item.port} value={item.id || ''}>
                {item.name || `端口代理 ${item.port}`} ·{' '}
                {portProxyRuntimeListen}:{item.port}
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 1,
            flex: 1,
            minWidth: 320,
          }}
        >
          <TextField
            size="small"
            value={customTarget}
            disabled={isCheckingAll || isCheckingCustom}
            placeholder="输入域名或 URL，例如 google.com"
            onChange={(event) => setCustomTarget(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void checkCustomTarget()
              }
            }}
            sx={{
              flex: 1,
              minWidth: 240,
              maxWidth: 460,
              '& .MuiInputBase-input': {
                py: '7px',
                fontSize: 12,
              },
            }}
          />
          <Button
            variant="outlined"
            size="small"
            disabled={isCheckingAll || isCheckingCustom || !customTarget.trim()}
            onClick={checkCustomTarget}
            startIcon={
              isCheckingCustom ? (
                <CircularProgress size={14} color="inherit" />
              ) : undefined
            }
            sx={{ whiteSpace: 'nowrap', minWidth: 82 }}
          >
            {isCheckingCustom ? '测试中' : '测试'}
          </Button>
        </Box>
      </Box>

      <Box
        className="unlock-page__route-panel"
        sx={{
          mb: 1.5,
          px: 1.2,
          py: 1.1,
          borderRadius: 2,
          border: `1px dashed ${alpha(theme.palette.primary.main, 0.28)}`,
          backgroundColor: isDark
            ? alpha(theme.palette.primary.main, 0.08)
            : alpha(theme.palette.primary.main, 0.045),
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 800, mb: 0.9 }}>
          当前测试路径
        </Typography>

        {selectedPortProxy ? (
          <>
            <Box
              sx={{
                display: 'flex',
                gap: 0.8,
                flexWrap: 'wrap',
                mb: 0.9,
              }}
            >
              <Chip
                size="small"
                label={`入口：${portProxyRuntimeListen}:${selectedPortProxy.port} · ${String(
                  selectedPortProxy.type || 'mixed',
                ).toUpperCase()}`}
              />
              <Chip
                size="small"
                color={
                  selectedPortProxy.chain?.enabled
                    ? 'secondary'
                    : selectedPortProxy.routeMode === 'direct'
                      ? 'success'
                      : selectedPortProxy.routeMode === 'global'
                        ? 'secondary'
                        : selectedPortProxySubscription
                          ? 'primary'
                          : 'warning'
                }
                label={`模式：${selectedPortProxyModeLabel}`}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`订阅：${selectedPortProxySubscription || '未选择'}`}
              />
            </Box>

            <Typography sx={{ fontSize: 12, lineHeight: 1.75 }}>
              {selectedPortProxy.chain?.enabled
                ? '当前端口代理已开启链式代理，测试流量会直接走链式出口，不再经过订阅规则。'
                : selectedPortProxy.routeMode === 'direct'
                  ? '当前端口代理为直连模式，测试流量会直接 DIRECT，不再经过订阅规则。'
                  : selectedPortProxy.routeMode === 'global'
                    ? '当前端口代理为全局模式，测试流量会直接走该端口代理绑定订阅的代理组。'
                    : selectedPortProxySubscription
                      ? '当前端口代理会命中所绑定订阅的 rules / sub-rules；测试页不会再单独选择一次订阅。'
                      : '当前端口代理未绑定订阅，若访问行为异常，请先到端口代理里补选订阅。'}
            </Typography>

            {selectedPortProxyLastMatch ? (
              <Box sx={{ mt: 0.8 }}>
                <Typography sx={{ fontSize: 12, lineHeight: 1.75 }}>
                  最近命中目标：{selectedPortProxyLastMatch.target}
                </Typography>
                <Typography sx={{ fontSize: 12, lineHeight: 1.75 }}>
                  最近命中规则：{selectedPortProxyLastMatch.rule} ·{' '}
                  {selectedPortProxyLastMatch.rulePayload}
                </Typography>
                <Tooltip
                  placement="top-start"
                  title={selectedPortProxyLastMatch.routeText}
                >
                  <Typography
                    sx={{
                      fontSize: 12,
                      lineHeight: 1.75,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    最近出站链路：{selectedPortProxyLastMatch.routeText}
                  </Typography>
                </Tooltip>
                {selectedPortProxyLastMatch.process ? (
                  <Typography sx={{ fontSize: 12, lineHeight: 1.75 }}>
                    最近来源进程：{selectedPortProxyLastMatch.process}
                  </Typography>
                ) : null}
              </Box>
            ) : (
              <Typography
                sx={{
                  mt: 0.8,
                  fontSize: 12,
                  lineHeight: 1.75,
                  color: 'text.secondary',
                }}
              >
                还没有观测到这个端口的最近连接记录。可先用浏览器通过该端口访问一次
                ChatGPT，再回来查看命中的规则与链路。
              </Typography>
            )}
          </>
        ) : (
          <Typography sx={{ fontSize: 12, lineHeight: 1.75 }}>
            当前使用系统网络测试，不经过端口代理，因此这里不会显示订阅和端口规则信息。
          </Typography>
        )}
      </Box>

      {unlockItems.length === 0 ? (
        <Box
          className="unlock-page__empty"
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '50%',
          }}
        >
          <BaseEmpty textKey="tests.unlock.page.empty" />
        </Box>
      ) : (
        <Grid
          className="unlock-page__cards"
          container
          spacing={1.5}
          columns={{ xs: 1, sm: 2, md: 3 }}
        >
          {unlockItems.map((item) => (
            <Grid size={1} key={item.name}>
              <Card
                className="unlock-page__item-card"
                variant="outlined"
                onContextMenu={(event) => {
                  event.preventDefault()
                  setContextMenu({
                    mouseX: event.clientX + 2,
                    mouseY: event.clientY - 6,
                    item,
                  })
                }}
                sx={{
                  height: '100%',
                  borderRadius: 2,
                  borderLeft: `4px solid ${getStatusBorderColor(item.status)}`,
                  backgroundColor: isDark ? '#282a36' : '#ffffff',
                  position: 'relative',
                  overflow: 'hidden',
                  '&:hover': {
                    backgroundColor: isDark
                      ? alpha(theme.palette.primary.dark, 0.05)
                      : alpha(theme.palette.primary.light, 0.05),
                  },
                  cursor: 'context-menu',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box sx={{ p: 1.3, flex: 1 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 600,
                        fontSize: '1rem',
                        color: 'text.primary',
                      }}
                    >
                      {item.name}
                    </Typography>
                    <Tooltip title={t('tests.components.item.actions.test')}>
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          disabled={
                            loadingItems.includes(item.name) || isCheckingAll
                          }
                          sx={{
                            minWidth: '32px',
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                          }}
                          onClick={() => {
                            void (shouldUseUrlCheck(item)
                              ? checkCustomItem(item)
                              : checkSingleMedia(item))
                          }}
                        >
                          <RefreshRounded
                            sx={{
                              animation: loadingItems.includes(item.name)
                                ? 'spin 1s linear infinite'
                                : 'none',
                              '@keyframes spin': {
                                '0%': { transform: 'rotate(0deg)' },
                                '100%': { transform: 'rotate(360deg)' },
                              },
                            }}
                          />
                        </Button>
                      </span>
                    </Tooltip>
                  </Box>

                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 1,
                    }}
                  >
                    <Chip
                      label={t(STATUS_LABEL_KEYS[item.status] ?? item.status)}
                      color={getStatusColor(item.status)}
                      size="small"
                      icon={getStatusIcon(item.status)}
                      sx={{
                        ...getStatusChipSx(item.status),
                        fontWeight:
                          item.status === 'Pending' ? 'normal' : 'bold',
                      }}
                    />

                    {item.region && (
                      <Chip
                        label={item.region}
                        size="small"
                        variant="outlined"
                        color="info"
                        sx={getResultChipSx()}
                      />
                    )}
                  </Box>
                </Box>

                <Divider
                  sx={{
                    borderStyle: 'dashed',
                    borderColor: alpha(theme.palette.divider, 0.2),
                    mx: 1,
                  }}
                />

                <Box sx={{ px: 1.5, py: 0.2 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      display: 'block',
                      color: 'text.secondary',
                      fontSize: '0.7rem',
                      textAlign: 'right',
                    }}
                  >
                    {item.check_time || '-- --'}
                  </Typography>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
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
              minWidth: 150,
              width: 'auto',
            },
          },
        }}
      >
        <MenuItem
          disabled={!canAddContextMenuRuleHost}
          onClick={openHostRuleTargetMenu}
        >
          <ListItemIcon>
            <PlaylistAddRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="添加域名到默认规则模板"
            secondary={contextMenuRuleHost || '无可用域名'}
          />
          <KeyboardArrowRightRounded fontSize="small" />
        </MenuItem>
        <MenuItem onClick={openEditCustomItem}>
          <ListItemIcon>
            <EditRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="编辑" />
        </MenuItem>
        <MenuItem onClick={deleteCustomItem} sx={{ color: 'error.main' }}>
          <ListItemIcon sx={{ color: 'error.main' }}>
            <DeleteRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="删除" />
        </MenuItem>
      </Menu>
      <Menu
        open={Boolean(hostRuleTargetMenuAnchorEl)}
        onClose={() => setHostRuleTargetMenuAnchorEl(null)}
        anchorEl={hostRuleTargetMenuAnchorEl}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {ruleStrategyOptions.map((option) => (
          <MenuItem
            key={`${option.type}:${option.name}`}
            onClick={() => {
              void addUnlockHostToDefaultRuleTemplate(option.name)
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

      <Dialog
        open={Boolean(editingItem)}
        onClose={closeEditDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>编辑测试项</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="测试项名称"
            value={editingName}
            disabled={isCheckingCustom}
            placeholder="请输入测试项显示名称"
            onChange={(event) => setEditingName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void saveEditCustomItem()
              }
            }}
            sx={{ mt: 1 }}
          />
          <TextField
            fullWidth
            size="small"
            label="测试地址"
            value={editingTarget}
            disabled={isCheckingCustom}
            placeholder="可选；例如 google.com 或 https://www.google.com。留空则使用内置检测逻辑。"
            helperText="填写后会按这个域名或 URL 测试；留空则保留为内置测试项，只改显示名称。"
            onChange={(event) => setEditingTarget(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void saveEditCustomItem()
              }
            }}
            sx={{ mt: 1.5 }}
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={isCheckingCustom} onClick={closeEditDialog}>
            取消
          </Button>
          <Button
            variant="contained"
            disabled={isCheckingCustom || !editingName.trim()}
            onClick={saveEditCustomItem}
            startIcon={
              isCheckingCustom ? (
                <CircularProgress size={14} color="inherit" />
              ) : undefined
            }
          >
            {isCheckingCustom
              ? '测试中'
              : editingWillUseUrlCheck
                ? '保存并测试'
                : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </BasePage>
  )
}

export default UnlockPage
