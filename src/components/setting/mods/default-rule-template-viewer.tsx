import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import yaml from 'js-yaml'
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DialogRef } from '@/components/base'
import { EditorViewer } from '@/components/profile/editor-viewer'
import { useVerge } from '@/hooks/use-app-config'
import { enhanceProfiles } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import {
  DEFAULT_RULE_TEMPLATE,
  RULE_TEMPLATE_PRESETS,
  dumpDefaultRuleTemplate,
  normalizeDefaultRuleTemplate,
} from '@/utils/default-rule-template'

const CUSTOM_TEMPLATE_PREFIX = 'custom:'
const BUILTIN_TEMPLATE_PREFIX = 'builtin:'
const SAVED_TEMPLATE_KEY = 'saved:current'

const getCustomTemplateKey = (id: string) => `${CUSTOM_TEMPLATE_PREFIX}${id}`

const getCustomTemplateId = (key: string) =>
  key.startsWith(CUSTOM_TEMPLATE_PREFIX)
    ? key.slice(CUSTOM_TEMPLATE_PREFIX.length)
    : ''

const getBuiltinTemplateKey = (key: string) =>
  key.startsWith(BUILTIN_TEMPLATE_PREFIX)
    ? key.slice(BUILTIN_TEMPLATE_PREFIX.length)
    : ''

