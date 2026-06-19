import {
  decodeAndTrim,
  getIfNotBlank,
  parseBoolOrPresence,
  parseInteger,
  parsePortOrDefault,
  parseQueryStringNormalized,
  parseUrlLike,
  safeDecodeURIComponent,
  splitOnce,
  stripUriScheme,
} from './helpers'
import { URI_VLESS } from './vless'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizeAnyTlsParams(params: Record<string, string | undefined>) {
  const normalized: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(params)) {
    const lowerKey = key.replace(/_/g, '-').toLowerCase()
    normalized[lowerKey] = value

    switch (lowerKey) {
      case 'allowinsecure':
        normalized['allow-insecure'] = value
        break
      case 'clientfingerprint':
        normalized['client-fingerprint'] = value
        break
      case 'publickey':
        normalized['public-key'] = value
        break
      case 'shortid':
        normalized['short-id'] = value
        break
      case 'servername':
      case 'server-name':
        normalized.servername = value
        break
      default:
        break
    }
  }
  return normalized
}

function hasParam(
  params: Record<string, string | undefined>,
  ...keys: string[]
) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(params, key))
}

function getParam(
  params: Record<string, string | undefined>,
  ...keys: string[]
) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      return params[key]
    }
  }
  return undefined
}

function isUuid(value: string | undefined) {
  return !!value && UUID_RE.test(value.trim())
}

function getVlessUserId(
  authRaw: string | undefined,
  params: Record<string, string | undefined>,
) {
  const auth = safeDecodeURIComponent(authRaw)?.trim() ?? authRaw?.trim()
  if (isUuid(auth)) return auth

  const userId = getParam(
    params,
    'uuid',
    'id',
    'user-id',
    'userid',
    'password',
    'auth',
  )
  return isUuid(userId) ? userId?.trim() : undefined
}

function shouldTreatAsVless(
  params: Record<string, string | undefined>,
  vlessUserId: string | undefined,
) {
  const security = getParam(params, 'security')?.toLowerCase()

  return (
    isUuid(vlessUserId) &&
    (security === 'reality' ||
      hasParam(params, 'pbk', 'sid', 'public-key', 'short-id'))
  )
}

export function URI_AnyTLS(line: string): IProxyConfig {
  const afterScheme = stripUriScheme(line, 'anytls', 'Invalid anytls uri')
  if (!afterScheme) {
    throw new Error('Invalid anytls uri')
  }
  const {
    auth: authRaw,
    host: server,
    port,
    query: addons,
    fragment: nameRaw,
  } = parseUrlLike(afterScheme, {
    errorMessage: 'Invalid anytls uri',
  })
  if (!server) {
    throw new Error('Invalid anytls uri')
  }

  const params = normalizeAnyTlsParams(parseQueryStringNormalized(addons))
  const vlessUserId = getVlessUserId(authRaw, params)

  // Keep anytls:// links as AnyTLS by default. Some exporters append generic
  // VLESS-like keys such as flow/type/security to AnyTLS links; treating those
  // as VLESS makes mihomo enable XTLS Vision and produces
  // "XTLS Vision server responded unknown UUID". Only rewrite links that carry
  // unmistakable VLESS Reality parameters.
  if (shouldTreatAsVless(params, vlessUserId)) {
    if (!vlessUserId) {
      throw new Error(
        'Invalid anytls uri: detected VLESS parameters but user id is not UUID',
      )
    }
    const queryPart = addons ? `?${addons}` : ''
    const fragmentPart = nameRaw ? `#${nameRaw}` : ''
    return URI_VLESS(
      `vless://${encodeURIComponent(vlessUserId)}@${server}:${
        port ?? '443'
      }${queryPart}${fragmentPart}`,
    )
  }

  const portNum = parsePortOrDefault(port, 443)
  const auth = safeDecodeURIComponent(authRaw) ?? authRaw
  const decodedName = decodeAndTrim(nameRaw)
  const name = decodedName ?? `AnyTLS ${server}:${portNum}`
  const proxy: IProxyAnyTLSConfig = {
    type: 'anytls',
    name,
    server,
    port: portNum,
    udp: true,
  }

  if (auth) {
    const [username, password] = splitOnce(auth, ':')
    proxy.password = password ?? username
  }

  proxy.password =
    getIfNotBlank(params.password) ??
    getIfNotBlank(params.auth) ??
    proxy.password

  const sni = params.sni ?? params.servername ?? params.peer
  if (sni) {
    proxy.sni = sni
  }
  if (params.alpn) {
    const alpn = params.alpn
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    if (alpn.length > 0) {
      proxy.alpn = alpn
    }
  }

  const fingerprint = params.fingerprint ?? params.hpkp
  if (fingerprint) {
    proxy.fingerprint = fingerprint
  }
  const clientFingerprint = params['client-fingerprint'] ?? params.fp
  if (clientFingerprint) {
    proxy['client-fingerprint'] = clientFingerprint as ClientFingerprint
  }

  if (Object.prototype.hasOwnProperty.call(params, 'skip-cert-verify')) {
    proxy['skip-cert-verify'] = parseBoolOrPresence(params['skip-cert-verify'])
  } else if (Object.prototype.hasOwnProperty.call(params, 'allow-insecure')) {
    proxy['skip-cert-verify'] = parseBoolOrPresence(params['allow-insecure'])
  } else if (Object.prototype.hasOwnProperty.call(params, 'insecure')) {
    proxy['skip-cert-verify'] = parseBoolOrPresence(params.insecure)
  }

  if (Object.prototype.hasOwnProperty.call(params, 'udp')) {
    proxy.udp = parseBoolOrPresence(params.udp)
  }

  const idleCheck = parseInteger(params['idle-session-check-interval'])
  if (idleCheck !== undefined) {
    proxy['idle-session-check-interval'] = idleCheck
  }
  const idleTimeout = parseInteger(params['idle-session-timeout'])
  if (idleTimeout !== undefined) {
    proxy['idle-session-timeout'] = idleTimeout
  }
  const minIdle = parseInteger(params['min-idle-session'])
  if (minIdle !== undefined) {
    proxy['min-idle-session'] = minIdle
  }

  return proxy
}
