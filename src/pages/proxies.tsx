import { alpha, Box, Tab, Tabs } from '@mui/material'
import yaml from 'js-yaml'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BasePage } from '@/components/base'
import { ProviderButton } from '@/components/proxy/provider-button'
import { ProxyGroups } from '@/components/proxy/proxy-groups'
import { useVerge } from '@/hooks/use-app-config'
import { useProfiles } from '@/hooks/use-profiles'
import {
  useClashConfigData,
  useProxiesData,
} from '@/providers/app-data-context'
import { readProfileFile } from '@/services/cmds'

type RawProfileConfig = {
  proxies?: Array<{ name?: string; type?: string; history?: any[] }>
  'proxy-groups'?: Array<{
    name?: string
    type?: string
    now?: string
    proxies?: Array<string | { name?: string }>
    all?: Array<string | { name?: string }>
    use?: Array<string | { name?: string }>
    icon?: string
    url?: string
    testUrl?: string
  }>
}

type ProfileProxyView = {
  key: string
  type: 'profile'
  label: string
  profile: IProfileItem
}

type PortProxyView = {
  key: string
  type: 'port'
  label: string
  profile: IProfileItem
  portProxy: IVergePortProxy
  runtimePrefix: string
}

type ProxyView = ProfileProxyView | PortProxyView

const CLASH_MODE_SET = new Set(['rule', 'global', 'direct'])

const toProxyItem = (proxy: {
  name: string
  type?: string
  history?: any[]
}): IProxyItem =>
  ({
    name: proxy.name,
    type: proxy.type || 'Unknown',
    udp: false,
    xudp: false,
    tfo: false,
    mptcp: false,
    smux: false,
    history: proxy.history || [],
  }) as IProxyItem

const parseProfileGroups = (content: string): IProxyGroupItem[] => {
  const parsed = yaml.load(content) as RawProfileConfig | null
  const proxyMap = new Map<string, IProxyItem>()

  for (const proxy of parsed?.proxies ?? []) {
    if (proxy?.name) proxyMap.set(proxy.name, toProxyItem(proxy as any))
  }

  return (parsed?.['proxy-groups'] ?? [])
    .map((group) => {
      const rawNodes = group.proxies ?? group.all ?? group.use ?? []
      const all = rawNodes
        .map((node) => (typeof node === 'string' ? node : node?.name))
        .filter((name): name is string => Boolean(name))
        .map((name) => proxyMap.get(name) ?? toProxyItem({ name }))

      if (!group.name || all.length === 0) return null

      return {
        name: group.name,
        type: group.type || 'Selector',
        udp: false,
        xudp: false,
        tfo: false,
        mptcp: false,
        smux: false,
        history: [],
        now: group.now || all[0]?.name || '',
        all,
        icon: group.icon,
        testUrl: group.testUrl || group.url,
      } as IProxyGroupItem
    })
    .filter((group): group is IProxyGroupItem => Boolean(group))
}

const getPortProxyDisplayName = (portProxy: IVergePortProxy) =>
  portProxy.name?.trim() ||
  (portProxy.port ? String(portProxy.port) : portProxy.id || '端口代理')

const getPortProxyViewLabel = (
  profile: IProfileItem,
  portProxy: IVergePortProxy,
) => `${profile.name || profile.uid}(${getPortProxyDisplayName(portProxy)})`

