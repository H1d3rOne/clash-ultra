import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import {
  CheckBoxOutlineBlankRounded,
  CheckBoxRounded,
  ClearRounded,
  ContentPasteRounded,
  DeleteRounded,
  IndeterminateCheckBoxRounded,
  LocalFireDepartmentRounded,
  RefreshRounded,
  TextSnippetOutlined,
} from '@mui/icons-material'
import { LoadingButton } from '@mui/lab'
import { Box, Button, Divider, Grid, IconButton, Stack } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { TauriEvent } from '@tauri-apps/api/event'
import { readText } from '@tauri-apps/plugin-clipboard-manager'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { useLockFn } from 'ahooks'
import yaml from 'js-yaml'
import { throttle } from 'lodash-es'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import {
  closeAllConnections,
  selectNodeForGroup,
} from 'tauri-plugin-mihomo-api'

import { BasePage, BaseStyledTextField, DialogRef } from '@/components/base'
import { ProfileItem } from '@/components/profile/profile-item'
import { ProfileMore } from '@/components/profile/profile-more'
import {
  ProfileViewer,
  ProfileViewerRef,
} from '@/components/profile/profile-viewer'
import { ConfigViewer } from '@/components/setting/mods/config-viewer'
import { useVerge } from '@/hooks/use-app-config'
import { useListen } from '@/hooks/use-listen'
import { useProfiles } from '@/hooks/use-profiles'
import {
  calcuProxies,
  createProfile,
  deleteProfile,
  enhanceProfiles,
  getProfiles,
  //restartCore,
  getRuntimeLogs,
  importProfile,
  reorderProfile,
  updateProfile,
} from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { queryClient } from '@/services/query-client'
import {
  useLoadingCache,
  useSetLoadingCache,
  useThemeMode,
} from '@/services/states'
import { debugLog } from '@/utils/debug'
import parseUri from '@/utils/uri-parser'
import { getCipher } from '@/utils/uri-parser/helpers'

// 与 src-tauri/src/main.rs 的 worker_limit 上限(8)保持一致，避免前后端更新风暴不对齐
const PROFILE_UPDATE_WORKER_LIMIT = 8

// 记录profile切换状态
const debugProfileSwitch = (action: string, profile: string, extra?: any) => {
  const timestamp = new Date().toISOString().substring(11, 23)
  debugLog(`[Profile-Debug][${timestamp}] ${action}: ${profile}`, extra || '')
}

const NODE_URI_SCHEMES = [
  'ss',
  'ssr',
  'vmess',
  'vless',
  'trojan',
  'anytls',
  'hysteria2',
  'hy2',
  'hysteria',
  'hy',
  'tuic',
  'wireguard',
  'wg',
  'http',
  'https',
  'socks5',
  'socks',
]

const NODE_URI_RE = new RegExp(
  `(?:^|\\s)((?:${NODE_URI_SCHEMES.join('|')}):\\/\\/[^\\s]+)`,
  'gi',
)

const tryDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const normalizeClipboardSubscriptionUrl = (value: string) => {
  let candidate = value.trim()
  for (let index = 0; index < 2; index += 1) {
    const decoded = tryDecodeURIComponent(candidate)
    if (decoded === candidate) break
    candidate = decoded.trim()
  }
  return /^https?:\/\//i.test(candidate) ? candidate : null
}

const getClipboardSubscriptionUrl = (text: string) => {
  const trimmed = text.trim()
  if (!trimmed || /\s/.test(trimmed)) return null

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      // A bare http(s) URL in the clipboard should be treated as a remote
      // subscription. Keep credential/fragment style http proxy URIs on the
      // local node-import path.
      if (!parsed.username && !parsed.password && !parsed.hash) {
        return trimmed
      }
    } catch {
      return null
    }
  }

  if (/^(?:clash|clash-ultra):\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      const rawUrl = parsed.searchParams.get('url')
      return rawUrl ? normalizeClipboardSubscriptionUrl(rawUrl) : null
    } catch {
      return null
    }
  }

  return null
}

const decodeBase64Text = (text: string) => {
  const normalized = text
    .trim()
    .replace(/[\r\n\s]/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  if (!normalized) return null

  const padLen = normalized.length % 4
  const padded = padLen === 0 ? normalized : normalized + '='.repeat(4 - padLen)

  try {
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    try {
      return atob(padded)
    } catch {
      return null
    }
  }
}

const getClipboardImportContents = (text: string) => {
  const contents = new Set<string>()
  const queue = [text]

  for (let index = 0; index < queue.length; index += 1) {
    const content = queue[index]?.trim()
    if (!content || contents.has(content)) continue

    contents.add(content)

    // V2Ray subscriptions are commonly a base64 encoded list of node URIs.
    // Decode recursively so clipboard content can be either raw URI lines,
    // base64 URI lines, raw sing-box JSON, or base64 sing-box JSON.
    const decoded = decodeBase64Text(content)?.trim()
    if (decoded && decoded !== content && !contents.has(decoded)) {
      queue.push(decoded)
    }
  }

  return contents
}

const splitProxyCandidates = (text: string) => {
  const contents = getClipboardImportContents(text)

  const candidates: string[] = []
  for (const content of contents) {
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (NODE_URI_RE.test(trimmed)) candidates.push(trimmed)
      NODE_URI_RE.lastIndex = 0
    }

    NODE_URI_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = NODE_URI_RE.exec(content))) {
      if (match[1]) candidates.push(match[1].trim())
    }
  }

  return [...new Set(candidates)]
}

const tryParseJson = (content: string) => {
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

const toRecord = (value: unknown): Record<string, any> | null => {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null
}

const getValue = (
  source: Record<string, any> | null | undefined,
  ...keys: string[]
) => {
  if (!source) return undefined
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key]
    }
  }
  return undefined
}

const getString = (
  source: Record<string, any> | null | undefined,
  ...keys: string[]
) => {
  const value = getValue(source, ...keys)
  if (value === null || value === undefined) return undefined
  const text = String(value).trim()
  return text || undefined
}

const getNumber = (
  source: Record<string, any> | null | undefined,
  ...keys: string[]
) => {
  const value = getValue(source, ...keys)
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const getBool = (
  source: Record<string, any> | null | undefined,
  ...keys: string[]
) => {
  const value = getValue(source, ...keys)
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    if (/^(?:true|1|yes)$/i.test(value)) return true
    if (/^(?:false|0|no)$/i.test(value)) return false
  }
  return undefined
}

const getStringArray = (
  source: Record<string, any> | null | undefined,
  ...keys: string[]
) => {
  const value = getValue(source, ...keys)
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return undefined
}

const getSingBoxPort = (outbound: Record<string, any>) => {
  return getNumber(outbound, 'server_port', 'serverPort', 'port')
}

const isIPv4Address = (value: string) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)

