import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { MihomoWebSocket } from 'tauri-plugin-mihomo-api'

const MAX_CLOSED_CONNS_NUM = 500
const CONNECTION_UPDATE_THROTTLE_MS = 500
const CONNECTION_RECONNECT_DELAY_MS = 1_000

type ConnectionMetadata = IConnectionsItem['metadata']
type ConnectionListener = () => void

const metadataValue = (value?: string) => value || ''

export const initConnData: ConnectionMonitorData = {
  uploadTotal: 0,
  downloadTotal: 0,
  activeConnections: [],
  closedConnections: [],
}

export interface ConnectionActiveData {
  uploadTotal: number
  downloadTotal: number
  activeConnections: IConnectionsItem[]
}

export const initConnActiveData: ConnectionActiveData = {
  uploadTotal: 0,
  downloadTotal: 0,
  activeConnections: [],
}

export interface ConnectionMonitorData {
  uploadTotal: number
  downloadTotal: number
  activeConnections: IConnectionsItem[]
  closedConnections: IConnectionsItem[]
}

export interface ConnectionSummaryData {
  activeConnectionCount: number
}

export const initConnSummaryData: ConnectionSummaryData = {
  activeConnectionCount: 0,
}

let connectionData: ConnectionMonitorData = initConnData
let connectionActiveData: ConnectionActiveData = initConnActiveData
let connectionSummary: ConnectionSummaryData = initConnSummaryData
let connectionSocket: MihomoWebSocket | null = null
let connectionStarted = false
let connectionConnecting = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pendingMessageData: string | null = null
let lastFlushAt = 0

const connectionListeners = new Set<ConnectionListener>()
const activeConnectionListeners = new Set<ConnectionListener>()
const summaryListeners = new Set<ConnectionListener>()

const notifyConnectionListeners = () => {
  connectionListeners.forEach((listener) => listener())
}

const notifyActiveConnectionListeners = () => {
  activeConnectionListeners.forEach((listener) => listener())
}

const notifySummaryListeners = () => {
  summaryListeners.forEach((listener) => listener())
}

const sameMetadata = (left: ConnectionMetadata, right: ConnectionMetadata) =>
  metadataValue(left.network) === metadataValue(right.network) &&
  metadataValue(left.type) === metadataValue(right.type) &&
  metadataValue(left.host) === metadataValue(right.host) &&
  metadataValue(left.sourceIP) === metadataValue(right.sourceIP) &&
  metadataValue(left.sourcePort) === metadataValue(right.sourcePort) &&
  metadataValue(left.destinationPort) ===
    metadataValue(right.destinationPort) &&
  metadataValue(left.destinationIP) === metadataValue(right.destinationIP) &&
  metadataValue(left.remoteDestination) ===
    metadataValue(right.remoteDestination) &&
  metadataValue(left.inboundName) === metadataValue(right.inboundName) &&
  metadataValue(left.inboundPort) === metadataValue(right.inboundPort) &&
  metadataValue(left.process) === metadataValue(right.process) &&
  metadataValue(left.processPath) === metadataValue(right.processPath)

const normalizeMetadata = (
  metadata: ConnectionMetadata,
  previous?: ConnectionMetadata,
): ConnectionMetadata => {
  if (previous && sameMetadata(previous, metadata)) return previous

  return {
    network: metadata.network || '',
    type: metadata.type || '',
    host: metadata.host || '',
    sourceIP: metadata.sourceIP || '',
    sourcePort: metadata.sourcePort || '',
    destinationPort: metadata.destinationPort || '',
    destinationIP: metadata.destinationIP || '',
    remoteDestination: metadata.remoteDestination || '',
    inboundName: metadata.inboundName || '',
    inboundPort: metadata.inboundPort || '',
    process: metadata.process || '',
    processPath: metadata.processPath || '',
  }
}

const sameChains = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false
  }
  return true
}

const normalizeChains = (chains: string[], previous?: string[]) => {
  if (previous && sameChains(previous, chains)) return previous
  return chains.slice()
}