const ProxyPage = () => {
  const { t } = useTranslation()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const { profiles } = useProfiles()
  const { proxies: proxiesData } = useProxiesData()
  const { clashConfig } = useClashConfigData()

  const profileItems = useMemo(() => profiles?.items ?? [], [profiles?.items])
  const currentProfileUid = profiles?.current ?? ''
  const [activeViewKey, setActiveViewKey] = useState('')
  const manualViewSelectRef = useRef(false)
  const [profileGroupsMap, setProfileGroupsMap] = useState<
    Record<string, IProxyGroupItem[]>
  >({})

  const normalizedMode = clashConfig?.mode?.toLowerCase()
  const currentMode =
    normalizedMode && CLASH_MODE_SET.has(normalizedMode)
      ? normalizedMode
      : 'rule'

  const enabledProfiles = useMemo(() => {
    const enabledUidSet = new Set(verge?.enabled_profile_uids ?? [])
    return profileItems.filter(
      (item) =>
        ['remote', 'local'].includes(item.type ?? '') &&
        enabledUidSet.has(item.uid),
    )
  }, [profileItems, verge?.enabled_profile_uids])
  const enabledProfileUidSet = useMemo(
    () => new Set(enabledProfiles.map((item) => item.uid)),
    [enabledProfiles],
  )
  const isPortProxyModeActive =
    !verge?.enable_system_proxy && !verge?.enable_tun_mode
  const enabledPortProxies = useMemo(
    () =>
      (verge?.port_proxies ?? []).filter(
        (portProxy) =>
          portProxy.enabled !== false &&
          Boolean(portProxy.port) &&
          Boolean(portProxy.subscriptionUid),
      ),
    [verge?.port_proxies],
  )
  const portProxyViews = useMemo<PortProxyView[]>(() => {
    if (!isPortProxyModeActive) return []

    const profileMap = new Map(enabledProfiles.map((item) => [item.uid, item]))
    const activePortProxies = enabledPortProxies.filter((portProxy) =>
      profileMap.has(portProxy.subscriptionUid!),
    )
    const portProxyCountByProfileUid = new Map<string, number>()
    activePortProxies.forEach((portProxy) => {
      const uid = portProxy.subscriptionUid!
      portProxyCountByProfileUid.set(
        uid,
        (portProxyCountByProfileUid.get(uid) ?? 0) + 1,
      )
    })

    return activePortProxies.map((portProxy, index) => {
      const profile = profileMap.get(portProxy.subscriptionUid!)!
      const runtimeLabel = getPortProxyViewLabel(profile, portProxy)
      const portProxyCount = portProxyCountByProfileUid.get(profile.uid) ?? 0
      const label =
        portProxyCount > 1 ? runtimeLabel : profile.name || profile.uid
      return {
        key: `port:${portProxy.id || `${portProxy.port ?? index}`}`,
        type: 'port' as const,
        label,
        profile,
        portProxy,
        runtimePrefix: `${runtimeLabel} - `,
      }
    })
  }, [enabledPortProxies, enabledProfiles, isPortProxyModeActive])

  const portProxyViewsByProfileUid = useMemo(() => {
    const viewMap = new Map<string, PortProxyView[]>()
    portProxyViews.forEach((view) => {
      const views = viewMap.get(view.profile.uid) ?? []
      views.push(view)
      viewMap.set(view.profile.uid, views)
    })
    return viewMap
  }, [portProxyViews])

  const createProfileView = useCallback(
    (profile: IProfileItem): ProfileProxyView => ({
      key: `profile:${profile.uid}`,
      type: 'profile',
      label: profile.name || profile.uid,
      profile,
    }),
    [],
  )

  const profileViews = useMemo<ProfileProxyView[]>(
    () => enabledProfiles.map(createProfileView),
    [createProfileView, enabledProfiles],
  )

  const proxyViews = useMemo<ProxyView[]>(
    () =>
      enabledProfiles.flatMap<ProxyView>((profile) => {
        const portViews = portProxyViewsByProfileUid.get(profile.uid)
        return portViews?.length ? portViews : [createProfileView(profile)]
      }),
    [createProfileView, enabledProfiles, portProxyViewsByProfileUid],
  )
  const showProfileTabs = proxyViews.length > 1
  const runningProfileUid = verge?.enable_system_proxy
    ? verge.system_proxy_profile_uid
    : verge?.enable_tun_mode
      ? verge.tun_proxy_profile_uid
      : ''
  const effectiveRunningProfileUid = useMemo(() => {
    if (!verge?.enable_system_proxy && !verge?.enable_tun_mode) return ''
    if (runningProfileUid && enabledProfileUidSet.has(runningProfileUid)) {
      return runningProfileUid
    }
    if (currentProfileUid && enabledProfileUidSet.has(currentProfileUid)) {
      return currentProfileUid
    }
    return enabledProfiles[0]?.uid ?? ''
  }, [
    currentProfileUid,
    enabledProfileUidSet,
    enabledProfiles,
    runningProfileUid,
    verge?.enable_system_proxy,
    verge?.enable_tun_mode,
  ])
  const usedProfileUidSet = useMemo(() => {
    const usedUidSet = new Set<string>()

    if (isPortProxyModeActive) {
      for (const portProxy of verge?.port_proxies ?? []) {
        if (portProxy.enabled !== false && portProxy.subscriptionUid) {
          usedUidSet.add(portProxy.subscriptionUid)
        }
      }
      return usedUidSet
    }

    if (effectiveRunningProfileUid) {
      usedUidSet.add(effectiveRunningProfileUid)
    }

    return usedUidSet
  }, [effectiveRunningProfileUid, isPortProxyModeActive, verge?.port_proxies])
  const preferredViewKey = useMemo(() => {
    if (!showProfileTabs) return ''
    if (isPortProxyModeActive) {
      return proxyViews[0]?.key ?? ''
    }
    return (
      profileViews.find(
        (view) => view.profile.uid === effectiveRunningProfileUid,
      )?.key ??
      proxyViews[0]?.key ??
      ''
    )
  }, [
    profileViews,
    proxyViews,
    isPortProxyModeActive,
    effectiveRunningProfileUid,
    showProfileTabs,
  ])
  const activeViewExists = useMemo(
    () => proxyViews.some((item) => item.key === activeViewKey),
    [activeViewKey, proxyViews],
  )
  const effectiveActiveViewKey = showProfileTabs
    ? activeViewExists
      ? activeViewKey
      : preferredViewKey
    : proxyViews[0]?.key || ''
  const loadProfileGroups = useCallback(async (item: IProfileItem) => {
    try {
      const content = await readProfileFile(item.uid)
      return parseProfileGroups(content)
    } catch (error) {
      console.error('Failed to read subscription profile:', item.uid, error)
      return []
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-ultra-active-page', 'proxies')

    return () => {
      if (root.getAttribute('data-ultra-active-page') === 'proxies') {
        root.removeAttribute('data-ultra-active-page')
      }
    }
  }, [])

  useEffect(() => {
    if (!showProfileTabs) {
      manualViewSelectRef.current = false
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setActiveViewKey('')
      return
    }

    if (!activeViewExists) {
      manualViewSelectRef.current = false
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setActiveViewKey(preferredViewKey)
      return
    }

    if (!manualViewSelectRef.current && activeViewKey !== preferredViewKey) {
      setActiveViewKey(preferredViewKey)
    }
  }, [activeViewExists, activeViewKey, preferredViewKey, showProfileTabs])

  useEffect(() => {
    if (!showProfileTabs) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setProfileGroupsMap({})
      return
    }

    let cancelled = false
    const loadGroups = async () => {
      const entries = await Promise.all(
        enabledProfiles.map(async (item) => {
          if (item.uid === currentProfileUid) return [item.uid, []] as const
          return [item.uid, await loadProfileGroups(item)] as const
        }),
      )

      if (!cancelled) setProfileGroupsMap(Object.fromEntries(entries))
    }

    loadGroups()

    return () => {
      cancelled = true
    }
  }, [currentProfileUid, enabledProfiles, loadProfileGroups, showProfileTabs])

  const activeView = proxyViews.find(
    (item) => item.key === effectiveActiveViewKey,
  )
  const activeProfile =
    activeView?.type === 'profile' ? activeView.profile : undefined
  const activePortView = activeView?.type === 'port' ? activeView : undefined
  const useRuntimeGroups =
    !showProfileTabs ||
    !activeView ||
    activeView.type === 'port' ||
    activeView.profile.uid === currentProfileUid
  const overrideGroups = useMemo(() => {
    if (!activeView) return undefined
    if (activeView.type === 'port') {
      return (proxiesData?.groups ?? []).filter((group: IProxyGroupItem) =>
        group.name?.startsWith(activeView.runtimePrefix),
      )
    }
    if (useRuntimeGroups) return undefined
    return profileGroupsMap[activeView.profile.uid] ?? []
  }, [activeView, profileGroupsMap, proxiesData?.groups, useRuntimeGroups])
  const getGroupDisplayName = useCallback(
    (groupName: string) => {
      if (activeView?.type !== 'port') return groupName
      if (!groupName.startsWith(activeView.runtimePrefix)) return groupName
      return groupName.slice(activeView.runtimePrefix.length) || groupName
    },
    [activeView],
  )
  const excludeRuntimeGroupPrefixes = useMemo(() => {
    if (
      !useRuntimeGroups ||
      !showProfileTabs ||
      !activeView ||
      activeView.type === 'port'
    ) {
      return []
    }

    const subscriptionPrefixes = enabledProfiles
      .filter((item) => item.uid !== activeView.profile.uid)
      .map((item) => item.name || item.uid)
      .filter(Boolean)
      .map((name) => `${name} - `)
    const portPrefixes = portProxyViews.map((view) => view.runtimePrefix)

    return [...subscriptionPrefixes, ...portPrefixes]
  }, [
    activeView,
    enabledProfiles,
    portProxyViews,
    showProfileTabs,
    useRuntimeGroups,
  ])
  const currentProfile = profileItems.find(
    (item) => item.uid === currentProfileUid,
  )
  const activeProfileForNodeAction = activePortView
    ? undefined
    : useRuntimeGroups
      ? (currentProfile ?? activeProfile)
      : activeProfile

  const handleProfileContentChanged = useCallback(async () => {
    if (!activeProfileForNodeAction) return
    if (activeProfileForNodeAction.uid === currentProfileUid) return

    const groups = await loadProfileGroups(activeProfileForNodeAction)
    setProfileGroupsMap((prev) => ({
      ...prev,
      [activeProfileForNodeAction.uid]: groups,
    }))
  }, [activeProfileForNodeAction, currentProfileUid, loadProfileGroups])

  const handlePortViewProxySelected = useCallback(
    async (group: IProxyGroupItem, proxy: IProxyItem) => {
      if (activeView?.type !== 'port' || !group?.name || !proxy?.name) return

      const nextPortProxies = (verge?.port_proxies ?? []).map((item) => {
        const samePortProxy = activeView.portProxy.id
          ? item.id === activeView.portProxy.id
          : item.port === activeView.portProxy.port &&
            item.name === activeView.portProxy.name
        if (!samePortProxy) return item

        const selected = [...(item.selected ?? [])]
        const selectedIndex = selected.findIndex(
          (entry) => entry.name === group.name,
        )
        const nextSelected = { name: group.name, now: proxy.name }
        if (selectedIndex >= 0) {
          selected[selectedIndex] = nextSelected
        } else {
          selected.push(nextSelected)
        }

        return { ...item, selected }
      })

      mutateVerge((prev) =>
        prev ? { ...prev, port_proxies: nextPortProxies } : prev,
      )
      await patchVerge({ port_proxies: nextPortProxies })
    },
    [activeView, mutateVerge, patchVerge, verge?.port_proxies],
  )

  return (
    <BasePage
      full
      className="proxies-page-shell"
      contentStyle={{ height: '100%' }}
      title={t('layout.components.navigation.tabs.proxies')}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ProviderButton />
        </Box>
      }
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {showProfileTabs && (
          <Box sx={{ px: 1, pt: 0.5, pb: 0.5 }}>
            <Tabs
              value={effectiveActiveViewKey}
              onChange={(_, value) => {
                manualViewSelectRef.current = true
                setActiveViewKey(value)
              }}
              variant="scrollable"
              scrollButtons="auto"
            >
              {proxyViews.map((item) => {
                const isProfileUsed = usedProfileUidSet.has(item.profile.uid)

                return (
                  <Tab
                    key={item.key}
                    value={item.key}
                    label={item.label}
                    sx={
                      isProfileUsed
                        ? (theme) => ({
                            position: 'relative',
                            mx: 0.25,
                            borderRadius: '999px',
                            border: `1px solid ${alpha(theme.palette.success.main, 0.38)}`,
                            color: `${theme.palette.success.main} !important`,
                            fontWeight: 800,
                            background:
                              theme.palette.mode === 'dark'
                                ? `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.24)}, ${alpha(theme.palette.success.light, 0.1)})`
                                : `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.14)}, ${alpha(theme.palette.success.light, 0.08)})`,
                            boxShadow: `0 8px 20px ${alpha(theme.palette.success.main, 0.12)}`,
                            '&.Mui-selected': {
                              color: `${theme.palette.success.main} !important`,
                              background:
                                theme.palette.mode === 'dark'
                                  ? `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.32)}, ${alpha(theme.palette.success.light, 0.14)})`
                                  : `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.2)}, ${alpha(theme.palette.success.light, 0.12)})`,
                              boxShadow: `0 10px 24px ${alpha(theme.palette.success.main, 0.2)}`,
                            },
                            '&::after': {
                              content: '""',
                              position: 'absolute',
                              left: '50%',
                              bottom: 4,
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              transform: 'translateX(-50%)',
                              backgroundColor: theme.palette.success.main,
                              boxShadow: `0 0 10px ${alpha(theme.palette.success.main, 0.9)}`,
                            },
                          })
                        : undefined
                    }
                  />
                )
              })}
            </Tabs>
          </Box>
        )}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ProxyGroups
            key={showProfileTabs ? activeView?.key : 'runtime'}
            mode={currentMode}
            overrideGroups={overrideGroups}
            excludeRuntimeGroupPrefixes={excludeRuntimeGroupPrefixes}
            getGroupDisplayName={getGroupDisplayName}
            profileUid={activeProfileForNodeAction?.uid}
            readOnly={Boolean(
              activeView?.type === 'profile' && !useRuntimeGroups,
            )}
            skipSelectionSave={activeView?.type === 'port'}
            onProxySelected={
              activeView?.type === 'port'
                ? handlePortViewProxySelected
                : undefined
            }
            onProfileContentChanged={handleProfileContentChanged}
          />
        </Box>
      </Box>
    </BasePage>
  )
}

export default ProxyPage
