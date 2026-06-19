import { ExpandMoreRounded } from '@mui/icons-material'
import {
  Alert,
  Box,
  Chip,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Typography,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useQuery } from '@tanstack/react-query'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useLockFn } from 'ahooks'
import yaml from 'js-yaml'
import {
  type Key,
  type MouseEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { delayGroup, healthcheckProxyProvider } from 'tauri-plugin-mihomo-api'

import { BaseEmpty } from '@/components/base'
import { useVerge } from '@/hooks/use-app-config'
import { useProxySelection } from '@/hooks/use-proxy-selection'
import { useVisibility } from '@/hooks/use-visibility'
import { useProxiesData } from '@/providers/app-data-context'
import {
  calcuProxies,
  readProfileFile,
  saveProfileFile,
  updateProxyChainConfigInRuntime,
} from '@/services/cmds'
import delayManager from '@/services/delay'
import { showNotice } from '@/services/notice-service'
import speedManager from '@/services/speed'
import { debugLog } from '@/utils/debug'

import { ScrollTopButton } from '../layout/scroll-top-button'

import { ProxyChain } from './proxy-chain'
import {
  DEFAULT_HOVER_DELAY,
  ProxyGroupNavigator,
} from './proxy-group-navigator'
import { ProxyRender } from './proxy-render'
import type { HeadState } from './use-head-state'
import { type IRenderItem, useRenderList } from './use-render-list'

function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args: Parameters<T>) => ref.current(...args), []) as T
}

interface Props {
  mode: string
  isChainMode?: boolean
  chainConfigData?: string | null
  overrideGroups?: IProxyGroupItem[]
  excludeRuntimeGroupPrefixes?: string[]
  getGroupDisplayName?: (groupName: string) => string
  profileUid?: string
  readOnly?: boolean
  skipSelectionSave?: boolean
  chainLayout?: 'inline' | 'drawer'
  onProxySelected?: (
    group: IProxyGroupItem,
    proxy: IProxyItem,
  ) => void | Promise<void>
  onProfileContentChanged?: () => void | Promise<void>
}

interface ProxyChainItem {
  id: string
  name: string
  type?: string
  delay?: number
}

type ProfileConfigForNodeAction = Record<string, any> & {
  proxies?: Array<Record<string, any>>
  'proxy-groups'?: Array<Record<string, any>>
  rules?: any[]
  'sub-rules'?: Record<string, any>
}

const PRESET_PROXY_NAMES = [
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
  'COMPATIBLE',
]
const PRESET_PROXY_NAME_SET = new Set(PRESET_PROXY_NAMES)

const getProxyName = (item: unknown) => {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object' && 'name' in item) {
    const name = (item as { name?: unknown }).name
    return typeof name === 'string' ? name : undefined
  }
  return undefined
}

const replaceRuleTarget = (
  rule: unknown,
  deletedNames: Set<string>,
): unknown => {
  if (typeof rule !== 'string') return rule

  const parts = rule.split(',')
  if (parts.length < 2) return rule

  const targetIndex =
    parts.length >= 3 && parts[parts.length - 1]?.trim() === 'no-resolve'
      ? parts.length - 2
      : parts.length - 1
  const target = parts[targetIndex]?.trim()
  if (!target || !deletedNames.has(target)) return rule

  parts[targetIndex] = 'DIRECT'
  return parts.join(',')
}

const removeNodesFromProfileConfig = (
  config: ProfileConfigForNodeAction,
  nodeNames: string[],
) => {
  const requestedNames = Array.from(
    new Set(nodeNames.filter((name) => !PRESET_PROXY_NAME_SET.has(name))),
  )
  const requestedNameSet = new Set(requestedNames)
  const proxies = Array.isArray(config.proxies) ? config.proxies : []
  const deletedNames = new Set<string>()

  config.proxies = proxies.filter((proxy) => {
    const name = getProxyName(proxy)
    if (name && requestedNameSet.has(name)) {
      deletedNames.add(name)
      return false
    }
    return true
  })

  if (deletedNames.size === 0) {
    return {
      deletedNames: [] as string[],
      missingNames: requestedNames,
    }
  }

  const updateProxyNameList = (list: unknown) => {
    if (!Array.isArray(list)) return list

    const next = list.filter((item) => {
      const name = getProxyName(item)
      return !name || !deletedNames.has(name)
    })

    return next.length > 0 ? next : ['DIRECT']
  }

  if (Array.isArray(config['proxy-groups'])) {
    config['proxy-groups'] = config['proxy-groups'].map((group) => {
      if (!group || typeof group !== 'object') return group
      const nextGroup = { ...group }

      if (Array.isArray(nextGroup.proxies)) {
        nextGroup.proxies = updateProxyNameList(nextGroup.proxies)
      }
      if (Array.isArray(nextGroup.all)) {
        nextGroup.all = updateProxyNameList(nextGroup.all)
      }
      if (
        typeof nextGroup.now === 'string' &&
        deletedNames.has(nextGroup.now)
      ) {
        const firstName = getProxyName(nextGroup.proxies?.[0])
        nextGroup.now = firstName ?? 'DIRECT'
      }

      return nextGroup
    })
  }

  if (Array.isArray(config.rules)) {
    config.rules = config.rules.map((rule) =>
      replaceRuleTarget(rule, deletedNames),
    )
  }

  if (config['sub-rules'] && typeof config['sub-rules'] === 'object') {
    config['sub-rules'] = Object.fromEntries(
      Object.entries(config['sub-rules']).map(([name, rules]) => [
        name,
        Array.isArray(rules)
          ? rules.map((rule) => replaceRuleTarget(rule, deletedNames))
          : rules,
      ]),
    )
  }

  if (Array.isArray(config.proxies)) {
    config.proxies = config.proxies.map((proxy) => {
      if (
        proxy &&
        typeof proxy === 'object' &&
        typeof proxy['dialer-proxy'] === 'string' &&
        deletedNames.has(proxy['dialer-proxy'])
      ) {
        const nextProxy = { ...proxy }
        delete nextProxy['dialer-proxy']
        return nextProxy
      }
      return proxy
    })
  }

  return {
    deletedNames: Array.from(deletedNames),
    missingNames: requestedNames.filter((name) => !deletedNames.has(name)),
  }
}

