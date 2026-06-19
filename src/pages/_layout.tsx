import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Box,
  Menu,
  MenuItem,
  Paper,
  SvgIcon,
  ThemeProvider,
  alpha,
} from '@mui/material'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { CSSProperties, ReactNode } from 'react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useOutlet } from 'react-router'

import iconDark from '@/assets/image/icon_dark.svg?react'
import iconLight from '@/assets/image/icon_light.svg?react'
import LogoSvg from '@/assets/image/logo.svg?react'
import { BaseErrorBoundary } from '@/components/base'
import { FluxBackground } from '@/components/home/flux/flux-background'
import { DockItem } from '@/components/layout/dock-item'
import { DockTraffic } from '@/components/layout/dock-traffic'
import { NoticeManager } from '@/components/layout/notice-manager'
import { UpdateButton } from '@/components/layout/update-button'
import { WindowControls } from '@/components/layout/window-controller'
import { useVerge } from '@/hooks/use-app-config'
import { useI18n } from '@/hooks/use-i18n'
import { useVisibility } from '@/hooks/use-visibility'
import { useWindowDecorations } from '@/hooks/use-window'
import { useThemeMode } from '@/services/states'
import getSystem from '@/utils/get-system'

import {
  useCustomTheme,
  useLayoutEvents,
  useLoadingOverlay,
  useNavMenuOrder,
} from './_layout/hooks'
import { handleNoticeMessage } from './_layout/utils'
import { navItems } from './_routers'
import LogsPage from './logs'

import 'dayjs/locale/ru'
import 'dayjs/locale/zh-cn'

export const portableFlag = false

type NavItem = (typeof navItems)[number]

type MenuContextPosition = { top: number; left: number }

interface SortableNavMenuItemProps {
  item: NavItem
  label: string
}

const SortableNavMenuItem = ({ item, label }: SortableNavMenuItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.path,
  })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  if (isDragging) {
    style.zIndex = 100
  }

  return (
    <DockItem
      to={item.path}
      icon={item.icon}
      sortable={{
        setNodeRef,
        attributes,
        listeners,
        style,
        isDragging,
      }}
    >
      {label}
    </DockItem>
  )
}

dayjs.extend(relativeTime)

const OS = getSystem()
const HEAVY_TRANSITION_PATHS = new Set([
  '/',
  '/ports',
  '/profile',
  '/proxies',
  '/connections',
])
const isHeavyTransitionPath = (path: string) => HEAVY_TRANSITION_PATHS.has(path)

