import { Select, SelectProps, alpha, styled } from '@mui/material'

export const BaseStyledSelect = styled((props: SelectProps<string>) => {
  return (
    <Select
      size="small"
      autoComplete="new-password"
      sx={{
        width: 120,
        height: 33.375,
        mr: 1,
        '[role="button"]': { py: 0.65 },
      }}
      {...props}
    />
  )
})(({ theme }) => ({
  borderRadius: 12,
  background:
    theme.palette.mode === 'light'
      ? `linear-gradient(135deg, ${alpha('#fff', 0.94)}, ${alpha(theme.palette.primary.main, 0.04)})`
      : `linear-gradient(135deg, ${alpha(theme.palette.common.white, 0.08)}, ${alpha(theme.palette.primary.main, 0.1)})`,
  boxShadow:
    theme.palette.mode === 'light'
      ? `inset 0 1px 0 ${alpha('#fff', 0.78)}, 0 6px 18px ${alpha(theme.palette.primary.main, 0.08)}`
      : `inset 0 1px 0 ${alpha(theme.palette.common.white, 0.08)}, 0 8px 20px ${alpha('#000', 0.18)}`,
  transition:
    'border-color 160ms ease, background 160ms ease, box-shadow 160ms ease',
  '&:hover': {
    background:
      theme.palette.mode === 'light'
        ? `linear-gradient(135deg, ${alpha('#fff', 0.98)}, ${alpha(theme.palette.secondary.main, 0.06)})`
        : `linear-gradient(135deg, ${alpha(theme.palette.common.white, 0.1)}, ${alpha(theme.palette.secondary.main, 0.12)})`,
  },
  '&.Mui-focused': {
    boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.15)}, 0 10px 26px ${alpha(theme.palette.primary.main, 0.12)}`,
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: alpha(theme.palette.text.primary, 0.16),
  },
}))