const generateTemplateId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `rule-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const normalizeTemplateValue = (value: string) =>
  value.trim().replace(/\r\n/g, '\n')

const normalizeTemplateForCompare = (value: string) => {
  try {
    const parsed = yaml.load(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return normalizeTemplateValue(value)
    }

    return normalizeTemplateValue(dumpDefaultRuleTemplate(parsed))
  } catch {
    return normalizeTemplateValue(value)
  }
}

const validateTemplateValue = (source: string) => {
  const parsed = yaml.load(source)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('模板必须是 YAML 对象')
  }
}

const findTemplateKeyByTemplate = (
  value: string,
  customTemplates: IRuleTemplateItem[],
) => {
  const normalizedValue = normalizeTemplateForCompare(value)

  const builtIn = RULE_TEMPLATE_PRESETS.find(
    (item) => normalizeTemplateForCompare(item.template) === normalizedValue,
  )
  if (builtIn) return `${BUILTIN_TEMPLATE_PREFIX}${builtIn.key}`

  const custom = customTemplates.find(
    (item) => normalizeTemplateForCompare(item.template) === normalizedValue,
  )
  if (custom) return getCustomTemplateKey(custom.id)

  return SAVED_TEMPLATE_KEY
}

const getBuiltinTemplateByKey = (key: string) =>
  RULE_TEMPLATE_PRESETS.find((item) => item.key === getBuiltinTemplateKey(key))

const getCustomTemplateByKey = (
  key: string,
  customTemplates: IRuleTemplateItem[],
) => customTemplates.find((item) => item.id === getCustomTemplateId(key))

const getTemplateValueByKey = (
  key: string | undefined,
  customTemplates: IRuleTemplateItem[],
) => {
  if (!key || key === SAVED_TEMPLATE_KEY) return ''

  const builtin = getBuiltinTemplateByKey(key)
  if (builtin) return builtin.template

  const custom = getCustomTemplateByKey(key, customTemplates)
  if (custom) return custom.template

  return ''
}

const resolveSavedTemplateKey = (
  value: string,
  savedKey: string | undefined,
  customTemplates: IRuleTemplateItem[],
) => {
  if (savedKey === SAVED_TEMPLATE_KEY) return SAVED_TEMPLATE_KEY

  const template = getTemplateValueByKey(savedKey, customTemplates)
  if (
    template &&
    normalizeTemplateForCompare(template) === normalizeTemplateForCompare(value)
  ) {
    return savedKey!
  }

  return findTemplateKeyByTemplate(value, customTemplates)
}

const buildInitialCreateValue = (value: string) =>
  value.trim() ? value : DEFAULT_RULE_TEMPLATE

export const DefaultRuleTemplateViewer = forwardRef<DialogRef>((_, ref) => {
  const { t } = useTranslation()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(DEFAULT_RULE_TEMPLATE)
  const [dirty, setDirty] = useState(false)
  const [hasYamlError, setHasYamlError] = useState(false)
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(
    `${BUILTIN_TEMPLATE_PREFIX}${RULE_TEMPLATE_PRESETS[0]?.key || 'basic'}`,
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createValue, setCreateValue] = useState(DEFAULT_RULE_TEMPLATE)
  const [createYamlError, setCreateYamlError] = useState(false)
  const [hasSelectedTemplate, setHasSelectedTemplate] = useState(false)

  const customTemplates = useMemo(
    () =>
      (verge?.rule_template_items ?? [])
        .filter((item) => item?.id && item.name && item.template)
        .map((item) => ({
          ...item,
          description: item.description || '',
        })),
    [verge?.rule_template_items],
  )

  const savedValue = useMemo(
    () =>
      verge?.default_rule_template
        ? normalizeDefaultRuleTemplate(verge.default_rule_template)
        : DEFAULT_RULE_TEMPLATE,
    [verge?.default_rule_template],
  )
  const currentBuiltinTemplate = useMemo(
    () => getBuiltinTemplateByKey(selectedTemplateKey),
    [selectedTemplateKey],
  )
  const currentCustomTemplate = useMemo(
    () => getCustomTemplateByKey(selectedTemplateKey, customTemplates),
    [customTemplates, selectedTemplateKey],
  )
  const isBuiltinTemplate = Boolean(currentBuiltinTemplate)
  const isCustomTemplate = Boolean(currentCustomTemplate)
  const isSavedCustomTemplate = selectedTemplateKey === SAVED_TEMPLATE_KEY
  const selectedDescription =
    currentBuiltinTemplate?.description ||
    currentCustomTemplate?.description ||
    (isSavedCustomTemplate
      ? '当前已保存的自定义模板，可直接编辑；选择内置模板后点击保存即可应用'
      : '') ||
    '选择一个模板后可预览，点击保存会设为当前启用模板'

  useImperativeHandle(ref, () => ({
    open: () => {
      const key = resolveSavedTemplateKey(
        savedValue,
        verge?.default_rule_template_key,
        customTemplates,
      )
      setValue(savedValue)
      setDirty(false)
      setHasYamlError(false)
      setHasSelectedTemplate(false)
      setSelectedTemplateKey(key)
      setOpen(true)
    },
    close: () => setOpen(false),
  }))

  const applyTemplate = (templateKey: string) => {
    const builtin = getBuiltinTemplateByKey(templateKey)
    const custom = getCustomTemplateByKey(templateKey, customTemplates)
    const template =
      templateKey === SAVED_TEMPLATE_KEY
        ? savedValue
        : builtin?.template || custom?.template
    if (!template) return

    setSelectedTemplateKey(templateKey)
    setValue(template)
    setDirty(
      normalizeTemplateForCompare(template) !==
        normalizeTemplateForCompare(savedValue),
    )
    setHasSelectedTemplate(templateKey !== SAVED_TEMPLATE_KEY)
    setHasYamlError(false)
  }

  const getValueForSave = () => {
    const builtin = getBuiltinTemplateByKey(selectedTemplateKey)
    if (builtin) return builtin.template

    return value
  }

  const restoreSavedValue = () => {
    const key = resolveSavedTemplateKey(
      savedValue,
      verge?.default_rule_template_key,
      customTemplates,
    )
    setValue(savedValue)
    setDirty(false)
    setHasYamlError(false)
    setHasSelectedTemplate(false)
    setSelectedTemplateKey(key)
  }

  const handleSave = async () => {
    try {
      const nextValue = getValueForSave()
      const nextTemplateKey =
        selectedTemplateKey === SAVED_TEMPLATE_KEY
          ? findTemplateKeyByTemplate(nextValue, customTemplates)
          : selectedTemplateKey

      validateTemplateValue(nextValue)
      await patchVerge({
        default_rule_template: nextValue,
        default_rule_template_key: nextTemplateKey,
      })
      mutateVerge((prev) =>
        prev
          ? {
              ...prev,
              default_rule_template: nextValue,
              default_rule_template_key: nextTemplateKey,
            }
          : prev,
      )

      const applied = await enhanceProfiles().catch((error) => {
        showNotice.error('规则模板已保存，但重新应用运行配置失败', error)
        return false
      })
      if (applied) {
        showNotice.success('规则模板已保存并应用')
      } else {
        showNotice.info('规则模板已保存，但重新应用运行配置未通过')
      }
      setDirty(false)
      setHasSelectedTemplate(false)
      setValue(nextValue)
      setSelectedTemplateKey(nextTemplateKey)
    } catch (error) {
      showNotice.error(error)
      throw error
    }
  }

  const patchCustomTemplates = async (
    nextItems: IRuleTemplateItem[],
    message: string,
  ) => {
    await patchVerge({ rule_template_items: nextItems })
    mutateVerge((prev) =>
      prev ? { ...prev, rule_template_items: nextItems } : prev,
    )
    showNotice.success(message)
  }

  const openCreateDialog = () => {
    setCreateName('')
    setCreateDescription('')
    setCreateValue(buildInitialCreateValue(value))
    setCreateYamlError(false)
    setCreateOpen(true)
  }

  const createTemplate = async () => {
    try {
      validateTemplateValue(createValue)
      const name = createName.trim()
      if (!name) {
        showNotice.error('模板名称不能为空')
        return
      }

      const nextItem: IRuleTemplateItem = {
        id: generateTemplateId(),
        name,
        description: createDescription.trim(),
        template: createValue,
        updated_at: new Date().toISOString(),
      }
      const nextItems = [...customTemplates, nextItem]

      await patchCustomTemplates(nextItems, `已新增模板：${name}`)
      const key = getCustomTemplateKey(nextItem.id)
      setSelectedTemplateKey(key)
      setValue(createValue)
      setDirty(
        normalizeTemplateForCompare(createValue) !==
          normalizeTemplateForCompare(savedValue),
      )
      setHasSelectedTemplate(true)
      setHasYamlError(false)
      setCreateOpen(false)
    } catch (error) {
      showNotice.error(error)
    }
  }

  const updateTemplate = async () => {
    if (!currentCustomTemplate) return

    try {
      validateTemplateValue(value)
      const nextItems = customTemplates.map((item) =>
        item.id === currentCustomTemplate.id
          ? {
              ...item,
              template: value,
              updated_at: new Date().toISOString(),
            }
          : item,
      )

      await patchCustomTemplates(
        nextItems,
        `已更新模板：${currentCustomTemplate.name}`,
      )
    } catch (error) {
      showNotice.error(error)
    }
  }

  const deleteTemplate = async () => {
    if (!currentCustomTemplate) return

    if (!window.confirm(`确定删除模板「${currentCustomTemplate.name}」吗？`)) {
      return
    }

    const nextItems = customTemplates.filter(
      (item) => item.id !== currentCustomTemplate.id,
    )
    await patchCustomTemplates(
      nextItems,
      `已删除模板：${currentCustomTemplate.name}`,
    )

    const key = findTemplateKeyByTemplate(savedValue, nextItems)
    setSelectedTemplateKey(key)
    setValue(savedValue)
    setDirty(false)
    setHasYamlError(false)
    setHasSelectedTemplate(false)
  }

  if (!open) return null

  return (
    <>
      <EditorViewer
        open={open}
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {t('settings.components.app.advanced.fields.defaultRuleTemplate')}
            <Chip
              label={isBuiltinTemplate ? '内置只读' : 'YAML'}
              size="small"
            />
          </Box>
        }
        toolbar={
          <Box
            sx={{
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
                flex: 1,
                minWidth: 0,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                模板
              </Typography>
              <FormControl size="small" sx={{ minWidth: 260 }}>
                <Select
                  value={selectedTemplateKey}
                  onChange={(event) => applyTemplate(event.target.value)}
                  MenuProps={{
                    disablePortal: false,
                    slotProps: {
                      paper: {
                        sx: {
                          width: 'auto !important',
                          minWidth: 260,
                          maxWidth: 420,
                        },
                      },
                    },
                  }}
                >
                  {isSavedCustomTemplate && (
                    <MenuItem value={SAVED_TEMPLATE_KEY}>
                      当前已保存模板
                    </MenuItem>
                  )}
                  <MenuItem disabled>内置模板（只读）</MenuItem>
                  {RULE_TEMPLATE_PRESETS.map((item) => (
                    <MenuItem
                      key={item.key}
                      value={`${BUILTIN_TEMPLATE_PREFIX}${item.key}`}
                    >
                      {item.label}
                    </MenuItem>
                  ))}
                  {customTemplates.length > 0 && (
                    <MenuItem disabled>自定义模板</MenuItem>
                  )}
                  {customTemplates.map((item) => (
                    <MenuItem
                      key={item.id}
                      value={getCustomTemplateKey(item.id)}
                    >
                      {item.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                size="small"
                variant="outlined"
                onClick={openCreateDialog}
              >
                新增模板
              </Button>
              <Tooltip title="更新当前选中的自定义模板内容">
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!isCustomTemplate}
                    onClick={() => {
                      void updateTemplate()
                    }}
                  >
                    更新模板
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="删除当前选中的自定义模板">
                <span>
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    disabled={!isCustomTemplate}
                    onClick={() => {
                      void deleteTemplate()
                    }}
                  >
                    删除模板
                  </Button>
                </span>
              </Tooltip>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ flexBasis: '100%' }}
              >
                {selectedDescription}
              </Typography>
            </Box>

            <Button size="small" variant="outlined" onClick={restoreSavedValue}>
              恢复已保存
            </Button>
          </Box>
        }
        value={value}
        language="yaml"
        path="default-rule-template.yaml"
        readOnly={isBuiltinTemplate}
        allowSaveWhenReadOnly
        dirty={dirty || hasSelectedTemplate}
        saveDisabled={hasYamlError}
        onChange={(nextValue) => {
          if (isBuiltinTemplate) return
          setValue(nextValue)
          setDirty(
            normalizeTemplateForCompare(nextValue) !==
              normalizeTemplateForCompare(savedValue),
          )
          setHasSelectedTemplate(false)
        }}
        onValidate={(markers) => setHasYamlError(markers.length > 0)}
        onSave={handleSave}
        onClose={() => setOpen(false)}
      />
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>新增规则模板</DialogTitle>
        <DialogContent
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            pt: 1,
          }}
        >
          <TextField
            autoFocus
            size="small"
            label="模板名称"
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
          />
          <TextField
            size="small"
            label="描述"
            value={createDescription}
            onChange={(event) => setCreateDescription(event.target.value)}
          />
          <TextField
            label="模板内容"
            value={createValue}
            onChange={(event) => {
              setCreateValue(event.target.value)
              try {
                validateTemplateValue(event.target.value)
                setCreateYamlError(false)
              } catch {
                setCreateYamlError(true)
              }
            }}
            minRows={16}
            maxRows={24}
            multiline
            error={createYamlError}
            helperText={
              createYamlError
                ? '模板内容必须是有效 YAML 对象'
                : '支持 __ALL_PROXIES__ 和 __ALL_PROXY_PROVIDERS__ 占位符'
            }
            sx={{
              '& textarea': {
                fontFamily:
                  'Fira Code, JetBrains Mono, Consolas, Menlo, Monaco, monospace',
                fontSize: 12,
              },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} variant="outlined">
            取消
          </Button>
          <Button
            variant="contained"
            disabled={createYamlError || !createName.trim()}
            onClick={() => {
              void createTemplate()
            }}
          >
            新增
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
})