const Layout = () => {
  const mode = useThemeMode()
  const isDark = mode !== 'light'
  const { t } = useTranslation()
  const { theme } = useCustomTheme()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const { language } = verge ?? {}
  const navCollapsed = verge?.collapse_navbar ?? false
  const { switchLanguage } = useI18n()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const isLogsPage = pathname === '/logs'
  // 日志页原来用独立的持久化浮层渲染，不在转盘层内；
  // 导航到/离开日志页时会直接覆盖当前页，导致转盘切换特效看起来消失。
  // 这里把日志页也作为当前页面内容交给 diskLayers 统一处理。
  const pageOutlet = useMemo<ReactNode>(
    () => (isLogsPage ? <LogsPage /> : outlet),
    [isLogsPage, outlet],
  )
  const themeReady = useMemo(() => Boolean(theme), [theme])
  const windowVisible = useVisibility()

  const [menuUnlocked, setMenuUnlocked] = useState(false)
  const [menuContextPosition, setMenuContextPosition] =
    useState<MenuContextPosition | null>(null)

  const windowControlsRef = useRef<any>(null)
  const { decorated } = useWindowDecorations()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleMenuOrderOptimisticUpdate = useCallback(
    (order: string[]) => {
      mutateVerge(
        (prev) => (prev ? { ...prev, menu_order: order } : prev),
        false,
      )
    },
    [mutateVerge],
  )

  const handleMenuOrderPersist = useCallback(
    (order: string[]) => patchVerge({ menu_order: order }),
    [patchVerge],
  )

  const {
    menuOrder,
    navItemMap,
    handleMenuDragEnd,
    isDefaultOrder,
    resetMenuOrder,
  } = useNavMenuOrder({
    enabled: menuUnlocked,
    items: navItems,
    storedOrder: verge?.menu_order,
    onOptimisticUpdate: handleMenuOrderOptimisticUpdate,
    onPersist: handleMenuOrderPersist,
  })

  // 圆盘连动切换：导航时同时渲染离场旧页与入场新页，两层贴在同一
  // 远下方圆心的盘面上保持固定夹角一起转，呈现整块转盘转动的连贯感。
  const DISK_ANIM_MS = 380
  const HEAVY_DISK_ANIM_MS = 380
  const activePathRef = useRef(pathname)
  const prevNavIndexRef = useRef<number | null>(menuOrder.indexOf(pathname))
  const pageOutletRef = useRef<ReactNode>(pageOutlet)
  const [diskLayers, setDiskLayers] = useState<{
    incoming: { key: string; node: ReactNode; dir: 'forward' | 'back' }
    outgoing: { key: string; node: ReactNode; dir: 'forward' | 'back' } | null
  }>(() => ({
    incoming: { key: pathname, node: pageOutlet, dir: 'forward' },
    outgoing: null,
  }))

  useLayoutEffect(() => {
    pageOutletRef.current = pageOutlet
  })

  useLayoutEffect(() => {
    if (activePathRef.current === pathname) return
    activePathRef.current = pathname

    setDiskLayers((prev) => {
      const nextNode = pageOutletRef.current

      // 同一页面不再因为 outlet 引用变化反复刷新动画层，避免导航/主题等
      // 父级重渲染时多跑一次 setState，减少切换瞬间卡顿。
      if (prev.incoming.key === pathname) {
        return prev
      }

      // 依据 Dock 实际显示顺序判断方向：目标在右→forward，在左→back
      const index = menuOrder.indexOf(pathname)
      const prevIndex = prevNavIndexRef.current
      let dir: 'forward' | 'back' = 'forward'
      if (index !== -1 && prevIndex !== null && index < prevIndex) dir = 'back'
      if (index !== -1) prevNavIndexRef.current = index
      return {
        incoming: { key: pathname, node: nextNode, dir },
        outgoing: { ...prev.incoming, dir },
      }
    })
  }, [pathname, menuOrder])

  // 转动结束后移除离场层
  const isHeavyDiskTransition = useMemo(
    () =>
      Boolean(
        diskLayers.outgoing &&
          (isHeavyTransitionPath(diskLayers.incoming.key) ||
            isHeavyTransitionPath(diskLayers.outgoing.key)),
      ),
    [diskLayers.incoming.key, diskLayers.outgoing],
  )
  const diskAnimMs = isHeavyDiskTransition ? HEAVY_DISK_ANIM_MS : DISK_ANIM_MS

  useEffect(() => {
    if (!diskLayers.outgoing) return
    const timer = setTimeout(() => {
      setDiskLayers((prev) => ({ incoming: prev.incoming, outgoing: null }))
    }, diskAnimMs)
    return () => clearTimeout(timer)
  }, [diskAnimMs, diskLayers.outgoing])

  const handleMenuContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setMenuContextPosition({ top: event.clientY, left: event.clientX })
    },
    [],
  )

  const handleMenuContextClose = useCallback(() => {
    setMenuContextPosition(null)
  }, [])

  const handleResetMenuOrder = useCallback(() => {
    setMenuContextPosition(null)
    void resetMenuOrder()
  }, [resetMenuOrder])

  const handleUnlockMenu = useCallback(() => {
    setMenuUnlocked(true)
    setMenuContextPosition(null)
  }, [])

  const handleLockMenu = useCallback(() => {
    setMenuUnlocked(false)
    setMenuContextPosition(null)
  }, [])

  const handleToggleNavCollapsed = useCallback(() => {
    setMenuContextPosition(null)
    void patchVerge({ collapse_navbar: !navCollapsed })
  }, [navCollapsed, patchVerge])

  // macOS 鱼眼放大：指针靠近时图标按距离平滑缩放，相邻项连带起伏。
  // 直接操作 DOM 避免逐帧 re-render；排序模式下让位于 dnd 的 transform。
  const dockRef = useRef<HTMLElement | null>(null)
  const dockRafRef = useRef<number | null>(null)
  const MAGNIFY_RADIUS = 88
  const MAGNIFY_BOOST = 0.28

  const applyDockMagnify = useCallback((clientX: number | null) => {
    const nav = dockRef.current
    if (!nav) return
    const items = nav.querySelectorAll<HTMLElement>('.flux-dock__item')
    items.forEach((el) => {
      if (clientX === null) {
        el.style.transform = ''
        el.style.zIndex = ''
        return
      }
      const rect = el.getBoundingClientRect()
      const center = rect.left + rect.width / 2
      const d = Math.abs(clientX - center)
      const sigma = MAGNIFY_RADIUS / 1.6
      const f = Math.exp(-(d * d) / (2 * sigma * sigma))
      const scale = 1 + MAGNIFY_BOOST * f
      const lift = -5 * f
      el.style.transform = `translate3d(0, ${lift.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`
      el.style.zIndex = `${Math.round(10 + f * 20)}`
    })
  }, [])

  const handleDockPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (menuUnlocked) return
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
        return
      const x = event.clientX
      if (dockRafRef.current !== null) cancelAnimationFrame(dockRafRef.current)
      dockRafRef.current = requestAnimationFrame(() => applyDockMagnify(x))
    },
    [menuUnlocked, applyDockMagnify],
  )

  const handleDockPointerLeave = useCallback(() => {
    if (dockRafRef.current !== null) {
      cancelAnimationFrame(dockRafRef.current)
      dockRafRef.current = null
    }
    applyDockMagnify(null)
  }, [applyDockMagnify])

  useEffect(() => {
    if (menuUnlocked) applyDockMagnify(null)
  }, [menuUnlocked, applyDockMagnify])

  const customTitlebar = useMemo(
    () =>
      !decorated ? (
        <div className="the_titlebar">
          <div
            className="the_titlebar-drag-region"
            data-tauri-drag-region="true"
          />
          <WindowControls ref={windowControlsRef} />
        </div>
      ) : null,
    [decorated],
  )

  useLoadingOverlay(themeReady)

  const handleNotice = useCallback(
    (payload: [string, string]) => {
      const [status, msg] = payload
      try {
        handleNoticeMessage(status, msg, t, navigate)
      } catch (error) {
        console.error('[通知处理] 失败:', error)
      }
    },
    [t, navigate],
  )

  useLayoutEvents(handleNotice)

  useEffect(() => {
    document.documentElement.dataset.ultraWindowVisible = windowVisible
      ? 'true'
      : 'false'

    return () => {
      delete document.documentElement.dataset.ultraWindowVisible
    }
  }, [windowVisible])

  useEffect(() => {
    if (language) {
      dayjs.locale(language === 'zh' ? 'zh-cn' : language)
      switchLanguage(language)
    }
  }, [language, switchLanguage])

  if (!themeReady) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: mode === 'light' ? '#fff' : '#181a1b',
          transition: 'background 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: mode === 'light' ? '#333' : '#fff',
        }}
      ></div>
    )
  }

  return (
    <ThemeProvider theme={theme}>
      {/* 左侧底部窗口控制按钮 */}
      <NoticeManager position={verge?.notice_position} />
      <div
        style={{
          animation: 'fadeIn 0.5s',
          WebkitAnimation: 'fadeIn 0.5s',
        }}
      />
      <style>
        {`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}
      </style>
      <Paper
        square
        elevation={0}
        className={`${OS} layout${navCollapsed ? ' layout--nav-collapsed' : ''}`}
        style={{
          borderTopLeftRadius: '0px',
          borderTopRightRadius: '0px',
        }}
        onContextMenu={(e) => {
          if (
            OS === 'windows' &&
            !['input', 'textarea'].includes(
              e.currentTarget.tagName.toLowerCase(),
            ) &&
            !e.currentTarget.isContentEditable
          ) {
            e.preventDefault()
          }
        }}
        sx={[
          ({ palette }) => ({ bgcolor: palette.background.paper }),
          OS === 'linux'
            ? {
                borderRadius: '8px',
                width: '100vw',
                height: '100vh',
              }
            : {},
        ]}
      >
        {/* Custom titlebar - rendered only when decorated is false, memoized for performance */}
        {customTitlebar}

        <FluxBackground />

        <div className="layout-content">
          {/* 顶部品牌栏 */}
          <header className="flux-topbar" data-tauri-drag-region="true">
            <div className="flux-topbar__brand" data-tauri-drag-region="true">
              <SvgIcon
                component={isDark ? iconDark : iconLight}
                style={{ height: '24px', width: '24px' }}
                inheritViewBox
              />
              <LogoSvg
                fill={isDark ? 'white' : 'black'}
                style={{ height: '14px', width: 'auto' }}
              />
              <UpdateButton className="flux-topbar__update" />
            </div>
            <div
              className="flux-topbar__spacer"
              data-tauri-drag-region="true"
            />
          </header>

          {/* 内容面板 */}
          <Box
            className="flux-main"
            sx={({ palette }) => {
              const dark = palette.mode === 'dark'
              return {
                borderColor: alpha(
                  dark ? '#ffffff' : '#1e2a4a',
                  dark ? 0.1 : 0.12,
                ),
                backgroundColor: dark
                  ? alpha('#0d1126', 0.42)
                  : alpha('#ffffff', 0.5),
                boxShadow: dark
                  ? '0 18px 50px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.05)'
                  : '0 14px 40px rgba(30,42,74,.1), inset 0 1px 0 rgba(255,255,255,.6)',
              }
            }}
          >
            <div className="the-content">
              {diskLayers.outgoing && (
                <div
                  key={diskLayers.outgoing.key}
                  className={`the-content__page the-content__page--animating${isHeavyDiskTransition ? ' the-content__page--heavy' : ''} the-content__page--out-${diskLayers.outgoing.dir}`}
                >
                  <BaseErrorBoundary>
                    {diskLayers.outgoing.node}
                  </BaseErrorBoundary>
                </div>
              )}
              <div
                key={diskLayers.incoming.key}
                className={`the-content__page${diskLayers.outgoing ? ' the-content__page--animating' : ''}${isHeavyDiskTransition ? ' the-content__page--heavy' : ''}${diskLayers.outgoing ? ` the-content__page--in-${diskLayers.incoming.dir}` : ''}`}
              >
                <BaseErrorBoundary>
                  {diskLayers.incoming.node}
                </BaseErrorBoundary>
              </div>
            </div>
          </Box>

          {/* 菜单排序模式提示 */}
          {menuUnlocked && (
            <Box
              sx={(theme) => ({
                position: 'absolute',
                bottom: 78,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 20,
                px: 1.5,
                py: 0.75,
                borderRadius: 1.5,
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                color: theme.palette.warning.contrastText,
                bgcolor:
                  theme.palette.mode === 'light'
                    ? theme.palette.warning.main
                    : theme.palette.warning.dark,
              })}
            >
              {t('layout.components.navigation.menu.reorderMode')}
            </Box>
          )}

          {/* 底部 Dock 导航 + 两侧流量 */}
          <div className="flux-dock-row">
            <DockTraffic side="up" />
            <Box
              component="nav"
              className="flux-dock"
              ref={dockRef}
              onContextMenu={handleMenuContextMenu}
              onPointerMove={handleDockPointerMove}
              onPointerLeave={handleDockPointerLeave}
              sx={({ palette }) => {
                const dark = palette.mode === 'dark'
                return {
                  backgroundColor: dark
                    ? alpha('#0d1126', 0.32)
                    : alpha('#ffffff', 0.38),
                  border: `1px solid ${alpha(dark ? '#ffffff' : '#1e2a4a', dark ? 0.16 : 0.18)}`,
                  // 分层阴影：贴地柔影 + 远距抬升投影，营造悬浮观感
                  boxShadow: dark
                    ? '0 6px 16px rgba(0,0,0,.32), 0 26px 60px -12px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.1)'
                    : '0 6px 16px rgba(30,42,74,.1), 0 24px 54px -12px rgba(30,42,74,.28), inset 0 1px 0 rgba(255,255,255,.8)',
                }
              }}
            >
              {menuUnlocked ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleMenuDragEnd}
                >
                  <SortableContext
                    items={menuOrder}
                    strategy={horizontalListSortingStrategy}
                  >
                    {menuOrder.map((path) => {
                      const item = navItemMap.get(path)
                      if (!item) {
                        return null
                      }
                      return (
                        <SortableNavMenuItem
                          key={item.path}
                          item={item}
                          label={t(item.label)}
                        />
                      )
                    })}
                  </SortableContext>
                </DndContext>
              ) : (
                menuOrder.map((path) => {
                  const item = navItemMap.get(path)
                  if (!item) {
                    return null
                  }
                  return (
                    <DockItem key={item.path} to={item.path} icon={item.icon}>
                      {t(item.label)}
                    </DockItem>
                  )
                })
              )}
            </Box>
            <DockTraffic side="down" />
          </div>

          <Menu
            open={Boolean(menuContextPosition)}
            onClose={handleMenuContextClose}
            anchorReference="anchorPosition"
            anchorPosition={
              menuContextPosition
                ? {
                    top: menuContextPosition.top,
                    left: menuContextPosition.left,
                  }
                : undefined
            }
            transitionDuration={200}
            slotProps={{
              list: {
                sx: { py: 0.5 },
              },
            }}
          >
            <MenuItem onClick={handleToggleNavCollapsed} dense>
              {navCollapsed
                ? t('layout.components.navigation.menu.expandNavBar')
                : t('layout.components.navigation.menu.collapseNavBar')}
            </MenuItem>
            <MenuItem
              onClick={menuUnlocked ? handleLockMenu : handleUnlockMenu}
              dense
            >
              {menuUnlocked
                ? t('layout.components.navigation.menu.lock')
                : t('layout.components.navigation.menu.unlock')}
            </MenuItem>
            <MenuItem
              onClick={handleResetMenuOrder}
              dense
              disabled={isDefaultOrder}
            >
              {t('layout.components.navigation.menu.restoreDefaultOrder')}
            </MenuItem>
          </Menu>
        </div>
      </Paper>
    </ThemeProvider>
  )
}

export default Layout