const buildExportProfileYaml = (proxies: Array<Record<string, any>>) => {
  const proxyNames = proxies
    .map((proxy) => getProxyName(proxy))
    .filter((name): name is string => Boolean(name))
  const selectGroupName = '导出的节点'

  return yaml.dump(
    {
      proxies,
      'proxy-groups': [
        {
          name: selectGroupName,
          type: 'select',
          proxies: [...proxyNames, 'DIRECT'],
        },
      ],
      rules: [`MATCH,${selectGroupName}`],
    },
    {
      lineWidth: -1,
      noRefs: true,
    },
  )
}

export const ProxyGroups = (props: Props) => {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const {
    mode,
    isChainMode = false,
    chainConfigData,
    overrideGroups,
    excludeRuntimeGroupPrefixes,
    getGroupDisplayName,
    profileUid,
    readOnly = false,
    skipSelectionSave = false,
    chainLayout = 'drawer',
    onProxySelected,
    onProfileContentChanged,
  } = props
  const pageVisible = useVisibility()
  const { verge } = useVerge()
  const lightweightOptimizations =
    verge?.enable_ui_lightweight_optimizations ?? true
  const pollingEnabled =
    !overrideGroups && (lightweightOptimizations ? pageVisible : true)

  // Drive polling on the shared TQ cache; data is read via granular context below.
  // UI lightweight mode pauses it while the app window is hidden to avoid background IPC and render churn.
  useQuery({
    queryKey: ['getProxies'],
    queryFn: calcuProxies,
    refetchInterval: pollingEnabled ? 3000 : false,
    refetchIntervalInBackground: !lightweightOptimizations,
    staleTime: 1500,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: pollingEnabled,
  })

  const [proxyChain, setProxyChain] = useState<ProxyChainItem[]>(() => {
    try {
      const saved = localStorage.getItem('proxy-chain-items')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch {
      // ignore
    }
    return []
  })
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  useEffect(() => {
    if (proxyChain.length > 0) {
      localStorage.setItem('proxy-chain-items', JSON.stringify(proxyChain))
    } else {
      localStorage.removeItem('proxy-chain-items')
    }
  }, [proxyChain])
  const [ruleMenuAnchor, setRuleMenuAnchor] = useState<null | HTMLElement>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{
    open: boolean
    message: string
  }>({ open: false, message: '' })
  const [selectedNodeNames, setSelectedNodeNames] = useState<
    Record<string, string[]>
  >({})
  const lastSelectedNodeRef = useRef<Record<string, string>>({})

  const { proxies: proxiesData } = useProxiesData()
  const shouldFilterRuntimeGroups =
    !overrideGroups && Boolean(excludeRuntimeGroupPrefixes?.length)
  const groups = useMemo(() => {
    const sourceGroups = overrideGroups ?? proxiesData?.groups
    if (!sourceGroups) return sourceGroups
    if (!shouldFilterRuntimeGroups) return sourceGroups
    const excludedPrefixes = excludeRuntimeGroupPrefixes ?? []

    return sourceGroups.filter((group: IProxyGroupItem) => {
      const name = group?.name ?? ''
      return !excludedPrefixes.some((prefix) => name.startsWith(prefix))
    })
  }, [
    excludeRuntimeGroupPrefixes,
    overrideGroups,
    proxiesData?.groups,
    shouldFilterRuntimeGroups,
  ])
  const renderOverrideGroups = shouldFilterRuntimeGroups
    ? (groups ?? [])
    : overrideGroups
  const availableGroups = useMemo(() => {
    if (!groups) return []
    // 在链式代理模式下，仅显示支持选择节点的 Selector 代理组
    return isChainMode
      ? groups.filter((g: any) => g.type === 'Selector')
      : groups
  }, [groups, isChainMode])

  const defaultRuleGroup = useMemo(() => {
    if (isChainMode && mode === 'rule' && availableGroups.length > 0) {
      return availableGroups[0].name
    }
    return null
  }, [availableGroups, isChainMode, mode])

  const activeSelectedGroup = useMemo(
    () => selectedGroup ?? defaultRuleGroup,
    [selectedGroup, defaultRuleGroup],
  )

  const { renderList, onProxies, onHeadState } = useRenderList(
    mode,
    isChainMode,
    activeSelectedGroup,
    renderOverrideGroups,
  )

  const getGroupHeadState = useCallback(
    (groupName: string) => {
      const headItem = renderList.find(
        (item) => item.type === 1 && item.group?.name === groupName,
      )
      return headItem?.headState
    },
    [renderList],
  )

  // 统代理选择
  const { handleProxyGroupChange } = useProxySelection({
    onSuccess: () => {
      onProxies()
    },
    onError: (error) => {
      console.error('代理切换失败', error)
      onProxies()
    },
  })

  const timeout = verge?.default_latency_timeout || 10000
  const speedTestTimeout = speedManager.normalizeTimeout(
    verge?.default_speed_test_timeout,
  )
  const speedTestConcurrency = speedManager.normalizeConcurrency(
    verge?.default_speed_test_concurrency,
  )

  const getSelectedNodeNames = useCallback(
    (groupName: string) => selectedNodeNames[groupName] ?? [],
    [selectedNodeNames],
  )

  const getSelectedNodeCount = useCallback(
    (groupName: string) => getSelectedNodeNames(groupName).length,
    [getSelectedNodeNames],
  )

  const isNodeMultiSelected = useCallback(
    (groupName: string, nodeName: string) =>
      getSelectedNodeNames(groupName).includes(nodeName),
    [getSelectedNodeNames],
  )

  const clearSelectedNodes = useCallback((groupName: string) => {
    setSelectedNodeNames((prev) => {
      const next = { ...prev }
      delete next[groupName]
      return next
    })
    delete lastSelectedNodeRef.current[groupName]
  }, [])

  const selectSingleNode = useCallback(
    (groupName: string, nodeName: string) => {
      setSelectedNodeNames((prev) => ({ ...prev, [groupName]: [nodeName] }))
      lastSelectedNodeRef.current[groupName] = nodeName
    },
    [],
  )

  const getRenderedNodeNames = useCallback(
    (groupName: string) => {
      const names = renderList
        .filter(
          (item) =>
            item.group?.name === groupName &&
            (item.type === 2 || item.type === 4),
        )
        .flatMap((item) =>
          item.type === 4
            ? (item.proxyCol ?? []).map((proxy) => proxy.name)
            : item.proxy?.name
              ? [item.proxy.name]
              : [],
        )
        .filter((name): name is string => Boolean(name))
      return Array.from(new Set(names))
    },
    [renderList],
  )

  const toggleNodeSelection = useCallback(
    (
      groupName: string,
      nodeName: string,
      event?: ReactMouseEvent<HTMLDivElement>,
    ) => {
      setSelectedNodeNames((prev) => {
        const current = prev[groupName] ?? []
        if (event?.shiftKey) {
          const renderedNames = getRenderedNodeNames(groupName)
          const anchorName = lastSelectedNodeRef.current[groupName] ?? nodeName
          const anchorIndex = renderedNames.indexOf(anchorName)
          const targetIndex = renderedNames.indexOf(nodeName)

          if (anchorIndex >= 0 && targetIndex >= 0) {
            const [start, end] =
              anchorIndex <= targetIndex
                ? [anchorIndex, targetIndex]
                : [targetIndex, anchorIndex]
            const rangeNames = renderedNames.slice(start, end + 1)
            const next = Array.from(new Set([...current, ...rangeNames]))
            return { ...prev, [groupName]: next }
          }
        }

        const next = current.includes(nodeName)
          ? current.filter((name) => name !== nodeName)
          : [...current, nodeName]
        lastSelectedNodeRef.current[groupName] = nodeName
        return { ...prev, [groupName]: next }
      })
    },
    [getRenderedNodeNames],
  )

  const parentRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef<Record<string, number>>({})
  const scrollTopRef = useRef(0)
  const showScrollTopRef = useRef(false)
  const activeStickyIndexRef = useRef<number | null>(null)
  const restoredScrollKeyRef = useRef<string | null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const scrollPositionKey = useMemo(
    () =>
      isChainMode
        ? `${mode}:chain:${activeSelectedGroup ?? 'all'}`
        : `${mode}:normal`,
    [activeSelectedGroup, isChainMode, mode],
  )
  const stickyGroupIndexes = useMemo(
    () =>
      renderList.flatMap((item, index) =>
        item.type === 0 && !item.group.hidden ? [index] : [],
      ),
    [renderList],
  )

  const rangeExtractor = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      let activeStickyIndex: number | undefined
      for (let i = stickyGroupIndexes.length - 1; i >= 0; i -= 1) {
        const index = stickyGroupIndexes[i]
        if (index <= range.startIndex) {
          activeStickyIndex = index
          break
        }
      }
      activeStickyIndexRef.current = activeStickyIndex ?? null

      const indexes = defaultRangeExtractor(range)
      return activeStickyIndex == null || indexes.includes(activeStickyIndex)
        ? indexes
        : [activeStickyIndex, ...indexes]
    },
    [stickyGroupIndexes],
  )

  const virtualizer = useVirtualizer({
    count: renderList.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 8,
    getItemKey: (index) => renderList[index]?.key ?? index,
    rangeExtractor,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const activeStickyIndex = activeStickyIndexRef.current

  // 从 localStorage 恢复滚动位置
  useLayoutEffect(() => {
    if (renderList.length === 0) return
    const node = parentRef.current
    if (!node) return
    if (
      restoredScrollKeyRef.current === scrollPositionKey &&
      node.scrollTop === scrollTopRef.current
    ) {
      return
    }

    try {
      const savedPositions = localStorage.getItem('proxy-scroll-positions')
      if (savedPositions) {
        const positions = JSON.parse(savedPositions)
        scrollPositionRef.current = positions
        const savedPosition = positions[scrollPositionKey]

        if (savedPosition !== undefined) {
          node.scrollTop = savedPosition
          scrollTopRef.current = savedPosition
          const nextShowScrollTop = savedPosition > 100
          showScrollTopRef.current = nextShowScrollTop
          queueMicrotask(() => setShowScrollTop(nextShowScrollTop))
        }
      }
    } catch (e) {
      console.error('Error restoring scroll position:', e)
    }
    restoredScrollKeyRef.current = scrollPositionKey
  }, [pathname, renderList.length, scrollPositionKey])

  // 改为使用节流函数保存滚动位置
  const saveScrollPosition = useCallback(
    (scrollTop: number) => {
      try {
        scrollPositionRef.current[scrollPositionKey] = scrollTop
        localStorage.setItem(
          'proxy-scroll-positions',
          JSON.stringify(scrollPositionRef.current),
        )
      } catch (e) {
        console.error('Error saving scroll position:', e)
      }
    },
    [scrollPositionKey],
  )

  const saveScrollPositionThrottled = useMemo(
    () => throttle(saveScrollPosition, 500),
    [saveScrollPosition],
  )

  const handleScroll = useCallback(
    (event: Event) => {
      const target = event.target as HTMLElement | null
      const nextScrollTop = target?.scrollTop ?? 0
      const nextShowScrollTop = nextScrollTop > 100
      scrollTopRef.current = nextScrollTop

      if (showScrollTopRef.current !== nextShowScrollTop) {
        showScrollTopRef.current = nextShowScrollTop
        setShowScrollTop(nextShowScrollTop)
      }

      saveScrollPositionThrottled(nextScrollTop)
    },
    [saveScrollPositionThrottled],
  )

  // 添加和清理滚动事件监听器
  useEffect(() => {
    const node = parentRef.current
    if (!node) return

    const listener = handleScroll as EventListener
    const options: AddEventListenerOptions = { passive: true }

    node.addEventListener('scroll', listener, options)

    return () => {
      if (restoredScrollKeyRef.current === scrollPositionKey) {
        saveScrollPosition(scrollTopRef.current)
      }
      node.removeEventListener('scroll', listener, options)
    }
  }, [handleScroll, saveScrollPosition, scrollPositionKey])

  // 滚动到顶部
  const scrollToTop = useCallback(() => {
    parentRef.current?.scrollTo?.({
      top: 0,
      behavior: 'smooth',
    })
    scrollTopRef.current = 0
    saveScrollPosition(0)
  }, [saveScrollPosition])

  // 关闭重复节点警告
  const handleCloseDuplicateWarning = useCallback(() => {
    setDuplicateWarning({ open: false, message: '' })
  }, [])

  const currentGroup = useMemo(() => {
    if (!activeSelectedGroup) return null
    return (
      availableGroups.find(
        (group: any) => group.name === activeSelectedGroup,
      ) ?? null
    )
  }, [activeSelectedGroup, availableGroups])

  // 处理代理组选择菜单
  const handleGroupMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setRuleMenuAnchor(event.currentTarget)
  }

  const handleGroupMenuClose = () => {
    setRuleMenuAnchor(null)
  }

  const handleGroupSelect = (groupName: string) => {
    setSelectedGroup(groupName)
    handleGroupMenuClose()

    if (isChainMode && mode === 'rule') {
      updateProxyChainConfigInRuntime(null)
      localStorage.removeItem('proxy-chain-group')
      localStorage.removeItem('proxy-chain-exit-node')
      localStorage.removeItem('proxy-chain-items')
      setProxyChain([])
    }
  }

  const handleChangeProxy = useCallback(
    (group: IProxyGroupItem, proxy: IProxyItem) => {
      if (readOnly) return

      if (isChainMode) {
        // 使用函数式更新来避免状态延迟问题
        setProxyChain((prev) => {
          // 检查是否已经存在相同名称的代理，防止重复添加
          if (prev.some((item) => item.name === proxy.name)) {
            const warningMessage = t('proxies.page.chain.duplicateNode')
            setDuplicateWarning({
              open: true,
              message: warningMessage,
            })
            return prev // 返回原来的状态，不做任何更改
          }

          // 安全获取延迟数据，如果没有延迟数据则设为 undefined
          const delay =
            proxy.history && proxy.history.length > 0
              ? proxy.history[proxy.history.length - 1].delay
              : undefined

          const chainItem: ProxyChainItem = {
            id: `${proxy.name}_${Date.now()}`,
            name: proxy.name,
            type: proxy.type,
            delay: delay,
          }

          return [...prev, chainItem]
        })
        return
      }

      if (!['Selector', 'URLTest', 'Fallback'].includes(group.type)) return

      handleProxyGroupChange(group, proxy, skipSelectionSave)
      if (onProxySelected) {
        void Promise.resolve(onProxySelected(group, proxy)).catch((error) => {
          showNotice.error(error)
        })
      }
    },
    [
      handleProxyGroupChange,
      isChainMode,
      onProxySelected,
      readOnly,
      skipSelectionSave,
      t,
    ],
  )

  const getNodeActionTargetNames = useCallback(
    (groupName: string, nodeName: string, useSelectedBatch: boolean) => {
      const selectedNames = useSelectedBatch
        ? getSelectedNodeNames(groupName)
        : []
      const targetNames = selectedNames.length > 0 ? selectedNames : [nodeName]

      return Array.from(new Set(targetNames.filter(Boolean)))
    },
    [getSelectedNodeNames],
  )

  const readProfileConfigForNodeAction = useCallback(async () => {
    if (!profileUid) {
      throw new Error('未找到目标订阅配置，无法操作节点')
    }

    const content = await readProfileFile(profileUid)
    const parsed = yaml.load(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('目标订阅配置不是有效的 YAML 对象')
    }

    return parsed as ProfileConfigForNodeAction
  }, [profileUid])

  const writeClipboardText = useCallback(async (text: string) => {
    try {
      await writeText(text)
    } catch (error) {
      console.warn('[ProxyGroups] Tauri clipboard write failed:', error)
      await navigator.clipboard.writeText(text)
    }
  }, [])

  const handleExportNodes = useStableCallback(
    useLockFn(
      async (
        groupName: string,
        nodeName: string,
        useSelectedBatch: boolean,
      ) => {
        try {
          const targetNames = getNodeActionTargetNames(
            groupName,
            nodeName,
            useSelectedBatch,
          ).filter((name) => !PRESET_PROXY_NAME_SET.has(name))
          if (targetNames.length === 0) {
            showNotice.error('没有可导出的节点')
            return
          }

          const config = await readProfileConfigForNodeAction()
          const proxyMap = new Map(
            (Array.isArray(config.proxies) ? config.proxies : [])
              .map((proxy) => [getProxyName(proxy), proxy] as const)
              .filter(
                (entry): entry is readonly [string, Record<string, any>] =>
                  Boolean(entry[0]),
              ),
          )
          const exportProxies = targetNames
            .map((name) => proxyMap.get(name))
            .filter((proxy): proxy is Record<string, any> => Boolean(proxy))

          if (exportProxies.length === 0) {
            showNotice.error('未在目标订阅配置中找到可导出的节点')
            return
          }

          await writeClipboardText(buildExportProfileYaml(exportProxies))
          showNotice.success(`已导出 ${exportProxies.length} 个节点到剪贴板`)
        } catch (error) {
          showNotice.error(error)
        }
      },
    ),
  )

  const handleDeleteNodes = useStableCallback(
    useLockFn(
      async (
        groupName: string,
        nodeName: string,
        useSelectedBatch: boolean,
      ) => {
        try {
          if (!profileUid) {
            showNotice.error('未找到目标订阅配置，无法删除节点')
            return
          }

          const targetNames = getNodeActionTargetNames(
            groupName,
            nodeName,
            useSelectedBatch,
          )
          if (targetNames.length === 0) {
            showNotice.error('没有可删除的节点')
            return
          }

          const config = await readProfileConfigForNodeAction()
          const { deletedNames } = removeNodesFromProfileConfig(
            config,
            targetNames,
          )

          if (deletedNames.length === 0) {
            showNotice.error('未在目标订阅配置中找到可删除的节点')
            return
          }

          const nextContent = yaml.dump(config, {
            lineWidth: -1,
            noRefs: true,
          })
          const success = await saveProfileFile(profileUid, nextContent)
          if (!success) {
            showNotice.error('节点删除失败，订阅配置校验未通过')
            return
          }

          clearSelectedNodes(groupName)
          await onProfileContentChanged?.()
          await onProxies()
          showNotice.success(`已删除 ${deletedNames.length} 个节点`)
        } catch (error) {
          showNotice.error(error)
        }
      },
    ),
  )

  // 测全部延迟
  const handleCheckAll = useStableCallback(
    useLockFn(async (groupName: string) => {
      debugLog(`[ProxyGroups] 开始测试所有延迟，组: ${groupName}`)

      const proxies = renderList
        .filter(
          (e) => e.group?.name === groupName && (e.type === 2 || e.type === 4),
        )
        .flatMap((e) => e.proxyCol || e.proxy!)
        .filter(Boolean)

      debugLog(`[ProxyGroups] 找到代理数量: ${proxies.length}`)

      const selectedNames = getSelectedNodeNames(groupName)
      const selectedNameSet = new Set(selectedNames)
      const providerProxies =
        selectedNames.length > 0
          ? proxies.filter((p) => p?.provider && selectedNameSet.has(p.name))
          : proxies.filter((p) => p?.provider)
      const providers = new Set(
        providerProxies.map((p) => p!.provider!).filter(Boolean),
      )

      let providerCheck: Promise<unknown> | null = null
      if (providers.size) {
        debugLog(`[ProxyGroups] 发现提供者，数量: ${providers.size}`)
        providerCheck = Promise.allSettled(
          [...providers].map((p) => healthcheckProxyProvider(p)),
        ).then(() => {
          debugLog(`[ProxyGroups] 提供者健康检查完成`)
          onProxies()
        })
      }

      const names = proxies
        .filter((p) => !p!.provider)
        .map((p) => p!.name)
        .filter((name) => !PRESET_PROXY_NAME_SET.has(name))
      const nameSet = new Set(names)
      const validSelectedNames = selectedNames.filter((name) =>
        nameSet.has(name),
      )
      const targetNames = selectedNames.length > 0 ? validSelectedNames : names
      debugLog(`[ProxyGroups] 过滤后需要测试的代理数量: ${targetNames.length}`)

      const url = delayManager.getUrl(groupName)
      debugLog(`[ProxyGroups] 测试URL: ${url}, 超时: ${timeout}ms`)

      try {
        const delayChecks: Promise<unknown>[] = []
        if (targetNames.length > 0) {
          delayChecks.push(
            delayManager.checkListDelay(
              targetNames,
              groupName,
              timeout,
              36,
              profileUid,
            ),
          )
        }
        if (providerCheck) {
          delayChecks.push(providerCheck)
        }
        if (selectedNames.length === 0 && !profileUid) {
          // 保留既有行为：触发 mihomo 组延迟刷新，让内核同步更新 history。
          delayChecks.push(
            delayGroup(groupName, url, timeout).then((result) => {
              debugLog(
                `[ProxyGroups] delayGroup 返回结果数量:`,
                Object.keys(result || {}).length,
              )
            }),
          )
        }
        await Promise.allSettled(delayChecks)
        debugLog(`[ProxyGroups] 延迟测试完成，组: ${groupName}`)
      } catch (error) {
        console.error(`[ProxyGroups] 延迟测试出错，组: ${groupName}`, error)
      } finally {
        const headState = getGroupHeadState(groupName)
        if (headState?.sortType === 1) {
          onHeadState(groupName, { sortType: headState.sortType })
        }
        onProxies()
      }
    }),
  )

  // 测全部下载速度
  const handleCheckSpeed = useStableCallback(
    useLockFn(async (groupName: string) => {
      debugLog(`[ProxyGroups] 开始测试所有速度，组: ${groupName}`)

      const proxies = renderList
        .filter(
          (e) => e.group?.name === groupName && (e.type === 2 || e.type === 4),
        )
        .flatMap((e) => e.proxyCol || e.proxy!)
        .filter(Boolean)

      const allNames = proxies
        .filter((p) => !p!.provider)
        .map((p) => p!.name)
        .filter((name) => !PRESET_PROXY_NAMES.includes(name))
      const selectedNames = getSelectedNodeNames(groupName)
      const nameSet = new Set(allNames)
      const validSelectedNames = selectedNames.filter((name) =>
        nameSet.has(name),
      )
      const targetNames =
        selectedNames.length > 0 ? validSelectedNames : allNames

      if (targetNames.length === 0) {
        showNotice.error('没有可测速的当前运行节点')
        return
      }

      debugLog(`[ProxyGroups] 过滤后需要测速的代理数量: ${targetNames.length}`)
      await speedManager.checkListSpeed(
        targetNames,
        groupName,
        speedTestTimeout,
        speedTestConcurrency,
        profileUid,
      )
    }),
  )

  // 滚到对应的节点
  const handleLocation = useStableCallback((group: IProxyGroupItem) => {
    if (!group) return
    const { name, now } = group

    const index = renderList.findIndex(
      (e) =>
        e.group?.name === name &&
        ((e.type === 2 && e.proxy?.name === now) ||
          (e.type === 4 && e.proxyCol?.some((p) => p.name === now))),
    )

    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' })
    }
  })

  // 定位到指定的代理组
  const handleGroupLocationByName = useCallback(
    (groupName: string) => {
      const index = renderList.findIndex(
        (item) => item.type === 0 && item.group?.name === groupName,
      )

      if (index >= 0) {
        virtualizer.scrollToIndex(index, { align: 'start', behavior: 'smooth' })
      }
    },
    [renderList, virtualizer],
  )

  const proxyGroupNames = useMemo(() => {
    const names = renderList
      .filter((item) => item.type === 0 && item.group?.name)
      .map((item) => item.group!.name)
    return Array.from(new Set(names))
  }, [renderList])

  const renderProxyList = (height: string) => (
    <ProxyVirtualList
      parentRef={parentRef}
      height={height}
      totalSize={virtualizer.getTotalSize()}
      virtualItems={virtualItems}
      renderList={renderList}
      activeStickyIndex={activeStickyIndex}
      indent={mode === 'rule' || mode === 'script'}
      isChainMode={isChainMode}
      measureElement={virtualizer.measureElement}
      onLocation={handleLocation}
      onCheckAll={handleCheckAll}
      onCheckSpeed={handleCheckSpeed}
      getSelectedNodeCount={getSelectedNodeCount}
      isNodeMultiSelected={isNodeMultiSelected}
      onClearSelectedNodes={clearSelectedNodes}
      onExportNodes={profileUid ? handleExportNodes : undefined}
      onDeleteNodes={profileUid ? handleDeleteNodes : undefined}
      onSelectSingleNode={selectSingleNode}
      onToggleNodeSelection={toggleNodeSelection}
      onHeadState={onHeadState}
      onChangeProxy={handleChangeProxy}
      testDisabled={false}
      profileUid={profileUid}
      getGroupDisplayName={getGroupDisplayName}
    />
  )

  if (mode === 'direct') {
    return <BaseEmpty textKey="proxies.page.messages.directMode" />
  }

  if (isChainMode) {
    // 获取所有代理组
    const proxyGroups = overrideGroups ?? proxiesData?.groups ?? []
    const showRuleHeader = mode === 'rule' && proxyGroups.length > 0

    return (
      <>
        {chainLayout === 'inline' ? (
          <Box sx={{ display: 'flex', height: '100%', gap: 2 }}>
            <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>
              {showRuleHeader && (
                <ChainRuleHeader
                  title={t('proxies.page.rules.title')}
                  selectLabel={t('proxies.page.rules.select')}
                  currentGroup={currentGroup}
                  getGroupDisplayName={getGroupDisplayName}
                  canSelectGroup={availableGroups.length > 0}
                  onMenuOpen={handleGroupMenuOpen}
                />
              )}

              {renderProxyList(
                showRuleHeader ? 'calc(100% - 80px)' : 'calc(100% - 14px)',
              )}
              <ScrollTopButton show={showScrollTop} onClick={scrollToTop} />
            </Box>

            <Box sx={{ width: 420, minWidth: 360 }}>
              <ProxyChain
                proxyChain={proxyChain}
                onUpdateChain={setProxyChain}
                chainConfigData={chainConfigData}
                mode={mode}
                selectedGroup={activeSelectedGroup}
              />
            </Box>
          </Box>
        ) : (
          <>
            <Box
              sx={{
                height: '100%',
                position: 'relative',
                pr: { md: '420px' },
                transition: 'padding-right 0.2s ease-in-out',
              }}
            >
              {showRuleHeader && (
                <ChainRuleHeader
                  title={t('proxies.page.rules.title')}
                  selectLabel={t('proxies.page.rules.select')}
                  currentGroup={currentGroup}
                  getGroupDisplayName={getGroupDisplayName}
                  canSelectGroup={availableGroups.length > 0}
                  onMenuOpen={handleGroupMenuOpen}
                />
              )}

              {renderProxyList(
                showRuleHeader ? 'calc(100% - 80px)' : 'calc(100% - 14px)',
              )}
              <ScrollTopButton show={showScrollTop} onClick={scrollToTop} />
            </Box>

            <Drawer
              anchor="right"
              open={isChainMode}
              variant="persistent"
              slotProps={{
                paper: {
                  sx: {
                    width: 420,
                    maxWidth: 'calc(100vw - 72px)',
                    boxSizing: 'border-box',
                    p: 1.5,
                    bgcolor: 'background.default',
                  },
                },
              }}
            >
              <ProxyChain
                proxyChain={proxyChain}
                onUpdateChain={setProxyChain}
                chainConfigData={chainConfigData}
                mode={mode}
                selectedGroup={activeSelectedGroup}
              />
            </Drawer>
          </>
        )}

        <Snackbar
          open={duplicateWarning.open}
          autoHideDuration={3000}
          onClose={handleCloseDuplicateWarning}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert
            onClose={handleCloseDuplicateWarning}
            severity="warning"
            variant="filled"
          >
            {duplicateWarning.message}
          </Alert>
        </Snackbar>

        <GroupSelectMenu
          anchorEl={ruleMenuAnchor}
          groups={availableGroups}
          selectedGroup={activeSelectedGroup}
          getGroupDisplayName={getGroupDisplayName}
          emptyText="暂无可用代理组"
          onClose={handleGroupMenuClose}
          onSelect={handleGroupSelect}
        />
      </>
    )
  }

  return (
    <div
      style={{ position: 'relative', height: '100%', willChange: 'transform' }}
    >
      {/* 代理组导航栏 */}
      {mode === 'rule' && (
        <ProxyGroupNavigator
          proxyGroupNames={proxyGroupNames}
          getGroupDisplayName={getGroupDisplayName}
          onGroupLocation={handleGroupLocationByName}
          enableHoverJump={verge?.enable_hover_jump_navigator ?? true}
          hoverDelay={verge?.hover_jump_navigator_delay ?? DEFAULT_HOVER_DELAY}
        />
      )}

      {renderProxyList('calc(100% - 14px)')}
      <ScrollTopButton show={showScrollTop} onClick={scrollToTop} />
    </div>
  )
}