const normalizeConnection = (
  connection: IConnectionsItem,
  previous?: IConnectionsItem,
): IConnectionsItem => {
  const metadata = normalizeMetadata(connection.metadata, previous?.metadata)
  const chains = normalizeChains(connection.chains || [], previous?.chains)
  const upload = connection.upload ?? 0
  const download = connection.download ?? 0
  const curUpload = previous ? upload - previous.upload : 0
  const curDownload = previous ? download - previous.download : 0
  const rule = connection.rule || ''
  const rulePayload = connection.rulePayload || ''
  const start = connection.start || ''

  if (
    previous &&
    previous.metadata === metadata &&
    previous.chains === chains &&
    previous.upload === upload &&
    previous.download === download &&
    previous.curUpload === curUpload &&
    previous.curDownload === curDownload &&
    previous.rule === rule &&
    previous.rulePayload === rulePayload &&
    previous.start === start
  ) {
    return previous
  }

  return {
    id: connection.id,
    metadata,
    upload,
    download,
    start,
    chains,
    rule,
    rulePayload,
    curUpload,
    curDownload,
  }
}

const mergeConnectionSnapshot = (
  payload: IConnections,
  previous: ConnectionMonitorData = initConnData,
): ConnectionMonitorData => {
  const nextConnections = payload.connections ?? []
  const uploadTotal = payload.uploadTotal ?? 0
  const downloadTotal = payload.downloadTotal ?? 0
  const previousActive = previous.activeConnections ?? []
  const previousClosed = previous.closedConnections ?? []
  const previousActiveById = new Map<string, IConnectionsItem>()
  let activeConnectionsChanged =
    previousActive.length !== nextConnections.length

  for (let i = 0; i < previousActive.length; i++) {
    const previousConnection = previousActive[i]
    previousActiveById.set(previousConnection.id, previousConnection)
  }

  const activeConnections: IConnectionsItem[] = []
  for (let i = 0; i < nextConnections.length; i++) {
    const connection = nextConnections[i]
    const previousConnection = previousActiveById.get(connection.id)
    if (previousConnection) previousActiveById.delete(connection.id)
    const normalizedConnection = normalizeConnection(
      connection,
      previousConnection,
    )
    if (
      !activeConnectionsChanged &&
      normalizedConnection !== previousActive[i]
    ) {
      activeConnectionsChanged = true
    }
    activeConnections.push(normalizedConnection)
  }

  if (previousActiveById.size === 0) {
    if (
      !activeConnectionsChanged &&
      previous.uploadTotal === uploadTotal &&
      previous.downloadTotal === downloadTotal
    ) {
      return previous
    }

    return {
      uploadTotal,
      downloadTotal,
      activeConnections,
      closedConnections: previousClosed,
    }
  }

  const removedConnectionCount = previousActiveById.size
  const dropFromClosed = Math.max(
    0,
    previousClosed.length + removedConnectionCount - MAX_CLOSED_CONNS_NUM,
  )
  const closedConnections =
    dropFromClosed >= previousClosed.length
      ? []
      : previousClosed.slice(dropFromClosed)

  const keepFromRemoved = MAX_CLOSED_CONNS_NUM - closedConnections.length
  let skipRemoved = Math.max(0, removedConnectionCount - keepFromRemoved)

  for (let i = 0; i < previousActive.length; i++) {
    const connection = previousActive[i]
    if (!previousActiveById.has(connection.id)) continue
    if (skipRemoved > 0) {
      skipRemoved -= 1
      continue
    }
    closedConnections.push(connection)
  }

  return {
    uploadTotal,
    downloadTotal,
    activeConnections,
    closedConnections,
  }
}

const mergeActiveConnectionSnapshot = (
  payload: IConnections,
  previous: ConnectionActiveData = initConnActiveData,
): ConnectionActiveData => {
  const nextConnections = payload.connections ?? []
  const uploadTotal = payload.uploadTotal ?? 0
  const downloadTotal = payload.downloadTotal ?? 0
  const previousActive = previous.activeConnections ?? []
  const previousActiveById = new Map<string, IConnectionsItem>()
  let activeConnectionsChanged =
    previousActive.length !== nextConnections.length

  for (let i = 0; i < previousActive.length; i++) {
    const previousConnection = previousActive[i]
    previousActiveById.set(previousConnection.id, previousConnection)
  }

  const activeConnections: IConnectionsItem[] = []
  for (let i = 0; i < nextConnections.length; i++) {
    const connection = nextConnections[i]
    const previousConnection = previousActiveById.get(connection.id)
    const normalizedConnection = normalizeConnection(
      connection,
      previousConnection,
    )
    if (
      !activeConnectionsChanged &&
      normalizedConnection !== previousActive[i]
    ) {
      activeConnectionsChanged = true
    }
    activeConnections.push(normalizedConnection)
  }

  if (
    !activeConnectionsChanged &&
    previous.uploadTotal === uploadTotal &&
    previous.downloadTotal === downloadTotal
  ) {
    return previous
  }

  return {
    uploadTotal,
    downloadTotal,
    activeConnections,
  }
}

