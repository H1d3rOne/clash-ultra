import { Box, Typography, alpha, useTheme, keyframes } from '@mui/material'
import React, { forwardRef, ReactNode } from 'react'

// 呼吸光晕动画 — 卡片静息时微弱脉动，增加"活"的质感
const breatheGlow = keyframes`
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.6; }
`

// 极慢的棱镜流光：只改变内部光影，不改变布局占位
const prismFloat = keyframes`
  0%, 100% { opacity: 0.18; transform: translate3d(-3%, -2%, 0) rotate(0deg); }
  50% { opacity: 0.34; transform: translate3d(3%, 2%, 0) rotate(6deg); }
`

// 自定义卡片组件接口
interface EnhancedCardProps {
  title: ReactNode
  icon: ReactNode
  action?: ReactNode
  children: ReactNode
  iconColor?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success'
  minHeight?: number | string
  noContentPadding?: boolean
}

// 自定义卡片组件 — 3D 立体玻璃态
export const EnhancedCard = forwardRef<HTMLElement, EnhancedCardProps>(
  (
    {
      title,
      icon,
      action,
      children,
      iconColor = 'primary',
      minHeight,
      noContentPadding = false,
    },
    ref,
  ) => {
    const theme = useTheme()
    const isDark = theme.palette.mode === 'dark'

    // 统一的标题截断样式
    const titleTruncateStyle = {
      minWidth: 0,
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      display: 'block',
    }

    const accent = theme.palette[iconColor].main
    const secondaryAccent = theme.palette.secondary.main

    return (
      <Box
        className="home-enhanced-card"
        sx={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 2.5,
          overflow: 'hidden',
          // ——— 3D 透视基础 ———
          transform: 'perspective(800px) translateZ(0)',
          transformStyle: 'preserve-3d',
          // ——— 深度层叠背景 ———
          backgroundColor: isDark
            ? alpha('#12141f', 0.82)
            : alpha('#ffffff', 0.88),
          backgroundImage: isDark
            ? `
              radial-gradient(ellipse 80% 50% at 10% 0%, ${alpha(accent, 0.26)}, transparent),
              radial-gradient(ellipse 58% 42% at 100% 100%, ${alpha(secondaryAccent, 0.1)}, transparent),
              linear-gradient(165deg, ${alpha('#ffffff', 0.1)} 0%, transparent 40%),
              linear-gradient(335deg, ${alpha(secondaryAccent, 0.06)}, transparent 38%)
            `
            : `
              radial-gradient(ellipse 78% 48% at 10% 0%, ${alpha(accent, 0.13)}, transparent),
              radial-gradient(ellipse 60% 42% at 100% 100%, ${alpha(secondaryAccent, 0.1)}, transparent),
              linear-gradient(165deg, ${alpha('#ffffff', 0.88)} 0%, transparent 45%),
              linear-gradient(335deg, ${alpha(secondaryAccent, 0.06)}, transparent 40%)
            `,
          // ——— 多层阴影模拟3D深度 ———
          //   层1: 远投 — 模拟卡片离桌面较远的柔和阴影
          //   层2: 近投 — 模拟紧贴底部的锐利阴影
          //   层3: 内顶高光 — 模拟光线从上方照射
          //   层4: 内底暗边 — 模拟下边缘遮挡光线
          boxShadow: isDark
            ? [
                `0 2px 4px ${alpha('#000000', 0.2)}`,
                `0 8px 16px ${alpha('#000000', 0.25)}`,
                `0 20px 44px ${alpha('#000000', 0.35)}`,
                `0 40px 80px ${alpha('#000000', 0.18)}`,
                `inset 0 1px 0 ${alpha('#ffffff', 0.08)}`,
                `inset 0 -1px 0 ${alpha('#000000', 0.15)}`,
              ].join(', ')
            : [
                `0 1px 2px ${alpha(accent, 0.04)}`,
                `0 4px 8px ${alpha(accent, 0.06)}`,
                `0 12px 28px ${alpha(accent, 0.08)}`,
                `0 28px 58px ${alpha(secondaryAccent, 0.055)}`,
                `inset 0 1px 0 ${alpha('#ffffff', 0.75)}`,
                `inset 0 -1px 0 ${alpha('#000000', 0.04)}`,
              ].join(', '),
          // ——— 磨砂玻璃 ———
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          // ——— 3D边框 ——— 顶边亮、底边暗，制造凸起感
          border: '1px solid',
          borderColor: isDark
            ? `${alpha('#ffffff', 0.1)} ${alpha('#ffffff', 0.04)} ${alpha('#000000', 0.3)} ${alpha('#ffffff', 0.04)}`
            : `${alpha('#ffffff', 0.9)} ${alpha(accent, 0.12)} ${alpha(accent, 0.08)} ${alpha(accent, 0.12)}`,
          // ——— 平滑过渡 ———
          transition:
            'transform .35s cubic-bezier(.2,.8,.2,1), box-shadow .35s cubic-bezier(.2,.8,.2,1), border-color .3s ease',

          // ——— 渐变边框（对角线高光） ———
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            padding: '1px',
            background: isDark
              ? `linear-gradient(135deg, ${alpha(accent, 0.58)}, ${alpha(secondaryAccent, 0.14)} 36%, transparent 58%, ${alpha(accent, 0.16)})`
              : `linear-gradient(135deg, ${alpha('#ffffff', 0.86)}, ${alpha(accent, 0.18)} 38%, transparent 60%, ${alpha(secondaryAccent, 0.26)})`,
            WebkitMask:
              'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            pointerEvents: 'none',
          },
          // ——— 顶部弧形高光条 ——— 模拟光线打在顶部边缘
          '&::after': {
            content: '""',
            position: 'absolute',
            left: 16,
            right: 16,
            top: 0,
            height: 3,
            borderRadius: '0 0 999px 999px',
            background: isDark
              ? `linear-gradient(90deg, transparent, ${alpha(accent, 0.78)}, ${alpha(secondaryAccent, 0.5)}, transparent)`
              : `linear-gradient(90deg, transparent, ${alpha('#ffffff', 0.96)}, ${alpha(secondaryAccent, 0.36)}, transparent)`,
            pointerEvents: 'none',
            animation: `${breatheGlow} 4s ease-in-out infinite`,
          },
          // ——— hover 3D 浮起效果 ———
          '&:hover': {
            transform: 'perspective(800px) translateZ(12px) translateY(-4px)',
            borderColor: isDark
              ? `${alpha(accent, 0.55)} ${alpha(accent, 0.2)} ${alpha('#000000', 0.4)} ${alpha(accent, 0.2)}`
              : `${alpha(accent, 0.6)} ${alpha(accent, 0.2)} ${alpha(accent, 0.12)} ${alpha(accent, 0.2)}`,
            boxShadow: isDark
              ? [
                  `0 4px 8px ${alpha('#000000', 0.25)}`,
                  `0 14px 28px ${alpha('#000000', 0.3)}`,
                  `0 28px 56px ${alpha('#000000', 0.35)}`,
                  `0 56px 100px ${alpha('#000000', 0.2)}`,
                  `0 0 30px ${alpha(accent, 0.2)}`,
                  `inset 0 1px 0 ${alpha('#ffffff', 0.12)}`,
                  `inset 0 -1px 0 ${alpha('#000000', 0.2)}`,
                ].join(', ')
              : [
                  `0 2px 4px ${alpha(accent, 0.06)}`,
                  `0 8px 16px ${alpha(accent, 0.1)}`,
                  `0 20px 44px ${alpha(accent, 0.12)}`,
                  `0 44px 78px ${alpha(secondaryAccent, 0.07)}`,
                  `0 0 24px ${alpha(accent, 0.1)}`,
                  `inset 0 1px 0 ${alpha('#ffffff', 0.85)}`,
                  `inset 0 -1px 0 ${alpha('#000000', 0.06)}`,
                ].join(', '),
          },
          '&:hover .home-enhanced-card__header-icon': {
            transform: 'translateY(-1px) rotate(-2deg) scale(1.04)',
          },
          '&:hover .home-enhanced-card__orbital': {
            opacity: 0.9,
            transform: 'translateY(50%) scale(1.04)',
          },
        }}
        ref={ref}
      >
        {/* ——— 内部光斑层 ——— 模拟环境光在卡片表面的漫反射 ——— */}
        <Box
          className="home-enhanced-card__ambient"
          aria-hidden="true"
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 0,
            minHeight: 0,
            maxHeight: 0,
            padding: 0,
            overflow: 'hidden',
            borderRadius: 'inherit',
            pointerEvents: 'none',
            background: isDark
              ? `radial-gradient(ellipse 50% 30% at 30% 15%, ${alpha(accent, 0.08)}, transparent)`
              : `radial-gradient(ellipse 50% 30% at 30% 15%, ${alpha('#ffffff', 0.5)}, transparent)`,
            zIndex: 0,
          }}
        />
        <Box
          className="home-enhanced-card__prism"
          aria-hidden="true"
          sx={{
            position: 'absolute',
            inset: '-35% -18%',
            zIndex: 0,
            pointerEvents: 'none',
            opacity: isDark ? 0.26 : 0.2,
            background: `
              conic-gradient(from 210deg at 54% 46%,
                transparent 0deg,
                ${alpha(accent, isDark ? 0.24 : 0.16)} 54deg,
                transparent 112deg,
                ${alpha(secondaryAccent, isDark ? 0.2 : 0.14)} 178deg,
                transparent 246deg,
                ${alpha('#7DEBDD', isDark ? 0.14 : 0.11)} 304deg,
                transparent 360deg)
            `,
            filter: 'blur(22px)',
            mixBlendMode: isDark ? 'screen' : 'normal',
            animation: `${prismFloat} 9s ease-in-out infinite`,
          }}
        />
        {/* ——— 底部阴影投射区 ——— 仅在 overflow:visible 主题下可见，不影响卡片尺寸 ——— */}
        <Box
          className="home-enhanced-card__shadow-floor"
          aria-hidden="true"
          sx={{
            position: 'absolute',
            left: '10%',
            right: '10%',
            bottom: 0,
            height: 8,
            borderRadius: '50%',
            background: isDark
              ? `radial-gradient(ellipse, ${alpha(accent, 0.1)}, transparent 70%)`
              : `radial-gradient(ellipse, ${alpha(accent, 0.05)}, transparent 70%)`,
            filter: 'blur(4px)',
            pointerEvents: 'none',
            zIndex: -1,
            transform: 'translateY(50%)',
            transition:
              'opacity .35s ease, transform .35s cubic-bezier(.2,.8,.2,1)',
          }}
        />
        {/* ——— 绝对定位装饰层：不参与 flex 排版，不改变卡片占位尺寸 ——— */}
        <Box
          className="home-enhanced-card__index"
          aria-hidden="true"
          sx={{
            position: 'absolute',
            top: 12,
            right: 16,
            zIndex: 0,
            pointerEvents: 'none',
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: '0.16em',
            lineHeight: 1,
            color: 'transparent',
            background: `linear-gradient(90deg, ${alpha(accent, isDark ? 0.12 : 0.1)}, ${alpha(secondaryAccent, isDark ? 0.08 : 0.07)})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
          }}
        >
          FLUX
        </Box>
        <Box
          className="home-enhanced-card__corner"
          aria-hidden="true"
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            zIndex: 0,
            width: 48,
            height: 48,
            pointerEvents: 'none',
            background: `
              linear-gradient(135deg, transparent 49%, ${alpha('#ffffff', isDark ? 0.08 : 0.54)} 50%, transparent 56%),
              radial-gradient(circle at 100% 0%, ${alpha(secondaryAccent, isDark ? 0.2 : 0.16)}, transparent 58%)
            `,
            opacity: 0.82,
          }}
        />
        <Box
          className="home-enhanced-card__orbital"
          aria-hidden="true"
          sx={{
            position: 'absolute',
            right: -24,
            bottom: -24,
            zIndex: 0,
            width: 92,
            height: 92,
            borderRadius: '50%',
            pointerEvents: 'none',
            background: `radial-gradient(circle at 34% 32%, ${alpha('#ffffff', isDark ? 0.05 : 0.28)}, transparent 34%)`,
            boxShadow: [
              `inset 0 0 0 1px ${alpha(accent, isDark ? 0.12 : 0.1)}`,
              `inset 0 0 0 12px ${alpha(secondaryAccent, isDark ? 0.035 : 0.04)}`,
            ].join(', '),
            opacity: 0.7,
          }}
        />
        <Box
          className="home-enhanced-card__scanline"
          aria-hidden="true"
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 0,
            height: 1,
            pointerEvents: 'none',
            background: `linear-gradient(90deg, transparent, ${alpha(accent, isDark ? 0.22 : 0.16)}, ${alpha(secondaryAccent, isDark ? 0.18 : 0.13)}, transparent)`,
          }}
        />
        {/* ——— 头部 ——— */}
        <Box
          className="home-enhanced-card__header"
          sx={{
            position: 'relative',
            px: 2,
            py: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: isDark
              ? `linear-gradient(90deg, ${alpha('#ffffff', 0.055)}, transparent 46%, ${alpha(secondaryAccent, 0.04)})`
              : `linear-gradient(90deg, ${alpha('#ffffff', 0.62)}, ${alpha(accent, 0.045)} 46%, ${alpha(secondaryAccent, 0.05)})`,
            // 分隔线：上亮下暗，制造内凹刻痕效果
            borderBottom: '1px solid',
            borderColor: isDark ? alpha(accent, 0.15) : alpha(accent, 0.085),
            // 分隔线下方加一条淡高光，加深内凹感
            '&::after': {
              content: '""',
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: -1,
              height: 1,
              background: isDark
                ? `linear-gradient(90deg, transparent, ${alpha('#ffffff', 0.06)}, transparent)`
                : `linear-gradient(90deg, transparent, ${alpha('#ffffff', 0.52)}, ${alpha(secondaryAccent, 0.16)}, transparent)`,
              pointerEvents: 'none',
            },
            zIndex: 1,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              minWidth: 0,
              flex: 1,
              overflow: 'hidden',
            }}
          >
            {/* ——— 图标容器：3D 浮雕效果 ——— */}
            <Box
              className="home-enhanced-card__header-icon"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                borderRadius: 1.5,
                width: 38,
                height: 38,
                mr: 1.5,
                flexShrink: 0,
                transition:
                  'transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s ease',
                // 3D 内凹容器：顶边亮，底边暗
                background: isDark
                  ? `linear-gradient(145deg, ${alpha(accent, 0.28)}, ${alpha(secondaryAccent, 0.1)} 52%, ${alpha('#000000', 0.08)})`
                  : `linear-gradient(145deg, ${alpha('#ffffff', 0.92)}, ${alpha(accent, 0.12)} 54%, ${alpha(secondaryAccent, 0.09)})`,
                border: '1px solid',
                borderColor: isDark
                  ? `${alpha(accent, 0.4)} ${alpha(accent, 0.15)} ${alpha('#000000', 0.3)} ${alpha(accent, 0.15)}`
                  : `${alpha('#ffffff', 0.9)} ${alpha(accent, 0.15)} ${alpha(accent, 0.08)} ${alpha(accent, 0.15)}`,
                color: accent,
                boxShadow: isDark
                  ? [
                      `0 2px 6px ${alpha(accent, 0.25)}`,
                      `0 6px 16px ${alpha(accent, 0.15)}`,
                      `inset 0 1px 0 ${alpha('#ffffff', 0.12)}`,
                      `inset 0 -1px 2px ${alpha('#000000', 0.2)}`,
                    ].join(', ')
                  : [
                      `0 2px 4px ${alpha(accent, 0.12)}`,
                      `0 6px 14px ${alpha(accent, 0.08)}`,
                      `inset 0 1px 0 ${alpha('#ffffff', 0.8)}`,
                      `inset 0 -1px 2px ${alpha(accent, 0.06)}`,
                    ].join(', '),
                // 图标内部加一个微妙的径向光晕
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  inset: 2,
                  borderRadius: 'inherit',
                  background: `radial-gradient(circle at 35% 30%, ${alpha(accent, isDark ? 0.15 : 0.08)}, transparent 70%)`,
                  pointerEvents: 'none',
                },
                '& svg': {
                  position: 'relative',
                  zIndex: 1,
                  filter: isDark
                    ? `drop-shadow(0 0 8px ${alpha(accent, 0.36)})`
                    : `drop-shadow(0 4px 7px ${alpha(accent, 0.18)})`,
                },
              }}
            >
              {icon}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              {typeof title === 'string' ? (
                <Typography
                  variant="h6"
                  sx={{
                    ...titleTruncateStyle,
                    fontWeight: 700,
                    fontSize: 18,
                    color: isDark
                      ? theme.palette.text.primary
                      : alpha('#0A1024', 0.92),
                    // 标题文字微妙的文字阴影，增加凹刻感
                    textShadow: isDark
                      ? `0 1px 2px ${alpha('#000000', 0.4)}`
                      : `0 1px 0 ${alpha('#ffffff', 0.9)}`,
                  }}
                  title={title}
                >
                  {title}
                </Typography>
              ) : (
                <Box sx={titleTruncateStyle}>{title}</Box>
              )}
            </Box>
          </Box>
          {action && <Box sx={{ ml: 2, flexShrink: 0 }}>{action}</Box>}
        </Box>
        {/* ——— 内容区 ——— */}
        <Box
          className="home-enhanced-card__body"
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            p: noContentPadding ? 0 : 2,
            position: 'relative',
            zIndex: 1,
            ...(minHeight && { minHeight }),
          }}
        >
          {children}
        </Box>
      </Box>
    )
  },
)