const normalizeSingBoxHeadersForWs = (headers: unknown) => {
  const record = toRecord(headers)
  if (!record) return undefined

  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      const first = value.find((item) => item !== null && item !== undefined)
      if (first !== undefined) normalized[key] = String(first)
    } else if (value !== null && value !== undefined) {
      normalized[key] = String(value)
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

const normalizeSingBoxHeadersForHttp = (headers: unknown) => {
  const record = toRecord(headers)
  if (!record) return undefined

  const normalized: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      normalized[key] = value.map((item) => String(item))
    } else if (value !== null && value !== undefined) {
      normalized[key] = [String(value)]
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

const applySingBoxTls = (
  proxy: IProxyConfig,
  outbound: Record<string, any>,
  serverNameKey: 'servername' | 'sni' = 'sni',
) => {
  const tls = toRecord(outbound.tls)
  if (!tls) return

  if (
    getBool(tls, 'enabled') === true &&
    ['vmess', 'vless', 'http', 'socks5'].includes(proxy.type)
  ) {
    ;(proxy as any).tls = true
  }

  const serverName = getString(tls, 'server_name', 'serverName', 'sni')
  if (serverName) {
    ;(proxy as any)[serverNameKey] = serverName
  }

  const insecure = getBool(tls, 'insecure', 'allow_insecure', 'allowInsecure')
  if (insecure !== undefined) {
    proxy['skip-cert-verify'] = insecure
  }

  const alpn = getStringArray(tls, 'alpn')
  if (alpn?.length) {
    ;(proxy as any).alpn = alpn
  }

  const utls = toRecord(tls.utls)
  const fingerprint = getString(utls, 'fingerprint')
  if (fingerprint) {
    ;(proxy as any)['client-fingerprint'] = fingerprint
  }

  const reality = toRecord(tls.reality)
  if (reality && getBool(reality, 'enabled') !== false) {
    const publicKey = getString(
      reality,
      'public_key',
      'publicKey',
      'public-key',
    )
    const shortId = getString(reality, 'short_id', 'shortId', 'short-id')
    if (publicKey || shortId) {
      ;(proxy as any).tls = true
      proxy['reality-opts'] = {
        ...(publicKey ? { 'public-key': publicKey } : {}),
        ...(shortId ? { 'short-id': shortId } : {}),
      }
    }
  }
}

const applySingBoxTransport = (
  proxy: IProxyConfig,
  outbound: Record<string, any>,
) => {
  const transport = toRecord(outbound.transport)
  if (!transport) return

  const rawType = getString(transport, 'type')?.toLowerCase()
  if (!rawType || rawType === 'tcp') {
    if (['vmess', 'vless', 'trojan'].includes(proxy.type)) {
      ;(proxy as any).network = 'tcp'
    }
    return
  }

  const path = getString(transport, 'path')
  const headers = getValue(transport, 'headers')

  if (rawType === 'ws' || rawType === 'websocket') {
    ;(proxy as any).network = 'ws'
    const wsOpts: WsOptions = {}
    if (path) wsOpts.path = path
    const wsHeaders = normalizeSingBoxHeadersForWs(headers)
    if (wsHeaders) wsOpts.headers = wsHeaders
    const maxEarlyData = getNumber(transport, 'max_early_data', 'maxEarlyData')
    if (maxEarlyData !== undefined) wsOpts['max-early-data'] = maxEarlyData
    const earlyDataHeaderName = getString(
      transport,
      'early_data_header_name',
      'earlyDataHeaderName',
    )
    if (earlyDataHeaderName) {
      wsOpts['early-data-header-name'] = earlyDataHeaderName
    }
    ;(proxy as any)['ws-opts'] = wsOpts
    return
  }

  if (rawType === 'grpc') {
    ;(proxy as any).network = 'grpc'
    const serviceName = getString(
      transport,
      'service_name',
      'serviceName',
      'grpc_service_name',
    )
    if (serviceName) {
      ;(proxy as any)['grpc-opts'] = { 'grpc-service-name': serviceName }
    }
    return
  }

  if (rawType === 'httpupgrade' || rawType === 'http_upgrade') {
    ;(proxy as any).network = 'ws'
    const wsOpts: WsOptions = {
      'v2ray-http-upgrade': true,
      'v2ray-http-upgrade-fast-open': true,
    }
    if (path) wsOpts.path = path
    const wsHeaders = normalizeSingBoxHeadersForWs(headers)
    if (wsHeaders) wsOpts.headers = wsHeaders
    ;(proxy as any)['ws-opts'] = wsOpts
    return
  }

  if (rawType === 'http' || rawType === 'h2') {
    ;(proxy as any).network = rawType === 'h2' ? 'h2' : 'http'
    if (rawType === 'h2') {
      const h2Opts: H2Options = {}
      if (path) h2Opts.path = path
      const host = getString(transport, 'host')
      if (host) h2Opts.host = host
      if (Object.keys(h2Opts).length > 0) {
        ;(proxy as any)['h2-opts'] = h2Opts
      }
      return
    }

    const httpOpts: HttpOptions = {}
    if (path) httpOpts.path = [path]
    const httpHeaders = normalizeSingBoxHeadersForHttp(headers)
    if (httpHeaders) httpOpts.headers = httpHeaders
    if (Object.keys(httpOpts).length > 0) {
      ;(proxy as any)['http-opts'] = httpOpts
    }
  }
}

const applySingBoxDialerProxy = (
  proxy: IProxyConfig,
  outbound: Record<string, any>,
) => {
  const detour = getString(outbound, 'detour', 'dialer_proxy', 'dialer-proxy')
  if (detour) {
    proxy['dialer-proxy'] = detour
  }
}

const singBoxOutboundToProxy = (
  outbound: Record<string, any>,
): IProxyConfig | null => {
  const type = getString(outbound, 'type')?.toLowerCase()
  const server = getString(outbound, 'server')
  const port = getSingBoxPort(outbound)
  const name =
    getString(outbound, 'tag', 'name') ?? `${type ?? 'Proxy'} ${server}:${port}`

  let proxy: IProxyConfig | undefined

  switch (type) {
    case 'shadowsocks':
    case 'ss':
      if (!server || !port) return null
      proxy = {
        type: 'ss',
        name,
        server,
        port,
        cipher: getCipher(getString(outbound, 'method')),
        password: getString(outbound, 'password'),
      } as IProxyConfig
      break
    case 'vmess':
      if (!server || !port) return null
      proxy = {
        type: 'vmess',
        name,
        server,
        port,
        uuid: getString(outbound, 'uuid'),
        alterId: getNumber(outbound, 'alter_id', 'alterId') ?? 0,
        cipher: getCipher(getString(outbound, 'security')),
      } as IProxyConfig
      applySingBoxTls(proxy, outbound, 'servername')
      applySingBoxTransport(proxy, outbound)
      break
    case 'vless':
      if (!server || !port) return null
      proxy = {
        type: 'vless',
        name,
        server,
        port,
        uuid: getString(outbound, 'uuid'),
        flow: getString(outbound, 'flow'),
      } as IProxyConfig
      applySingBoxTls(proxy, outbound, 'servername')
      applySingBoxTransport(proxy, outbound)
      break
    case 'trojan':
      if (!server || !port) return null
      proxy = {
        type: 'trojan',
        name,
        server,
        port,
        password: getString(outbound, 'password'),
      } as IProxyConfig
      applySingBoxTls(proxy, outbound, 'sni')
      applySingBoxTransport(proxy, outbound)
      break
    case 'hysteria':
      if (!server || !port) return null
      proxy = {
        type: 'hysteria',
        name,
        server,
        port,
        auth: getString(outbound, 'auth'),
        'auth-str': getString(outbound, 'auth_str', 'authStr', 'password'),
        obfs: getString(outbound, 'obfs'),
        up: getString(outbound, 'up', 'up_mbps', 'upMbps'),
        down: getString(outbound, 'down', 'down_mbps', 'downMbps'),
      } as IProxyConfig
      applySingBoxTls(proxy, outbound, 'sni')
      break
    case 'hysteria2':
    case 'hy2':
      if (!server || !port) return null
      {
        const obfs = toRecord(outbound.obfs)
        proxy = {
          type: 'hysteria2',
          name,
          server,
          port,
          password: getString(outbound, 'password'),
          obfs: getString(obfs, 'type') ?? getString(outbound, 'obfs'),
          'obfs-password':
            getString(obfs, 'password') ??
            getString(outbound, 'obfs_password', 'obfs-password'),
        } as IProxyConfig
      }
      applySingBoxTls(proxy, outbound, 'sni')
      break
    case 'tuic':
      if (!server || !port) return null
      proxy = {
        type: 'tuic',
        name,
        server,
        port,
        uuid: getString(outbound, 'uuid'),
        password: getString(outbound, 'password'),
        token: getString(outbound, 'token'),
        'congestion-controller': getString(
          outbound,
          'congestion_control',
          'congestionController',
          'congestion-controller',
        ),
        'udp-relay-mode': getString(
          outbound,
          'udp_relay_mode',
          'udpRelayMode',
          'udp-relay-mode',
        ),
      } as IProxyConfig
      applySingBoxTls(proxy, outbound, 'sni')
      break
    case 'anytls':
      if (!server || !port) return null
      proxy = {
        type: 'anytls',
        name,
        server,
        port,
        password: getString(outbound, 'password'),
      } as IProxyConfig
      applySingBoxTls(proxy, outbound, 'sni')
      break
    case 'http':
      if (!server || !port) return null
      proxy = {
        type: 'http',
        name,
        server,
        port,
        username: getString(outbound, 'username'),
        password: getString(outbound, 'password'),
      } as IProxyConfig
      applySingBoxTls(proxy, outbound, 'sni')
      break
    case 'socks':
    case 'socks5':
      if (!server || !port) return null
      proxy = {
        type: 'socks5',
        name,
        server,
        port,
        username: getString(outbound, 'username'),
        password: getString(outbound, 'password'),
        udp: getBool(outbound, 'udp'),
      } as IProxyConfig
      applySingBoxTls(proxy, outbound, 'sni')
      break
    case 'wireguard':
      if (!server || !port) return null
      {
        const localAddress = getStringArray(
          outbound,
          'local_address',
          'localAddress',
          'address',
        )
        proxy = {
          type: 'wireguard',
          name,
          server,
          port,
          'private-key': getString(outbound, 'private_key', 'privateKey'),
          'public-key': getString(
            outbound,
            'peer_public_key',
            'peerPublicKey',
            'public_key',
            'public-key',
          ),
          'pre-shared-key': getString(
            outbound,
            'pre_shared_key',
            'preSharedKey',
            'pre-shared-key',
          ),
          mtu: getNumber(outbound, 'mtu'),
          udp: true,
        } as IProxyConfig

        for (const address of localAddress ?? []) {
          const ip = address.replace(/\/\d+$/, '')
          if (isIPv4Address(ip)) proxy.ip = ip
          else if (ip.includes(':')) proxy.ipv6 = ip
        }
      }
      break
    default:
      return null
  }

  if (!proxy) return null

  applySingBoxDialerProxy(proxy, outbound)
  return proxy
}

const parseSingBoxProxyNodes = (text: string) => {
  const parsed: IProxyConfig[] = []

  for (const content of getClipboardImportContents(text)) {
    const json = tryParseJson(content)
    if (!json) continue

    const outbounds = Array.isArray(json)
      ? json
      : Array.isArray(json.outbounds)
        ? json.outbounds
        : []

    for (const item of outbounds) {
      const outbound = toRecord(item)
      if (!outbound) continue
      const proxy = singBoxOutboundToProxy(outbound)
      if (proxy) parsed.push(proxy)
    }
  }

  return parsed
}

const parseClashYamlProxyNodes = (text: string) => {
  const parsed: IProxyConfig[] = []
  const skippedTypes = new Set(['direct', 'reject', 'reject-drop', 'pass'])

  for (const content of getClipboardImportContents(text)) {
    let config: unknown
    try {
      config = yaml.load(content)
    } catch {
      continue
    }

    const record = toRecord(config)
    const proxies = Array.isArray(record?.proxies) ? record.proxies : []

    for (const item of proxies) {
      const proxy = toRecord(item)
      const name = proxy?.name
      const type = proxy?.type
      if (typeof name !== 'string' || typeof type !== 'string') continue
      if (skippedTypes.has(type.toLowerCase())) continue

      parsed.push(proxy as IProxyConfig)
    }
  }

  return parsed
}

const getProxyFingerprint = (proxy: IProxyConfig) => {
  return [
    proxy.type,
    proxy.server,
    proxy.port,
    proxy.uuid,
    proxy.password,
    proxy.cipher,
    proxy.name,
  ].join('|')
}

const createUniqueProxyName = (name: string, usedNames: Set<string>) => {
  const base = name.trim() || 'Proxy'
  if (!usedNames.has(base)) {
    usedNames.add(base)
    return base
  }

  let index = 2
  while (usedNames.has(`${base} ${index}`)) index += 1
  const nextName = `${base} ${index}`
  usedNames.add(nextName)
  return nextName
}

const parseClipboardProxyNodes = (text: string) => {
  const parsed: IProxyConfig[] = []
  const usedNames = new Set<string>()
  const usedProxies = new Set<string>()

  const appendProxy = (proxy: IProxyConfig) => {
    const fingerprint = getProxyFingerprint(proxy)
    if (usedProxies.has(fingerprint)) return
    usedProxies.add(fingerprint)
    const name = createUniqueProxyName(proxy.name, usedNames)
    parsed.push({ ...proxy, name })
  }

  for (const proxy of parseClashYamlProxyNodes(text)) {
    appendProxy(proxy)
  }

  for (const proxy of parseSingBoxProxyNodes(text)) {
    appendProxy(proxy)
  }

  // Raw URI lines and base64 V2Ray subscriptions.
  for (const candidate of splitProxyCandidates(text)) {
    try {
      const proxy = parseUri(candidate)
      appendProxy(proxy)
    } catch (error) {
      console.warn(
        '[Clipboard Node Import] parse node failed:',
        candidate,
        error,
      )
    }
  }

  return parsed
}

const buildClipboardProfileYaml = (proxies: IProxyConfig[]) => {
  const proxyNames = proxies.map((proxy) => proxy.name)
  const selectGroupName = '节点选择'

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

const buildClipboardClashProfileYaml = (text: string) => {
  for (const content of getClipboardImportContents(text)) {
    let config: unknown
    try {
      config = yaml.load(content)
    } catch {
      continue
    }

    const record = toRecord(config)
    if (!record) continue

    const proxies = Array.isArray(record.proxies) ? record.proxies : []
    const proxyProviders = toRecord(record['proxy-providers'])
    const proxyNames = proxies
      .map((proxy) => toRecord(proxy)?.name)
      .filter((name): name is string => typeof name === 'string' && !!name)
    const providerNames = Object.keys(proxyProviders ?? {})
    const hasProxyContent = proxyNames.length > 0 || providerNames.length > 0
    if (!hasProxyContent) continue

    const normalized = { ...record }
    const groups = Array.isArray(normalized['proxy-groups'])
      ? normalized['proxy-groups']
      : []

    if (groups.length === 0) {
      normalized['proxy-groups'] = [
        {
          name: '节点选择',
          type: 'select',
          ...(proxyNames.length ? { proxies: [...proxyNames, 'DIRECT'] } : {}),
          ...(providerNames.length ? { use: providerNames } : {}),
        },
      ]
    }

    const nextGroups = Array.isArray(normalized['proxy-groups'])
      ? normalized['proxy-groups']
      : []
    const firstGroupName =
      nextGroups
        .map((group) => toRecord(group)?.name)
        .find((name): name is string => typeof name === 'string' && !!name) ??
      '节点选择'

    if (!Array.isArray(normalized.rules) || normalized.rules.length === 0) {
      normalized.rules = [`MATCH,${firstGroupName}`]
    }

    return yaml.dump(normalized, {
      lineWidth: -1,
      noRefs: true,
    })
  }

  return null
}

const formatProfileNameTime = () => {
  const pad = (value: number) => String(value).padStart(2, '0')
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

// 检查请求是否已过期
const isRequestOutdated = (
  currentSequence: number,
  requestSequenceRef: RefObject<number>,
  profile: string,
) => {
  if (currentSequence !== requestSequenceRef.current) {
    debugProfileSwitch(
      'REQUEST_OUTDATED',
      profile,
      `当前序列号: ${currentSequence}, 最新序列号: ${requestSequenceRef.current}`,
    )
    return true
  }
  return false
}

// 检查是否被中断
const isOperationAborted = (
  abortController: AbortController,
  profile: string,
) => {
  if (abortController.signal.aborted) {
    debugProfileSwitch('OPERATION_ABORTED', profile)
    return true
  }
  return false
}

const ProfilePage = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const { addListener } = useListen()
  const [url, setUrl] = useState('')
  const [disabled, setDisabled] = useState(false)
  const [activatings, setActivatings] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [clipboardImporting, setClipboardImporting] = useState(false)

  // Batch selection states
  const [batchMode, setBatchMode] = useState(false)
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(
    () => new Set(),
  )

  // 防止重复切换
  const switchingProfileRef = useRef<string | null>(null)

  // 支持中断当前切换操作
  const abortControllerRef = useRef<AbortController | null>(null)

  // 只处理最新的切换请求
  const requestSequenceRef = useRef<number>(0)

  // 待处理请求跟踪，取消排队的请求
  const pendingRequestRef = useRef<Promise<any> | null>(null)

  // 处理profile切换中断
  const handleProfileInterrupt = useCallback(
    (previousSwitching: string, newProfile: string) => {
      debugProfileSwitch(
        'INTERRUPT_PREVIOUS',
        previousSwitching,
        `被 ${newProfile} 中断`,
      )

      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        debugProfileSwitch('ABORT_CONTROLLER_TRIGGERED', previousSwitching)
      }

      if (pendingRequestRef.current) {
        debugProfileSwitch('CANCEL_PENDING_REQUEST', previousSwitching)
      }

      setActivatings((prev) => prev.filter((id) => id !== previousSwitching))
      showNotice.info(
        'profiles.page.feedback.notifications.switchInterrupted',
        `${previousSwitching} → ${newProfile}`,
        3000,
      )
    },
    [],
  )

  // 清理切换状态
  const cleanupSwitchState = useCallback(
    (profile: string, sequence: number) => {
      setActivatings((prev) => prev.filter((id) => id !== profile))
      switchingProfileRef.current = null
      abortControllerRef.current = null
      pendingRequestRef.current = null
      debugProfileSwitch('SWITCH_END', profile, `序列号: ${sequence}`)
    },
    [],
  )
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const { current } = location.state || {}

  const {
    profiles = {},
    patchProfiles,
    mutateProfiles,
    error,
    isStale,
  } = useProfiles()
  const { verge, mutateVerge, patchVerge } = useVerge()

  useEffect(() => {
    const handleFileDrop = async () => {
      const unlisten = await addListener(
        TauriEvent.DRAG_DROP,
        async (event: any) => {
          const paths = event.payload.paths

          for (const file of paths) {
            if (!file.endsWith('.yaml') && !file.endsWith('.yml')) {
              showNotice.error('profiles.page.feedback.errors.onlyYaml')
              continue
            }
            const item = {
              type: 'local',
              name: file.split(/\/|\\/).pop() ?? 'New Profile',
              desc: '',
              url: '',
              option: {
                with_proxy: false,
                self_proxy: false,
              },
            } as IProfileItem
            const data = await readTextFile(file)
            await createProfile(item, data)
            await mutateProfiles()
          }
          await enhanceProfiles()
        },
      )

      return unlisten
    }

    const unsubscribe = handleFileDrop()

    return () => {
      unsubscribe.then((cleanup) => cleanup())
    }
  }, [addListener, mutateProfiles, t])

  // 添加紧急恢复功能
  const onEmergencyRefresh = useLockFn(async () => {
    debugLog('[紧急刷新] 开始强制刷新所有数据')

    try {
      // 只失效 profiles 相关 query，不影响 WS 订阅、IP 缓存等其他 query
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['getProfiles'] }),
        queryClient.invalidateQueries({ queryKey: ['getRuntimeLogs'] }),
      ])

      // 强制重新获取配置数据
      await mutateProfiles()

      // 等待状态稳定后增强配置
      await new Promise((resolve) => setTimeout(resolve, 500))
      await onEnhance(false)

      showNotice.success(
        'profiles.page.feedback.notices.forceRefreshCompleted',
        2000,
      )
    } catch (error) {
      console.error('[紧急刷新] 失败:', error)
      showNotice.error(
        'profiles.page.feedback.notices.emergencyRefreshFailed',
        { message: String(error) },
        4000,
      )
    }
  })

  const { data: chainLogs = {}, refetch: mutateLogs } = useQuery({
    queryKey: ['getRuntimeLogs'],
    queryFn: getRuntimeLogs,
  })

  const viewerRef = useRef<ProfileViewerRef>(null)
  const configRef = useRef<DialogRef>(null)

  // distinguish type
  const profileItems = useMemo(() => {
    const items = profiles.items || []

    const type1 = ['local', 'remote']

    return items.filter((i) => i && type1.includes(i.type!))
  }, [profiles])

  const enabledProfileUids = useMemo(() => {
    const validUids = new Set(profileItems.map((item) => item.uid))
    return (verge?.enabled_profile_uids ?? []).filter((uid) =>
      validUids.has(uid),
    )
  }, [profileItems, verge?.enabled_profile_uids])

  const enabledProfileUidSet = useMemo(
    () => new Set(enabledProfileUids),
    [enabledProfileUids],
  )

  const toggleEnabledProfile = useLockFn(async (uid: string) => {
    const nextEnabledProfileUids = enabledProfileUidSet.has(uid)
      ? enabledProfileUids.filter((item) => item !== uid)
      : [...enabledProfileUids, uid]

    mutateVerge((prev) =>
      prev ? { ...prev, enabled_profile_uids: nextEnabledProfileUids } : prev,
    )
    await patchVerge({ enabled_profile_uids: nextEnabledProfileUids })
  })

  const currentActivatings = () => {
    return [...new Set([profiles.current ?? ''])].filter(Boolean)
  }

  const onImport = async () => {
    if (!url) return
    // 校验url是否为http/https
    if (!/^https?:\/\//i.test(url)) {
      showNotice.error('profiles.page.feedback.errors.invalidUrl')
      return
    }
    setLoading(true)

    const handleImportSuccess = async (noticeKey: string) => {
      showNotice.success(noticeKey)
      setUrl('')
      await performRobustRefresh()
    }
    try {
      // 尝试正常导入
      await importProfile(url)
      await handleImportSuccess('shared.feedback.notifications.importSuccess')
    } catch (initialErr) {
      console.warn('[订阅导入] 首次导入失败:', initialErr)

      if (String(initialErr).toLowerCase().includes('legacy tls')) {
        showNotice.error(String(initialErr))
        return
      }

      showNotice.info('profiles.page.feedback.notifications.importRetry')
      try {
        // 使用自身代理尝试导入
        await importProfile(url, {
          with_proxy: false,
          self_proxy: true,
        })
        await handleImportSuccess(
          'shared.feedback.notifications.importWithClashProxy',
        )
      } catch (retryErr) {
        // 回退导入也失败
        showNotice.error(
          'profiles.page.feedback.notifications.importFail',
          String(retryErr),
        )
      }
    } finally {
      setDisabled(false)
      setLoading(false)
    }
  }

  const onImportNodesFromClipboard = useLockFn(async () => {
    setClipboardImporting(true)
    try {
      const text = await readText()
      if (!text?.trim()) {
        showNotice.error('剪贴板为空，没有可导入的节点')
        return
      }

      const subscriptionUrl = getClipboardSubscriptionUrl(text)
      if (subscriptionUrl) {
        let importedUid: string | undefined
        try {
          importedUid = await importProfile(subscriptionUrl)
        } catch (initialErr) {
          console.warn('[剪贴板订阅导入] 首次导入失败:', initialErr)
          showNotice.info('profiles.page.feedback.notifications.importRetry')
          importedUid = await importProfile(subscriptionUrl, {
            with_proxy: false,
            self_proxy: true,
          })
        }

        if (importedUid) {
          const nextEnabledProfileUids = [
            ...new Set([...enabledProfileUids, importedUid]),
          ]
          mutateVerge((prev) =>
            prev
              ? { ...prev, enabled_profile_uids: nextEnabledProfileUids }
              : prev,
          )
          await patchVerge({ enabled_profile_uids: nextEnabledProfileUids })
          await activateProfile(importedUid, false)
        }
        await mutateProfiles()
        showNotice.success('已从剪贴板导入远程订阅，并切换到新配置')
        return
      }

      const clashProfileYaml = buildClipboardClashProfileYaml(text)
      const proxies = clashProfileYaml ? [] : parseClipboardProxyNodes(text)
      if (!clashProfileYaml && proxies.length === 0) {
        showNotice.error('剪贴板中未识别到支持的节点协议')
        return
      }

      const profileName = `剪贴板节点 ${formatProfileNameTime()}`
      const fileData = clashProfileYaml ?? buildClipboardProfileYaml(proxies)
      const importedNodeCount = clashProfileYaml
        ? '完整配置'
        : `${proxies.length} 个节点`
      const item = {
        type: 'local',
        name: profileName,
        desc: `从剪贴板导入${clashProfileYaml ? '完整配置' : ` ${proxies.length} 个节点`}`,
        url: '',
        option: {
          with_proxy: false,
          self_proxy: false,
          allow_auto_update: false,
        },
      } as IProfileItem

      const createdUid = await createProfile(item, fileData)
      if (createdUid) {
        const nextEnabledProfileUids = [
          ...new Set([...enabledProfileUids, createdUid]),
        ]
        mutateVerge((prev) =>
          prev
            ? { ...prev, enabled_profile_uids: nextEnabledProfileUids }
            : prev,
        )
        await patchVerge({ enabled_profile_uids: nextEnabledProfileUids })
        await activateProfile(createdUid, false)
        await mutateProfiles()
        showNotice.success(
          `已从剪贴板导入${clashProfileYaml ? '完整配置' : ` ${proxies.length} 个节点`}，并切换到新配置`,
        )
      } else {
        showNotice.success(`已从剪贴板导入 ${importedNodeCount}`)
        await performRobustRefresh()
      }
    } catch (error) {
      showNotice.error(error)
    } finally {
      setClipboardImporting(false)
    }
  })

  // 强化的刷新策略
  // maxRetries 设为 1：useProfiles 内部 useQuery 已配置 retry:3，业务层只需 1 次额外重试
  const performRobustRefresh = async () => {
    let retryCount = 0
    const maxRetries = 1
    const baseDelay = 200

    while (retryCount < maxRetries) {
      try {
        debugLog(`[导入刷新] 第${retryCount + 1}次尝试刷新配置数据`)

        // 强制刷新，绕过所有缓存
        await mutateProfiles()

        // 等待状态稳定
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelay * (retryCount + 1)),
        )

        await onEnhance(false)
        return
      } catch (error) {
        console.error(`[导入刷新] 第${retryCount + 1}次刷新失败:`, error)
        retryCount++
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelay * retryCount),
        )
      }
    }

    // 所有重试失败后的最后尝试
    console.warn(`[导入刷新] 常规刷新失败，尝试清除缓存重新获取`)
    try {
      // 清除缓存并重新获取
      await queryClient.fetchQuery({
        queryKey: ['getProfiles'],
        queryFn: getProfiles,
      })
      await onEnhance(false)
      showNotice.error(
        'profiles.page.feedback.notifications.importNeedsRefresh',
        3000,
      )
    } catch (finalError) {
      console.error(`[导入刷新] 最终刷新尝试失败:`, finalError)
      showNotice.error(
        'profiles.page.feedback.notifications.importSuccess',
        5000,
      )
    }
  }

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over) {
      if (active.id !== over.id) {
        await reorderProfile(active.id.toString(), over.id.toString())
        mutateProfiles()
      }
    }
  }

  const activateProfile = useCallback(
    async (profile: string, notifySuccess: boolean) => {
      if (profiles.current === profile && !notifySuccess) {
        debugLog(`[Profile] 目标profile ${profile} 已经是当前配置，跳过切换`)
        return
      }

      const currentSequence = ++requestSequenceRef.current
      debugProfileSwitch('NEW_REQUEST', profile, `序列号: ${currentSequence}`)

      // 处理中断逻辑
      const previousSwitching = switchingProfileRef.current
      if (previousSwitching && previousSwitching !== profile) {
        handleProfileInterrupt(previousSwitching, profile)
      }

      // 防止重复切换同一个profile
      if (switchingProfileRef.current === profile) {
        debugProfileSwitch('DUPLICATE_SWITCH_BLOCKED', profile)
        return
      }

      // 初始化切换状态
      switchingProfileRef.current = profile
      debugProfileSwitch('SWITCH_START', profile, `序列号: ${currentSequence}`)

      const currentAbortController = new AbortController()
      abortControllerRef.current = currentAbortController

      setActivatings((prev) => {
        if (prev.includes(profile)) return prev
        return [...prev, profile]
      })

      try {
        debugLog(`[Profile] 开始切换到: ${profile}，序列号: ${currentSequence}`)

        // 检查请求有效性
        if (
          isRequestOutdated(currentSequence, requestSequenceRef, profile) ||
          isOperationAborted(currentAbortController, profile)
        ) {
          return
        }

        // 执行切换请求
        const requestPromise = patchProfiles(
          { current: profile },
          currentAbortController.signal,
          {
            deferRefreshOnSuccess: true,
          },
        )
        pendingRequestRef.current = requestPromise

        const success = await requestPromise

        if (pendingRequestRef.current === requestPromise) {
          pendingRequestRef.current = null
        }

        // 再次检查有效性
        if (
          isRequestOutdated(currentSequence, requestSequenceRef, profile) ||
          isOperationAborted(currentAbortController, profile)
        ) {
          return
        }

        // 选择所记忆的节点
        const current = profiles.items?.find((e) => e.uid === profile)
        for (const item of current?.selected ?? []) {
          if (item.name && item.now) {
            try {
              await selectNodeForGroup(item.name, item.now)
            } catch (err) {
              debugLog(
                `[Profile] 选择节点失败: ${item.name} -> ${item.now}`,
                err,
              )
            }
          }
        }
        queryClient.setQueryData(['getProxies'], await calcuProxies())

        // 完成切换
        await mutateLogs()
        closeAllConnections()

        if (notifySuccess && success) {
          showNotice.success(
            'profiles.page.feedback.notifications.profileSwitched',
            1000,
          )
        }

        debugLog(
          `[Profile] 切换到 ${profile} 完成，序列号: ${currentSequence}，开始后台处理`,
        )
      } catch (err: any) {
        if (pendingRequestRef.current) {
          pendingRequestRef.current = null
        }

        // 检查是否因为中断或过期而出错
        if (
          isOperationAborted(currentAbortController, profile) ||
          isRequestOutdated(currentSequence, requestSequenceRef, profile)
        ) {
          return
        }

        console.error(`[Profile] 切换失败:`, err)
        showNotice.error(err, 4000)
      } finally {
        // 只有当前profile仍然是正在切换的profile且序列号匹配时才清理状态
        if (
          switchingProfileRef.current === profile &&
          currentSequence === requestSequenceRef.current
        ) {
          cleanupSwitchState(profile, currentSequence)
        } else {
          debugProfileSwitch(
            'CLEANUP_SKIPPED',
            profile,
            `序列号不匹配或已被接管: ${currentSequence} vs ${requestSequenceRef.current}`,
          )
        }
      }
    },
    [
      profiles,
      patchProfiles,
      mutateLogs,
      handleProfileInterrupt,
      cleanupSwitchState,
    ],
  )
  const onSelect = async (current: string, force: boolean) => {
    // 阻止重复点击或已激活的profile
    if (switchingProfileRef.current === current) {
      debugProfileSwitch('DUPLICATE_CLICK_IGNORED', current)
      return
    }

    if (!force && current === profiles.current) {
      debugProfileSwitch('ALREADY_CURRENT_IGNORED', current)
      return
    }

    await activateProfile(current, true)
  }

  useEffect(() => {
    ;(async () => {
      if (current) {
        mutateProfiles()
        await activateProfile(current, false)
      }
    })()
  }, [current, activateProfile, mutateProfiles])

  const onEnhance = useLockFn(async (notifySuccess: boolean) => {
    if (switchingProfileRef.current) {
      debugLog(
        `[Profile] 有profile正在切换中(${switchingProfileRef.current})，跳过enhance操作`,
      )
      return
    }

    const currentProfiles = currentActivatings()
    setActivatings((prev) => [...new Set([...prev, ...currentProfiles])])

    try {
      if (!(await enhanceProfiles())) return
      mutateLogs()
      if (notifySuccess) {
        showNotice.success(
          'profiles.page.feedback.notifications.profileReactivated',
          1000,
        )
      }
    } catch (err: any) {
      showNotice.error(err, 3000)
    } finally {
      // 保留正在切换的profile，清除其他状态
      setActivatings((prev) =>
        prev.filter((id) => id === switchingProfileRef.current),
      )
    }
  })

  const onDelete = useLockFn(async (uid: string) => {
    const current = profiles.current === uid
    try {
      setActivatings([...(current ? currentActivatings() : []), uid])
      await deleteProfile(uid)
      mutateProfiles()
      mutateLogs()
      if (current) {
        await onEnhance(false)
      }
    } catch (err: any) {
      showNotice.error(err)
    } finally {
      setActivatings([])
    }
  })

  // 更新所有订阅
  const loadingCache = useLoadingCache()
  const setLoadingCache = useSetLoadingCache()
  const setLoadingProfiles = useCallback(
    (uids: string[], loading: boolean) => {
      setLoadingCache((cache) => {
        const next = new Set(cache)
        for (const uid of uids) {
          if (loading) {
            next.add(uid)
          } else {
            next.delete(uid)
          }
        }
        return next
      })
    },
    [setLoadingCache],
  )
  const runProfileUpdates = useCallback(
    async (uids: string[]) => {
      if (uids.length === 0) return

      const throttleMutate = throttle(mutateProfiles, 2000, {
        trailing: true,
      })
      let cursor = 0

      const updateOne = async (uid: string) => {
        try {
          await updateProfile(uid)
          throttleMutate()
        } catch (err: any) {
          console.error(`更新订阅 ${uid} 失败:`, err)
        }
      }

      const worker = async () => {
        while (cursor < uids.length) {
          const uid = uids[cursor++]
          await updateOne(uid)
        }
      }

      try {
        const active = Math.min(PROFILE_UPDATE_WORKER_LIMIT, uids.length)
        await Promise.allSettled(Array.from({ length: active }, worker))
      } finally {
        setLoadingProfiles(uids, false)
        // 避免长时间批量更新后列表数据过晚刷新
        void mutateProfiles()
      }
    },
    [mutateProfiles, setLoadingProfiles],
  )
  const onUpdateAll = useLockFn(async () => {
    const items = profileItems.filter((e) => e.type === 'remote')
    const target = items
      .map((item) => item.uid)
      .filter((uid) => !loadingCache.has(uid))

    setLoadingProfiles(target, true)
    await runProfileUpdates(target)
  })

  const onCopyLink = async () => {
    const text = await readText()
    if (text) setUrl(text)
  }

  // Batch selection functions
  const toggleBatchMode = () => {
    setBatchMode(!batchMode)
    if (!batchMode) {
      // Entering batch mode - clear previous selections
      setSelectedProfiles(new Set())
    }
  }

  const toggleProfileSelection = (uid: string) => {
    setSelectedProfiles((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(uid)) {
        newSet.delete(uid)
      } else {
        newSet.add(uid)
      }
      return newSet
    })
  }

  const selectAllProfiles = () => {
    setSelectedProfiles(new Set(profileItems.map((item) => item.uid)))
  }

  const clearAllSelections = () => {
    setSelectedProfiles(new Set())
  }

  const isAllSelected = () => {
    return (
      profileItems.length > 0 && profileItems.length === selectedProfiles.size
    )
  }

  const getSelectionState = () => {
    if (selectedProfiles.size === 0) {
      return 'none' // 无选择
    } else if (selectedProfiles.size === profileItems.length) {
      return 'all' // 全选
    } else {
      return 'partial' // 部分选择
    }
  }

  const deleteSelectedProfiles = useLockFn(async () => {
    if (selectedProfiles.size === 0) return

    try {
      // Get all currently activating profiles
      const currentActivating =
        profiles.current && selectedProfiles.has(profiles.current)
          ? [profiles.current]
          : []

      setActivatings((prev) => [...new Set([...prev, ...currentActivating])])

      // Delete all selected profiles
      for (const uid of selectedProfiles) {
        await deleteProfile(uid)
      }

      await mutateProfiles()
      await mutateLogs()

      // If any deleted profile was current, enhance profiles
      if (currentActivating.length > 0) {
        await onEnhance(false)
      }

      // Clear selections and exit batch mode
      setSelectedProfiles(new Set())
      setBatchMode(false)

      showNotice.success('profiles.page.feedback.notifications.batchDeleted')
    } catch (err: any) {
      showNotice.error(err)
    } finally {
      setActivatings([])
    }
  })

  const mode = useThemeMode()
  const isLight = mode === 'light'
  const dividercolor = isLight
    ? 'rgba(0, 0, 0, 0.06)'
    : 'rgba(255, 255, 255, 0.06)'

  // 组件卸载时清理中断控制器
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        debugProfileSwitch('COMPONENT_UNMOUNT_CLEANUP', 'all')
      }
    }
  }, [])

  return (
    <BasePage
      full
      title={t('profiles.page.title')}
      contentStyle={{ height: '100%' }}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {!batchMode ? (
            <>
              {/* Batch mode toggle button */}
              <IconButton
                size="small"
                color="inherit"
                title={t('profiles.page.batch.title')}
                onClick={toggleBatchMode}
              >
                <CheckBoxOutlineBlankRounded />
              </IconButton>

              <IconButton
                size="small"
                color="inherit"
                title={t('profiles.page.actions.updateAll')}
                onClick={onUpdateAll}
              >
                <RefreshRounded />
              </IconButton>

              <IconButton
                size="small"
                color="inherit"
                title={t('profiles.page.actions.viewRuntimeConfig')}
                onClick={() => configRef.current?.open()}
              >
                <TextSnippetOutlined />
              </IconButton>

              <IconButton
                size="small"
                color="primary"
                title={t('profiles.page.actions.reactivate')}
                onClick={() => onEnhance(true)}
              >
                <LocalFireDepartmentRounded />
              </IconButton>

              {/* 故障检测和紧急恢复按钮 */}
              {(error || isStale) && (
                <IconButton
                  size="small"
                  color="warning"
                  title="数据异常，点击强制刷新"
                  onClick={onEmergencyRefresh}
                  sx={{
                    animation: 'pulse 2s infinite',
                    '@keyframes pulse': {
                      '0%': { opacity: 1 },
                      '50%': { opacity: 0.5 },
                      '100%': { opacity: 1 },
                    },
                  }}
                >
                  <ClearRounded />
                </IconButton>
              )}
            </>
          ) : (
            // Batch mode header
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                size="small"
                color="inherit"
                title={
                  isAllSelected()
                    ? t('profiles.page.batch.actions.deselectAll')
                    : t('profiles.page.batch.actions.selectAll')
                }
                onClick={
                  isAllSelected() ? clearAllSelections : selectAllProfiles
                }
              >
                {getSelectionState() === 'all' ? (
                  <CheckBoxRounded />
                ) : getSelectionState() === 'partial' ? (
                  <IndeterminateCheckBoxRounded />
                ) : (
                  <CheckBoxOutlineBlankRounded />
                )}
              </IconButton>
              <IconButton
                size="small"
                color="error"
                title={t('profiles.page.batch.actions.delete')}
                onClick={deleteSelectedProfiles}
                disabled={selectedProfiles.size === 0}
              >
                <DeleteRounded />
              </IconButton>
              <Button size="small" variant="outlined" onClick={toggleBatchMode}>
                {t('profiles.page.batch.actions.done')}
              </Button>
              <Box
                sx={{ flex: 1, textAlign: 'right', color: 'text.secondary' }}
              >
                {t('profiles.page.batch.summary.selected')}{' '}
                {selectedProfiles.size} {t('profiles.page.batch.summary.items')}
              </Box>
            </Box>
          )}
        </Box>
      }
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        sx={{
          pt: 1,
          mb: 0.5,
          mx: '10px',
          minHeight: '36px',
          alignItems: { xs: 'stretch', md: 'center' },
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{ flex: '1 1 auto', minWidth: 0, alignItems: 'center' }}
        >
          <BaseStyledTextField
            value={url}
            variant="outlined"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
                return
              }
              if (!url || disabled || loading) {
                return
              }
              event.preventDefault()
              void onImport()
            }}
            placeholder={t('profiles.page.importForm.placeholder')}
            sx={{ flex: 1, minWidth: 0 }}
            slotProps={{
              input: {
                sx: { pr: 1 },
                endAdornment: !url ? (
                  <IconButton
                    size="small"
                    sx={{ p: 0.5 }}
                    title={t('profiles.page.importForm.actions.paste')}
                    onClick={onCopyLink}
                  >
                    <ContentPasteRounded fontSize="inherit" />
                  </IconButton>
                ) : (
                  <IconButton
                    size="small"
                    sx={{ p: 0.5 }}
                    title={t('shared.actions.clear')}
                    onClick={() => setUrl('')}
                  >
                    <ClearRounded fontSize="inherit" />
                  </IconButton>
                ),
              },
            }}
          />
          <LoadingButton
            disabled={!url || disabled}
            loading={loading}
            variant="contained"
            size="small"
            sx={(theme) => {
              const buttonText =
                theme.palette.mode === 'dark' ? '#061414' : '#ffffff'

              return {
                '--ultra-readable-on-primary': buttonText,
                '--ultra-readable-disabled': buttonText,
                borderRadius: '6px',
                minWidth: 64,
                flexShrink: 0,
                '&&&': {
                  color: `${buttonText} !important`,
                  WebkitTextFillColor: `${buttonText} !important`,
                },
                '& .MuiLoadingButton-loadingIndicator': {
                  color: `${buttonText} !important`,
                },
                '&&&.Mui-disabled': {
                  color: `${buttonText} !important`,
                  WebkitTextFillColor: `${buttonText} !important`,
                },
              }
            }}
            onClick={onImport}
          >
            {t('profiles.page.actions.import')}
          </LoadingButton>
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          sx={{
            flex: '0 0 auto',
            alignItems: 'center',
            justifyContent: { xs: 'flex-end', md: 'flex-start' },
          }}
        >
          <LoadingButton
            loading={clipboardImporting}
            variant="outlined"
            size="small"
            startIcon={<ContentPasteRounded />}
            title="从剪贴板导入节点"
            sx={{
              borderRadius: '6px',
              whiteSpace: 'nowrap',
              minWidth: { xs: 104, sm: 148 },
              flexShrink: 0,
            }}
            onClick={onImportNodesFromClipboard}
          >
            <Box
              component="span"
              sx={{ display: { xs: 'none', sm: 'inline' } }}
            >
              从剪贴板导入节点
            </Box>
            <Box
              component="span"
              sx={{ display: { xs: 'inline', sm: 'none' } }}
            >
              导入节点
            </Box>
          </LoadingButton>
          <Button
            variant="contained"
            size="small"
            sx={{ borderRadius: '6px', minWidth: 64, flexShrink: 0 }}
            onClick={() => viewerRef.current?.create()}
          >
            {t('shared.actions.new')}
          </Button>
        </Stack>
      </Stack>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <Box
          sx={{
            pl: '10px',
            pr: '10px',
            height: 'calc(100% - 48px)',
            overflowY: 'auto',
          }}
        >
          <Box sx={{ mb: 1.5 }}>
            <Grid container spacing={{ xs: 1, lg: 1 }}>
              <SortableContext
                items={profileItems.map((x) => {
                  return x.uid
                })}
              >
                {profileItems.map((item) => (
                  <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={item.file}>
                    <ProfileItem
                      id={item.uid}
                      selected={enabledProfileUidSet.has(item.uid)}
                      enabled={enabledProfileUidSet.has(item.uid)}
                      activating={activatings.includes(item.uid)}
                      itemData={item}
                      mutateProfiles={mutateProfiles}
                      onSelect={(force) => {
                        if (force) {
                          void onSelect(item.uid, force)
                          return
                        }
                        void toggleEnabledProfile(item.uid)
                      }}
                      onEdit={() => viewerRef.current?.edit(item)}
                      onSave={async (prev, curr) => {
                        if (prev !== curr && profiles.current === item.uid) {
                          await onEnhance(false)
                          //  await restartCore();
                          //   Notice.success(t("settings.feedback.notifications.clash.restartSuccess"), 1000);
                        }
                      }}
                      onDelete={() => {
                        if (batchMode) {
                          toggleProfileSelection(item.uid)
                        } else {
                          onDelete(item.uid)
                        }
                      }}
                      batchMode={batchMode}
                      isSelected={selectedProfiles.has(item.uid)}
                      onSelectionChange={() => toggleProfileSelection(item.uid)}
                    />
                  </Grid>
                ))}
              </SortableContext>
            </Grid>
          </Box>
          <Divider
            variant="middle"
            flexItem
            sx={{ width: `calc(100% - 32px)`, borderColor: dividercolor }}
          ></Divider>
          <Box sx={{ mt: 1.5, mb: '10px' }}>
            <Grid container spacing={{ xs: 1, lg: 1 }}>
              <Grid size={{ xs: 12, sm: 6, md: 6, lg: 6 }}>
                <ProfileMore
                  id="Merge"
                  onSave={async (prev, curr) => {
                    if (prev !== curr) {
                      await onEnhance(false)
                    }
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 6, lg: 6 }}>
                <ProfileMore
                  id="Script"
                  logInfo={chainLogs['Script']}
                  onSave={async (prev, curr) => {
                    if (prev !== curr) {
                      await onEnhance(false)
                    }
                  }}
                />
              </Grid>
            </Grid>
          </Box>
        </Box>
        <DragOverlay />
      </DndContext>

      <ProfileViewer
        ref={viewerRef}
        onChange={async (isActivating) => {
          mutateProfiles()
          // 只有更改当前激活的配置时才触发全局重新加载
          if (isActivating) {
            await onEnhance(false)
          }
        }}
      />
      <ConfigViewer ref={configRef} />
    </BasePage>
  )
}

export default ProfilePage
