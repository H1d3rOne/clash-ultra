import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { LanguageRounded } from '@mui/icons-material'
import { Box, Divider, MenuItem, Menu, styled, alpha } from '@mui/material'
import { UnlistenFn } from '@tauri-apps/api/event'
import { useLockFn } from 'ahooks'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BaseLoading } from '@/components/base'
import { useIconCache } from '@/hooks/use-icon-cache'
import { useListen } from '@/hooks/use-listen'
import { cmdTestDelay } from '@/services/cmds'
import delayManager from '@/services/delay'
import { showNotice } from '@/services/notice-service'
import { debugLog } from '@/utils/debug'

import { TestBox } from './test-box'

interface Props {
  id: string
  itemData: IVergeTestItem
  onEdit: () => void
  onDelete: (uid: string) => void
}

export const TestItem = ({
  id,
  itemData,
  onEdit,
  onDelete: removeTest,
}: Props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
  })

  const { t } = useTranslation()
  const [anchorEl, setAnchorEl] = useState<any>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const [delay, setDelay] = useState(-1)
  const { uid, name, icon, url } = itemData
  const iconCachePath = useIconCache({ icon, cacheKey: uid })
  const { addListener } = useListen()

  const onDelay = useCallback(async () => {
    setDelay(-2)
    const result = await cmdTestDelay(url)
    setDelay(result)
  }, [url])

  const onEditTest = () => {
    setAnchorEl(null)
    onEdit()
  }

  const onDelete = useLockFn(async () => {
    setAnchorEl(null)
    try {
      removeTest(uid)
    } catch (err: any) {
      showNotice.error(err)
    }
  })

  const menu = [
    { label: 'Edit', handler: onEditTest },
    { label: 'Delete', handler: onDelete },
  ]

  useEffect(() => {
    let unlistenFn: UnlistenFn | null = null

    const setupListener = async () => {
      if (unlistenFn) {
        unlistenFn()
      }
      unlistenFn = await addListener('ultra://test-all', () => {
        onDelay()
      })
    }

    setupListener()

    return () => {
      if (unlistenFn) {
        debugLog(
          `TestItem for ${id} unmounting or url changed, cleaning up test-all listener.`,
        )
        unlistenFn()
      }
    }
  }, [url, addListener, onDelay, id])

  return (
    <Box
      className="test-page__item-shell"
      sx={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined,
      }}
    >
      <TestBox
        className="test-page__item-card"
        onContextMenu={(event) => {
          const { clientX, clientY } = event
          setPosition({ top: clientY, left: clientX })
          setAnchorEl(event.currentTarget)
          event.preventDefault()
        }}
      >
        <Box aria-hidden className="test-card-motion" />
        <Box
          sx={{ position: 'relative', cursor: 'move' }}
          ref={setNodeRef}
          {...attributes}
          {...listeners}
        >
          {icon && icon.trim() !== '' ? (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              {icon.trim().startsWith('http') && (
                <img
                  src={iconCachePath === '' ? icon : iconCachePath}
                  height="40px"
                />
              )}
              {icon.trim().startsWith('data') && (
                <img src={icon} height="40px" />
              )}
              {icon.trim().startsWith('<svg') && (
                <img
                  src={`data:image/svg+xml;base64,${btoa(icon)}`}
                  height="40px"
                />
              )}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <LanguageRounded sx={{ height: '40px' }} fontSize="large" />
            </Box>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'center' }}>{name}</Box>
        </Box>
        <Divider
          sx={({ palette }) => ({
            mt: '8px',
            borderColor:
              palette.mode === 'dark'
                ? alpha(palette.primary.main, 0.045)
                : undefined,
          })}
        />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '8px',
            color: 'text.primary',
          }}
        >
          {delay === -2 && (
            <Widget
              className="the-testing"
              sx={({ palette }) => {
                const tone = palette.info.main
                return {
                  color:
                    palette.mode === 'dark'
                      ? palette.info.light
                      : palette.info.dark,
                  bgcolor: alpha(tone, palette.mode === 'dark' ? 0.22 : 0.12),
                  border: `1px solid ${alpha(
                    tone,
                    palette.mode === 'dark' ? 0.44 : 0.3,
                  )}`,
                  boxShadow: `0 0 0 3px ${alpha(tone, 0.08)}`,
                }
              }}
            >
              <BaseLoading />
            </Widget>
          )}

          {delay === -1 && (
            <Widget
              className="the-check"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDelay()
              }}
              sx={({ palette }) => ({
                color:
                  palette.mode === 'dark'
                    ? palette.info.light
                    : palette.primary.dark,
                bgcolor: alpha(
                  palette.info.main,
                  palette.mode === 'dark' ? 0.2 : 0.1,
                ),
                border: `1px solid ${alpha(
                  palette.info.main,
                  palette.mode === 'dark' ? 0.42 : 0.26,
                )}`,
                boxShadow: `0 0 0 3px ${alpha(palette.info.main, 0.07)}`,
                ':hover': {
                  bgcolor: alpha(
                    palette.info.main,
                    palette.mode === 'dark' ? 0.28 : 0.16,
                  ),
                  borderColor: alpha(
                    palette.info.main,
                    palette.mode === 'dark' ? 0.58 : 0.36,
                  ),
                },
              })}
            >
              {t('tests.components.item.actions.test')}
            </Widget>
          )}

          {delay >= 0 && (
            // 显示延迟
            <Widget
              className="the-delay"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDelay()
              }}
              sx={({ palette }) => {
                const isError = delay === 0 || delay >= 10000
                const tone = isError
                  ? palette.error.main
                  : delay >= 400
                    ? palette.warning.main
                    : delay >= 250
                      ? palette.info.main
                      : palette.success.main
                const textColor = isError
                  ? palette.mode === 'dark'
                    ? palette.error.light
                    : palette.error.dark
                  : delay >= 400
                    ? palette.mode === 'dark'
                      ? palette.warning.light
                      : palette.warning.dark
                    : delay >= 250
                      ? palette.mode === 'dark'
                        ? palette.info.light
                        : palette.info.dark
                      : palette.mode === 'dark'
                        ? palette.success.light
                        : palette.success.dark

                return {
                  color: textColor,
                  bgcolor: alpha(tone, palette.mode === 'dark' ? 0.22 : 0.12),
                  border: `1px solid ${alpha(
                    tone,
                    palette.mode === 'dark' ? 0.48 : 0.34,
                  )}`,
                  boxShadow: `0 0 0 3px ${alpha(tone, 0.08)}`,
                  ':hover': {
                    bgcolor: alpha(tone, palette.mode === 'dark' ? 0.3 : 0.18),
                    borderColor: alpha(
                      tone,
                      palette.mode === 'dark' ? 0.64 : 0.44,
                    ),
                  },
                }
              }}
            >
              {delayManager.formatDelay(delay)}
            </Widget>
          )}
        </Box>
      </TestBox>

      <Menu
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorPosition={position}
        anchorReference="anchorPosition"
        transitionDuration={225}
        slotProps={{ list: { sx: { py: 0.5 } } }}
        onContextMenu={(e) => {
          setAnchorEl(null)
          e.preventDefault()
        }}
      >
        {menu.map((item) => (
          <MenuItem
            key={item.label}
            onClick={item.handler}
            sx={{ minWidth: 120 }}
            dense
          >
            {t(item.label)}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  )
}
const Widget = styled(Box)(({ theme: { typography } }) => ({
  minWidth: 42,
  padding: '3px 8px',
  fontSize: 14,
  fontFamily: typography.fontFamily,
  fontWeight: 850,
  lineHeight: 1.28,
  textAlign: 'center',
  borderRadius: 999,
  transition: 'background-color 180ms ease, border-color 180ms ease',
}))
