import { alpha, Box, styled } from '@mui/material'

export const TestBox = styled(Box)(({ theme, 'aria-selected': selected }) => {
  const { mode, primary, text } = theme.palette
  const key = `${mode}-${!!selected}`

  const background =
    mode === 'light'
      ? alpha(primary.main, 0.05)
      : `linear-gradient(145deg, ${alpha(primary.main, 0.05)}, ${alpha(
          theme.palette.background.paper,
          0.78,
        )})`

  const color = {
    'light-true': text.secondary,
    'light-false': text.secondary,
    'dark-true': alpha(text.secondary, 0.65),
    'dark-false': alpha(text.secondary, 0.65),
  }[key]!

  const cardSweepBackground =
    mode === 'light'
      ? 'linear-gradient(105deg, transparent 0 36%, rgba(255, 255, 255, 0.74) 46%, rgba(126, 237, 222, 0.24) 52%, transparent 64% 100%)'
      : 'linear-gradient(105deg, transparent 0 32%, rgba(92, 227, 210, 0.18) 41%, rgba(255, 255, 255, 0.58) 48%, rgba(126, 237, 222, 0.3) 55%, transparent 70% 100%)'

  const h2color = {
    'light-true': primary.main,
    'light-false': text.primary,
    'dark-true': primary.main,
    'dark-false': text.primary,
  }[key]!

  return {
    position: 'relative',
    width: '100%',
    display: 'block',
    cursor: 'pointer',
    textAlign: 'left',
    border: `1px solid ${
      mode === 'light' ? alpha(primary.main, 0.08) : alpha(primary.main, 0.055)
    }`,
    borderRadius: 10,
    boxShadow:
      mode === 'light'
        ? theme.shadows[1]
        : `0 1px 4px ${alpha('#000', 0.1)} !important`,
    padding: '8px 16px',
    boxSizing: 'border-box',
    background: mode === 'light' ? background : `${background} !important`,
    color,
    '& h2': { color: h2color },
    transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s',
    '&:hover': {
      background:
        mode === 'light'
          ? alpha(primary.main, 0.1)
          : `linear-gradient(145deg, ${alpha(primary.main, 0.07)}, ${alpha(
              theme.palette.background.paper,
              0.82,
            )}) !important`,
      borderColor:
        mode === 'light'
          ? alpha(primary.main, 0.16)
          : alpha(primary.main, 0.08),
      boxShadow:
        mode === 'light'
          ? theme.shadows[2]
          : `0 4px 10px ${alpha('#000', 0.14)} !important`,
    },
    '&::before, &::after': {
      content: '""',
      display: 'none !important',
      background: 'none !important',
      opacity: '0 !important',
    },
    '&.test-page__item-card': {
      position: 'relative',
      isolation: 'isolate',
      overflow: 'hidden',
      background: mode === 'light' ? undefined : `${background} !important`,
      boxShadow:
        mode === 'light'
          ? undefined
          : `0 1px 4px ${alpha('#000', 0.1)} !important`,
      '& .test-card-motion': {
        display: 'block',
        position: 'absolute',
        inset: '1px',
        zIndex: 2,
        pointerEvents: 'none',
        opacity: '0 !important',
        borderRadius: 'inherit',
        background: `${cardSweepBackground} !important`,
        mixBlendMode: 'normal',
        filter: mode === 'dark' ? 'blur(0.25px) saturate(1.08)' : 'none',
        transform: 'translate3d(-44%, 0, 0)',
        transition: 'opacity 180ms ease, transform 360ms ease !important',
        willChange: 'opacity, transform',
      },
      '&:hover > .test-card-motion': {
        opacity: `${mode === 'dark' ? 0.74 : 0.62} !important`,
        transform: 'translate3d(42%, 0, 0) !important',
      },
      '& > :not(.test-card-motion)': {
        position: 'relative',
        zIndex: 3,
      },
      ...(mode === 'dark'
        ? {
            transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s',
            '&::before': {
              content: '""',
              display: 'block !important',
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              pointerEvents: 'none',
              borderRadius: 'inherit',
              background: `radial-gradient(ellipse at 22% 0%, ${alpha(
                '#ffffff',
                0.052,
              )}, transparent 38%), linear-gradient(180deg, ${alpha(
                '#ffffff',
                0.018,
              )}, transparent 46%) !important`,
              opacity: '0.68 !important',
              transform: 'none !important',
              transition: 'opacity 0.3s ease !important',
            },
            '&:hover': {
              background: `linear-gradient(145deg, ${alpha(
                primary.main,
                0.06,
              )}, ${alpha(theme.palette.background.paper, 0.84)}) !important`,
              borderColor: `${alpha(primary.main, 0.11)} !important`,
              boxShadow: `0 4px 10px ${alpha('#000', 0.14)} !important`,
            },
            '&:hover::before': {
              opacity: '0.78 !important',
            },
          }
        : {}),
    },
  }
})
