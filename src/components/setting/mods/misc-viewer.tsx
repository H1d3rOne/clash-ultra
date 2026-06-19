import {
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  TextField,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { forwardRef, useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseDialog, DialogRef, Switch, TooltipIcon } from '@/components/base'
import { useVerge } from '@/hooks/use-app-config'
import { showNotice } from '@/services/notice-service'
import speedManager, {
  DEFAULT_SPEED_TEST_CONCURRENCY,
  DEFAULT_SPEED_TEST_TIMEOUT,
} from '@/services/speed'

const SPEED_TEST_PRESETS = {
  recommended: [
    'https://speed.cloudflare.com/__down?bytes=50000000',
    'https://cachefly.cachefly.net/20mb.test',
    'https://proof.ovh.net/files/10Mb.dat',
  ].join('\n'),
  cloudflare: 'https://speed.cloudflare.com/__down?bytes=50000000',
  cachefly: 'https://cachefly.cachefly.net/20mb.test',
  ovh: 'https://proof.ovh.net/files/10Mb.dat',
} as const

type SpeedTestPresetKey = keyof typeof SPEED_TEST_PRESETS | 'custom'

const normalizeSpeedTestValue = (value: string) =>
  value
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n')

const getSpeedTestPresetValue = (value: string): SpeedTestPresetKey => {
  const normalized = normalizeSpeedTestValue(value)
  if (!normalized) return 'custom'

  const matched = Object.entries(SPEED_TEST_PRESETS).find(
    ([, presetValue]) => normalizeSpeedTestValue(presetValue) === normalized,
  )

  return (
    (matched?.[0] as keyof typeof SPEED_TEST_PRESETS | undefined) ?? 'custom'
  )
}

export const MiscViewer = forwardRef<DialogRef>((props, ref) => {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()

  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({
    appLogLevel: 'warn',
    appLogMaxSize: 8,
    appLogMaxCount: 12,
    autoCloseConnection: true,
    autoCheckUpdate: true,
    enableBuiltinEnhanced: true,
    proxyLayoutColumn: 6,
    enableAutoDelayDetection: false,
    autoDelayDetectionIntervalMinutes: 5,
    defaultLatencyTest: '',
    defaultSpeedTest: '',
    defaultSpeedTestConcurrency: DEFAULT_SPEED_TEST_CONCURRENCY,
    defaultSpeedTestTimeout: DEFAULT_SPEED_TEST_TIMEOUT,
    autoLogClean: 2,
    defaultLatencyTimeout: 10000,
  })

  useImperativeHandle(ref, () => ({
    open: () => {
      setOpen(true)
      setValues({
        appLogLevel: verge?.app_log_level ?? 'warn',
        appLogMaxSize: verge?.app_log_max_size ?? 128,
        appLogMaxCount: verge?.app_log_max_count ?? 8,
        autoCloseConnection: verge?.auto_close_connection ?? true,
        autoCheckUpdate: verge?.auto_check_update ?? true,
        enableBuiltinEnhanced: verge?.enable_builtin_enhanced ?? true,
        proxyLayoutColumn: verge?.proxy_layout_column || 6,
        enableAutoDelayDetection: verge?.enable_auto_delay_detection ?? false,
        autoDelayDetectionIntervalMinutes:
          verge?.auto_delay_detection_interval_minutes ?? 5,
        defaultLatencyTest: verge?.default_latency_test || '',
        defaultSpeedTest: verge?.default_speed_test || '',
        defaultSpeedTestConcurrency: speedManager.normalizeConcurrency(
          verge?.default_speed_test_concurrency,
        ),
        defaultSpeedTestTimeout: speedManager.normalizeTimeout(
          verge?.default_speed_test_timeout,
        ),
        autoLogClean: verge?.auto_log_clean || 0,
        defaultLatencyTimeout: verge?.default_latency_timeout || 10000,
      })
    },
    close: () => setOpen(false),
  }))

  const onSave = useLockFn(async () => {
    try {
      await patchVerge({
        app_log_level: values.appLogLevel,
        app_log_max_size: values.appLogMaxSize,
        app_log_max_count: values.appLogMaxCount,
        auto_close_connection: values.autoCloseConnection,
        auto_check_update: values.autoCheckUpdate,
        enable_builtin_enhanced: values.enableBuiltinEnhanced,
        proxy_layout_column: values.proxyLayoutColumn,
        enable_auto_delay_detection: values.enableAutoDelayDetection,
        auto_delay_detection_interval_minutes:
          values.autoDelayDetectionIntervalMinutes,
        default_latency_test: values.defaultLatencyTest,
        default_speed_test: values.defaultSpeedTest.trim(),
        default_speed_test_concurrency: speedManager.normalizeConcurrency(
          values.defaultSpeedTestConcurrency,
        ),
        default_speed_test_timeout: speedManager.normalizeTimeout(
          values.defaultSpeedTestTimeout,
        ),
        default_latency_timeout: values.defaultLatencyTimeout,
        auto_log_clean: values.autoLogClean as any,
      })
      setOpen(false)
    } catch (err) {
      showNotice.error(err)
    }
  })

  const speedTestPresetValue = getSpeedTestPresetValue(values.defaultSpeedTest)

  return (
    <BaseDialog
      open={open}
      title={t('settings.modals.misc.title')}
      contentSx={{ width: 450 }}
      okBtn={t('shared.actions.save')}
      cancelBtn={t('shared.actions.cancel')}
      onClose={() => setOpen(false)}
      onCancel={() => setOpen(false)}
      onOk={onSave}
    >
      <List>
        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.appLogLevel')}
          />
          <Select
            size="small"
            sx={{ width: 100, '> div': { py: '7.5px' } }}
            value={values.appLogLevel}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                appLogLevel: e.target.value as string,
              }))
            }
          >
            {['trace', 'debug', 'info', 'warn', 'error', 'silent'].map((i) => (
              <MenuItem value={i} key={i}>
                {i[0].toUpperCase() + i.slice(1).toLowerCase()}
              </MenuItem>
            ))}
          </Select>
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.appLogMaxSize')}
            sx={{ maxWidth: 'fit-content' }}
          />
          <TextField
            autoComplete="new-password"
            size="small"
            type="number"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            sx={{ width: 140, marginLeft: 'auto' }}
            value={values.appLogMaxSize}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                appLogMaxSize: Math.max(1, parseInt(e.target.value) || 128),
              }))
            }
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {t('shared.units.kilobytes')}
                  </InputAdornment>
                ),
              },
            }}
          />
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.appLogMaxCount')}
            sx={{ maxWidth: 'fit-content' }}
          />
          <TextField
            autoComplete="new-password"
            size="small"
            type="number"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            sx={{ width: 140, marginLeft: 'auto' }}
            value={values.appLogMaxCount}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                appLogMaxCount: Math.max(1, parseInt(e.target.value) || 1),
              }))
            }
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {t('shared.units.files')}
                  </InputAdornment>
                ),
              },
            }}
          />
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.autoCloseConnections')}
            sx={{ maxWidth: 'fit-content' }}
          />
          <TooltipIcon
            title={t('settings.modals.misc.tooltips.autoCloseConnections')}
            sx={{ opacity: '0.7' }}
          />
          <Switch
            edge="end"
            checked={values.autoCloseConnection}
            onChange={(_, c) =>
              setValues((v) => ({ ...v, autoCloseConnection: c }))
            }
            sx={{ marginLeft: 'auto' }}
          />
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.autoCheckUpdate')}
          />
          <Switch
            edge="end"
            checked={values.autoCheckUpdate}
            onChange={(_, c) =>
              setValues((v) => ({ ...v, autoCheckUpdate: c }))
            }
          />
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.enableBuiltinEnhanced')}
            sx={{ maxWidth: 'fit-content' }}
          />
          <TooltipIcon
            title={t('settings.modals.misc.tooltips.enableBuiltinEnhanced')}
            sx={{ opacity: '0.7' }}
          />
          <Switch
            edge="end"
            checked={values.enableBuiltinEnhanced}
            onChange={(_, c) =>
              setValues((v) => ({ ...v, enableBuiltinEnhanced: c }))
            }
            sx={{ marginLeft: 'auto' }}
          />
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.proxyLayoutColumns')}
          />
          <Select
            size="small"
            sx={{ width: 160, '> div': { py: '7.5px' } }}
            value={values.proxyLayoutColumn}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                proxyLayoutColumn: e.target.value as number,
              }))
            }
          >
            <MenuItem value={6} key={6}>
              {t('settings.modals.misc.options.proxyLayoutColumns.auto')}
            </MenuItem>
            {[1, 2, 3, 4, 5].map((i) => (
              <MenuItem value={i} key={i}>
                {i}
              </MenuItem>
            ))}
          </Select>
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.autoLogClean')}
          />
          <Select
            size="small"
            sx={{ width: 160, '> div': { py: '7.5px' } }}
            value={values.autoLogClean}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                autoLogClean: e.target.value as number,
              }))
            }
          >
            {[
              {
                key: t('settings.modals.misc.options.autoLogClean.never'),
                value: 0,
              },
              {
                key: t('settings.modals.misc.options.autoLogClean.retainDays', {
                  n: 1,
                }),
                value: 1,
              },
              {
                key: t('settings.modals.misc.options.autoLogClean.retainDays', {
                  n: 7,
                }),
                value: 2,
              },
              {
                key: t('settings.modals.misc.options.autoLogClean.retainDays', {
                  n: 30,
                }),
                value: 3,
              },
              {
                key: t('settings.modals.misc.options.autoLogClean.retainDays', {
                  n: 90,
                }),
                value: 4,
              },
            ].map((i) => (
              <MenuItem key={i.value} value={i.value}>
                {i.key}
              </MenuItem>
            ))}
          </Select>
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.autoDelayDetection')}
            sx={{ maxWidth: 'fit-content' }}
          />
          <TooltipIcon
            title={t('settings.modals.misc.tooltips.autoDelayDetection')}
            sx={{ opacity: '0.7' }}
          />
          <Switch
            edge="end"
            checked={values.enableAutoDelayDetection}
            onChange={(_, c) =>
              setValues((v) => ({ ...v, enableAutoDelayDetection: c }))
            }
            sx={{ marginLeft: 'auto' }}
          />
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t(
              'settings.modals.misc.fields.autoDelayDetectionInterval',
            )}
            sx={{ maxWidth: 'fit-content' }}
          />
          <TextField
            autoComplete="new-password"
            size="small"
            type="number"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            sx={{ width: 160, marginLeft: 'auto' }}
            value={values.autoDelayDetectionIntervalMinutes}
            disabled={!values.enableAutoDelayDetection}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10)
              const intervalMinutes =
                Number.isFinite(parsed) && parsed > 0 ? parsed : 1
              setValues((v) => ({
                ...v,
                autoDelayDetectionIntervalMinutes: intervalMinutes,
              }))
            }}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {t('shared.units.minutes')}
                  </InputAdornment>
                ),
              },
            }}
          />
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.defaultLatencyTest')}
            sx={{ maxWidth: 'fit-content' }}
          />
          <TooltipIcon
            title={t('settings.modals.misc.tooltips.defaultLatencyTest')}
            sx={{ opacity: '0.7' }}
          />
          <TextField
            autoComplete="new-password"
            size="small"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            sx={{ width: 250, marginLeft: 'auto' }}
            value={values.defaultLatencyTest}
            placeholder="http://cp.cloudflare.com/generate_204"
            onChange={(e) =>
              setValues((v) => ({ ...v, defaultLatencyTest: e.target.value }))
            }
          />
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.defaultLatencyTimeout')}
          />
          <TextField
            autoComplete="new-password"
            size="small"
            type="number"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            sx={{ width: 250 }}
            value={values.defaultLatencyTimeout}
            placeholder="10000"
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                defaultLatencyTimeout: parseInt(e.target.value, 10) || 10000,
              }))
            }
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {t('shared.units.milliseconds')}
                  </InputAdornment>
                ),
              },
            }}
          />
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.defaultSpeedTestPreset')}
            sx={{ maxWidth: 'fit-content' }}
          />
          <TooltipIcon
            title={t('settings.modals.misc.tooltips.defaultSpeedTestPreset')}
            sx={{ opacity: '0.7' }}
          />
          <Select
            size="small"
            sx={{ width: 250, marginLeft: 'auto' }}
            value={speedTestPresetValue}
            onChange={(e) => {
              const nextPreset = e.target.value as SpeedTestPresetKey
              if (nextPreset === 'custom') return
              setValues((v) => ({
                ...v,
                defaultSpeedTest: SPEED_TEST_PRESETS[nextPreset],
              }))
            }}
          >
            <MenuItem value="custom">
              {t('settings.modals.misc.options.speedTestPreset.custom')}
            </MenuItem>
            <MenuItem value="recommended">
              {t('settings.modals.misc.options.speedTestPreset.recommended')}
            </MenuItem>
            <MenuItem value="cloudflare">
              {t('settings.modals.misc.options.speedTestPreset.cloudflare')}
            </MenuItem>
            <MenuItem value="cachefly">
              {t('settings.modals.misc.options.speedTestPreset.cachefly')}
            </MenuItem>
            <MenuItem value="ovh">
              {t('settings.modals.misc.options.speedTestPreset.ovh')}
            </MenuItem>
          </Select>
        </ListItem>

        <ListItem sx={{ padding: '5px 2px', alignItems: 'flex-start' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.defaultSpeedTest')}
            sx={{ maxWidth: 'fit-content', pt: 1 }}
          />
          <TooltipIcon
            title={t('settings.modals.misc.tooltips.defaultSpeedTest')}
            sx={{ opacity: '0.7', mt: 1 }}
          />
          <TextField
            autoComplete="new-password"
            size="small"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            multiline
            minRows={3}
            maxRows={5}
            sx={{ width: 250, marginLeft: 'auto' }}
            value={values.defaultSpeedTest}
            placeholder={
              'https://speed.cloudflare.com/__down?bytes=50000000\nhttps://cachefly.cachefly.net/20mb.test'
            }
            onChange={(e) =>
              setValues((v) => ({ ...v, defaultSpeedTest: e.target.value }))
            }
          />
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t(
              'settings.modals.misc.fields.defaultSpeedTestConcurrency',
            )}
          />
          <TooltipIcon
            title={t(
              'settings.modals.misc.tooltips.defaultSpeedTestConcurrency',
            )}
            sx={{ opacity: '0.7' }}
          />
          <Select
            size="small"
            sx={{ width: 250, marginLeft: 'auto' }}
            value={values.defaultSpeedTestConcurrency}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                defaultSpeedTestConcurrency: Number(e.target.value),
              }))
            }
          >
            {Array.from({ length: 10 }, (_, index) => index + 1).map(
              (value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ),
            )}
          </Select>
        </ListItem>

        <ListItem sx={{ padding: '5px 2px' }}>
          <ListItemText
            primary={t('settings.modals.misc.fields.defaultSpeedTestTimeout')}
          />
          <TooltipIcon
            title={t('settings.modals.misc.tooltips.defaultSpeedTestTimeout')}
            sx={{ opacity: '0.7' }}
          />
          <TextField
            autoComplete="new-password"
            size="small"
            type="number"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            sx={{ width: 250, marginLeft: 'auto' }}
            value={values.defaultSpeedTestTimeout}
            placeholder={String(DEFAULT_SPEED_TEST_TIMEOUT)}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                defaultSpeedTestTimeout:
                  parseInt(e.target.value, 10) || DEFAULT_SPEED_TEST_TIMEOUT,
              }))
            }
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {t('shared.units.milliseconds')}
                  </InputAdornment>
                ),
              },
            }}
          />
        </ListItem>
      </List>
    </BaseDialog>
  )
})
