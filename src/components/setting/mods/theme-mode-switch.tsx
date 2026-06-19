import {
  DarkModeRounded,
  LightModeRounded,
  SettingsBrightnessRounded,
} from '@mui/icons-material'
import { Button, ButtonGroup, alpha, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'

type ThemeValue = IVergeConfig['theme_mode']

interface Props {
  value?: ThemeValue
  onChange?: (value: ThemeValue) => void
}

const normalizeColor = (value?: string) => value?.trim().toLowerCase()

export const ThemeModeSwitch = (props: Props) => {
  const { value, onChange } = props
  const { t } = useTranslation()
  const theme = useTheme()
  const resolvedValue = value ?? 'dark'
  const { primary, secondary } = theme.palette
  const isLightMode = theme.palette.mode === 'light'
  const isCyberpunk =
    normalizeColor(primary.main) === '#00e5ff' &&
    normalizeColor(secondary.main) === '#ff2bd6'
  const isManga =
    normalizeColor(primary.main) === '#111111' &&
    normalizeColor(secondary.main) === '#ff2f6d'
  const isGlass =
    normalizeColor(primary.main) === '#0a84ff' &&
    normalizeColor(secondary.main) === '#64d2ff'

  const modes = [
    { value: 'light', icon: <LightModeRounded fontSize="inherit" /> },
    { value: 'dark', icon: <DarkModeRounded fontSize="inherit" /> },
    { value: 'system', icon: <SettingsBrightnessRounded fontSize="inherit" /> },
  ] as const

  return (
    <ButtonGroup
      className="theme-mode-switch"
      data-theme-mode-source={resolvedValue}
      data-theme-mode-current={theme.palette.mode}
      size="small"
      sx={{
        my: '4px',
        ...(isCyberpunk
          ? {
              p: '3px',
              gap: '3px',
              border: `1px solid ${alpha(primary.main, 0.5)}`,
              borderRadius: '14px',
              background:
                'linear-gradient(135deg, rgba(0, 229, 255, 0.12), rgba(255, 43, 214, 0.08)), rgba(4, 11, 28, 0.92)',
              boxShadow: `0 0 16px ${alpha(primary.main, 0.26)}, inset 0 0 18px ${alpha(primary.main, 0.08)}`,
              '& .MuiButtonGroup-grouped': {
                minWidth: 76,
                border: '0 !important',
                borderRadius: '10px !important',
                color: 'var(--cyber-text, #EAFBFF)',
                background: 'var(--cyber-card, rgba(1, 8, 24, 0.62))',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                clipPath:
                  'polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px))',
                '&:hover': {
                  color: 'var(--cyber-active-text, #fff)',
                  background:
                    'var(--cyber-card-hover, rgba(0, 229, 255, 0.16))',
                  boxShadow: `0 0 14px ${alpha(primary.main, 0.34)}`,
                },
              },
            }
          : {}),
        ...(isManga
          ? {
              p: '3px',
              gap: '4px',
              border: `2px solid ${isLightMode ? '#111111' : '#fff8e8'}`,
              borderRadius: '16px',
              background: isLightMode
                ? 'radial-gradient(circle at 1px 1px, rgba(17, 17, 17, 0.08) 1px, transparent 1.2px) 0 0 / 8px 8px, #fff8e8'
                : 'radial-gradient(circle at 1px 1px, rgba(255, 248, 232, 0.13) 1px, transparent 1.2px) 0 0 / 8px 8px, #17131a',
              boxShadow: isLightMode
                ? `4px 4px 0 ${alpha('#111111', 0.2)}`
                : `4px 4px 0 ${alpha(secondary.main, 0.28)}`,
              '& .MuiButtonGroup-grouped': {
                minWidth: 76,
                border: '0 !important',
                borderRadius: '11px !important',
                color: isLightMode ? '#111111' : '#fff8e8',
                fontWeight: 900,
                textTransform: 'none',
                '&:hover': {
                  background: alpha(secondary.main, 0.12),
                  boxShadow: `3px 3px 0 ${alpha(isLightMode ? '#111111' : secondary.main, 0.2)}`,
                  transform: 'translate(-1px, -1px)',
                },
              },
            }
          : {}),
        ...(isGlass
          ? {
              p: '3px',
              gap: '4px',
              border: `1px solid ${
                isLightMode
                  ? 'rgba(255, 255, 255, 0.72)'
                  : 'rgba(255, 255, 255, 0.18)'
              }`,
              borderRadius: '999px',
              background: isLightMode
                ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.34))'
                : 'linear-gradient(135deg, rgba(15, 23, 42, 0.76), rgba(15, 23, 42, 0.36))',
              boxShadow: isLightMode
                ? `0 16px 34px ${alpha(primary.main, 0.14)}, inset 0 1px 0 rgba(255, 255, 255, 0.72)`
                : '0 18px 40px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.14)',
              backdropFilter: 'blur(18px) saturate(1.35)',
              WebkitBackdropFilter: 'blur(18px) saturate(1.35)',
              '& .MuiButtonGroup-grouped': {
                minWidth: 76,
                border: '0 !important',
                borderRadius: '999px !important',
                color: isLightMode ? '#0f172a' : '#eaf6ff',
                fontWeight: 800,
                textTransform: 'none',
                '&:hover': {
                  background: alpha(primary.main, isLightMode ? 0.12 : 0.18),
                  boxShadow: `0 12px 28px ${alpha(primary.main, 0.18)}`,
                  transform: 'translateY(-1px)',
                },
              },
            }
          : {}),
      }}
    >
      {modes.map((item) => {
        const active = item.value === resolvedValue
        return (
          <Button
            key={item.value}
            data-theme-mode-option={item.value}
            data-active={active ? 'true' : 'false'}
            variant={active ? 'contained' : 'outlined'}
            startIcon={item.icon}
            onClick={() => onChange?.(item.value)}
            sx={{
              textTransform: 'capitalize',
              ...(isCyberpunk
                ? {
                    position: 'relative',
                    overflow: 'hidden',
                    ...(item.value === 'light'
                      ? {
                          color: 'var(--cyber-text, #eafbff) !important',
                          background:
                            'radial-gradient(circle at 22% 22%, rgba(248, 243, 43, 0.34), transparent 34%), linear-gradient(135deg, rgba(0, 229, 255, 0.24), rgba(7, 17, 38, 0.92)) !important',
                        }
                      : {}),
                    ...(item.value === 'dark'
                      ? {
                          color: '#eafbff !important',
                          background:
                            'linear-gradient(180deg, #071126, #120421) !important',
                        }
                      : {}),
                    ...(item.value === 'system'
                      ? {
                          color: 'var(--cyber-text, #eafbff) !important',
                          background:
                            'linear-gradient(135deg, rgba(0, 229, 255, 0.2), rgba(255, 43, 214, 0.16)), linear-gradient(90deg, rgba(7, 17, 38, 0.96), rgba(18, 4, 33, 0.96)) !important',
                        }
                      : {}),
                    ...(active
                      ? {
                          borderColor: `${secondary.main} !important`,
                          boxShadow: `0 0 18px ${alpha(primary.main, 0.55)}, 0 0 28px ${alpha(secondary.main, 0.28)} !important`,
                          transform: 'translateY(-1px)',
                        }
                      : { opacity: 0.82 }),
                  }
                : {}),
              ...(isManga
                ? {
                    position: 'relative',
                    overflow: 'hidden',
                    border: '2px solid transparent !important',
                    ...(item.value === 'light'
                      ? {
                          color: '#111111 !important',
                          background:
                            'radial-gradient(circle at 1px 1px, rgba(17, 17, 17, 0.09) 1px, transparent 1.2px) 0 0 / 8px 8px, linear-gradient(180deg, #fff2b8, #ffd6e4) !important',
                        }
                      : {}),
                    ...(item.value === 'dark'
                      ? {
                          color: '#fff8e8 !important',
                          background:
                            'radial-gradient(circle at 1px 1px, rgba(255, 248, 232, 0.15) 1px, transparent 1.2px) 0 0 / 8px 8px, linear-gradient(180deg, #111111, #2b121c) !important',
                        }
                      : {}),
                    ...(item.value === 'system'
                      ? {
                          color: '#fff8e8 !important',
                          background:
                            'radial-gradient(circle at 1px 1px, rgba(255, 248, 232, 0.13) 1px, transparent 1.2px) 0 0 / 8px 8px, linear-gradient(135deg, #2b121c, #ff2f6d) !important',
                          textShadow: '2px 2px 0 rgba(17, 17, 17, 0.55)',
                        }
                      : {}),
                    ...(active
                      ? {
                          borderColor: `${secondary.main} !important`,
                          boxShadow: `4px 4px 0 ${alpha(secondary.main, isLightMode ? 0.36 : 0.52)} !important`,
                          transform: 'translate(-1px, -1px) rotate(-0.5deg)',
                        }
                      : { opacity: 0.84 }),
                  }
                : {}),
              ...(isGlass
                ? {
                    position: 'relative',
                    overflow: 'hidden',
                    border: '1px solid transparent !important',
                    ...(item.value === 'light'
                      ? {
                          color: '#0f172a !important',
                          background:
                            'linear-gradient(180deg, rgba(214, 239, 255, 0.88), rgba(188, 228, 255, 0.68)) !important',
                        }
                      : {}),
                    ...(item.value === 'dark'
                      ? {
                          color: '#eaf6ff !important',
                          background:
                            'linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(7, 11, 20, 0.88)) !important',
                        }
                      : {}),
                    ...(item.value === 'system'
                      ? {
                          color: '#eaf6ff !important',
                          background:
                            'linear-gradient(135deg, rgba(10, 132, 255, 0.76), rgba(15, 23, 42, 0.78)) !important',
                        }
                      : {}),
                    ...(active
                      ? {
                          borderColor: `${alpha(primary.main, 0.38)} !important`,
                          boxShadow: `0 12px 28px ${alpha(primary.main, 0.24)}, inset 0 1px 0 rgba(255, 255, 255, 0.48) !important`,
                          transform: 'translateY(-1px)',
                        }
                      : { opacity: 0.84 }),
                  }
                : {}),
            }}
          >
            {t(`settings.sections.appearance.${item.value}`)}
          </Button>
        )
      })}
    </ButtonGroup>
  )
}