type VirtualListItem = {
  key: Key
  index: number
  start: number
  end: number
}

interface ProxyVirtualListProps {
  parentRef: RefObject<HTMLDivElement | null>
  height: string
  totalSize: number
  virtualItems: VirtualListItem[]
  renderList: IRenderItem[]
  activeStickyIndex: number | null
  indent: boolean
  isChainMode?: boolean
  measureElement: (node: Element | null) => void
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
    event?: ReactMouseEvent<HTMLDivElement>,
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

interface ProxyGroupOption {
  name: string
  type: string
  all?: unknown[]
}

interface ChainRuleHeaderProps {
  title: string
  selectLabel: string
  currentGroup: ProxyGroupOption | null
  getGroupDisplayName?: (groupName: string) => string
  canSelectGroup: boolean
  onMenuOpen: (event: MouseEvent<HTMLElement>) => void
}

function ChainRuleHeader({
  title,
  selectLabel,
  currentGroup,
  getGroupDisplayName,
  canSelectGroup,
  onMenuOpen,
}: ChainRuleHeaderProps) {
  const currentGroupName = currentGroup?.name
    ? getGroupDisplayName?.(currentGroup.name) || currentGroup.name
    : ''

  return (
    <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '16px' }}>
            {title}
          </Typography>

          {currentGroup && (
            <Chip
              size="small"
              label={`${currentGroupName} (${currentGroup.type})`}
              variant="outlined"
              sx={{
                fontSize: '12px',
                maxWidth: '200px',
                '& .MuiChip-label': {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              }}
            />
          )}
        </Box>

        {canSelectGroup && (
          <IconButton
            size="small"
            onClick={onMenuOpen}
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '4px',
              padding: '4px 8px',
            }}
          >
            <Typography variant="body2" sx={{ mr: 0.5, fontSize: '12px' }}>
              {selectLabel}
            </Typography>
            <ExpandMoreRounded fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Box>
  )
}

