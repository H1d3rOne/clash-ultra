import {
  decodeAndTrim,
  decodeBase64OrOriginal,
  getCipher,
  getIfNotBlank,
  getIfPresent,
  parseBoolOrPresence,
  parseQueryString,
  parseRequiredPort,
  safeDecodeURIComponent,
  splitOnce,
  stripUriScheme,
} from './helpers'

function normalizeSsUserInfo(raw: string) {
  let current = decodeBase64OrOriginal(raw)

  // Some public V2Ray subscriptions contain malformed nested SS userinfo like:
  // ss://base64("ss://base64(method:password)")@server:port#name
  // If we parse it directly, the cipher becomes "ss" and mihomo rejects the
  // generated config. Unwrap a small number of nested ss:// layers first.
  for (let index = 0; index < 3; index += 1) {
    const trimmed = current.trim()
    if (!/^ss:\/\//i.test(trimmed)) break

    const afterScheme = trimmed.replace(/^ss:\/\//i, '')
    const [withoutHash] = splitOnce(afterScheme, '#')
    const [withoutQuery] = splitOnce(withoutHash, '?')
    const [nestedUserInfo] = withoutQuery.includes('@')
      ? splitOnce(withoutQuery, '@')
      : [withoutQuery]
    const decoded = decodeBase64OrOriginal(nestedUserInfo)
    if (!decoded || decoded === current) break
    current = decoded
  }

  return current
}

export function URI_SS(line: string): IProxyShadowsocksConfig {
  const afterScheme = stripUriScheme(line, 'ss', 'Invalid ss uri')
  if (!afterScheme) {
    throw new Error('Invalid ss uri')
  }

  const [withoutHash, hashRaw] = splitOnce(afterScheme, '#')
  const nameFromHash = decodeAndTrim(hashRaw)

  const [mainRaw, queryRaw] = splitOnce(withoutHash, '?')
  const queryParams = parseQueryString(queryRaw)

  const main = mainRaw.includes('@') ? mainRaw : decodeBase64OrOriginal(mainRaw)
  const atIdx = main.lastIndexOf('@')
  if (atIdx === -1) {
    throw new Error("Invalid ss uri: missing '@'")
  }

  const userInfoStr = normalizeSsUserInfo(main.slice(0, atIdx))
  const serverAndPortWithPath = main.slice(atIdx + 1)
  const serverAndPort = serverAndPortWithPath.split('/')[0]

  const portIdx = serverAndPort.lastIndexOf(':')
  if (portIdx === -1) {
    throw new Error('Invalid ss uri: missing port')
  }
  const server = serverAndPort.slice(0, portIdx)
  const portRaw = serverAndPort.slice(portIdx + 1)
  const port = parseRequiredPort(portRaw, 'Invalid ss uri: invalid port')

  const userInfo = userInfoStr.match(/^([^:]+):(.*)$/)
  if (!userInfo) {
    throw new Error('Invalid ss uri: invalid user info')
  }

  const cipher = getCipher(safeDecodeURIComponent(userInfo[1]) ?? userInfo[1])
  if (cipher === 'auto' || cipher === 'none') {
    throw new Error(`Invalid ss uri: unsupported cipher ${userInfo[1]}`)
  }

  const proxy: IProxyShadowsocksConfig = {
    name: nameFromHash ?? `SS ${server}:${port}`,
    type: 'ss',
    server,
    port,
    cipher,
    password: safeDecodeURIComponent(userInfo[2]) ?? userInfo[2],
  }

  // plugin from `plugin=...`
  const pluginParam = queryParams.plugin
  if (pluginParam) {
    const pluginParts = pluginParam.split(';')
    const pluginName = pluginParts[0]
    const pluginOptions: Record<string, any> = { plugin: pluginName }
    for (const raw of pluginParts.slice(1)) {
      if (!raw) continue
      const [key, val] = splitOnce(raw, '=')
      if (!key) continue
      pluginOptions[key] = val === undefined || val === '' ? true : val
    }

    switch (pluginOptions.plugin) {
      case 'obfs-local':
      case 'simple-obfs':
        proxy.plugin = 'obfs'
        proxy['plugin-opts'] = {
          mode: pluginOptions.obfs,
          host: getIfNotBlank(pluginOptions['obfs-host']),
        }
        break
      case 'v2ray-plugin':
        proxy.plugin = 'v2ray-plugin'
        proxy['plugin-opts'] = {
          mode: 'websocket',
          host: getIfNotBlank(pluginOptions['obfs-host'] ?? pluginOptions.host),
          path: getIfNotBlank(pluginOptions.path),
          tls: getIfPresent(pluginOptions.tls),
        }
        break
      default:
        throw new Error(`Unsupported plugin option: ${pluginOptions.plugin}`)
    }
  }

  // plugin from `v2ray-plugin=...` (base64 JSON)
  const v2rayPluginParam = queryParams['v2ray-plugin']
  if (!proxy.plugin && v2rayPluginParam) {
    proxy.plugin = 'v2ray-plugin'
    try {
      proxy['plugin-opts'] = JSON.parse(
        decodeBase64OrOriginal(v2rayPluginParam),
      )
    } catch (e) {
      console.warn('[URI_SS] v2ray-plugin JSON.parse failed:', e)
      proxy['plugin-opts'] = {}
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(queryParams, 'uot') &&
    parseBoolOrPresence(queryParams.uot)
  ) {
    proxy['udp-over-tcp'] = true
  }
  if (
    Object.prototype.hasOwnProperty.call(queryParams, 'tfo') &&
    parseBoolOrPresence(queryParams.tfo)
  ) {
    proxy.tfo = true
  }

  return proxy
}
