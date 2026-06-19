import {
  AutoAwesomeRounded,
  CheckCircleRounded,
  EditRounded,
  PaletteRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  Stack,
  styled,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, type DialogRef } from '@/components/base'
import { EditorViewer } from '@/components/profile/editor-viewer'
import { useVerge } from '@/hooks/use-app-config'
import { defaultDarkTheme, defaultTheme } from '@/pages/_theme'
import { showNotice } from '@/services/notice-service'

import {
  defaultThemePreset,
  type ThemePreset,
  themePresets,
} from './theme-presets'

type ThemeSetting = NonNullable<IVergeConfig['theme_setting']>

export function ThemeViewer(props: { ref?: React.Ref<DialogRef> }) {
  const { ref } = props
  const { t } = useTranslation()

  const [open, setOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [cssEditorValue, setCssEditorValue] = useState('')
  const [cssEditorSavedValue, setCssEditorSavedValue] = useState('')
  const { verge, patchVerge } = useVerge()
  const { theme_preset, theme_setting } = verge ?? {}
  const getEffectiveThemeSetting = (
    presetId: string | undefined,
    setting: ThemeSetting | undefined,
  ): ThemeSetting =>
    presetId === defaultThemePreset.id ? {} : { ...(setting || {}) }
  const [theme, setTheme] = useState<ThemeSetting>(() =>
    getEffectiveThemeSetting(theme_preset, theme_setting),
  )
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    theme_preset || defaultThemePreset.id,
  )
  // Latest theme ref to avoid stale closures when saving CSS
  const themeRef = useRef(theme)
  const selectedPresetIdRef = useRef(selectedPresetId)
  useEffect(() => {
    themeRef.current = theme
  }, [theme])
  useEffect(() => {
    selectedPresetIdRef.current = selectedPresetId
  }, [selectedPresetId])

  useImperativeHandle(ref, () => ({
    open: () => {
      setOpen(true)
      const nextTheme = getEffectiveThemeSetting(theme_preset, theme_setting)
      syncThemeState(nextTheme)
      syncSelectedPresetId(inferPresetId(theme_preset, nextTheme))
    },
    close: () => setOpen(false),
  }))

  const textProps = {
    size: 'small',
    autoComplete: 'off',
    sx: { width: 135 },
  } as const

  const syncThemeState = (nextTheme: typeof theme) => {
    themeRef.current = nextTheme
    setTheme(nextTheme)
  }

  const syncSelectedPresetId = (presetId: string) => {
    selectedPresetIdRef.current = presetId
    setSelectedPresetId(presetId)
  }

  const handleChange =
    (field: keyof typeof theme) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      syncThemeState({ ...themeRef.current, [field]: e.target.value })
      syncSelectedPresetId('custom')
    }

  const isEmptyTheme = (value: ThemeSetting) =>
    Object.values(value).every(
      (item) => item === undefined || item === null || item === '',
    )

  const normalizeThemeForSave = (value: ThemeSetting): ThemeSetting => {
    const normalized = Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [
          key,
          typeof item === 'string' ? item.trim() : item,
        ])
        .filter(
          ([, item]) => item !== undefined && item !== null && item !== '',
        ),
    ) as ThemeSetting

    return isEmptyTheme(normalized) ? {} : normalized
  }

  const isPresetThemeMatch = (preset: ThemePreset, value: ThemeSetting) =>
    Object.entries(preset.theme).every(([key, presetValue]) => {
      const themeKey = key as keyof ThemeSetting
      return value[themeKey] === presetValue
    })

  const inferPresetId = (presetId: string | undefined, value: ThemeSetting) => {
    if (presetId) {
      return presetId
    }

    if (isEmptyTheme(value)) {
      return defaultThemePreset.id
    }

    return (
      themePresets.find(
        (preset) =>
          preset.id !== defaultThemePreset.id &&
          isPresetThemeMatch(preset, value),
      )?.id || 'custom'
    )
  }

  const onSave = useLockFn(async () => {
    try {
      const nextTheme = normalizeThemeForSave(themeRef.current)
      const nextPresetId = isEmptyTheme(nextTheme)
        ? defaultThemePreset.id
        : selectedPresetIdRef.current === defaultThemePreset.id
          ? 'custom'
          : selectedPresetIdRef.current
      syncThemeState(nextTheme)
      syncSelectedPresetId(nextPresetId)
      await patchVerge({
        theme_preset: nextPresetId,
        theme_setting: nextTheme,
      })
      setOpen(false)
    } catch (err) {
      showNotice.error(err)
    }
  })

  const { palette } = useTheme()

  const dt = palette.mode === 'light' ? defaultTheme : defaultDarkTheme

  type ThemeKey = keyof typeof theme & keyof typeof defaultTheme

  const fieldDefinitions: Array<{ labelKey: string; key: ThemeKey }> = useMemo(
    () => [
      {
        labelKey: 'settings.components.app.theme.fields.primaryColor',
        key: 'primary_color',
      },
      {
        labelKey: 'settings.components.app.theme.fields.secondaryColor',
        key: 'secondary_color',
      },
      {
        labelKey: 'settings.components.app.theme.fields.primaryText',
        key: 'primary_text',
      },
      {
        labelKey: 'settings.components.app.theme.fields.secondaryText',
        key: 'secondary_text',
      },
      {
        labelKey: 'settings.components.app.theme.fields.infoColor',
        key: 'info_color',
      },
      {
        labelKey: 'settings.components.app.theme.fields.warningColor',
        key: 'warning_color',
      },
      {
        labelKey: 'settings.components.app.theme.fields.errorColor',
        key: 'error_color',
      },
      {
        labelKey: 'settings.components.app.theme.fields.successColor',
        key: 'success_color',
      },
    ],
    [],
  )

  const openCssEditor = () => {
    const nextCss = themeRef.current?.css_injection ?? ''
    setCssEditorValue(nextCss)
    setCssEditorSavedValue(nextCss)
    setEditorOpen(true)
  }

  const applyPreset = (preset: ThemePreset) => {
    const nextTheme = { ...preset.theme }
    syncThemeState(nextTheme)
    syncSelectedPresetId(preset.id)
    setCssEditorValue(nextTheme.css_injection ?? '')
    setCssEditorSavedValue(nextTheme.css_injection ?? '')
  }

  const handleSaveCss = useLockFn(async () => {
    const prevTheme = themeRef.current || {}
    syncThemeState({ ...prevTheme, css_injection: cssEditorValue })
    syncSelectedPresetId('custom')
    setCssEditorSavedValue(cssEditorValue)
  })

  const isPresetActive = (preset: ThemePreset) => {
    return selectedPresetId === preset.id
  }

  const renderPresetCard = (preset: ThemePreset) => {
    const active = isPresetActive(preset)
    return (
      <PresetCard
        key={preset.id}
        type="button"
        data-active={active ? 'true' : 'false'}
        onClick={() => applyPreset(preset)}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {preset.id === defaultThemePreset.id ? (
              <PaletteRounded fontSize="small" />
            ) : (
              <AutoAwesomeRounded fontSize="small" />
            )}
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {preset.name}
            </Typography>
            {active && (
              <CheckCircleRounded
                color="primary"
                fontSize="small"
                sx={{ ml: 'auto !important' }}
              />
            )}
          </Stack>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 0.75, lineHeight: 1.45 }}
          >
            {preset.description}
          </Typography>

          <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap' }}>
            {preset.tags.map((tag) => (
              <Chip key={tag} label={tag} size="small" />
            ))}
          </Stack>
        </Box>

        <Stack direction="row" spacing={0.5}>
          {preset.colors.map((color) => (
            <ColorDot key={color} sx={{ background: color }} />
          ))}
        </Stack>
      </PresetCard>
    )
  }

  const renderItem = (labelKey: string, key: ThemeKey) => {
    const label = t(labelKey)
    return (
      <Item key={key}>
        <ListItemText primary={label} />
        <Round sx={{ background: theme[key] || dt[key] }} />
        <TextField
          {...textProps}
          value={theme[key] ?? ''}
          placeholder={dt[key]}
          onChange={handleChange(key)}
          onKeyDown={(e) => e.key === 'Enter' && onSave()}
        />
      </Item>
    )
  }

  return (
    <BaseDialog
      open={open}
      title={t('settings.components.app.theme.title')}
      okBtn={t('shared.actions.save')}
      cancelBtn={t('shared.actions.cancel')}
      contentSx={{ width: 560, maxHeight: 650, overflow: 'auto', pb: 0 }}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      onOk={onSave}
    >
      <List sx={{ pt: 0 }}>
        <Item sx={{ alignItems: 'flex-start' }}>
          <Stack spacing={1.5} sx={{ width: '100%' }}>
            <ListItemText
              primary="主题预设"
              secondary="主题只修改界面外观，不改变代理、节点、订阅等功能逻辑；点击主题卡片后需要保存才会正式生效。"
            />

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
                gap: 1,
              }}
            >
              {themePresets.map(renderPresetCard)}
            </Box>

            <Typography variant="caption" color="text.secondary">
              默认主题会清空当前自定义主题，恢复 Clash Ultra 原生视觉。
            </Typography>
          </Stack>
        </Item>

        {fieldDefinitions.map((field) => renderItem(field.labelKey, field.key))}

        <Item>
          <ListItemText
            primary={t('settings.components.app.theme.fields.fontFamily')}
          />
          <TextField
            {...textProps}
            value={theme.font_family ?? ''}
            onChange={handleChange('font_family')}
            onKeyDown={(e) => e.key === 'Enter' && onSave()}
          />
        </Item>
        <Item>
          <ListItemText
            primary={t('settings.components.app.theme.fields.cssInjection')}
          />
          <Button
            startIcon={<EditRounded />}
            variant="outlined"
            onClick={openCssEditor}
          >
            {t('settings.components.app.theme.actions.editCss')}
          </Button>
          {editorOpen && (
            <EditorViewer
              open={true}
              title={t('settings.components.app.theme.dialogs.editCssTitle')}
              value={cssEditorValue}
              language="css"
              path="theme-css.css"
              dirty={cssEditorValue !== cssEditorSavedValue}
              onChange={setCssEditorValue}
              onSave={handleSaveCss}
              onClose={() => {
                setEditorOpen(false)
              }}
            />
          )}
        </Item>
      </List>
    </BaseDialog>
  )
}