const mergeConnectionSummary = (
  payload: IConnections,
  previous: ConnectionSummaryData = initConnSummaryData,
): ConnectionSummaryData => {
  const activeConnectionCount = payload.connections?.length ?? 0
  if (previous.activeConnectionCount === activeConnectionCount) return previous
  return { activeConnectionCount }
}

const releaseFullConnectionDataIfUnused = () => {
  if (connectionListeners.size > 0 || connectionData === initConnData) return
  connectionData = initConnData
}

const releaseActiveConnectionDataIfUnused = () => {
  if (
    activeConnectionListeners.size > 0 ||
    connectionActiveData === initConnActiveData
  ) {
    return
  }
  connectionActiveData = initConnActiveData
}

const flushPendingMessage = () => {
  flushTimer = null
  const messageData = pendingMessageData
  pendingMessageData = null
  if (!messageData) return

  let payload: IConnections
  try {
    payload = JSON.parse(messageData) as IConnections
  } catch (err) {
    console.error('[Connections] Failed to parse websocket payload', err)
    return
  }

  lastFlushAt = Date.now()
  const nextConnectionSummary = mergeConnectionSummary(
    payload,
    connectionSummary,
  )
  if (nextConnectionSummary !== connectionSummary) {
    connectionSummary = nextConnectionSummary
    notifySummaryListeners()
  }

  const hasFullListeners = connectionListeners.size > 0
  const hasActiveListeners = activeConnectionListeners.size > 0

  if (!hasFullListeners && !hasActiveListeners) {
    releaseFullConnectionDataIfUnused()
    releaseActiveConnectionDataIfUnused()
    return
  }

  let nextConnectionData: ConnectionMonitorData | null = null
  if (hasFullListeners) {
    nextConnectionData = mergeConnectionSnapshot(payload, connectionData)
    if (nextConnectionData !== connectionData) {
      connectionData = nextConnectionData
      notifyConnectionListeners()
    }
  } else {
    releaseFullConnectionDataIfUnused()
  }

  const nextConnectionActiveData = nextConnectionData
    ? {
        uploadTotal: nextConnectionData.uploadTotal,
        downloadTotal: nextConnectionData.downloadTotal,
        activeConnections: nextConnectionData.activeConnections,
      }
    : mergeActiveConnectionSnapshot(payload, connectionActiveData)

  if (
    hasActiveListeners &&
    (nextConnectionActiveData.uploadTotal !==
      connectionActiveData.uploadTotal ||
      nextConnectionActiveData.downloadTotal !==
        connectionActiveData.downloadTotal ||
      nextConnectionActiveData.activeConnections !==
        connectionActiveData.activeConnections)
  ) {
    connectionActiveData = nextConnectionActiveData
    notifyActiveConnectionListeners()
  } else if (!hasActiveListeners) {
    releaseActiveConnectionDataIfUnused()
  }
}

const enqueueConnectionMessage = (messageData: string) => {
  pendingMessageData = messageData
  if (flushTimer) return

  const elapsed = Date.now() - lastFlushAt
  if (elapsed >= CONNECTION_UPDATE_THROTTLE_MS) {
    flushPendingMessage()
    return
  }

  flushTimer = window.setTimeout(
    flushPendingMessage,
    CONNECTION_UPDATE_THROTTLE_MS - elapsed,
  )
}

const clearReconnectTimer = () => {
  if (!reconnectTimer) return
  window.clearTimeout(reconnectTimer)
  reconnectTimer = null
}

const closeConnectionSocket = async () => {
  const socket = connectionSocket
  connectionSocket = null
  if (!socket) return

  try {
    await socket.close()
  } catch (err) {
    console.warn('Failed to close connection websocket', err)
  }
}

const scheduleReconnect = () => {
  if (!connectionStarted) return
  if (reconnectTimer) return
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    if (!connectionStarted) return
    void connectConnectionSocket()
  }, CONNECTION_RECONNECT_DELAY_MS)
}

async function reconnectConnectionSocket() {
  if (!connectionStarted) return
  await closeConnectionSocket()
  scheduleReconnect()
}

