import yaml from 'js-yaml'

export const DEFAULT_RULE_TEMPLATE = `proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - __ALL_PROXIES__
    use:
      - __ALL_PROXY_PROVIDERS__
rules:
  - MATCH,节点选择
`

export const OPEN_SOURCE_RULE_TEMPLATE = `proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - __ALL_PROXIES__
    use:
      - __ALL_PROXY_PROVIDERS__
  - name: 全球直连
    type: select
    proxies:
      - DIRECT
  - name: 全球拦截
    type: select
    proxies:
      - REJECT
rule-providers:
  Reject:
    type: http
    behavior: domain
    format: yaml
    url: https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/reject.txt
    path: ./ruleset/reject.yaml
    interval: 86400
  Direct:
    type: http
    behavior: domain
    format: yaml
    url: https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/direct.txt
    path: ./ruleset/direct.yaml
    interval: 86400
  Proxy:
    type: http
    behavior: domain
    format: yaml
    url: https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/proxy.txt
    path: ./ruleset/proxy.yaml
    interval: 86400
rules:
  - RULE-SET,Reject,全球拦截
  - RULE-SET,Direct,全球直连
  - GEOIP,CN,全球直连,no-resolve
  - RULE-SET,Proxy,节点选择
  - MATCH,节点选择
`

const STANDARD_RULE_PROVIDERS = `rule-providers:
  Reject:
    type: http
    behavior: domain
    format: yaml
    url: https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/reject.txt
    path: ./ruleset/reject.yaml
    interval: 86400
  Direct:
    type: http
    behavior: domain
    format: yaml
    url: https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/direct.txt
    path: ./ruleset/direct.yaml
    interval: 86400
  Proxy:
    type: http
    behavior: domain
    format: yaml
    url: https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/proxy.txt
    path: ./ruleset/proxy.yaml
    interval: 86400`

const STANDARD_SPLIT_RULES = `rules:
  - RULE-SET,Reject,全球拦截
  - RULE-SET,Direct,全球直连
  - GEOIP,CN,全球直连,no-resolve
  - RULE-SET,Proxy,节点选择
  - MATCH,节点选择`

const STANDARD_DIRECT_REJECT_GROUPS = `  - name: 全球直连
    type: select
    proxies:
      - DIRECT
  - name: 全球拦截
    type: select
    proxies:
      - REJECT`

export const STANDARD_MANUAL_RULE_TEMPLATE = `proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - __ALL_PROXIES__
    use:
      - __ALL_PROXY_PROVIDERS__
${STANDARD_DIRECT_REJECT_GROUPS}
${STANDARD_RULE_PROVIDERS}
${STANDARD_SPLIT_RULES}
`

export const STANDARD_MANUAL_AUTO_RULE_TEMPLATE = `proxy-groups:
  - name: 自动选择
    type: url-test
    proxies:
      - __ALL_PROXIES__
    use:
      - __ALL_PROXY_PROVIDERS__
    url: https://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    timeout: 5000
    lazy: false
  - name: 节点选择
    type: select
    proxies:
      - 自动选择
      - __ALL_PROXIES__
    use:
      - __ALL_PROXY_PROVIDERS__
${STANDARD_DIRECT_REJECT_GROUPS}
${STANDARD_RULE_PROVIDERS}
${STANDARD_SPLIT_RULES}
`

export const STANDARD_AUTO_RULE_TEMPLATE = `proxy-groups:
  - name: 节点选择
    type: url-test
    proxies:
      - __ALL_PROXIES__
    use:
      - __ALL_PROXY_PROVIDERS__
    url: https://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
    timeout: 5000
    lazy: false
${STANDARD_DIRECT_REJECT_GROUPS}
${STANDARD_RULE_PROVIDERS}
${STANDARD_SPLIT_RULES}
`

export const STANDARD_FALLBACK_RULE_TEMPLATE = `proxy-groups:
  - name: 节点选择
    type: fallback
    proxies:
      - __ALL_PROXIES__
    use:
      - __ALL_PROXY_PROVIDERS__
    url: https://www.gstatic.com/generate_204
    interval: 300
    timeout: 5000
    lazy: false
${STANDARD_DIRECT_REJECT_GROUPS}
${STANDARD_RULE_PROVIDERS}
${STANDARD_SPLIT_RULES}
`

export const STANDARD_LOAD_BALANCE_RULE_TEMPLATE = `proxy-groups:
  - name: 节点选择
    type: load-balance
    proxies:
      - __ALL_PROXIES__
    use:
      - __ALL_PROXY_PROVIDERS__
    url: https://www.gstatic.com/generate_204
    interval: 300
    timeout: 5000
    strategy: consistent-hashing
    lazy: false
${STANDARD_DIRECT_REJECT_GROUPS}
${STANDARD_RULE_PROVIDERS}
${STANDARD_SPLIT_RULES}
`

export interface RuleTemplatePreset {
  key: string
  label: string
  description: string
  template: string
}