interface GroupSelectMenuProps {
  anchorEl: HTMLElement | null
  groups: ProxyGroupOption[]
  selectedGroup: string | null
  getGroupDisplayName?: (groupName: string) => string
  emptyText: string
  onClose: () => void
  onSelect: (groupName: string) => void
}

function GroupSelectMenu({
  anchorEl,
  groups,
  selectedGroup,
  getGroupDisplayName,
  emptyText,
  onClose,
  onSelect,
}: GroupSelectMenuProps) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            maxHeight: 300,
            minWidth: 200,
          },
        },
      }}
    >
      {groups.map((group) => (
        <MenuItem
          key={group.name}
          onClick={() => onSelect(group.name)}
          selected={selectedGroup === group.name}
          sx={{ fontSize: '14px', py: 1 }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {getGroupDisplayName?.(group.name) || group.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {group.type} · {group.all?.length ?? 0} 节点
            </Typography>
          </Box>
        </MenuItem>
      ))}

      {groups.length === 0 && (
        <MenuItem disabled>
          <Typography variant="body2" color="text.secondary">
            {emptyText}
          </Typography>
        </MenuItem>
      )}
    </Menu>
  )
}

function ProxyVirtualList({
  parentRef,
  height,
  totalSize,
  virtualItems,
  renderList,
  activeStickyIndex,
  indent,
  isChainMode,
  measureElement,
  onLocation,
  onCheckAll,
  onCheckSpeed,
  getSelectedNodeCount,
  isNodeMultiSelected,
  onClearSelectedNodes,
  onExportNodes,
  onDeleteNodes,
  onSelectSingleNode,
  onToggleNodeSelection,
  onHeadState,
  onChangeProxy,
  testDisabled,
  profileUid,
  getGroupDisplayName,
}: ProxyVirtualListProps) {
  const theme = useTheme()
  const stickyBackground =
    theme.palette.mode === 'dark' ? '#1e1f27' : 'var(--background-color)'

  return (
    <div ref={parentRef} style={{ height, overflow: 'auto' }}>
      <div style={{ height: totalSize, position: 'relative' }}>
        {virtualItems.map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={measureElement}
            style={{
              position:
                virtualItem.index === activeStickyIndex ? 'sticky' : 'absolute',
              top: 0,
              left: 0,
              zIndex: virtualItem.index === activeStickyIndex ? 5 : undefined,
              display:
                virtualItem.index === activeStickyIndex
                  ? 'flow-root'
                  : undefined,
              backgroundColor:
                virtualItem.index === activeStickyIndex
                  ? stickyBackground
                  : undefined,
              width: '100%',
              transform:
                virtualItem.index === activeStickyIndex
                  ? undefined
                  : `translateY(${virtualItem.start}px)`,
            }}
          >
            <ProxyRender
              item={renderList[virtualItem.index]}
              indent={indent}
              onLocation={onLocation}
              onCheckAll={onCheckAll}
              onCheckSpeed={onCheckSpeed}
              getSelectedNodeCount={getSelectedNodeCount}
              isNodeMultiSelected={isNodeMultiSelected}
              onClearSelectedNodes={onClearSelectedNodes}
              onExportNodes={onExportNodes}
              onDeleteNodes={onDeleteNodes}
              onSelectSingleNode={onSelectSingleNode}
              onToggleNodeSelection={onToggleNodeSelection}
              onHeadState={onHeadState}
              onChangeProxy={onChangeProxy}
              isChainMode={isChainMode}
              testDisabled={testDisabled}
              profileUid={profileUid}
              getGroupDisplayName={getGroupDisplayName}
            />
          </div>
        ))}
        <div style={{ height: 8 }} />
      </div>
    </div>
  )
}

// 替换简单防抖函数为更优的节流函数
function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let previous = 0
  let lastArgs: Parameters<T> | null = null

  const run = (args: Parameters<T>) => {
    previous = Date.now()
    timer = null
    lastArgs = null
    func(...args)
  }

  return function (...args: Parameters<T>) {
    const now = Date.now()
    const remaining = wait - (now - previous)
    lastArgs = args

    if (remaining <= 0 || remaining > wait) {
      if (timer) {
        clearTimeout(timer)
      }
      run(args)
    } else if (!timer) {
      timer = setTimeout(() => {
        if (lastArgs) {
          run(lastArgs)
        }
      }, remaining)
    }
  }
}