async function connectConnectionSocket() {
  if (!connectionStarted) return
  if (connectionSocket || connectionConnecting) return

  clearReconnectTimer()
  connectionConnecting = true

  try {
    const socket = await MihomoWebSocket.connect_connections()
    if (!connectionStarted) {
      await socket.close()
      return
    }
    connectionSocket = socket
    socket.addListener((message) => {
      if (message.type !== 'Text') return
      if (message.data.startsWith('Websocket error')) {
        void reconnectConnectionSocket()
        return
      }

      enqueueConnectionMessage(message.data)
    })
  } catch {
    scheduleReconnect()
  } finally {
    connectionConnecting = false
  }
}

const startConnectionMonitor = () => {
  if (connectionStarted) return
  connectionStarted = true
  void connectConnectionSocket()
}

const stopConnectionMonitorIfIdle = () => {
  if (
    connectionListeners.size > 0 ||
    activeConnectionListeners.size > 0 ||
    summaryListeners.size > 0
  ) {
    return
  }

  connectionStarted = false
  pendingMessageData = null

  if (flushTimer) {
    window.clearTimeout(flushTimer)
    flushTimer = null
  }

  clearReconnectTimer()
  void closeConnectionSocket()
}

const getConnectionSnapshot = () => connectionData
const getConnectionActiveSnapshot = () => connectionActiveData
const getConnectionSummarySnapshot = () => connectionSummary

const subscribeConnectionData = (listener: ConnectionListener) => {
  startConnectionMonitor()
  connectionListeners.add(listener)
  return () => {
    connectionListeners.delete(listener)
    releaseFullConnectionDataIfUnused()
    stopConnectionMonitorIfIdle()
  }
}

const subscribeConnectionActiveData = (listener: ConnectionListener) => {
  startConnectionMonitor()
  activeConnectionListeners.add(listener)
  return () => {
    activeConnectionListeners.delete(listener)
    releaseActiveConnectionDataIfUnused()
    stopConnectionMonitorIfIdle()
  }
}

const subscribeConnectionSummary = (listener: ConnectionListener) => {
  startConnectionMonitor()
  summaryListeners.add(listener)
  return () => {
    summaryListeners.delete(listener)
    releaseFullConnectionDataIfUnused()
    releaseActiveConnectionDataIfUnused()
    stopConnectionMonitorIfIdle()
  }
}

const refreshConnectionData = () => {
  pendingMessageData = null
  if (flushTimer) {
    window.clearTimeout(flushTimer)
    flushTimer = null
  }

  void reconnectConnectionSocket()
}

const clearClosedConnectionData = () => {
  if (connectionData.closedConnections.length === 0) return
  connectionData = {
    ...connectionData,
    closedConnections: [],
  }
  notifyConnectionListeners()
}

export const useConnectionData = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled ?? true
  const subscribe = useCallback(
    (listener: ConnectionListener) =>
      enabled ? subscribeConnectionData(listener) : () => {},
    [enabled],
  )
  const data = useSyncExternalStore(
    subscribe,
    getConnectionSnapshot,
    getConnectionSnapshot,
  )
  const response = useMemo(() => ({ data }), [data])
  const refreshGetClashConnection = useCallback(() => {
    refreshConnectionData()
  }, [])
  const clearClosedConnections = useCallback(() => {
    clearClosedConnectionData()
  }, [])

  return {
    response,
    refreshGetClashConnection,
    clearClosedConnections,
  }
}

export const useConnectionActiveData = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled ?? true
  const subscribe = useCallback(
    (listener: ConnectionListener) =>
      enabled ? subscribeConnectionActiveData(listener) : () => {},
    [enabled],
  )
  const data = useSyncExternalStore(
    subscribe,
    getConnectionActiveSnapshot,
    getConnectionActiveSnapshot,
  )
  const response = useMemo(() => ({ data }), [data])
  const refreshGetClashConnection = useCallback(() => {
    refreshConnectionData()
  }, [])

  return {
    response,
    refreshGetClashConnection,
  }
}

export const useConnectionSummaryData = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled ?? true
  const subscribe = useCallback(
    (listener: ConnectionListener) =>
      enabled ? subscribeConnectionSummary(listener) : () => {},
    [enabled],
  )
  const data = useSyncExternalStore(
    subscribe,
    getConnectionSummarySnapshot,
    getConnectionSummarySnapshot,
  )
  const response = useMemo(() => ({ data }), [data])
  const refreshGetClashConnectionSummary = useCallback(() => {
    refreshConnectionData()
  }, [])

  return {
    response,
    refreshGetClashConnectionSummary,
  }
}
