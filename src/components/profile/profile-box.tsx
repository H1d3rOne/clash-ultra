import { alpha, Box, styled } from '@mui/material'

type ProfileBoxProps = {
  'aria-selected'?: boolean
  'data-enabled'?: string
}

const normalizeColor = (value?: string) => value?.trim().toLowerCase()

export const ProfileBox = styled(Box)<ProfileBoxProps>(
  ({ theme, 'aria-selected': selected, 'data-enabled': enabled }) => {
    const { mode, primary, secondary, text } = theme.palette
    const active = !!selected || enabled === 'true'
    const key = `${mode}-${active}`
    const isCyberpunk =
      normalizeColor(primary.main) === '#00e5ff' &&
      normalizeColor(secondary.main) === '#ff2bd6'
    const isManga =
      normalizeColor(primary.main) === '#111111' &&
      normalizeColor(secondary.main) === '#ff2f6d'
    const isGlass =
      normalizeColor(primary.main) === '#0a84ff' &&
      normalizeColor(secondary.main) === '#64d2ff'

    if (isCyberpunk) {
      const isLight = mode === 'light'
      const textColor = isLight ? '#071126' : '#EAFBFF'
      const mutedColor = isLight ? '#24556d' : '#9BEEFF'
      const titleColor = active
        ? isLight
          ? '#005f75'
          : primary.main
        : textColor
      const panelColor = isLight
        ? 'rgba(245, 251, 255, 0.94)'
        : 'rgba(4, 11, 28, 0.94)'
      const hoverPanelColor = isLight
        ? 'rgba(232, 247, 255, 0.98)'
        : 'rgba(5, 16, 40, 0.98)'
      const cyanOverlay = isLight
        ? 'rgba(0, 130, 160, 0.1)'
        : 'rgba(0, 229, 255, 0.12)'
      const pinkOverlay = isLight
        ? 'rgba(255, 43, 214, 0.08)'
        : 'rgba(255, 43, 214, 0.12)'
      const borderColor = active
        ? alpha(secondary.main, isLight ? 0.62 : 0.78)
        : alpha(primary.main, isLight ? 0.42 : 0.32)

      return {
        position: 'relative',
        display: 'block',
        cursor: 'pointer',
        textAlign: 'left',
        padding: '8px 16px',
        boxSizing: 'border-box',
        width: active ? `calc(100% + 3px)` : '100%',
        marginLeft: active ? `-3px` : undefined,
        borderLeft: active ? `3px solid ${secondary.main}` : undefined,
        border: `1px solid ${borderColor}`,
        borderRadius: '12px',
        color: textColor,
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${cyanOverlay}, transparent 36%), linear-gradient(315deg, ${pinkOverlay}, transparent 40%), ${panelColor}`,
        boxShadow: active
          ? `0 0 18px ${alpha(secondary.main, isLight ? 0.26 : 0.42)}, inset 0 0 20px ${alpha(primary.main, 0.08)}`
          : `0 0 14px ${alpha(primary.main, isLight ? 0.12 : 0.16)}, inset 0 0 18px ${alpha(primary.main, 0.05)}`,
        transition:
          'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease, background 160ms ease',
        '&:hover': {
          transform: 'translateY(-1px)',
          borderColor: alpha(primary.main, isLight ? 0.62 : 0.76),
          background: `linear-gradient(135deg, ${alpha(primary.main, isLight ? 0.12 : 0.18)}, transparent 36%), linear-gradient(315deg, ${alpha(secondary.main, isLight ? 0.1 : 0.16)}, transparent 40%), ${hoverPanelColor}`,
          boxShadow: `0 0 20px ${alpha(primary.main, isLight ? 0.2 : 0.32)}, inset 0 0 20px ${alpha(secondary.main, 0.1)}`,
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: isLight ? 0.1 : 0.18,
          background:
            'linear-gradient(90deg, #00e5ff, transparent 24%, transparent 76%, #ff2bd6), linear-gradient(180deg, rgba(255, 255, 255, 0.12), transparent 18%)',
        },
        '& h2': {
          color: titleColor,
          textShadow: active
            ? `0 0 12px ${alpha(primary.main, isLight ? 0.32 : 0.82)}`
            : 'none',
        },
        '& .MuiTypography-root, & span, & small': {
          color: 'inherit',
        },
        '& .MuiTypography-colorTextSecondary': {
          color: mutedColor,
        },
        '& .MuiSvgIcon-root, & .MuiIconButton-root': {
          color: 'inherit',
        },
        '& .MuiLinearProgress-root': {
          border: `1px solid ${alpha(primary.main, isLight ? 0.34 : 0.38)}`,
          borderRadius: 999,
          backgroundColor: alpha(primary.main, isLight ? 0.12 : 0.08),
        },
        '& .MuiLinearProgress-bar': {
          background: `linear-gradient(90deg, ${primary.main}, ${secondary.main})`,
          boxShadow: `0 0 12px ${alpha(primary.main, isLight ? 0.38 : 0.62)}`,
        },
      }
    }

    if (isGlass) {
      const isLight = mode === 'light'
      const textColor = isLight ? '#0f172a' : '#eaf6ff'
      const mutedColor = isLight ? '#475569' : '#a7c7df'
      const panelColor = isLight
        ? 'rgba(255, 255, 255, 0.58)'
        : 'rgba(15, 23, 42, 0.58)'
      const hoverPanelColor = isLight
        ? 'rgba(255, 255, 255, 0.72)'
        : 'rgba(30, 41, 59, 0.72)'
      const borderColor = active
        ? alpha(primary.main, isLight ? 0.38 : 0.48)
        : isLight
          ? 'rgba(255, 255, 255, 0.62)'
          : 'rgba(255, 255, 255, 0.14)'

      return {
        position: 'relative',
        display: 'block',
        cursor: 'pointer',
        textAlign: 'left',
        padding: '9px 16px',
        boxSizing: 'border-box',
        width: active ? `calc(100% + 3px)` : '100%',
        marginLeft: active ? `-3px` : undefined,
        borderLeft: active ? `3px solid ${primary.main}` : undefined,
        border: `1px solid ${borderColor}`,
        borderRadius: '18px',
        color: textColor,
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${alpha(primary.main, active ? 0.16 : 0.08)}, transparent 42%), ${panelColor}`,
        boxShadow: active
          ? `0 18px 42px ${alpha(primary.main, isLight ? 0.2 : 0.28)}, inset 0 1px 0 rgba(255, 255, 255, 0.45)`
          : isLight
            ? '0 16px 36px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72)'
            : '0 18px 44px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
        backdropFilter: 'blur(22px) saturate(1.35)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.35)',
        transition:
          'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease, background 160ms ease',
        '&:hover': {
          transform: 'translateY(-1px)',
          borderColor: alpha(primary.main, 0.48),
          background: `linear-gradient(135deg, ${alpha(primary.main, 0.18)}, transparent 42%), ${hoverPanelColor}`,
        },
        '& h2': {
          color: active ? primary.main : textColor,
        },
        '& .MuiTypography-root, & span, & small': {
          color: 'inherit',
        },
        '& .MuiTypography-colorTextSecondary': {
          color: mutedColor,
        },
        '& .MuiSvgIcon-root, & .MuiIconButton-root': {
          color: 'inherit',
        },
        '& .MuiLinearProgress-root': {
          border: `1px solid ${borderColor}`,
          borderRadius: 999,
          backgroundColor: isLight
            ? 'rgba(255, 255, 255, 0.36)'
            : 'rgba(2, 6, 23, 0.38)',
        },
        '& .MuiLinearProgress-bar': {
          background: `linear-gradient(90deg, ${primary.main}, ${secondary.main})`,
        },
      }
    }

    if (isManga) {
      const isLight = mode === 'light'
      const textColor = isLight ? '#111111' : '#fff8e8'
      const mutedColor = isLight ? '#5f4b46' : '#ffd6e2'
      const paperColor = isLight
        ? 'rgba(255, 253, 247, 0.94)'
        : 'rgba(23, 19, 26, 0.94)'
      const hoverPaperColor = isLight
        ? 'rgba(255, 246, 232, 0.98)'
        : 'rgba(38, 28, 42, 0.98)'
      const dotColor = isLight
        ? 'rgba(17, 17, 17, 0.08)'
        : 'rgba(255, 248, 232, 0.13)'
      const borderColor = active
        ? secondary.main
        : isLight
          ? 'rgba(17, 17, 17, 0.82)'
          : 'rgba(255, 248, 232, 0.68)'
      const shadowColor = active
        ? alpha(secondary.main, isLight ? 0.36 : 0.5)
        : isLight
          ? 'rgba(17, 17, 17, 0.18)'
          : 'rgba(255, 47, 109, 0.22)'

      return {
        position: 'relative',
        display: 'block',
        cursor: 'pointer',
        textAlign: 'left',
        padding: '9px 16px',
        boxSizing: 'border-box',
        width: active ? `calc(100% + 3px)` : '100%',
        marginLeft: active ? `-3px` : undefined,
        borderLeft: active ? `3px solid ${secondary.main}` : undefined,
        border: `2px solid ${borderColor}`,
        borderRadius: '16px',
        color: textColor,
        overflow: 'hidden',
        background: `radial-gradient(circle at 1px 1px, ${dotColor} 1px, transparent 1.2px) 0 0 / 9px 9px, linear-gradient(135deg, ${alpha(secondary.main, active ? 0.16 : 0.08)}, transparent 42%), ${paperColor}`,
        boxShadow: `5px 5px 0 ${shadowColor}`,
        transition:
          'border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease, background 150ms ease',
        '&:hover': {
          transform: 'translate(-1px, -1px) rotate(-0.35deg)',
          borderColor: secondary.main,
          background: `radial-gradient(circle at 1px 1px, ${dotColor} 1px, transparent 1.2px) 0 0 / 9px 9px, linear-gradient(135deg, ${alpha(secondary.main, 0.18)}, transparent 42%), ${hoverPaperColor}`,
          boxShadow: `7px 7px 0 ${shadowColor}`,
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: isLight ? 0.18 : 0.22,
          background:
            'linear-gradient(112deg, transparent 0 72%, rgba(255, 47, 109, 0.34) 72.5% 74%, transparent 74.5%), linear-gradient(116deg, transparent 0 84%, rgba(251, 191, 36, 0.26) 84.3% 85.2%, transparent 85.5%)',
        },
        '& h2': {
          color: active ? secondary.main : textColor,
          textShadow: active
            ? `2px 2px 0 ${isLight ? 'rgba(17, 17, 17, 0.14)' : 'rgba(255, 248, 232, 0.16)'}`
            : 'none',
        },
        '& .MuiTypography-root, & span, & small': {
          color: 'inherit',
        },
        '& .MuiTypography-colorTextSecondary': {
          color: mutedColor,
        },
        '& .MuiSvgIcon-root, & .MuiIconButton-root': {
          color: 'inherit',
        },
        '& .MuiLinearProgress-root': {
          border: `2px solid ${borderColor}`,
          borderRadius: 999,
          backgroundColor: isLight
            ? 'rgba(255, 248, 232, 0.72)'
            : 'rgba(15, 13, 18, 0.72)',
        },
        '& .MuiLinearProgress-bar': {
          background: `repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.24) 0 6px, transparent 6px 12px), ${secondary.main}`,
        },
      }
    }

    const isLight = mode === 'light'
    const backgroundColor = isLight
      ? `radial-gradient(circle at 12% 0%, ${alpha('#ffffff', 0.72)}, transparent 34%), linear-gradient(135deg, ${alpha(primary.main, active ? 0.1 : 0.045)}, transparent 58%, ${alpha(secondary.main, 0.055)}), ${alpha('#ffffff', 0.92)}`
      : `radial-gradient(circle at 12% 0%, ${alpha('#ffffff', 0.07)}, transparent 34%), linear-gradient(135deg, ${alpha(primary.main, active ? 0.18 : 0.08)}, transparent 58%, ${alpha(secondary.main, 0.08)}), #061414`

    const colorMap: Record<string, string> = {
      'light-true': text.secondary,
      'light-false': text.secondary,
      'dark-true': alpha(text.secondary, 0.65),
      'dark-false': alpha(text.secondary, 0.65),
    }
    const color = colorMap[key] ?? text.secondary

    const h2colorMap: Record<string, string> = {
      'light-true': primary.main,
      'light-false': text.primary,
      'dark-true': primary.main,
      'dark-false': text.primary,
    }
    const h2color = h2colorMap[key] ?? text.primary

    const borderSelect = {
      'light-true': {
        borderLeft: `3px solid ${primary.main}`,
        width: `calc(100% + 3px)`,
        marginLeft: `-3px`,
      },
      'light-false': {
        width: '100%',
      },
      'dark-true': {
        borderLeft: `3px solid ${primary.main}`,
        width: `calc(100% + 3px)`,
        marginLeft: `-3px`,
      },
      'dark-false': {
        width: '100%',
      },
    }[key]

    return {
      position: 'relative',
      display: 'block',
      cursor: 'pointer',
      textAlign: 'left',
      padding: '8px 16px',
      boxSizing: 'border-box',
      overflow: 'hidden',
      background: backgroundColor,
      boxShadow: active
        ? `inset 0 0 0 1px ${alpha(primary.main, isLight ? 0.24 : 0.34)}, 0 14px 34px ${alpha(primary.main, isLight ? 0.12 : 0.2)}`
        : isLight
          ? `inset 0 0 0 1px ${alpha(primary.main, 0.1)}, 0 10px 26px ${alpha('#12afa0', 0.07)}`
          : `inset 0 0 0 1px ${alpha('#ffffff', 0.08)}, 0 12px 30px ${alpha('#000000', 0.22)}`,
      ...borderSelect,
      borderRadius: '12px',
      color,
      transition:
        'background 170ms ease, box-shadow 170ms ease, transform 170ms ease',
      '&::before': {
        content: '""',
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background:
          'linear-gradient(115deg, rgba(255, 255, 255, 0.42), transparent 28%, transparent 72%, rgba(255, 255, 255, 0.14))',
        opacity: isLight ? 0.72 : 0.2,
      },
      '&::after': {
        content: '""',
        position: 'absolute',
        left: 12,
        right: 12,
        top: 0,
        height: 1,
        pointerEvents: 'none',
        background: `linear-gradient(90deg, transparent, ${alpha(primary.main, isLight ? 0.28 : 0.36)}, ${alpha(secondary.main, isLight ? 0.2 : 0.3)}, transparent)`,
      },
      '&:hover': {
        transform: 'translateY(-1px)',
        boxShadow: active
          ? `inset 0 0 0 1px ${alpha(secondary.main, isLight ? 0.28 : 0.42)}, 0 16px 38px ${alpha(primary.main, isLight ? 0.16 : 0.24)}`
          : `inset 0 0 0 1px ${alpha(primary.main, isLight ? 0.18 : 0.28)}, 0 14px 34px ${alpha(primary.main, isLight ? 0.1 : 0.18)}`,
      },
      '& h2': { color: h2color },
    }
  },
)
