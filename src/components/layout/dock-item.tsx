import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import { Box, ButtonBase, Typography, alpha } from '@mui/material'
import type { CSSProperties, ReactNode } from 'react'
import { useMatch, useNavigate, useResolvedPath } from 'react-router'

import { useVerge } from '@/hooks/use-app-config'

interface SortableProps {
  setNodeRef?: (element: HTMLElement | null) => void
  attributes?: DraggableAttributes
  listeners?: DraggableSyntheticListeners
  style?: CSSProperties
  isDragging?: boolean
  disabled?: boolean
}

interface Props {
  to: string
  children: string
  icon: ReactNode[]
  sortable?: SortableProps
}

export const DockItem = (props: Props) => {
  const { to, children, icon, sortable } = props
  const { verge } = useVerge()
  const { menu_icon } = verge ?? {}
  const navCollapsed = verge?.collapse_navbar ?? false
  const resolved = useResolvedPath(to)
  const match = useMatch({ path: resolved.pathname, end: true })
  const navigate = useNavigate()

  const effectiveMenuIcon =
    navCollapsed && menu_icon === 'disable' ? 'monochrome' : menu_icon

  const { setNodeRef, attributes, listeners, style, isDragging, disabled } =
    sortable ?? {}

  const draggable = Boolean(sortable) && !disabled
  const dragHandleProps = draggable
    ? { ...(attributes ?? {}), ...(listeners ?? {}) }
    : undefined

  const showIcon = effectiveMenuIcon !== 'disable'
  const showLabel = !navCollapsed

  return (
    <Box
      ref={setNodeRef}
      style={style}
      className="flux-dock__item"
      sx={[
        {
          display: 'flex',
          transformOrigin: 'bottom center',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitFontSmoothing: 'antialiased',
          transition: 'transform .16s cubic-bezier(.2,.8,.2,1)',
        },
        isDragging ? { opacity: 0.78, zIndex: 10, transition: 'none' } : {},
      ]}
    >
      <ButtonBase
        {...(dragHandleProps ?? {})}
        onClick={() => navigate(to)}
        title={navCollapsed ? children : undefined}
        aria-label={children}
        sx={[
          {
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            px: showLabel ? 1.5 : 1.3,
            py: showLabel ? 0.7 : 1,
            borderRadius: '13px',
            cursor: draggable ? 'grab' : 'pointer',
            overflow: 'hidden',
            backfaceVisibility: 'hidden',
            transform: 'translate3d(0, 0, 0)',
            transition:
              'background-color .2s ease, color .2s ease, transform .2s ease, box-shadow .2s ease',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              opacity: 0,
              borderRadius: 'inherit',
              pointerEvents: 'none',
              background:
                'linear-gradient(135deg, rgba(255,255,255,.38), rgba(255,255,255,0) 58%)',
              transition: 'opacity .2s ease',
            },
            '&::after': {
              content: '""',
              position: 'absolute',
              left: '50%',
              bottom: 3,
              width: match ? 20 : 5,
              height: 3,
              borderRadius: 999,
              opacity: match ? 1 : 0,
              transform: 'translateX(-50%) scaleX(1)',
              transition:
                'width .2s cubic-bezier(.2,.8,.2,1), opacity .2s ease, background-color .2s ease, box-shadow .2s ease',
            },
            '&:active': {
              ...(draggable ? { cursor: 'grabbing' } : {}),
              transform: 'translateY(1px) scale(0.98)',
            },
            '&.Mui-focusVisible': {
              boxShadow: 'var(--app-focus-ring)',
            },
          },
          ({ palette }) => {
            const isDark = palette.mode === 'dark'
            const accent = palette.primary.main
            const accent2 = palette.secondary.main
            return {
              color: match ? accent : palette.text.secondary,
              backgroundImage: match
                ? `linear-gradient(135deg, ${alpha(accent, isDark ? 0.22 : 0.16)}, ${alpha(accent2, isDark ? 0.18 : 0.12)})`
                : 'none',
              boxShadow: match
                ? `inset 0 0 0 1px ${alpha(accent, 0.35)}, 0 0 16px ${alpha(accent, isDark ? 0.28 : 0.16)}`
                : 'none',
              '&::before': {
                opacity: match ? 0.7 : 0,
              },
              '&::after': {
                backgroundColor: match
                  ? accent
                  : alpha(palette.text.secondary, 0.34),
                boxShadow: match
                  ? `0 0 10px ${alpha(accent2, isDark ? 0.42 : 0.24)}`
                  : 'none',
              },
              '&:hover': {
                color: match ? accent : palette.text.primary,
                backgroundColor: match
                  ? 'transparent'
                  : alpha(isDark ? '#ffffff' : '#1e2a4a', 0.07),
                boxShadow: match
                  ? `inset 0 0 0 1px ${alpha(accent, 0.48)}, 0 10px 22px ${alpha(accent, isDark ? 0.32 : 0.18)}`
                  : `inset 0 0 0 1px ${alpha(palette.text.primary, isDark ? 0.1 : 0.07)}, 0 7px 16px ${alpha(palette.common.black, isDark ? 0.2 : 0.07)}`,
                transform: 'translateY(-2px)',
                '&::before': {
                  opacity: 0.62,
                },
              },
            }
          },
        ]}
      >
        {showIcon && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: 'translate3d(0, 0, 0)',
              backfaceVisibility: 'hidden',
              '& svg': {
                width: 20,
                height: 20,
                fontSize: 20,
                shapeRendering: 'geometricPrecision',
                textRendering: 'geometricPrecision',
                transform: 'translate3d(0, 0, 0)',
                backfaceVisibility: 'hidden',
              },
            }}
          >
            {effectiveMenuIcon === 'colorful' ? icon[1] : icon[0]}
          </Box>
        )}
        {showLabel && (
          <Typography
            sx={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.3px',
              lineHeight: 1,
              whiteSpace: 'nowrap',
              textRendering: 'geometricPrecision',
              WebkitFontSmoothing: 'antialiased',
              backfaceVisibility: 'hidden',
            }}
          >
            {children}
          </Typography>
        )}
      </ButtonBase>
    </Box>
  )
}