export const RULE_TEMPLATE_PRESETS: RuleTemplatePreset[] = [
  {
    key: 'basic',
    label: '基础模板',
    description: '轻量、兼容性最好',
    template: DEFAULT_RULE_TEMPLATE,
  },
  {
    key: 'opensource',
    label: '开源推荐模板',
    description: 'RULE-SET + GEOIP + MATCH',
    template: OPEN_SOURCE_RULE_TEMPLATE,
  },
  {
    key: 'standard-manual',
    label: '标准分流 - 手动选择',
    description: '广告拦截、国内直连、国外代理；节点由用户手动选择',
    template: STANDARD_MANUAL_RULE_TEMPLATE,
  },
  {
    key: 'standard-manual-auto',
    label: '标准分流 - 手动 + 自动',
    description: 'rules 命中节点选择；节点选择内可手动选节点或切到自动选择',
    template: STANDARD_MANUAL_AUTO_RULE_TEMPLATE,
  },
  {
    key: 'standard-auto',
    label: '标准分流 - 自动测速',
    description: '命中节点选择后自动使用延迟最低节点',
    template: STANDARD_AUTO_RULE_TEMPLATE,
  },
  {
    key: 'standard-fallback',
    label: '标准分流 - 故障转移',
    description: '命中节点选择后优先使用第一个可用节点',
    template: STANDARD_FALLBACK_RULE_TEMPLATE,
  },
  {
    key: 'standard-load-balance',
    label: '标准分流 - 负载均衡',
    description: '命中节点选择后按一致性哈希分摊到多个节点',
    template: STANDARD_LOAD_BALANCE_RULE_TEMPLATE,
  },
]

const DEFAULT_RULE_TARGET = '节点选择'

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const getRuleText = (rule: unknown) =>
  typeof rule === 'string' ? rule.trim() : ''

const splitRule = (rule: unknown) =>
  getRuleText(rule)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const findRuleTarget = (template: Record<string, any>) => {
  const rules = Array.isArray(template.rules) ? template.rules : []

  for (const rule of rules) {
    const parts = splitRule(rule)
    if (parts[0]?.toUpperCase() === 'MATCH' && parts[1]) {
      return parts[1]
    }
  }

  const groups = Array.isArray(template['proxy-groups'])
    ? template['proxy-groups']
    : []
  for (const group of groups) {
    if (group && typeof group === 'object' && typeof group.name === 'string') {
      return group.name
    }
  }

  return DEFAULT_RULE_TARGET
}

type RuleTarget = string

export interface RuleTemplateStrategyOption {
  name: string
  type: 'proxy-group'
  description: string
}

const hasDomainRule = (rules: unknown[], host: string, target: RuleTarget) =>
  rules.some((rule) => {
    const parts = splitRule(rule)

    return (
      parts[0]?.toUpperCase() === 'DOMAIN' &&
      parts[1]?.toLowerCase() === host.toLowerCase() &&
      parts[2] === target
    )
  })

type TemplateRuleType =
  | 'DOMAIN'
  | 'IP-CIDR'
  | 'IP-CIDR6'
  | 'PROCESS-NAME'
  | 'PROCESS-PATH'

const PROCESS_RULE_TYPES: TemplateRuleType[] = ['PROCESS-NAME', 'PROCESS-PATH']

const getTemplateSource = (currentTemplate: string | undefined | null) =>
  currentTemplate?.trim()
    ? normalizeDefaultRuleTemplate(currentTemplate)
    : DEFAULT_RULE_TEMPLATE

const parseDefaultRuleTemplate = (templateSource: string) => {
  const parsed = yaml.load(templateSource)

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('默认规则模板必须是 YAML 对象')
  }

  return parsed as Record<string, any>
}

const getProxyGroupOptions = (
  template: Record<string, any>,
): RuleTemplateStrategyOption[] => {
  const groups = Array.isArray(template['proxy-groups'])
    ? template['proxy-groups']
    : []
  const options: RuleTemplateStrategyOption[] = []

  for (const group of groups) {
    if (!isRecord(group)) continue

    const name = typeof group.name === 'string' ? group.name.trim() : ''
    if (!name) continue

    const groupType =
      typeof group.type === 'string' && group.type.trim()
        ? group.type.trim()
        : 'proxy-group'

    options.push({
      name,
      type: 'proxy-group',
      description: `代理组策略：${groupType}`,
    })
  }

  return options
}

const hasProxyGroup = (template: Record<string, any>, name: string) =>
  getProxyGroupOptions(template).some((group) => group.name === name)

export const getDefaultRuleTemplateStrategyOptions = (
  currentTemplate: string | undefined | null,
) => {
  const templateSource = getTemplateSource(currentTemplate)
  const template = parseDefaultRuleTemplate(templateSource)
  return getProxyGroupOptions(template)
}

const hasTypedRule = (
  rules: unknown[],
  ruleType: TemplateRuleType,
  payload: string,
  target?: RuleTarget,
) =>
  rules.some((rule) => {
    const parts = splitRule(rule)

    return (
      parts[0]?.toUpperCase() === ruleType &&
      parts[1]?.toLowerCase() === payload.toLowerCase() &&
      (!target || parts[2] === target)
    )
  })