const Item = styled(ListItem)(() => ({
  padding: '5px 2px',
}))

const Round = styled('div')(() => ({
  width: '24px',
  height: '24px',
  borderRadius: '18px',
  display: 'inline-block',
  marginRight: '8px',
}))

const PresetCard = styled('button')(({ theme }) => ({
  width: '100%',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 14px',
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 14,
  color: theme.palette.text.primary,
  background:
    theme.palette.mode === 'light'
      ? 'rgba(255,255,255,0.74)'
      : 'rgba(255,255,255,0.06)',
  cursor: 'pointer',
  textAlign: 'left',
  transition:
    'border-color 160ms ease, background-color 160ms ease, transform 160ms ease',
  '&:hover': {
    transform: 'translateY(-1px)',
    borderColor: theme.palette.primary.main,
    background:
      theme.palette.mode === 'light'
        ? 'rgba(255,255,255,0.94)'
        : 'rgba(255,255,255,0.1)',
  },
  '&[data-active="true"]': {
    borderColor: theme.palette.primary.main,
    background:
      theme.palette.mode === 'light'
        ? 'rgba(0,122,255,0.08)'
        : 'rgba(10,132,255,0.18)',
  },
}))

const ColorDot = styled('span')(() => ({
  width: 16,
  height: 16,
  flex: '0 0 auto',
  borderRadius: 999,
  border: '1px solid rgba(0,0,0,0.16)',
}))
