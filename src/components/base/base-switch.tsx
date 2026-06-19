import { alpha } from '@mui/material'
import { styled } from '@mui/material/styles'
import { default as MuiSwitch, SwitchProps } from '@mui/material/Switch'

export const Switch = styled((props: SwitchProps) => (
  <MuiSwitch
    focusVisibleClassName=".Mui-focusVisible"
    disableRipple
    {...props}
  />
))(({ theme }) => ({
  width: 42,
  height: 26,
  padding: 0,
  marginRight: 1,
  '& .MuiSwitch-switchBase': {
    padding: 0,
    margin: 2,
    transitionDuration: '300ms',
    '&.Mui-checked': {
      transform: 'translateX(16px)',
      color: '#fff',
      '& + .MuiSwitch-track': {
        background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
        opacity: 1,
        border: 0,
        boxShadow: `0 0 14px ${alpha(theme.palette.primary.main, 0.28)}`,
      },
      '&.Mui-disabled + .MuiSwitch-track': {
        opacity: 0.5,
      },
    },
    '&.Mui-focusVisible .MuiSwitch-thumb': {
      color: theme.palette.primary.main,
      border: `5px solid ${alpha(theme.palette.background.paper, 0.92)}`,
      boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.16)}`,
    },
    '&.Mui-disabled .MuiSwitch-thumb': {
      color:
        theme.palette.mode === 'light'
          ? theme.palette.grey[100]
          : theme.palette.grey[600],
    },
    '&.Mui-disabled + .MuiSwitch-track': {
      opacity: theme.palette.mode === 'light' ? 0.7 : 0.3,
    },
  },
  '& .MuiSwitch-thumb': {
    boxSizing: 'border-box',
    width: 22,
    height: 22,
    boxShadow:
      theme.palette.mode === 'light'
        ? '0 2px 7px rgba(15, 23, 42, 0.26)'
        : '0 2px 8px rgba(0, 0, 0, 0.46)',
  },
  '& .MuiSwitch-track': {
    borderRadius: 26 / 2,
    backgroundColor:
      theme.palette.mode === 'light'
        ? alpha(theme.palette.text.primary, 0.24)
        : alpha(theme.palette.common.white, 0.18),
    opacity: 1,
    transition: theme.transitions.create(['background-color'], {
      duration: 500,
    }),
  },
}))