const insertRuleBeforeMatch = (rules: unknown[], rule: string) => {
  const nextRules = [...rules]
  const matchIndex = nextRules.findIndex((item) => {
    const parts = splitRule(item)
    return parts[0]?.toUpperCase() === 'MATCH'
  })

  if (matchIndex >= 0) {
    nextRules.splice(matchIndex, 0, rule)
  } else {
    nextRules.push(rule)
  }

  return nextRules
}

const insertProcessRuleAtTop = (
  rules: unknown[],
  rule: string,
  ruleType: TemplateRuleType,
) => {
  const nextRules = [...rules]
  let lastSameTypeIndex = -1

  nextRules.forEach((item, index) => {
    const parts = splitRule(item)
    if (parts[0]?.toUpperCase() === ruleType) {
      lastSameTypeIndex = index
    }
  })

  nextRules.splice(lastSameTypeIndex + 1, 0, rule)

  return nextRules
}

const insertTypedRule = (
  rules: unknown[],
  rule: string,
  ruleType: TemplateRuleType,
) =>
  PROCESS_RULE_TYPES.includes(ruleType)
    ? insertProcessRuleAtTop(rules, rule, ruleType)
    : insertRuleBeforeMatch(rules, rule)

export const dumpDefaultRuleTemplate = (template: Record<string, any>) =>
  yaml.dump(template, {
    lineWidth: -1,
    noRefs: true,
  })

export const normalizeDefaultRuleTemplate = (templateSource: string) => {
  try {
    const parsed = yaml.load(templateSource)
    if (!isRecord(parsed)) return templateSource

    let changed = false
    const groups = Array.isArray(parsed['proxy-groups'])
      ? parsed['proxy-groups']
      : []

    groups.forEach((group) => {
      if (!isRecord(group) || group.name !== DEFAULT_RULE_TARGET) return
      if (!Array.isArray(group.proxies)) return

      const nextProxies = group.proxies.filter((proxy) => proxy !== 'DIRECT')
      if (nextProxies.length !== group.proxies.length) {
        group.proxies = nextProxies
        changed = true
      }
    })

    const providers = isRecord(parsed['rule-providers'])
      ? parsed['rule-providers']
      : {}

    Object.values(providers).forEach((provider) => {
      if (!isRecord(provider)) return

      const url = String(provider.url || '').toLowerCase()
      const format = String(provider.format || '').toLowerCase()
      if (format === 'text' && url.includes('loyalsoldier/clash-rules')) {
        provider.format = 'yaml'
        changed = true
      }
    })

    const rules = Array.isArray(parsed.rules) ? parsed.rules : []
    parsed.rules = rules.map((rule) => {
      const ruleText = getRuleText(rule)
      const parts = splitRule(ruleText)
      if (parts[0]?.toUpperCase() === 'GEOIP' && parts.length === 3) {
        changed = true
        return `${ruleText},no-resolve`
      }

      return rule
    })

    return changed ? dumpDefaultRuleTemplate(parsed) : templateSource
  } catch {
    return templateSource
  }
}

export const addRuleToDefaultRuleTemplate = (
  currentTemplate: string | undefined | null,
  ruleType: TemplateRuleType,
  payload: string,
  target?: RuleTarget,
) => {
  const value = payload.trim()

  if (!value) {
    throw new Error('规则内容不能为空')
  }

  if (value.includes(',')) {
    throw new Error('规则内容不能包含英文逗号')
  }

  const templateSource = getTemplateSource(currentTemplate)
  const template = parseDefaultRuleTemplate(templateSource)
  const rules = Array.isArray(template.rules) ? [...template.rules] : []
  const ruleTarget = target?.trim() || findRuleTarget(template)
  const rule = `${ruleType},${value},${ruleTarget}`

  if (!hasProxyGroup(template, ruleTarget)) {
    throw new Error(`当前规则模板中不存在策略 ${ruleTarget}`)
  }

  if (hasTypedRule(rules, ruleType, value, ruleTarget)) {
    return {
      added: false,
      template: templateSource,
      rule,
      target: ruleTarget,
    }
  }

  template.rules = insertTypedRule(rules, rule, ruleType)

  return {
    added: true,
    template: dumpDefaultRuleTemplate(template),
    rule,
    target: ruleTarget,
  }
}

export const addHostToDefaultRuleTemplate = (
  currentTemplate: string | undefined | null,
  host: string,
  target: RuleTarget = '节点选择',
) => {
  const templateSource = getTemplateSource(currentTemplate)
  const template = parseDefaultRuleTemplate(templateSource)
  const rules = Array.isArray(template.rules) ? [...template.rules] : []
  const rule = `DOMAIN,${host},${target}`

  if (!hasProxyGroup(template, target)) {
    throw new Error(`当前规则模板中不存在策略 ${target}`)
  }

  if (hasDomainRule(rules, host, target)) {
    return {
      added: false,
      template: templateSource,
      rule,
      target,
    }
  }

  template.rules = insertRuleBeforeMatch(rules, rule)

  return {
    added: true,
    template: dumpDefaultRuleTemplate(template),
    rule,
    target,
  }
}
