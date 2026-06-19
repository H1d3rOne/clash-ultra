import { InboxRounded } from '@mui/icons-material'
import { alpha, Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { TranslationKey } from '@/types/generated/i18n-keys'

interface Props {
  text?: ReactNode
  textKey?: TranslationKey
  extra?: ReactNode
}

export const BaseEmpty = ({
  text,
  textKey = 'shared.statuses.empty',
  extra,
}: Props) => {
  const { t } = useTranslation()

  const resolvedText: ReactNode = text !== undefined ? text : t(textKey)

  return (
    <Box
      sx={({ palette }) => ({
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: alpha(palette.text.secondary, 0.75),
        background:
          palette.mode === 'light'
            ? `radial-gradient(circle at 50% 42%, ${alpha(palette.primary.main, 0.09)}, transparent 30%)`
            : `radial-gradient(circle at 50% 42%, ${alpha(palette.primary.main, 0.14)}, transparent 30%)`,
        textAlign: 'center',
      })}
    >
      <InboxRounded
        sx={({ palette }) => ({
          fontSize: '4em',
          p: 1,
          borderRadius: '28%',
          color: alpha(
            palette.primary.main,
            palette.mode === 'light' ? 0.58 : 0.72,
          ),
          background: alpha(
            palette.primary.main,
            palette.mode === 'light' ? 0.08 : 0.14,
          ),
          boxShadow: `inset 0 0 0 1px ${alpha(palette.primary.main, 0.12)}`,
        })}
      />
      <Typography sx={{ mt: 1, fontSize: '1.25em', fontWeight: 700 }}>
        {resolvedText}
      </Typography>
      {extra}
    </Box>
  )
}
