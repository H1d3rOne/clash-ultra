import {
  ChevronLeftRounded,
  ChevronRightRounded,
  CloudUploadOutlined,
  DnsOutlined,
  EventOutlined,
  LaunchOutlined,
  SpeedOutlined,
  StorageOutlined,
  UpdateOutlined,
} from '@mui/icons-material'
import {
  Box,
  Button,
  IconButton,
  LinearProgress,
  Link,
  Stack,
  Typography,
  alpha,
  keyframes,
  styled,
  useTheme,
} from '@mui/material'
import { useInterval, useLockFn } from 'ahooks'
import dayjs from 'dayjs'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { useAppRefreshers } from '@/providers/app-data-context'
import { openWebUrl, updateProfile } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import parseTraffic from '@/utils/parse-traffic'

import { EnhancedCard } from './enhanced-card'

// 定义旋转动画
const round = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`

// 辅助函数解析URL和过期时间
const parseUrl = (url?: string) => {
  if (!url) return '-'
  if (url.startsWith('http')) return new URL(url).host
  return 'local'
}

const parseExpire = (expire?: number) => {
  if (!expire) return '-'
  return dayjs(expire * 1000).format('YYYY-MM-DD')
}

// 使用类型定义，而不是导入
interface ProfileExtra {
  upload: number
  download: number
  total: number
  expire: number
}

interface ProfileItem {
  uid: string
  type?: 'local' | 'remote' | 'merge' | 'script'
  name?: string
  desc?: string
  file?: string
  url?: string
  updated?: number
  extra?: ProfileExtra
  home?: string
  option?: any
}

interface HomeProfileCardProps {
  profiles?: ProfileItem[]
  onProfileUpdated?: () => void
}

const EMPTY_PROFILE_LIST: ProfileItem[] = []

const CarouselViewport = styled(Box)(({ theme }) => ({
  position: 'relative',
  overflow: 'hidden',
  borderRadius: theme.spacing(2),
}))

const CarouselSlide = styled(Box)(({ theme }) => ({
  minWidth: '100%',
  transition: theme.transitions.create('transform', {
    duration: theme.transitions.duration.standard,
    easing: theme.transitions.easing.easeInOut,
  }),
}))

// 提取独立组件减少主组件复杂度
const ProfileDetails = ({
  current,
  onUpdateProfile,
  updating,
}: {
  current: ProfileItem
  onUpdateProfile: () => void
  updating: boolean
}) => {
  const { t } = useTranslation()
  const theme = useTheme()

  const usedTraffic = useMemo(() => {
    if (!current.extra) return 0
    return current.extra.upload + current.extra.download
  }, [current.extra])

  const trafficPercentage = useMemo(() => {
    if (!current.extra || !current.extra.total || current.extra.total <= 0)
      return 0
    return Math.min(Math.round((usedTraffic / current.extra.total) * 100), 100)
  }, [current.extra, usedTraffic])

  return (
    <Box>
      <Stack spacing={2}>
        {current.url && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <DnsOutlined fontSize="small" color="action" />
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{ display: 'flex', alignItems: 'center' }}
            >
              <span style={{ flexShrink: 0 }}>{t('shared.labels.from')}: </span>
              {current.home ? (
                <Link
                  component="button"
                  onClick={() => current.home && openWebUrl(current.home)}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minWidth: 0,
                    maxWidth: 'calc(100% - 40px)',
                    ml: 0.5,
                    fontWeight: 'medium',
                  }}
                  title={parseUrl(current.url)}
                >
                  <Typography
                    component="span"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    {parseUrl(current.url)}
                  </Typography>
                  <LaunchOutlined
                    fontSize="inherit"
                    sx={{
                      ml: 0.5,
                      fontSize: '0.8rem',
                      opacity: 0.7,
                      flexShrink: 0,
                    }}
                  />
                </Link>
              ) : (
                <Typography
                  component="span"
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                    flex: 1,
                    ml: 0.5,
                    fontWeight: 'medium',
                  }}
                  title={parseUrl(current.url)}
                >
                  {parseUrl(current.url)}
                </Typography>
              )}
            </Typography>
          </Stack>
        )}

        {current.updated && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <UpdateOutlined
              fontSize="small"
              color="action"
              sx={{
                cursor: 'pointer',
                animation: updating ? `${round} 1.5s linear infinite` : 'none',
              }}
              onClick={onUpdateProfile}
            />
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ cursor: 'pointer' }}
              onClick={onUpdateProfile}
            >
              {t('shared.labels.updateTime')}:{' '}
              <Box component="span" sx={{ fontWeight: 'medium' }}>
                {dayjs(current.updated * 1000).format('YYYY-MM-DD HH:mm')}
              </Box>
            </Typography>
          </Stack>
        )}

        {current.extra && (
          <>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <SpeedOutlined fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {t('shared.labels.usedTotal')}:{' '}
                <Box component="span" sx={{ fontWeight: 'medium' }}>
                  {parseTraffic(usedTraffic)} /{' '}
                  {parseTraffic(current.extra.total)}
                </Box>
              </Typography>
            </Stack>

            {current.extra.expire > 0 && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <EventOutlined fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  {t('shared.labels.expireTime')}:{' '}
                  <Box component="span" sx={{ fontWeight: 'medium' }}>
                    {parseExpire(current.extra.expire)}
                  </Box>
                </Typography>
              </Stack>
            )}

            <Box sx={{ mt: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mb: 0.5, display: 'block' }}
              >
                {trafficPercentage}%
              </Typography>
              <LinearProgress
                variant="determinate"
                value={trafficPercentage}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: alpha(theme.palette.primary.main, 0.12),
                }}
              />
            </Box>
          </>
        )}
      </Stack>
    </Box>
  )
}

// 提取空订阅组件
const EmptyProfile = ({ onClick }: { onClick: () => void }) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 2.4,
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
        borderRadius: 2,
      }}
      onClick={onClick}
    >
      <CloudUploadOutlined
        sx={{ fontSize: 60, color: 'primary.main', mb: 2 }}
      />
      <Typography variant="h6" gutterBottom>
        暂无已启用订阅
      </Typography>
      <Typography variant="body2" color="text.secondary">
        点击前往订阅页面启用或导入订阅
      </Typography>
    </Box>
  )
}

export const HomeProfileCard = ({
  profiles = EMPTY_PROFILE_LIST,
  onProfileUpdated,
}: HomeProfileCardProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { refreshAll } = useAppRefreshers()

  // 更新当前展示的启用订阅
  const [updating, setUpdating] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const profileList = useMemo(
    () =>
      profiles.filter(
        (item) => item && ['remote', 'local'].includes(item.type ?? ''),
      ),
    [profiles],
  )
  const profileCount = profileList.length
  const safeActiveIndex =
    profileCount === 0 ? 0 : Math.min(activeIndex, profileCount - 1)
  const activeProfile = profileList[safeActiveIndex]

  const onUpdateProfile = useLockFn(async () => {
    if (!activeProfile?.uid) return

    setUpdating(true)
    try {
      await updateProfile(activeProfile.uid, activeProfile.option)
      onProfileUpdated?.()

      // 刷新首页数据
      refreshAll()
    } catch (err) {
      showNotice.error(err, 3000)
    } finally {
      setUpdating(false)
    }
  })

  // 导航到订阅页面
  const goToProfiles = useCallback(() => {
    navigate('/profile')
  }, [navigate])

  const goPrev = useCallback(() => {
    if (profileCount <= 1) return
    setActiveIndex((prev) => (prev - 1 + profileCount) % profileCount)
  }, [profileCount])

  const goNext = useCallback(() => {
    if (profileCount <= 1) return
    setActiveIndex((prev) => (prev + 1) % profileCount)
  }, [profileCount])

  const goToProfile = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  useInterval(
    () => {
      setActiveIndex((prev) => (prev + 1) % profileCount)
    },
    profileCount > 1 ? 6000 : undefined,
  )

  // 卡片标题
  const cardTitle = useMemo(() => {
    if (!activeProfile) return t('profiles.page.title')

    if (!activeProfile.home) return activeProfile.name

    return (
      <Link
        component="button"
        variant="h6"
        onClick={() => activeProfile.home && openWebUrl(activeProfile.home)}
        sx={{
          color: 'inherit',
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          maxWidth: '100%',
          fontWeight: 'medium',
          fontSize: 18,
          '& > span': {
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          },
        }}
        title={activeProfile.name}
      >
        <span>{activeProfile.name}</span>
        <LaunchOutlined
          fontSize="inherit"
          sx={{
            ml: 0.5,
            fontSize: '0.8rem',
            opacity: 0.7,
            flexShrink: 0,
          }}
        />
      </Link>
    )
  }, [activeProfile, t])

  // 卡片操作按钮
  const cardAction = useMemo(() => {
    if (!activeProfile) return null

    return (
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        {profileCount > 1 && (
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                minWidth: 34,
                textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {safeActiveIndex + 1}/{profileCount}
            </Typography>
            <IconButton
              size="small"
              onClick={goPrev}
              aria-label="上一个启用订阅"
              sx={{ width: 28, height: 28 }}
            >
              <ChevronLeftRounded fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={goNext}
              aria-label="下一个启用订阅"
              sx={{ width: 28, height: 28 }}
            >
              <ChevronRightRounded fontSize="small" />
            </IconButton>
          </>
        )}
        <Button
          variant="outlined"
          size="small"
          onClick={goToProfiles}
          endIcon={<StorageOutlined fontSize="small" />}
          sx={{ borderRadius: 1.5 }}
        >
          {t('layout.components.navigation.tabs.profiles')}
        </Button>
      </Stack>
    )
  }, [
    activeProfile,
    goNext,
    goPrev,
    goToProfiles,
    profileCount,
    safeActiveIndex,
    t,
  ])

  return (
    <EnhancedCard
      title={cardTitle}
      icon={<CloudUploadOutlined />}
      iconColor="info"
      action={cardAction}
    >
      {profileCount > 0 ? (
        <Stack spacing={1.25}>
          <CarouselViewport>
            <Box
              sx={{
                display: 'flex',
                transform: `translateX(-${safeActiveIndex * 100}%)`,
                transition: (theme) =>
                  theme.transitions.create('transform', {
                    duration: theme.transitions.duration.standard,
                    easing: theme.transitions.easing.easeInOut,
                  }),
              }}
            >
              {profileList.map((profile) => (
                <CarouselSlide key={profile.uid}>
                  <ProfileDetails
                    current={profile}
                    onUpdateProfile={onUpdateProfile}
                    updating={updating && profile.uid === activeProfile?.uid}
                  />
                </CarouselSlide>
              ))}
            </Box>
          </CarouselViewport>

          {profileCount > 1 && (
            <Stack
              direction="row"
              spacing={0.75}
              sx={{
                alignItems: 'center',
                justifyContent: 'center',
                pt: 0.25,
              }}
            >
              {profileList.map((profile, index) => {
                const selected = index === safeActiveIndex
                return (
                  <Box
                    key={profile.uid}
                    component="button"
                    type="button"
                    aria-label={`切换到订阅 ${profile.name || index + 1}`}
                    title={profile.name}
                    onClick={() => goToProfile(index)}
                    sx={{
                      width: selected ? 18 : 7,
                      height: 7,
                      p: 0,
                      border: 0,
                      borderRadius: 999,
                      cursor: 'pointer',
                      bgcolor: selected ? 'primary.main' : 'action.disabled',
                      opacity: selected ? 1 : 0.55,
                      transition: (theme) =>
                        theme.transitions.create(
                          ['width', 'background-color', 'opacity'],
                          {
                            duration: theme.transitions.duration.shortest,
                          },
                        ),
                    }}
                  />
                )
              })}
            </Stack>
          )}
        </Stack>
      ) : (
        <EmptyProfile onClick={goToProfiles} />
      )}
    </EnhancedCard>
  )
}
