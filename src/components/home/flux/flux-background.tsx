import { Box, alpha, useTheme } from '@mui/material'

export const FluxBackground = () => {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const primary = theme.palette.primary.main
  const secondary = theme.palette.secondary.main

  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: isDark
            ? `
              radial-gradient(circle at 18% 8%, ${alpha(primary, 0.28)}, transparent 32%),
              radial-gradient(circle at 84% 18%, ${alpha(secondary, 0.18)}, transparent 30%),
              linear-gradient(115deg, #061414 0%, #0b2422 45%, #10283b 72%, #081a1a 100%)
            `
            : `
              radial-gradient(circle at 12% 8%, ${alpha(primary, 0.16)}, transparent 30%),
              radial-gradient(circle at 88% 10%, ${alpha(secondary, 0.18)}, transparent 28%),
              radial-gradient(circle at 52% 112%, ${alpha('#7DEBDD', 0.12)}, transparent 34%),
              linear-gradient(115deg, #fbfffd 0%, ${alpha(primary, 0.06)} 46%, ${alpha(secondary, 0.075)} 100%)
            `,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(${alpha(isDark ? '#ffffff' : '#1e2a4a', isDark ? 0.035 : 0.045)} 1px, transparent 1px),
            linear-gradient(90deg, ${alpha(isDark ? '#ffffff' : '#1e2a4a', isDark ? 0.035 : 0.045)} 1px, transparent 1px),
            radial-gradient(circle, ${alpha(isDark ? '#ffffff' : primary, isDark ? 0.08 : 0.08)} 1px, transparent 1.5px)
          `,
          backgroundSize: '48px 48px, 48px 48px, 24px 24px',
          maskImage:
            'radial-gradient(ellipse 70% 60% at 50% 35%, #000 30%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 60% at 50% 35%, #000 30%, transparent 75%)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: '-18% -10%',
          opacity: isDark ? 0.34 : 0.4,
          transform: 'rotate(-6deg)',
          background: `
            conic-gradient(from 220deg at 50% 50%,
              transparent 0deg,
              ${alpha(primary, 0.16)} 42deg,
              transparent 84deg,
              ${alpha(secondary, 0.14)} 132deg,
              transparent 176deg,
              ${alpha('#7DEBDD', 0.1)} 238deg,
              transparent 310deg)
          `,
          filter: 'blur(14px)',
          mixBlendMode: isDark ? 'screen' : 'normal',
          maskImage:
            'linear-gradient(90deg, transparent 0%, #000 18%, #000 82%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(90deg, transparent 0%, #000 18%, #000 82%, transparent 100%)',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          width: 480,
          height: 480,
          top: -180,
          left: '16%',
          borderRadius: '50%',
          filter: 'blur(64px)',
          opacity: isDark ? 0.46 : 0.28,
          background: isDark ? '#2b3f8f' : alpha(primary, 0.46),
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          width: 420,
          height: 420,
          bottom: -200,
          right: '8%',
          borderRadius: '50%',
          filter: 'blur(64px)',
          opacity: isDark ? 0.38 : 0.24,
          background: isDark ? '#1f7a8f' : alpha(secondary, 0.44),
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          width: 360,
          height: 360,
          top: '22%',
          right: '22%',
          borderRadius: '50%',
          filter: 'blur(72px)',
          opacity: isDark ? 0.2 : 0.14,
          background: alpha('#7DEBDD', 0.75),
        }}
      />
    </Box>
  )
}
