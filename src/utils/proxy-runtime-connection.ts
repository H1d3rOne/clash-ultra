type RuntimeInboundMetadata = IConnectionsItem['metadata'] & {
  inboundName?: string
  inboundPort?: string | number
}

export interface RuntimeConnectionRoute {
  connection: IConnectionsItem
  route: string[]
  nodeName: string
  displayNodeName: string
  groupName: string
  displayGroupName: string
  rule: string
  rulePayload: string
  inboundName: string
  inboundPort: string
}

const normalizeText = (value?: string | number | null) =>
  value == null ? '' : String(value).trim()

export const getConnectionRoute = (connection: IConnectionsItem): string[] =>
  [...(connection.chains ?? [])]
    .reverse()
    .map((name) => normalizeText(name))
    .filter(Boolean)

const isTunConnection = (metadata: RuntimeInboundMetadata) => {
  const type = normalizeText(metadata.type).toLowerCase()
  const inboundName = normalizeText(metadata.inboundName).toLowerCase()

  return type.includes('tun') || inboundName.includes('tun')
}

const hasExplicitInbound = (metadata: RuntimeInboundMetadata) =>
  Boolean(
    normalizeText(metadata.inboundName) || normalizeText(metadata.inboundPort),
  )

export const stripRuntimeProfilePrefix = (
  nodeName: string,
  profileNames: string[] = [],
) => {
  const value = normalizeText(nodeName)
  if (!value) return ''

  const prefixes = Array.from(
    new Set(
      profileNames
        .map((name) => normalizeText(name))
        .filter(Boolean)
        .map((name) => `${name} - `),
    ),
  ).sort((a, b) => b.length - a.length)

  for (const prefix of prefixes) {
    if (value.startsWith(prefix)) return value.slice(prefix.length)
  }

  return value
}

const getPortProxyRuntimeDisplayName = (portProxy: IVergePortProxy): string =>
  portProxy.name?.trim() ||
  (portProxy.port ? String(portProxy.port) : portProxy.id || '端口代理')

const getPortProxyListenerNames = (portProxy: IVergePortProxy): string[] => {
  const id = normalizeText(portProxy.id)
  const type = normalizeText(portProxy.type) || 'mixed'
  const port = normalizeText(portProxy.port)
  return Array.from(
    new Set(
      [
        normalizeText(portProxy.name),
        id ? `port-proxy-${id}` : '',
        port ? `port-${type}-${port}` : '',
        port ? `port-${port}` : '',
      ].filter(Boolean),
    ),
  )
}

const stripRuntimePortProxyPrefix = (
  value: string,
  portProxy: IVergePortProxy,
  profileNames: string[] = [],
) => {
  const name = normalizeText(value)
  if (!name) return ''

  const displayName = getPortProxyRuntimeDisplayName(portProxy)
  const portProfileNames = [
    ...profileNames,
    portProxy.subscriptionName,
    portProxy.subscriptionUid,
  ]
    .map((item) => normalizeText(item))
    .filter(Boolean)

  const prefixes = Array.from(
    new Set(
      portProfileNames.flatMap((profileName) => [
        `${profileName}(${displayName}) - `,
        `${profileName} - `,
      ]),
    ),
  ).sort((a, b) => b.length - a.length)

  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) return name.slice(prefix.length)
  }

  const portScopedPrefix = `(${displayName}) - `
  const portScopedIndex = name.indexOf(portScopedPrefix)
  if (portScopedIndex >= 0) {
    return name.slice(portScopedIndex + portScopedPrefix.length)
  }

  return stripRuntimeProfilePrefix(name, profileNames)
}

const toRuntimeConnectionRoute = (
  connection: IConnectionsItem,
  route: string[],
  options: {
    profileNames?: string[]
    portProxy?: IVergePortProxy
  } = {},
): RuntimeConnectionRoute | null => {
  const nodeName = route[route.length - 1]
  if (!nodeName) return null

  const metadata = connection.metadata as RuntimeInboundMetadata
  const groupName =
    route.length > 1
      ? route[route.length - 2]
      : nodeName === 'DIRECT'
        ? 'DIRECT'
        : ''
  const displayName = options.portProxy
    ? stripRuntimePortProxyPrefix(
        nodeName,
        options.portProxy,
        options.profileNames,
      )
    : stripRuntimeProfilePrefix(nodeName, options.profileNames)
  const displayGroupName = options.portProxy
    ? stripRuntimePortProxyPrefix(
        groupName,
        options.portProxy,
        options.profileNames,
      )
    : stripRuntimeProfilePrefix(groupName, options.profileNames)

  return {
    connection,
    route,
    nodeName,
    displayNodeName: displayName || nodeName,
    groupName,
    displayGroupName: displayGroupName || groupName,
    rule: connection.rule || '',
    rulePayload: connection.rulePayload || '',
    inboundName: normalizeText(metadata.inboundName),
    inboundPort: normalizeText(metadata.inboundPort),
  }
}

export const findLatestRuntimeConnectionRoute = (
  connections: IConnectionsItem[] | undefined,
  options: {
    mode: 'system' | 'tun'
    mixedPort?: number
    profileNames?: string[]
  },
): RuntimeConnectionRoute | null => {
  const activeConnections = connections ?? []
  const mixedPort = options.mixedPort ? String(options.mixedPort) : ''

  for (const connection of [...activeConnections].reverse()) {
    const metadata = connection.metadata as RuntimeInboundMetadata
    const route = getConnectionRoute(connection)
    const nodeName = route[route.length - 1]

    if (!nodeName) continue

    if (options.mode === 'tun') {
      // Mihomo 新版本一般会带 TUN 入站类型；个别环境没有显式入站字段时，
      // TUN 作为唯一启用入口，仍按最新活跃连接作为真实命中数据。
      if (!isTunConnection(metadata) && hasExplicitInbound(metadata)) continue
    } else {
      const inboundPort = normalizeText(metadata.inboundPort)
      if (mixedPort && inboundPort && inboundPort !== mixedPort) continue
      if (!inboundPort && isTunConnection(metadata)) continue
    }

    return toRuntimeConnectionRoute(connection, route, {
      profileNames: options.profileNames,
    })
  }

  return null
}

export const findLatestPortProxyRuntimeConnectionRoute = (
  connections: IConnectionsItem[] | undefined,
  portProxy: IVergePortProxy,
  profileNames: string[] = [],
): RuntimeConnectionRoute | null => {
  const activeConnections = connections ?? []
  const listenerNames = getPortProxyListenerNames(portProxy)
  const port = normalizeText(portProxy.port)

  for (const connection of [...activeConnections].reverse()) {
    const metadata = connection.metadata as RuntimeInboundMetadata
    const inboundName = normalizeText(metadata.inboundName)
    const inboundPort = normalizeText(metadata.inboundPort)
    const isMatched =
      (inboundName && listenerNames.includes(inboundName)) ||
      (port && inboundPort === port)

    if (!isMatched) continue

    const route = getConnectionRoute(connection)
    const runtimeRoute = toRuntimeConnectionRoute(connection, route, {
      profileNames,
      portProxy,
    })
    if (runtimeRoute) return runtimeRoute
  }

  return null
}

export const formatRuntimeConnectionRouteLabel = (
  route: RuntimeConnectionRoute | null | undefined,
) => {
  if (!route?.nodeName) return ''

  const nodeName = route.displayNodeName || route.nodeName
  const groupName = route.displayGroupName || route.groupName

  if (!groupName || groupName === nodeName || nodeName === 'DIRECT') {
    return nodeName
  }

  return `${nodeName} · ${groupName}`
}
