import {
  alpha,
  createTheme,
  type Theme as MuiTheme,
  type Shadows,
} from '@mui/material'
import {
  getCurrentWebviewWindow,
  type WebviewWindow,
} from '@tauri-apps/api/webviewWindow'
import type { Theme as TauriOsTheme } from '@tauri-apps/api/window'
import { useEffect, useMemo } from 'react'

import { useVerge } from '@/hooks/use-app-config'
import { defaultDarkTheme, defaultTheme } from '@/pages/_theme'
import { useSetThemeMode, useThemeMode } from '@/services/states'

const CSS_INJECTION_SCOPE_ROOT = '[data-css-injection-root]'
const CSS_INJECTION_SCOPE_LIMIT =
  ':is(.monaco-editor .view-lines, .monaco-editor .view-line, .monaco-editor .margin, .monaco-editor .margin-view-overlays, .monaco-editor .view-overlays, .monaco-editor [class^="mtk"], .monaco-editor [class*=" mtk"])'
const TOP_LEVEL_AT_RULES = [
  '@charset',
  '@import',
  '@namespace',
  '@font-face',
  '@keyframes',
  '@counter-style',
  '@page',
  '@property',
  '@font-feature-values',
  '@color-profile',
]
const GLOBAL_SELECTOR_PATTERNS = [
  /(^|[\s,{])html([:.\s,{#]|$)/i,
  /(^|[\s,{])body([:.\s,{#]|$)/i,
  /(^|[\s,{]):root([:.\s,{#]|$)/i,
  /(^|[\s,{])::selection([:.\s,{#]|$)/i,
]
let cssScopeSupport: boolean | null = null
const EMPTY_THEME_SETTING: IVergeConfig['theme_setting'] = {}

const getSafeCurrentWebviewWindow = () => {
  try {
    return getCurrentWebviewWindow()
  } catch {
    return null
  }
}

const normalizeThemeColor = (value?: string) => value?.trim().toLowerCase()

const isBundledThemeCssInjection = (css?: string) => {
  if (!css?.trim()) return false

  return (
    css.includes('CLASH ULTRA PANEL') ||
    css.includes('CYBER DECK // ONLINE') ||
    css.includes('--manga-ink') ||
    css.includes('--cyber-bg') ||
    css.includes('--glass-tint')
  )
}

const isCyberpunkTheme = (setting: IVergeConfig['theme_setting'] = {}) => {
  const css = setting?.css_injection || ''
  const hasCyberpunkCss =
    css.includes('--cyber-bg') || css.includes('CYBER DECK // ONLINE')

  return (
    hasCyberpunkCss ||
    (normalizeThemeColor(setting?.primary_color) === '#00e5ff' &&
      normalizeThemeColor(setting?.secondary_color) === '#ff2bd6')
  )
}

const isMangaTheme = (setting: IVergeConfig['theme_setting'] = {}) => {
  const css = setting?.css_injection || ''
  const hasMangaCss =
    css.includes('--manga-ink') || css.includes('CLASH ULTRA PANEL')

  return (
    hasMangaCss ||
    (normalizeThemeColor(setting?.primary_color) === '#111111' &&
      normalizeThemeColor(setting?.secondary_color) === '#ff2f6d')
  )
}

const isLiquidGlassTheme = (setting: IVergeConfig['theme_setting'] = {}) => {
  const css = setting?.css_injection || ''
  const hasGlassCss =
    css.includes('--glass-tint') || css.includes('--glass-blue')

  return (
    hasGlassCss ||
    ((normalizeThemeColor(setting?.primary_color) === '#0a84ff' ||
      normalizeThemeColor(setting?.primary_color) === '#2f7bff') &&
      (normalizeThemeColor(setting?.secondary_color) === '#64d2ff' ||
        normalizeThemeColor(setting?.secondary_color) === '#70e1ff'))
  )
}

const CYBERPUNK_RUNTIME_READABILITY_CSS = `
  html[data-ultra-theme-preset="cyberpunk"] {
    color-scheme: dark;
    --cyber-bg: #050510;
    --cyber-panel: rgba(7, 14, 32, 0.96);
    --cyber-panel-strong: rgba(9, 18, 42, 0.98);
    --cyber-surface: rgba(4, 11, 28, 0.98);
    --cyber-surface-soft: rgba(7, 17, 38, 0.96);
    --cyber-card: rgba(3, 10, 28, 0.96);
    --cyber-card-hover: rgba(4, 15, 38, 0.94);
    --cyber-card-active: rgba(5, 18, 43, 0.98);
    --cyber-field: rgba(1, 8, 24, 0.88);
    --cyber-header: rgba(2, 8, 24, 0.94);
    --cyber-cyan: #00e5ff;
    --cyber-pink: #ff2bd6;
    --cyber-yellow: #f8f32b;
    --cyber-green: #00ffa3;
    --cyber-text: #eafbff;
    --cyber-muted: #9beeff;
    --cyber-active-text: #ffffff;
    --cyber-filled-text: #03111c;
    --cyber-border-soft: rgba(0, 229, 255, 0.26);
    --cyber-border: rgba(0, 229, 255, 0.5);
    --cyber-glow-soft: 0 0 16px rgba(0, 229, 255, 0.2), inset 0 0 18px rgba(0, 229, 255, 0.06);
    --background-color: var(--cyber-surface) !important;
    --background-color-alpha: rgba(0, 229, 255, 0.12) !important;
    --selection-color: rgba(255, 43, 214, 0.34) !important;
    --divider-color: rgba(0, 229, 255, 0.22) !important;
    --window-border-color: rgba(0, 229, 255, 0.44) !important;
    --scrollbar-bg: #030916 !important;
    --scrollbar-thumb: rgba(0, 229, 255, 0.42) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="light"] {
    color-scheme: light;
    --cyber-bg: #eaf7ff;
    --cyber-panel: rgba(224, 243, 255, 0.9);
    --cyber-panel-strong: rgba(244, 251, 255, 0.98);
    --cyber-surface: rgba(218, 239, 255, 0.96);
    --cyber-surface-soft: rgba(244, 251, 255, 0.94);
    --cyber-card: rgba(245, 251, 255, 0.92);
    --cyber-card-hover: rgba(232, 247, 255, 0.98);
    --cyber-card-active: rgba(222, 244, 255, 0.98);
    --cyber-field: rgba(255, 255, 255, 0.86);
    --cyber-header: rgba(239, 249, 255, 0.86);
    --cyber-text: #071126;
    --cyber-muted: #24556d;
    --cyber-active-text: #071126;
    --cyber-filled-text: #03111c;
    --cyber-border-soft: rgba(0, 130, 160, 0.32);
    --cyber-border: rgba(0, 130, 160, 0.56);
    --cyber-glow-soft: 0 0 16px rgba(0, 136, 170, 0.18), inset 0 0 18px rgba(0, 136, 170, 0.05);
    --background-color: var(--cyber-surface) !important;
    --background-color-alpha: rgba(0, 154, 190, 0.12) !important;
    --selection-color: rgba(255, 43, 214, 0.22) !important;
    --divider-color: rgba(0, 130, 160, 0.22) !important;
    --window-border-color: rgba(0, 130, 160, 0.36) !important;
    --scrollbar-bg: #d7effb !important;
    --scrollbar-thumb: rgba(0, 130, 160, 0.38) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"],
  html[data-ultra-theme-preset="cyberpunk"] body,
  html[data-ultra-theme-preset="cyberpunk"] #root {
    background: var(--cyber-bg) !important;
    color: var(--cyber-text) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] body::after {
    opacity: 0.22 !important;
  }

  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="light"] body::before {
    background:
      radial-gradient(circle at 16% 12%, rgba(0, 229, 255, 0.22) 0 9%, transparent 19%),
      radial-gradient(circle at 86% 18%, rgba(255, 43, 214, 0.18) 0 10%, transparent 21%),
      radial-gradient(circle at 72% 86%, rgba(248, 243, 43, 0.18) 0 9%, transparent 20%),
      linear-gradient(115deg, rgba(0, 130, 160, 0.1) 0 1px, transparent 1px 14px),
      linear-gradient(65deg, rgba(255, 43, 214, 0.08) 0 1px, transparent 1px 16px),
      linear-gradient(180deg, #f7fcff 0%, #dff2ff 52%, #f4e9ff 100%) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="light"] body::after {
    opacity: 0.12 !important;
    mix-blend-mode: multiply !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .layout {
    background:
      linear-gradient(90deg, rgba(0, 229, 255, 0.055) 1px, transparent 1px) 0 0 / 34px 34px,
      linear-gradient(0deg, rgba(255, 43, 214, 0.045) 1px, transparent 1px) 0 0 / 34px 34px,
      var(--cyber-bg) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .layout .layout-content__left,
  html[data-ultra-theme-preset="cyberpunk"] .layout .layout-content__right,
  html[data-ultra-theme-preset="cyberpunk"] .layout .layout-content__right .the-bar,
  html[data-ultra-theme-preset="cyberpunk"] .layout .layout-content__right .the-content,
  html[data-ultra-theme-preset="cyberpunk"] .layout .layout-content__left .the-logo,
  html[data-ultra-theme-preset="cyberpunk"] .layout .layout-content__left .the-traffic {
    color: var(--cyber-text) !important;
    border-color: var(--cyber-border-soft) !important;
    background:
      linear-gradient(135deg, rgba(0, 229, 255, 0.08), transparent 36%),
      linear-gradient(315deg, rgba(255, 43, 214, 0.08), transparent 40%),
      var(--cyber-panel) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] body,
  html[data-ultra-theme-preset="cyberpunk"] .base-page,
  html[data-ultra-theme-preset="cyberpunk"] .base-container,
  html[data-ultra-theme-preset="cyberpunk"] .base-content,
  html[data-ultra-theme-preset="cyberpunk"] .MuiTypography-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiListItemText-primary,
  html[data-ultra-theme-preset="cyberpunk"] .MuiInputBase-input,
  html[data-ultra-theme-preset="cyberpunk"] .MuiFormControlLabel-label,
  html[data-ultra-theme-preset="cyberpunk"] .MuiTableCell-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiTreeItem-label {
    color: var(--cyber-text) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiTypography-colorTextSecondary,
  html[data-ultra-theme-preset="cyberpunk"] .MuiListItemText-secondary,
  html[data-ultra-theme-preset="cyberpunk"] .MuiInputLabel-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiFormLabel-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiFormHelperText-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiTableCell-head,
  html[data-ultra-theme-preset="cyberpunk"] .MuiBreadcrumbs-separator,
  html[data-ultra-theme-preset="cyberpunk"] .MuiInputAdornment-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiInputAdornment-root .MuiTypography-root {
    color: var(--cyber-muted) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-page {
    background: transparent !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-page > header {
    border-bottom: 1px solid var(--cyber-border-soft) !important;
    color: var(--cyber-text) !important;
    background:
      linear-gradient(90deg, rgba(0, 229, 255, 0.14), transparent 38%),
      linear-gradient(270deg, rgba(255, 43, 214, 0.12), transparent 42%),
      var(--cyber-header) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-page > header .MuiTypography-root {
    color: var(--cyber-cyan) !important;
    text-shadow: 0 0 12px rgba(0, 229, 255, 0.72);
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-container,
  html[data-ultra-theme-preset="cyberpunk"] .base-container > section {
    color: var(--cyber-text) !important;
    background:
      linear-gradient(90deg, rgba(0, 229, 255, 0.045) 1px, transparent 1px) 0 0 / 30px 30px,
      linear-gradient(0deg, rgba(255, 43, 214, 0.04) 1px, transparent 1px) 0 0 / 30px 30px,
      var(--cyber-surface) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-content > .MuiBox-root,
  html[data-ultra-theme-preset="cyberpunk"] .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root,
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiGrid-root > .MuiGrid-root > .MuiBox-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiPaper-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiCard-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiDialog-paper,
  html[data-ultra-theme-preset="cyberpunk"] .MuiDrawer-paper,
  html[data-ultra-theme-preset="cyberpunk"] .MuiPopover-paper,
  html[data-ultra-theme-preset="cyberpunk"] .MuiMenu-paper,
  html[data-ultra-theme-preset="cyberpunk"] .MuiTableContainer-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiAccordion-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiAlert-root {
    color: var(--cyber-text) !important;
    border-color: var(--cyber-border-soft) !important;
    background:
      linear-gradient(135deg, rgba(0, 229, 255, 0.08), transparent 34%),
      linear-gradient(315deg, rgba(255, 43, 214, 0.08), transparent 40%),
      var(--cyber-surface-soft) !important;
    box-shadow: var(--cyber-glow-soft) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiBox-root[style*="background-color: rgb(255, 255, 255)"],
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiBox-root[style*="background-color: #ffffff"],
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiBox-root[style*="background-color: rgb(245, 245, 245)"],
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiBox-root[style*="background-color: rgb(236, 236, 236)"],
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiBox-root[style*="background-color: rgb(40, 42, 54)"],
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiBox-root[style*="background-color: #282a36"],
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiBox-root[style*="background-color: rgb(30, 31, 39)"],
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiBox-root[style*="background-color: #1e1f27"] {
    color: var(--cyber-text) !important;
    border: 1px solid var(--cyber-border-soft) !important;
    background:
      linear-gradient(135deg, rgba(0, 229, 255, 0.08), transparent 34%),
      var(--cyber-surface-soft) !important;
  }

  /* 节点列表/节点组：覆盖 sx 生成的白色节点卡片。 */
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItem-root {
    color: var(--cyber-text) !important;
    background: transparent !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root,
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root[style],
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItem-root > .MuiButtonBase-root {
    color: var(--cyber-text) !important;
    border: 1px solid rgba(0, 229, 255, 0.3) !important;
    background:
      linear-gradient(90deg, rgba(0, 229, 255, 0.1), rgba(255, 43, 214, 0.055)),
      var(--cyber-card) !important;
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.12), inset 0 0 16px rgba(0, 229, 255, 0.045) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root:hover {
    color: var(--cyber-active-text) !important;
    border-color: rgba(0, 229, 255, 0.78) !important;
    background:
      linear-gradient(90deg, rgba(0, 229, 255, 0.18), rgba(255, 43, 214, 0.12)),
      var(--cyber-card-hover) !important;
    box-shadow: 0 0 18px rgba(0, 229, 255, 0.28), inset 0 0 18px rgba(255, 43, 214, 0.08) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root.Mui-selected {
    color: var(--cyber-active-text) !important;
    border-color: var(--cyber-pink) !important;
    background:
      linear-gradient(90deg, rgba(255, 43, 214, 0.3), rgba(0, 229, 255, 0.18)),
      var(--cyber-card-active) !important;
    box-shadow: 0 0 18px rgba(255, 43, 214, 0.38), inset 3px 0 0 var(--cyber-cyan) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root .MuiTypography-root,
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root .MuiListItemText-primary,
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root .MuiListItemText-secondary,
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root .MuiBox-root,
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root span {
    color: inherit !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root .MuiListItemText-secondary,
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root .MuiTypography-colorTextSecondary {
    color: var(--cyber-muted) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root.Mui-selected .MuiListItemText-secondary,
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root:hover .MuiListItemText-secondary {
    color: rgba(234, 251, 255, 0.88) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiChip-root,
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root span[class*="TypeBox"],
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiListItemButton-root span:not(.MuiTouchRipple-root) {
    border-color: rgba(0, 229, 255, 0.44) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiTableContainer-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiTable-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiTableHead-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiTableBody-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiTableRow-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiTableCell-root {
    color: var(--cyber-text) !important;
    background-color: transparent !important;
    border-color: rgba(0, 229, 255, 0.18) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiTableCell-head,
  html[data-ultra-theme-preset="cyberpunk"] .MuiTableHead-root .MuiTableCell-root {
    color: var(--cyber-cyan) !important;
    background: rgba(0, 229, 255, 0.08) !important;
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.55);
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiOutlinedInput-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiInputBase-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiSelect-select {
    color: var(--cyber-text) !important;
    background: var(--cyber-field) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiOutlinedInput-notchedOutline {
    border-color: rgba(0, 229, 255, 0.48) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiSelect-icon,
  html[data-ultra-theme-preset="cyberpunk"] .MuiSvgIcon-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiIconButton-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiCheckbox-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiRadio-root {
    color: inherit !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiButton-root {
    color: var(--cyber-text) !important;
    border-color: rgba(0, 229, 255, 0.62) !important;
    background: linear-gradient(110deg, rgba(0, 229, 255, 0.16), rgba(255, 43, 214, 0.12)) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiButton-contained,
  html[data-ultra-theme-preset="cyberpunk"] .MuiButton-containedPrimary {
    color: var(--cyber-filled-text) !important;
    background: linear-gradient(90deg, var(--cyber-cyan), var(--cyber-pink)) !important;
    text-shadow: none !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .theme-mode-switch {
    background:
      linear-gradient(135deg, rgba(0, 229, 255, 0.1), rgba(255, 43, 214, 0.07)),
      var(--cyber-panel) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .theme-mode-switch .MuiButton-root[data-theme-mode-option] {
    color: var(--cyber-text) !important;
    border: 1px solid transparent !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .theme-mode-switch .MuiButton-root[data-theme-mode-option="light"] {
    color: var(--cyber-text) !important;
    background:
      radial-gradient(circle at 22% 22%, rgba(248, 243, 43, 0.34), transparent 34%),
      linear-gradient(135deg, rgba(0, 229, 255, 0.24), rgba(7, 17, 38, 0.92)) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .theme-mode-switch .MuiButton-root[data-theme-mode-option="dark"] {
    color: #eafbff !important;
    background: linear-gradient(180deg, #071126, #120421) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .theme-mode-switch .MuiButton-root[data-theme-mode-option="system"] {
    color: var(--cyber-text) !important;
    background:
      linear-gradient(135deg, rgba(0, 229, 255, 0.2), rgba(255, 43, 214, 0.16)),
      linear-gradient(90deg, rgba(7, 17, 38, 0.96), rgba(18, 4, 33, 0.96)) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .theme-mode-switch .MuiButton-root[data-theme-mode-option="system"] .MuiButton-startIcon,
  html[data-ultra-theme-preset="cyberpunk"] .theme-mode-switch .MuiButton-root[data-theme-mode-option="system"] .MuiButton-startIcon + * {
    filter: drop-shadow(0 0 4px rgba(0, 229, 255, 0.7));
  }

  html[data-ultra-theme-preset="cyberpunk"] .theme-mode-switch .MuiButton-root[data-active="true"] {
    border-color: var(--cyber-pink) !important;
    transform: translateY(-1px);
    box-shadow: 0 0 18px rgba(0, 229, 255, 0.5), 0 0 28px rgba(255, 43, 214, 0.26) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .theme-mode-switch .MuiButton-root[data-active="true"]::after {
    content: "";
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: 3px;
    height: 2px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--cyber-cyan), var(--cyber-pink));
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.8);
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiMenuItem-root {
    color: var(--cyber-text) !important;
    background: transparent !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiMenuItem-root:hover,
  html[data-ultra-theme-preset="cyberpunk"] .MuiMenuItem-root.Mui-selected,
  html[data-ultra-theme-preset="cyberpunk"] .Mui-selected {
    color: var(--cyber-active-text) !important;
    background: rgba(255, 43, 214, 0.18) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiTooltip-tooltip,
  html[data-ultra-theme-preset="cyberpunk"] .MuiSnackbarContent-root {
    color: var(--cyber-text) !important;
    border: 1px solid rgba(0, 229, 255, 0.62) !important;
    background: var(--cyber-panel-strong) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .the-delay,
  html[data-ultra-theme-preset="cyberpunk"] .the-speed,
  html[data-ultra-theme-preset="cyberpunk"] .the-check,
  html[data-ultra-theme-preset="cyberpunk"] .the-speed-check {
    border: 1px solid rgba(0, 229, 255, 0.44) !important;
    color: var(--cyber-cyan) !important;
    background: rgba(0, 229, 255, 0.1) !important;
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.55) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiInputBase-root.Mui-disabled,
  html[data-ultra-theme-preset="cyberpunk"] .MuiInputBase-input.Mui-disabled,
  html[data-ultra-theme-preset="cyberpunk"] .MuiButtonBase-root.Mui-disabled,
  html[data-ultra-theme-preset="cyberpunk"] .Mui-disabled {
    color: rgba(234, 251, 255, 0.46) !important;
    -webkit-text-fill-color: rgba(234, 251, 255, 0.46) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] ::selection {
    background: rgba(255, 43, 214, 0.42) !important;
    color: var(--cyber-active-text) !important;
  }
`

const MANGA_RUNTIME_READABILITY_CSS = `
  html[data-ultra-theme-preset="manga"] {
    color-scheme: light;
    --manga-ink: #111111;
    --manga-black: #111111;
    --manga-text: #111111;
    --manga-muted: #5f4b46;
    --manga-accent: #ff2f6d;
    --manga-blue: #1d4ed8;
    --manga-yellow: #fbbf24;
    --manga-paper: #fff8e8;
    --manga-page: #fff4df;
    --manga-panel: rgba(255, 252, 244, 0.96);
    --manga-panel-strong: rgba(255, 253, 247, 0.98);
    --manga-card: rgba(255, 253, 247, 0.92);
    --manga-card-hover: rgba(255, 246, 232, 0.98);
    --manga-field: rgba(255, 255, 255, 0.9);
    --manga-header: rgba(255, 248, 232, 0.92);
    --manga-border-color: rgba(17, 17, 17, 0.84);
    --manga-border-soft: rgba(17, 17, 17, 0.22);
    --manga-shadow: 6px 6px 0 rgba(17, 17, 17, 0.18);
    --manga-shadow-strong: 8px 8px 0 rgba(17, 17, 17, 0.72);
    --background-color: var(--manga-page) !important;
    --background-color-alpha: rgba(255, 47, 109, 0.1) !important;
    --selection-color: rgba(255, 47, 109, 0.28) !important;
    --divider-color: rgba(17, 17, 17, 0.18) !important;
    --window-border-color: rgba(17, 17, 17, 0.38) !important;
    --scrollbar-bg: #fff1df !important;
    --scrollbar-thumb: rgba(17, 17, 17, 0.32) !important;
  }

  html[data-ultra-theme-preset="manga"][data-ultra-theme-mode="dark"] {
    color-scheme: dark;
    --manga-ink: #fff8e8;
    --manga-black: #111111;
    --manga-text: #fff8e8;
    --manga-muted: #ffd6e2;
    --manga-accent: #ff5c93;
    --manga-blue: #7dd3fc;
    --manga-yellow: #facc15;
    --manga-paper: #17131a;
    --manga-page: #0f0d12;
    --manga-panel: rgba(22, 18, 26, 0.96);
    --manga-panel-strong: rgba(29, 22, 33, 0.98);
    --manga-card: rgba(28, 22, 32, 0.9);
    --manga-card-hover: rgba(38, 28, 42, 0.98);
    --manga-field: rgba(12, 10, 15, 0.82);
    --manga-header: rgba(18, 14, 22, 0.92);
    --manga-border-color: rgba(255, 248, 232, 0.7);
    --manga-border-soft: rgba(255, 248, 232, 0.2);
    --manga-shadow: 6px 6px 0 rgba(255, 47, 109, 0.22);
    --manga-shadow-strong: 8px 8px 0 rgba(255, 47, 109, 0.34);
    --background-color: var(--manga-page) !important;
    --background-color-alpha: rgba(255, 92, 147, 0.14) !important;
    --selection-color: rgba(255, 92, 147, 0.38) !important;
    --divider-color: rgba(255, 248, 232, 0.16) !important;
    --window-border-color: rgba(255, 248, 232, 0.34) !important;
    --scrollbar-bg: #0b090d !important;
    --scrollbar-thumb: rgba(255, 92, 147, 0.46) !important;
  }

  html[data-ultra-theme-preset="manga"],
  html[data-ultra-theme-preset="manga"] body,
  html[data-ultra-theme-preset="manga"] #root {
    background: var(--manga-page) !important;
    color: var(--manga-text) !important;
  }

  html[data-ultra-theme-preset="manga"] body::before {
    background:
      radial-gradient(circle at 12% 10%, rgba(255, 47, 109, 0.16) 0 9%, transparent 9.5%),
      radial-gradient(circle at 90% 16%, rgba(29, 78, 216, 0.12) 0 11%, transparent 11.5%),
      radial-gradient(circle at 80% 88%, rgba(251, 191, 36, 0.18) 0 13%, transparent 13.5%),
      linear-gradient(135deg, #fffdf7 0%, #fff2de 48%, #ffe8ef 100%) !important;
  }

  html[data-ultra-theme-preset="manga"][data-ultra-theme-mode="dark"] body::before {
    background:
      radial-gradient(circle at 12% 10%, rgba(255, 92, 147, 0.22) 0 9%, transparent 9.5%),
      radial-gradient(circle at 90% 16%, rgba(125, 211, 252, 0.12) 0 11%, transparent 11.5%),
      radial-gradient(circle at 80% 88%, rgba(250, 204, 21, 0.14) 0 13%, transparent 13.5%),
      linear-gradient(135deg, #09080c 0%, #171018 48%, #24111c 100%) !important;
  }

  html[data-ultra-theme-preset="manga"] body::after {
    opacity: 0.5 !important;
    mix-blend-mode: multiply !important;
  }

  html[data-ultra-theme-preset="manga"][data-ultra-theme-mode="dark"] body::after {
    opacity: 0.28 !important;
    mix-blend-mode: screen !important;
    background:
      radial-gradient(circle at 1px 1px, rgba(255, 248, 232, 0.12) 1px, transparent 1.2px) 0 0 / 12px 12px,
      repeating-linear-gradient(115deg, transparent 0 18px, rgba(255, 248, 232, 0.045) 19px 20px),
      linear-gradient(105deg, transparent 0 70%, rgba(255, 92, 147, 0.14) 70.3% 72%, transparent 72.3%) !important;
  }

  html[data-ultra-theme-preset="manga"] body,
  html[data-ultra-theme-preset="manga"] .base-page,
  html[data-ultra-theme-preset="manga"] .base-container,
  html[data-ultra-theme-preset="manga"] .base-content,
  html[data-ultra-theme-preset="manga"] .MuiTypography-root,
  html[data-ultra-theme-preset="manga"] .MuiListItemText-primary,
  html[data-ultra-theme-preset="manga"] .MuiInputBase-input,
  html[data-ultra-theme-preset="manga"] .MuiFormControlLabel-label,
  html[data-ultra-theme-preset="manga"] .MuiTableCell-root,
  html[data-ultra-theme-preset="manga"] .MuiTreeItem-label {
    color: var(--manga-text) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiTypography-colorTextSecondary,
  html[data-ultra-theme-preset="manga"] .MuiListItemText-secondary,
  html[data-ultra-theme-preset="manga"] .MuiInputLabel-root,
  html[data-ultra-theme-preset="manga"] .MuiFormLabel-root,
  html[data-ultra-theme-preset="manga"] .MuiFormHelperText-root,
  html[data-ultra-theme-preset="manga"] .MuiTableCell-head,
  html[data-ultra-theme-preset="manga"] .MuiBreadcrumbs-separator,
  html[data-ultra-theme-preset="manga"] .MuiInputAdornment-root,
  html[data-ultra-theme-preset="manga"] .MuiInputAdornment-root .MuiTypography-root {
    color: var(--manga-muted) !important;
  }

  html[data-ultra-theme-preset="manga"] .layout {
    background:
      radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--manga-ink) 8%, transparent) 1px, transparent 1.2px) 0 0 / 14px 14px,
      var(--manga-page) !important;
  }

  html[data-ultra-theme-preset="manga"] .layout .layout-content__left,
  html[data-ultra-theme-preset="manga"] .layout .layout-content__right,
  html[data-ultra-theme-preset="manga"] .layout .layout-content__left .the-logo,
  html[data-ultra-theme-preset="manga"] .layout .layout-content__left .the-traffic {
    color: var(--manga-text) !important;
    border-color: var(--manga-border-color) !important;
    background:
      linear-gradient(115deg, transparent 0 76%, color-mix(in srgb, var(--manga-accent) 18%, transparent) 76.3% 79%, transparent 79.3%),
      radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--manga-ink) 8%, transparent) 1px, transparent 1.15px) 0 0 / 11px 11px,
      var(--manga-panel) !important;
    box-shadow: var(--manga-shadow-strong) !important;
  }

  html[data-ultra-theme-preset="manga"] .layout .layout-content__right .the-bar {
    color: #ffffff !important;
    border-bottom-color: var(--manga-border-color) !important;
    background:
      repeating-linear-gradient(112deg, transparent 0 16px, rgba(255, 255, 255, 0.08) 17px 18px),
      linear-gradient(90deg, #111111 0%, #2b121c 56%, var(--manga-accent) 100%) !important;
  }

  html[data-ultra-theme-preset="manga"][data-ultra-theme-mode="light"] .layout .layout-content__right .the-bar::before {
    content: "DAY MANGA PANEL" !important;
  }

  html[data-ultra-theme-preset="manga"][data-ultra-theme-mode="dark"] .layout .layout-content__right .the-bar::before {
    content: "NIGHT MANGA PANEL" !important;
  }

  html[data-ultra-theme-preset="manga"][data-ultra-theme-source="system"] .layout .layout-content__right .the-bar::after {
    content: "SYSTEM";
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%) rotate(1deg);
    padding: 3px 10px;
    border: 2px solid #fff;
    border-radius: 999px;
    color: #111111;
    background:
      linear-gradient(90deg, #fff8e8 0 50%, #111111 50% 100%);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.28);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-shadow:
      -1px -1px 0 #fff8e8,
      1px -1px 0 #fff8e8,
      -1px 1px 0 #fff8e8,
      1px 1px 0 #fff8e8;
  }

  html[data-ultra-theme-preset="manga"] .layout .layout-content__right .the-content,
  html[data-ultra-theme-preset="manga"] .base-page,
  html[data-ultra-theme-preset="manga"] .base-container,
  html[data-ultra-theme-preset="manga"] .base-container > section {
    color: var(--manga-text) !important;
    border-color: var(--manga-border-soft) !important;
    background:
      radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--manga-ink) 5%, transparent) 1px, transparent 1.15px) 0 0 / 10px 10px,
      var(--manga-header) !important;
  }

  html[data-ultra-theme-preset="manga"] .base-page > header {
    border-bottom: 2.5px solid var(--manga-border-color) !important;
    color: var(--manga-text) !important;
    background:
      linear-gradient(105deg, color-mix(in srgb, var(--manga-yellow) 18%, transparent) 0 18%, transparent 18.5%),
      var(--manga-panel-strong) !important;
  }

  html[data-ultra-theme-preset="manga"] .base-page > header .MuiTypography-root {
    color: var(--manga-text) !important;
    font-weight: 900 !important;
  }

  html[data-ultra-theme-preset="manga"] .base-content > .MuiBox-root,
  html[data-ultra-theme-preset="manga"] .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root,
  html[data-ultra-theme-preset="manga"] .base-content .MuiGrid-root > .MuiGrid-root > .MuiBox-root,
  html[data-ultra-theme-preset="manga"] .MuiPaper-root,
  html[data-ultra-theme-preset="manga"] .MuiCard-root,
  html[data-ultra-theme-preset="manga"] .MuiDialog-paper,
  html[data-ultra-theme-preset="manga"] .MuiDrawer-paper,
  html[data-ultra-theme-preset="manga"] .MuiPopover-paper,
  html[data-ultra-theme-preset="manga"] .MuiMenu-paper,
  html[data-ultra-theme-preset="manga"] .MuiTableContainer-root,
  html[data-ultra-theme-preset="manga"] .MuiAccordion-root,
  html[data-ultra-theme-preset="manga"] .MuiAlert-root {
    color: var(--manga-text) !important;
    border-color: var(--manga-border-color) !important;
    background:
      radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--manga-ink) 5%, transparent) 1px, transparent 1.2px) 0 0 / 10px 10px,
      var(--manga-card) !important;
    box-shadow: var(--manga-shadow) !important;
  }

  html[data-ultra-theme-preset="manga"] .base-content .MuiBox-root[style*="background-color: rgb(255, 255, 255)"],
  html[data-ultra-theme-preset="manga"] .base-content .MuiBox-root[style*="background-color: #ffffff"],
  html[data-ultra-theme-preset="manga"] .base-content .MuiBox-root[style*="background-color: rgb(245, 245, 245)"],
  html[data-ultra-theme-preset="manga"] .base-content .MuiBox-root[style*="background-color: rgb(236, 236, 236)"],
  html[data-ultra-theme-preset="manga"] .base-content .MuiBox-root[style*="background-color: rgb(40, 42, 54)"],
  html[data-ultra-theme-preset="manga"] .base-content .MuiBox-root[style*="background-color: #282a36"],
  html[data-ultra-theme-preset="manga"] .base-content .MuiBox-root[style*="background-color: rgb(30, 31, 39)"],
  html[data-ultra-theme-preset="manga"] .base-content .MuiBox-root[style*="background-color: #1e1f27"] {
    color: var(--manga-text) !important;
    border: 2px solid var(--manga-border-color) !important;
    background: var(--manga-card) !important;
  }

  html[data-ultra-theme-preset="manga"] .base-content .MuiListItem-root {
    color: var(--manga-text) !important;
    background: transparent !important;
  }

  html[data-ultra-theme-preset="manga"] .base-content .MuiListItemButton-root,
  html[data-ultra-theme-preset="manga"] .base-content .MuiListItemButton-root[style],
  html[data-ultra-theme-preset="manga"] .base-content .MuiListItem-root > .MuiButtonBase-root,
  html[data-ultra-theme-preset="manga"] body .MuiListItemButton-root {
    color: var(--manga-text) !important;
    border: 2px solid var(--manga-border-color) !important;
    background:
      radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--manga-ink) 6%, transparent) 1px, transparent 1.2px) 0 0 / 8px 8px,
      var(--manga-card) !important;
    box-shadow: 4px 4px 0 color-mix(in srgb, var(--manga-ink) 18%, transparent) !important;
  }

  html[data-ultra-theme-preset="manga"] .base-content .MuiListItemButton-root:hover,
  html[data-ultra-theme-preset="manga"] body .MuiListItemButton-root:hover {
    color: var(--manga-text) !important;
    border-color: var(--manga-accent) !important;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--manga-accent) 14%, transparent), transparent 45%),
      var(--manga-card-hover) !important;
    box-shadow: var(--manga-shadow) !important;
  }

  html[data-ultra-theme-preset="manga"] .base-content .MuiListItemButton-root.Mui-selected,
  html[data-ultra-theme-preset="manga"] body .MuiListItemButton-root.Mui-selected {
    color: #ffffff !important;
    border-color: var(--manga-accent) !important;
    background:
      radial-gradient(circle at 12% 18%, rgba(255, 255, 255, 0.22) 0 12%, transparent 13%),
      repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.1) 0 7px, transparent 7px 14px),
      linear-gradient(135deg, #111111 0%, #311320 54%, var(--manga-accent) 100%) !important;
    box-shadow: var(--manga-shadow-strong) !important;
  }

  html[data-ultra-theme-preset="manga"] .base-content .MuiListItemButton-root .MuiTypography-root,
  html[data-ultra-theme-preset="manga"] .base-content .MuiListItemButton-root .MuiListItemText-primary,
  html[data-ultra-theme-preset="manga"] .base-content .MuiListItemButton-root .MuiListItemText-secondary,
  html[data-ultra-theme-preset="manga"] .base-content .MuiListItemButton-root .MuiBox-root,
  html[data-ultra-theme-preset="manga"] .base-content .MuiListItemButton-root span {
    color: inherit !important;
  }

  html[data-ultra-theme-preset="manga"] .base-content .MuiListItemButton-root .MuiListItemText-secondary,
  html[data-ultra-theme-preset="manga"] .base-content .MuiListItemButton-root .MuiTypography-colorTextSecondary {
    color: var(--manga-muted) !important;
  }

  html[data-ultra-theme-preset="manga"] .base-content .MuiListItemButton-root.Mui-selected .MuiListItemText-secondary,
  html[data-ultra-theme-preset="manga"] .base-content .MuiListItemButton-root:hover .MuiListItemText-secondary {
    color: rgba(255, 255, 255, 0.86) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiOutlinedInput-root,
  html[data-ultra-theme-preset="manga"] .MuiInputBase-root,
  html[data-ultra-theme-preset="manga"] .MuiSelect-select {
    color: var(--manga-text) !important;
    background: var(--manga-field) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiOutlinedInput-notchedOutline {
    border-color: var(--manga-border-color) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiSelect-icon,
  html[data-ultra-theme-preset="manga"] .MuiSvgIcon-root,
  html[data-ultra-theme-preset="manga"] .MuiIconButton-root,
  html[data-ultra-theme-preset="manga"] .MuiCheckbox-root,
  html[data-ultra-theme-preset="manga"] .MuiRadio-root {
    color: inherit !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiButton-root {
    color: var(--manga-text) !important;
    border-color: var(--manga-border-color) !important;
    background:
      radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--manga-ink) 7%, transparent) 1px, transparent 1.2px) 0 0 / 8px 8px,
      var(--manga-card) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiButton-contained,
  html[data-ultra-theme-preset="manga"] .MuiButton-containedPrimary {
    color: #ffffff !important;
    background:
      repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.13) 0 6px, transparent 6px 12px),
      linear-gradient(135deg, #111111 0%, var(--manga-accent) 100%) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiChip-root {
    color: var(--manga-text) !important;
    border-color: var(--manga-border-color) !important;
    background: var(--manga-card) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiChip-root.MuiChip-filled,
  html[data-ultra-theme-preset="manga"] .MuiChip-root.MuiChip-filledPrimary {
    color: #ffffff !important;
    background:
      repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.13) 0 6px, transparent 6px 12px),
      linear-gradient(135deg, #111111 0%, var(--manga-accent) 100%) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiTableContainer-root,
  html[data-ultra-theme-preset="manga"] .MuiTable-root,
  html[data-ultra-theme-preset="manga"] .MuiTableHead-root,
  html[data-ultra-theme-preset="manga"] .MuiTableBody-root,
  html[data-ultra-theme-preset="manga"] .MuiTableRow-root,
  html[data-ultra-theme-preset="manga"] .MuiTableCell-root {
    color: var(--manga-text) !important;
    background-color: transparent !important;
    border-color: var(--manga-border-soft) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiTableCell-head,
  html[data-ultra-theme-preset="manga"] .MuiTableHead-root .MuiTableCell-root {
    color: var(--manga-text) !important;
    background: color-mix(in srgb, var(--manga-accent) 10%, transparent) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiTab-root.Mui-selected {
    color: var(--manga-text) !important;
    background: color-mix(in srgb, var(--manga-accent) 12%, var(--manga-card)) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiTabs-indicator {
    background:
      repeating-linear-gradient(90deg, var(--manga-ink) 0 10px, var(--manga-accent) 10px 20px) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiMenuItem-root {
    color: var(--manga-text) !important;
    background: transparent !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiMenuItem-root:hover,
  html[data-ultra-theme-preset="manga"] .MuiMenuItem-root.Mui-selected,
  html[data-ultra-theme-preset="manga"] .Mui-selected {
    color: var(--manga-text) !important;
    background: color-mix(in srgb, var(--manga-accent) 18%, transparent) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiTooltip-tooltip,
  html[data-ultra-theme-preset="manga"] .MuiSnackbarContent-root {
    color: var(--manga-text) !important;
    border: 2px solid var(--manga-border-color) !important;
    background: var(--manga-panel-strong) !important;
    box-shadow: var(--manga-shadow) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiLinearProgress-root {
    border-color: var(--manga-border-color) !important;
    background: color-mix(in srgb, var(--manga-ink) 8%, transparent) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiLinearProgress-bar {
    background:
      repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.24) 0 6px, transparent 6px 12px),
      var(--manga-accent) !important;
  }

  html[data-ultra-theme-preset="manga"] .the-delay,
  html[data-ultra-theme-preset="manga"] .the-speed,
  html[data-ultra-theme-preset="manga"] .the-check,
  html[data-ultra-theme-preset="manga"] .the-speed-check {
    border: 1.5px solid var(--manga-border-color) !important;
    color: var(--manga-text) !important;
    background: var(--manga-card) !important;
  }

  html[data-ultra-theme-preset="manga"] .theme-mode-switch {
    border-color: var(--manga-border-color) !important;
    background:
      radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--manga-ink) 8%, transparent) 1px, transparent 1.2px) 0 0 / 8px 8px,
      var(--manga-panel-strong) !important;
    box-shadow: var(--manga-shadow) !important;
  }

  html[data-ultra-theme-preset="manga"] .theme-mode-switch .MuiButton-root[data-theme-mode-option] {
    border: 2px solid transparent !important;
    box-shadow: none !important;
  }

  html[data-ultra-theme-preset="manga"] .theme-mode-switch .MuiButton-root[data-theme-mode-option="light"] {
    color: #111111 !important;
    background:
      radial-gradient(circle at 1px 1px, rgba(17, 17, 17, 0.09) 1px, transparent 1.2px) 0 0 / 8px 8px,
      linear-gradient(180deg, #fff2b8, #ffd6e4) !important;
  }

  html[data-ultra-theme-preset="manga"] .theme-mode-switch .MuiButton-root[data-theme-mode-option="dark"] {
    color: #fff8e8 !important;
    background:
      radial-gradient(circle at 1px 1px, rgba(255, 248, 232, 0.16) 1px, transparent 1.2px) 0 0 / 8px 8px,
      linear-gradient(180deg, #111111, #2b121c) !important;
  }

  html[data-ultra-theme-preset="manga"] .theme-mode-switch .MuiButton-root[data-theme-mode-option="system"] {
    color: #fff8e8 !important;
    background:
      radial-gradient(circle at 1px 1px, rgba(255, 248, 232, 0.13) 1px, transparent 1.2px) 0 0 / 8px 8px,
      linear-gradient(135deg, #2b121c, #ff2f6d) !important;
    text-shadow: 2px 2px 0 rgba(17, 17, 17, 0.55);
  }

  html[data-ultra-theme-preset="manga"] .theme-mode-switch .MuiButton-root[data-active="true"] {
    border-color: var(--manga-accent) !important;
    transform: translate(-1px, -1px) rotate(-0.5deg);
    box-shadow: 4px 4px 0 color-mix(in srgb, var(--manga-accent) 42%, transparent) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiInputBase-root.Mui-disabled,
  html[data-ultra-theme-preset="manga"] .MuiInputBase-input.Mui-disabled,
  html[data-ultra-theme-preset="manga"] .MuiButtonBase-root.Mui-disabled,
  html[data-ultra-theme-preset="manga"] .Mui-disabled {
    color: color-mix(in srgb, var(--manga-text) 48%, transparent) !important;
    -webkit-text-fill-color: color-mix(in srgb, var(--manga-text) 48%, transparent) !important;
  }

  html[data-ultra-theme-preset="manga"] ::selection {
    background: var(--selection-color) !important;
    color: var(--manga-text) !important;
  }
`

const LIQUID_GLASS_RUNTIME_READABILITY_CSS = `
  html[data-ultra-theme-preset="glass"] {
    color-scheme: light;
    --glass-bg: #eef7ff;
    --glass-page: rgba(245, 250, 255, 0.72);
    --glass-panel: rgba(255, 255, 255, 0.58);
    --glass-panel-strong: rgba(255, 255, 255, 0.78);
    --glass-card: rgba(255, 255, 255, 0.56);
    --glass-card-hover: rgba(255, 255, 255, 0.72);
    --glass-field: rgba(255, 255, 255, 0.58);
    --glass-header: rgba(255, 255, 255, 0.52);
    --glass-blue: #0a84ff;
    --glass-cyan: #64d2ff;
    --glass-mint: #30d158;
    --glass-orange: #ff9f0a;
    --glass-text: #0f172a;
    --glass-muted: #475569;
    --glass-border: rgba(255, 255, 255, 0.62);
    --glass-border-strong: rgba(255, 255, 255, 0.82);
    --glass-hairline: rgba(10, 132, 255, 0.22);
    --glass-shadow: 0 18px 48px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.78);
    --glass-shadow-strong: 0 28px 70px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.88);
    --glass-blur: blur(26px) saturate(1.45);
    --background-color: var(--glass-bg) !important;
    --background-color-alpha: rgba(10, 132, 255, 0.1) !important;
    --selection-color: rgba(10, 132, 255, 0.22) !important;
    --divider-color: rgba(15, 23, 42, 0.08) !important;
    --window-border-color: rgba(255, 255, 255, 0.58) !important;
    --scrollbar-bg: rgba(238, 247, 255, 0.72) !important;
    --scrollbar-thumb: rgba(10, 132, 255, 0.3) !important;
  }

  html[data-ultra-theme-preset="glass"][data-ultra-theme-mode="dark"] {
    color-scheme: dark;
    --glass-bg: #070b14;
    --glass-page: rgba(9, 14, 25, 0.74);
    --glass-panel: rgba(15, 23, 42, 0.58);
    --glass-panel-strong: rgba(15, 23, 42, 0.78);
    --glass-card: rgba(15, 23, 42, 0.58);
    --glass-card-hover: rgba(30, 41, 59, 0.72);
    --glass-field: rgba(2, 6, 23, 0.58);
    --glass-header: rgba(15, 23, 42, 0.54);
    --glass-blue: #64d2ff;
    --glass-cyan: #0a84ff;
    --glass-mint: #30d158;
    --glass-orange: #ffd60a;
    --glass-text: #eaf6ff;
    --glass-muted: #a7c7df;
    --glass-border: rgba(255, 255, 255, 0.14);
    --glass-border-strong: rgba(255, 255, 255, 0.24);
    --glass-hairline: rgba(100, 210, 255, 0.26);
    --glass-shadow: 0 20px 58px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.13);
    --glass-shadow-strong: 0 30px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.18);
    --background-color: var(--glass-bg) !important;
    --background-color-alpha: rgba(100, 210, 255, 0.13) !important;
    --selection-color: rgba(100, 210, 255, 0.3) !important;
    --divider-color: rgba(255, 255, 255, 0.1) !important;
    --window-border-color: rgba(255, 255, 255, 0.16) !important;
    --scrollbar-bg: rgba(7, 11, 20, 0.76) !important;
    --scrollbar-thumb: rgba(100, 210, 255, 0.38) !important;
  }

  html[data-ultra-theme-preset="glass"],
  html[data-ultra-theme-preset="glass"] body,
  html[data-ultra-theme-preset="glass"] #root {
    background: var(--glass-bg) !important;
    color: var(--glass-text) !important;
  }

  html[data-ultra-theme-preset="glass"] body::before {
    background:
      radial-gradient(circle at 12% 8%, rgba(100, 210, 255, 0.34) 0 12%, transparent 28%),
      radial-gradient(circle at 88% 14%, rgba(10, 132, 255, 0.24) 0 10%, transparent 26%),
      radial-gradient(circle at 66% 90%, rgba(191, 219, 254, 0.48) 0 18%, transparent 36%),
      linear-gradient(135deg, #f8fcff 0%, #eef7ff 48%, #f8f3ff 100%) !important;
  }

  html[data-ultra-theme-preset="glass"][data-ultra-theme-mode="dark"] body::before {
    background:
      radial-gradient(circle at 16% 10%, rgba(100, 210, 255, 0.22) 0 11%, transparent 28%),
      radial-gradient(circle at 86% 14%, rgba(10, 132, 255, 0.22) 0 10%, transparent 26%),
      radial-gradient(circle at 62% 88%, rgba(48, 209, 88, 0.1) 0 16%, transparent 34%),
      linear-gradient(135deg, #05070d 0%, #070b14 48%, #101827 100%) !important;
  }

  html[data-ultra-theme-preset="glass"] body::after {
    opacity: 0.28 !important;
    mix-blend-mode: normal !important;
    background:
      linear-gradient(115deg, transparent 0 34%, rgba(255, 255, 255, 0.42) 34.5% 35.2%, transparent 36%),
      linear-gradient(70deg, transparent 0 72%, rgba(10, 132, 255, 0.12) 72.5% 73.2%, transparent 74%),
      radial-gradient(circle at 1px 1px, rgba(15, 23, 42, 0.08) 1px, transparent 1.2px) 0 0 / 18px 18px !important;
  }

  html[data-ultra-theme-preset="glass"][data-ultra-theme-mode="dark"] body::after {
    opacity: 0.2 !important;
    background:
      linear-gradient(115deg, transparent 0 34%, rgba(255, 255, 255, 0.16) 34.5% 35.2%, transparent 36%),
      linear-gradient(70deg, transparent 0 72%, rgba(100, 210, 255, 0.12) 72.5% 73.2%, transparent 74%),
      radial-gradient(circle at 1px 1px, rgba(234, 246, 255, 0.08) 1px, transparent 1.2px) 0 0 / 18px 18px !important;
  }

  html[data-ultra-theme-preset="glass"] body,
  html[data-ultra-theme-preset="glass"] .base-page,
  html[data-ultra-theme-preset="glass"] .base-container,
  html[data-ultra-theme-preset="glass"] .base-content,
  html[data-ultra-theme-preset="glass"] .MuiTypography-root,
  html[data-ultra-theme-preset="glass"] .MuiListItemText-primary,
  html[data-ultra-theme-preset="glass"] .MuiInputBase-input,
  html[data-ultra-theme-preset="glass"] .MuiFormControlLabel-label,
  html[data-ultra-theme-preset="glass"] .MuiTableCell-root,
  html[data-ultra-theme-preset="glass"] .MuiTreeItem-label {
    color: var(--glass-text) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiTypography-colorTextSecondary,
  html[data-ultra-theme-preset="glass"] .MuiListItemText-secondary,
  html[data-ultra-theme-preset="glass"] .MuiInputLabel-root,
  html[data-ultra-theme-preset="glass"] .MuiFormLabel-root,
  html[data-ultra-theme-preset="glass"] .MuiFormHelperText-root,
  html[data-ultra-theme-preset="glass"] .MuiTableCell-head,
  html[data-ultra-theme-preset="glass"] .MuiBreadcrumbs-separator,
  html[data-ultra-theme-preset="glass"] .MuiInputAdornment-root,
  html[data-ultra-theme-preset="glass"] .MuiInputAdornment-root .MuiTypography-root {
    color: var(--glass-muted) !important;
  }

  html[data-ultra-theme-preset="glass"] .layout {
    background: transparent !important;
  }

  html[data-ultra-theme-preset="glass"] .layout .layout-content__left,
  html[data-ultra-theme-preset="glass"] .layout .layout-content__right,
  html[data-ultra-theme-preset="glass"] .layout .layout-content__left .the-logo,
  html[data-ultra-theme-preset="glass"] .layout .layout-content__left .the-traffic,
  html[data-ultra-theme-preset="glass"] .base-content > .MuiBox-root,
  html[data-ultra-theme-preset="glass"] .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root,
  html[data-ultra-theme-preset="glass"] .base-content .MuiGrid-root > .MuiGrid-root > .MuiBox-root,
  html[data-ultra-theme-preset="glass"] .MuiPaper-root,
  html[data-ultra-theme-preset="glass"] .MuiCard-root,
  html[data-ultra-theme-preset="glass"] .MuiDialog-paper,
  html[data-ultra-theme-preset="glass"] .MuiDrawer-paper,
  html[data-ultra-theme-preset="glass"] .MuiPopover-paper,
  html[data-ultra-theme-preset="glass"] .MuiMenu-paper,
  html[data-ultra-theme-preset="glass"] .MuiTableContainer-root,
  html[data-ultra-theme-preset="glass"] .MuiAccordion-root,
  html[data-ultra-theme-preset="glass"] .MuiAlert-root {
    color: var(--glass-text) !important;
    border-color: var(--glass-border) !important;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.22), transparent 42%),
      var(--glass-card) !important;
    box-shadow: var(--glass-shadow) !important;
    backdrop-filter: var(--glass-blur) !important;
    -webkit-backdrop-filter: var(--glass-blur) !important;
  }

  html[data-ultra-theme-preset="glass"] .layout .layout-content__right .the-bar,
  html[data-ultra-theme-preset="glass"] .layout .layout-content__right .the-content,
  html[data-ultra-theme-preset="glass"] .base-page,
  html[data-ultra-theme-preset="glass"] .base-container,
  html[data-ultra-theme-preset="glass"] .base-container > section {
    color: var(--glass-text) !important;
    border-color: var(--glass-border) !important;
    background: var(--glass-header) !important;
    backdrop-filter: var(--glass-blur) !important;
    -webkit-backdrop-filter: var(--glass-blur) !important;
  }

  html[data-ultra-theme-preset="glass"][data-ultra-theme-source="system"] .layout .layout-content__right .the-bar::after {
    content: "SYSTEM GLASS";
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    padding: 4px 10px;
    border: 1px solid var(--glass-border-strong);
    border-radius: 999px;
    color: var(--glass-text);
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.76) 0 50%, rgba(15, 23, 42, 0.72) 50% 100%);
    box-shadow: 0 10px 26px rgba(10, 132, 255, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(16px) saturate(1.35);
    -webkit-backdrop-filter: blur(16px) saturate(1.35);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.1em;
  }

  html[data-ultra-theme-preset="glass"] .base-page > header {
    border-bottom: 1px solid var(--glass-border) !important;
    color: var(--glass-text) !important;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.56), rgba(255, 255, 255, 0.2)),
      var(--glass-header) !important;
    backdrop-filter: var(--glass-blur) !important;
    -webkit-backdrop-filter: var(--glass-blur) !important;
  }

  html[data-ultra-theme-preset="glass"] .base-content .MuiBox-root[style*="background-color: rgb(255, 255, 255)"],
  html[data-ultra-theme-preset="glass"] .base-content .MuiBox-root[style*="background-color: #ffffff"],
  html[data-ultra-theme-preset="glass"] .base-content .MuiBox-root[style*="background-color: rgb(245, 245, 245)"],
  html[data-ultra-theme-preset="glass"] .base-content .MuiBox-root[style*="background-color: rgb(236, 236, 236)"],
  html[data-ultra-theme-preset="glass"] .base-content .MuiBox-root[style*="background-color: rgb(40, 42, 54)"],
  html[data-ultra-theme-preset="glass"] .base-content .MuiBox-root[style*="background-color: #282a36"],
  html[data-ultra-theme-preset="glass"] .base-content .MuiBox-root[style*="background-color: rgb(30, 31, 39)"],
  html[data-ultra-theme-preset="glass"] .base-content .MuiBox-root[style*="background-color: #1e1f27"] {
    color: var(--glass-text) !important;
    border: 1px solid var(--glass-border) !important;
    background: var(--glass-card) !important;
    box-shadow: var(--glass-shadow) !important;
    backdrop-filter: var(--glass-blur) !important;
    -webkit-backdrop-filter: var(--glass-blur) !important;
  }

  html[data-ultra-theme-preset="glass"] .base-content .MuiListItem-root {
    color: var(--glass-text) !important;
    background: transparent !important;
  }

  html[data-ultra-theme-preset="glass"] .base-content .MuiListItemButton-root,
  html[data-ultra-theme-preset="glass"] .base-content .MuiListItemButton-root[style],
  html[data-ultra-theme-preset="glass"] .base-content .MuiListItem-root > .MuiButtonBase-root,
  html[data-ultra-theme-preset="glass"] body .MuiListItemButton-root {
    color: var(--glass-text) !important;
    border: 1px solid transparent !important;
    background: rgba(255, 255, 255, 0.08) !important;
    box-shadow: none !important;
    backdrop-filter: blur(16px) saturate(1.25) !important;
    -webkit-backdrop-filter: blur(16px) saturate(1.25) !important;
  }

  html[data-ultra-theme-preset="glass"] .base-content .MuiListItemButton-root:hover,
  html[data-ultra-theme-preset="glass"] body .MuiListItemButton-root:hover {
    color: var(--glass-text) !important;
    border-color: var(--glass-hairline) !important;
    background: var(--glass-card-hover) !important;
    box-shadow: 0 12px 30px rgba(10, 132, 255, 0.12) !important;
  }

  html[data-ultra-theme-preset="glass"] .base-content .MuiListItemButton-root.Mui-selected,
  html[data-ultra-theme-preset="glass"] body .MuiListItemButton-root.Mui-selected {
    color: var(--glass-text) !important;
    border-color: var(--glass-hairline) !important;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--glass-blue) 20%, transparent), color-mix(in srgb, var(--glass-cyan) 12%, transparent)),
      var(--glass-card-hover) !important;
    box-shadow: 0 16px 38px color-mix(in srgb, var(--glass-blue) 18%, transparent) !important;
  }

  html[data-ultra-theme-preset="glass"] .base-content .MuiListItemButton-root .MuiTypography-root,
  html[data-ultra-theme-preset="glass"] .base-content .MuiListItemButton-root .MuiListItemText-primary,
  html[data-ultra-theme-preset="glass"] .base-content .MuiListItemButton-root .MuiListItemText-secondary,
  html[data-ultra-theme-preset="glass"] .base-content .MuiListItemButton-root .MuiBox-root,
  html[data-ultra-theme-preset="glass"] .base-content .MuiListItemButton-root span {
    color: inherit !important;
  }

  html[data-ultra-theme-preset="glass"] .base-content .MuiListItemButton-root .MuiListItemText-secondary,
  html[data-ultra-theme-preset="glass"] .base-content .MuiListItemButton-root .MuiTypography-colorTextSecondary {
    color: var(--glass-muted) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiOutlinedInput-root,
  html[data-ultra-theme-preset="glass"] .MuiInputBase-root,
  html[data-ultra-theme-preset="glass"] .MuiSelect-select {
    color: var(--glass-text) !important;
    background: var(--glass-field) !important;
    backdrop-filter: blur(16px) saturate(1.25) !important;
    -webkit-backdrop-filter: blur(16px) saturate(1.25) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiOutlinedInput-notchedOutline {
    border-color: var(--glass-hairline) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiSelect-icon,
  html[data-ultra-theme-preset="glass"] .MuiSvgIcon-root,
  html[data-ultra-theme-preset="glass"] .MuiIconButton-root,
  html[data-ultra-theme-preset="glass"] .MuiCheckbox-root,
  html[data-ultra-theme-preset="glass"] .MuiRadio-root {
    color: inherit !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiButton-root {
    color: var(--glass-text) !important;
    border-color: var(--glass-border) !important;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.08)),
      var(--glass-card) !important;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.38) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiButton-contained,
  html[data-ultra-theme-preset="glass"] .MuiButton-containedPrimary {
    color: #ffffff !important;
    border-color: color-mix(in srgb, var(--glass-blue) 55%, transparent) !important;
    background: linear-gradient(135deg, var(--glass-blue), var(--glass-cyan)) !important;
    box-shadow: 0 16px 34px color-mix(in srgb, var(--glass-blue) 28%, transparent) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiChip-root,
  html[data-ultra-theme-preset="glass"] .MuiTooltip-tooltip,
  html[data-ultra-theme-preset="glass"] .MuiSnackbarContent-root {
    color: var(--glass-text) !important;
    border-color: var(--glass-border) !important;
    background: var(--glass-panel-strong) !important;
    box-shadow: var(--glass-shadow) !important;
    backdrop-filter: var(--glass-blur) !important;
    -webkit-backdrop-filter: var(--glass-blur) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiTableContainer-root,
  html[data-ultra-theme-preset="glass"] .MuiTable-root,
  html[data-ultra-theme-preset="glass"] .MuiTableHead-root,
  html[data-ultra-theme-preset="glass"] .MuiTableBody-root,
  html[data-ultra-theme-preset="glass"] .MuiTableRow-root,
  html[data-ultra-theme-preset="glass"] .MuiTableCell-root {
    color: var(--glass-text) !important;
    background-color: transparent !important;
    border-color: var(--divider-color) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiTableCell-head,
  html[data-ultra-theme-preset="glass"] .MuiTableHead-root .MuiTableCell-root {
    color: var(--glass-blue) !important;
    background: color-mix(in srgb, var(--glass-blue) 8%, transparent) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiTabs-indicator {
    background: linear-gradient(90deg, var(--glass-blue), var(--glass-cyan)) !important;
    box-shadow: 0 0 16px color-mix(in srgb, var(--glass-blue) 28%, transparent) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiMenuItem-root {
    color: var(--glass-text) !important;
    background: transparent !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiMenuItem-root:hover,
  html[data-ultra-theme-preset="glass"] .MuiMenuItem-root.Mui-selected,
  html[data-ultra-theme-preset="glass"] .Mui-selected {
    color: var(--glass-text) !important;
    background: color-mix(in srgb, var(--glass-blue) 14%, transparent) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiLinearProgress-root {
    border-color: var(--glass-border) !important;
    background: color-mix(in srgb, var(--glass-text) 8%, transparent) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiLinearProgress-bar {
    background: linear-gradient(90deg, var(--glass-blue), var(--glass-cyan)) !important;
  }

  html[data-ultra-theme-preset="glass"] .the-delay,
  html[data-ultra-theme-preset="glass"] .the-speed,
  html[data-ultra-theme-preset="glass"] .the-check,
  html[data-ultra-theme-preset="glass"] .the-speed-check {
    border: 1px solid var(--glass-border) !important;
    color: var(--glass-blue) !important;
    background: var(--glass-card) !important;
    backdrop-filter: blur(14px) saturate(1.25) !important;
    -webkit-backdrop-filter: blur(14px) saturate(1.25) !important;
  }

  html[data-ultra-theme-preset="glass"] .theme-mode-switch {
    border-color: var(--glass-border) !important;
    background: var(--glass-panel-strong) !important;
    box-shadow: var(--glass-shadow) !important;
    backdrop-filter: var(--glass-blur) !important;
    -webkit-backdrop-filter: var(--glass-blur) !important;
  }

  html[data-ultra-theme-preset="glass"] .theme-mode-switch .MuiButton-root[data-theme-mode-option] {
    border: 1px solid transparent !important;
    box-shadow: none !important;
  }

  html[data-ultra-theme-preset="glass"] .theme-mode-switch .MuiButton-root[data-theme-mode-option="light"] {
    color: #0f172a !important;
    background: linear-gradient(180deg, rgba(214, 239, 255, 0.88), rgba(188, 228, 255, 0.68)) !important;
  }

  html[data-ultra-theme-preset="glass"] .theme-mode-switch .MuiButton-root[data-theme-mode-option="dark"] {
    color: #eaf6ff !important;
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(7, 11, 20, 0.88)) !important;
  }

  html[data-ultra-theme-preset="glass"] .theme-mode-switch .MuiButton-root[data-theme-mode-option="system"] {
    color: #eaf6ff !important;
    background:
      linear-gradient(135deg, rgba(10, 132, 255, 0.76), rgba(15, 23, 42, 0.78)) !important;
  }

  html[data-ultra-theme-preset="glass"] .theme-mode-switch .MuiButton-root[data-active="true"] {
    border-color: var(--glass-hairline) !important;
    transform: translateY(-1px);
    box-shadow: 0 12px 28px color-mix(in srgb, var(--glass-blue) 22%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.48) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiInputBase-root.Mui-disabled,
  html[data-ultra-theme-preset="glass"] .MuiInputBase-input.Mui-disabled,
  html[data-ultra-theme-preset="glass"] .MuiButtonBase-root.Mui-disabled,
  html[data-ultra-theme-preset="glass"] .Mui-disabled {
    color: color-mix(in srgb, var(--glass-text) 48%, transparent) !important;
    -webkit-text-fill-color: color-mix(in srgb, var(--glass-text) 48%, transparent) !important;
  }

  @keyframes glass-aurora-drift {
    0%, 100% {
      transform: translate3d(-1.5%, -1%, 0) rotate(-5deg) scale(1);
    }
    50% {
      transform: translate3d(1.5%, 1%, 0) rotate(5deg) scale(1.03);
    }
  }

  @keyframes glass-prism-shimmer {
    0% {
      transform: translateX(-42%) rotate(12deg);
      opacity: 0;
    }
    18%, 62% {
      opacity: 0.72;
    }
    100% {
      transform: translateX(42%) rotate(12deg);
      opacity: 0;
    }
  }

  html[data-ultra-theme-preset="glass"] {
    --glass-blue: #2f7bff;
    --glass-cyan: #70e1ff;
    --glass-violet: #8b5cf6;
    --glass-rose: #fb7185;
    --glass-emerald: #2dd4bf;
    --glass-radius: 28px;
    --glass-radius-sm: 16px;
    --glass-prism-line: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.9), rgba(112, 225, 255, 0.72), transparent);
    --glass-lens: radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.86), transparent 28%), radial-gradient(circle at 84% 12%, color-mix(in srgb, var(--glass-cyan) 28%, transparent), transparent 34%), radial-gradient(circle at 68% 88%, color-mix(in srgb, var(--glass-violet) 18%, transparent), transparent 38%);
    --glass-card: rgba(255, 255, 255, 0.48);
    --glass-card-hover: rgba(255, 255, 255, 0.66);
    --glass-panel-strong: rgba(255, 255, 255, 0.72);
    --glass-field: rgba(255, 255, 255, 0.46);
    --glass-border: rgba(255, 255, 255, 0.68);
    --glass-hairline: rgba(47, 123, 255, 0.34);
    --glass-shadow: 0 18px 42px rgba(20, 80, 180, 0.12), 0 8px 18px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.82), inset 0 -28px 52px rgba(255, 255, 255, 0.12);
    --glass-shadow-strong: 0 30px 90px rgba(20, 80, 180, 0.22), 0 10px 28px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 -30px 70px rgba(255, 255, 255, 0.16);
    --glass-blur: blur(34px) saturate(1.75) contrast(1.03);
  }

  html[data-ultra-theme-preset="glass"][data-ultra-theme-mode="dark"] {
    --glass-blue: #70e1ff;
    --glass-cyan: #2f7bff;
    --glass-violet: #a78bfa;
    --glass-rose: #fb7185;
    --glass-emerald: #5eead4;
    --glass-card: rgba(8, 18, 34, 0.54);
    --glass-card-hover: rgba(16, 32, 58, 0.68);
    --glass-panel-strong: rgba(10, 22, 42, 0.78);
    --glass-field: rgba(5, 14, 28, 0.62);
    --glass-border: rgba(198, 232, 255, 0.16);
    --glass-hairline: rgba(112, 225, 255, 0.32);
    --glass-shadow: 0 24px 70px rgba(0, 0, 0, 0.44), 0 8px 28px rgba(47, 123, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -26px 58px rgba(112, 225, 255, 0.035);
    --glass-shadow-strong: 0 38px 100px rgba(0, 0, 0, 0.56), 0 14px 42px rgba(112, 225, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -32px 76px rgba(112, 225, 255, 0.045);
  }

  html[data-ultra-theme-preset="glass"] .layout {
    background:
      radial-gradient(ellipse at 8% 2%, color-mix(in srgb, var(--glass-cyan) 32%, transparent), transparent 32%),
      radial-gradient(ellipse at 96% 8%, color-mix(in srgb, var(--glass-violet) 22%, transparent), transparent 30%),
      radial-gradient(ellipse at 40% 104%, color-mix(in srgb, var(--glass-rose) 14%, transparent), transparent 36%),
      linear-gradient(135deg, var(--glass-bg), color-mix(in srgb, var(--glass-bg) 74%, var(--glass-blue))) !important;
  }

  html[data-ultra-theme-preset="glass"] .layout::before {
    opacity: 0.75 !important;
    animation: glass-aurora-drift 18s ease-in-out infinite;
    background-image:
      linear-gradient(115deg, transparent 0 16%, rgba(255, 255, 255, 0.2) 16.4% 16.8%, transparent 17.2%),
      linear-gradient(52deg, transparent 0 66%, color-mix(in srgb, var(--glass-cyan) 18%, transparent) 66.3% 67%, transparent 67.4%),
      radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--glass-blue) 8%, transparent) 1px, transparent 1.4px) !important;
    background-size: auto, auto, 28px 28px !important;
    mask-image: radial-gradient(ellipse at center, #000 0, transparent 70%) !important;
  }

  html[data-ultra-theme-preset="glass"] .layout .flux-main {
    border-radius: 34px !important;
    background:
      radial-gradient(circle at 0% 0%, rgba(255, 255, 255, 0.58), transparent 24%),
      radial-gradient(circle at 100% 12%, color-mix(in srgb, var(--glass-cyan) 18%, transparent), transparent 28%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.2), transparent 48%),
      var(--glass-page) !important;
    box-shadow:
      0 36px 100px rgba(24, 75, 145, 0.18),
      0 16px 36px rgba(15, 23, 42, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.8),
      inset 0 -42px 90px rgba(255, 255, 255, 0.08) !important;
    backdrop-filter: blur(42px) saturate(1.85) !important;
    -webkit-backdrop-filter: blur(42px) saturate(1.85) !important;
  }

  html[data-ultra-theme-preset="glass"][data-ultra-theme-mode="dark"] .layout .flux-main {
    box-shadow:
      0 36px 110px rgba(0, 0, 0, 0.54),
      0 16px 42px rgba(47, 123, 255, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.14),
      inset 0 -42px 90px rgba(112, 225, 255, 0.04) !important;
  }

  html[data-ultra-theme-preset="glass"] .layout .flux-main::before {
    background:
      linear-gradient(120deg, rgba(255, 255, 255, 0.46), transparent 20% 78%, rgba(112, 225, 255, 0.16)),
      linear-gradient(90deg, transparent, color-mix(in srgb, var(--glass-blue) 14%, transparent), transparent),
      radial-gradient(circle at 30% 0, rgba(255, 255, 255, 0.54), transparent 22%) !important;
    opacity: 1 !important;
  }

  html[data-ultra-theme-preset="glass"] .flux-dock {
    position: relative;
    border-radius: 28px !important;
    border-color: var(--glass-border) !important;
    background:
      radial-gradient(circle at 12% 0%, rgba(255, 255, 255, 0.72), transparent 32%),
      radial-gradient(circle at 90% 110%, color-mix(in srgb, var(--glass-violet) 18%, transparent), transparent 34%),
      rgba(255, 255, 255, 0.38) !important;
    box-shadow:
      0 22px 54px rgba(24, 75, 145, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.78),
      inset 0 -16px 34px rgba(255, 255, 255, 0.12) !important;
  }

  html[data-ultra-theme-preset="glass"] .flux-dock::after {
    content: "";
    position: absolute;
    left: 18px;
    right: 18px;
    top: 3px;
    height: 1px;
    background: var(--glass-prism-line);
    opacity: 0.86;
    pointer-events: none;
  }

  html[data-ultra-theme-preset="glass"] .base-page > header {
    position: relative;
    background:
      radial-gradient(circle at 8% 0%, rgba(255, 255, 255, 0.72), transparent 30%),
      linear-gradient(100deg, color-mix(in srgb, var(--glass-blue) 13%, transparent), rgba(255, 255, 255, 0.26) 48%, transparent),
      var(--glass-header) !important;
  }

  html[data-ultra-theme-preset="glass"] .base-page > header::before {
    content: "";
    position: absolute;
    left: clamp(18px, 3vw, 28px);
    bottom: 7px;
    width: min(160px, 30vw);
    height: 2px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--glass-blue), var(--glass-cyan), transparent);
    box-shadow: 0 0 18px color-mix(in srgb, var(--glass-cyan) 38%, transparent);
    pointer-events: none;
  }

  html[data-ultra-theme-preset="glass"] .home-enhanced-card,
  html[data-ultra-theme-preset="glass"] :is(.MuiCard-root, .MuiPaper-root, .base-content > .MuiBox-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip) {
    position: relative !important;
    overflow: hidden !important;
    isolation: isolate !important;
    border-radius: var(--glass-radius) !important;
    background:
      var(--glass-lens),
      linear-gradient(145deg, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0.12) 42%, color-mix(in srgb, var(--glass-blue) 7%, transparent)),
      var(--glass-card) !important;
    box-shadow: inset 0 0 0 1px var(--glass-border), var(--glass-shadow) !important;
  }

  html[data-ultra-theme-preset="glass"] .home-enhanced-card::before,
  html[data-ultra-theme-preset="glass"] :is(.MuiCard-root, .MuiPaper-root, .base-content > .MuiBox-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip)::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    border-radius: inherit;
    background:
      linear-gradient(120deg, rgba(255, 255, 255, 0.82), transparent 18% 72%, color-mix(in srgb, var(--glass-cyan) 18%, transparent)),
      linear-gradient(235deg, transparent 0 62%, rgba(255, 255, 255, 0.2) 62.5% 64%, transparent 65%);
    opacity: 0.7;
  }

  html[data-ultra-theme-preset="glass"] .home-enhanced-card::after,
  html[data-ultra-theme-preset="glass"] :is(.MuiCard-root, .MuiPaper-root, .base-content > .MuiBox-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip)::after {
    content: "";
    position: absolute;
    top: -36%;
    bottom: -36%;
    left: -44%;
    width: 42%;
    z-index: 0;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.32), transparent);
    filter: blur(2px);
    animation: glass-prism-shimmer 7.5s ease-in-out infinite;
  }

  html[data-ultra-theme-preset="glass"] .home-enhanced-card > *,
  html[data-ultra-theme-preset="glass"] :is(.MuiCard-root, .MuiPaper-root, .base-content > .MuiBox-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip) > * {
    position: relative;
    z-index: 1;
  }

  html[data-ultra-theme-preset="glass"] .home-enhanced-card:hover,
  html[data-ultra-theme-preset="glass"] :is(.MuiCard-root, .MuiPaper-root, .base-content > .MuiBox-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip):hover {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--glass-cyan) 42%, var(--glass-border)), var(--glass-shadow-strong) !important;
  }

  html[data-ultra-theme-preset="glass"] .base-content .MuiListItemButton-root,
  html[data-ultra-theme-preset="glass"] .proxy-node-card {
    border-radius: 18px !important;
    background:
      radial-gradient(circle at 12% 0%, rgba(255, 255, 255, 0.46), transparent 34%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.18), color-mix(in srgb, var(--glass-blue) 5%, transparent)),
      color-mix(in srgb, var(--glass-card) 78%, transparent) !important;
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--glass-border) 70%, transparent),
      0 10px 24px rgba(20, 80, 180, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.5) !important;
  }

  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-selected="true"],
  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-multi-selected="true"],
  html[data-ultra-theme-preset="glass"] .proxy-node-card.Mui-selected {
    border-color: color-mix(in srgb, var(--glass-blue) 58%, white) !important;
    background:
      radial-gradient(circle at 0 0, rgba(255, 255, 255, 0.62), transparent 32%),
      linear-gradient(135deg, color-mix(in srgb, var(--glass-blue) 26%, transparent), color-mix(in srgb, var(--glass-cyan) 16%, transparent)),
      var(--glass-card-hover) !important;
    box-shadow:
      0 18px 40px color-mix(in srgb, var(--glass-blue) 22%, transparent),
      inset 0 0 0 1px rgba(255, 255, 255, 0.54),
      inset 0 1px 0 rgba(255, 255, 255, 0.72) !important;
  }

  html[data-ultra-theme-preset="glass"] .proxy-node-card::before {
    background: linear-gradient(180deg, var(--glass-cyan), var(--glass-blue), var(--glass-violet)) !important;
    box-shadow: 0 0 18px color-mix(in srgb, var(--glass-cyan) 46%, transparent) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiButton-root:not([data-theme-mode-option]) {
    border-radius: 999px !important;
    background:
      radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.72), transparent 34%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.36), color-mix(in srgb, var(--glass-blue) 8%, transparent)),
      var(--glass-card) !important;
    letter-spacing: -0.01em;
  }

  html[data-ultra-theme-preset="glass"] .MuiButton-contained,
  html[data-ultra-theme-preset="glass"] .MuiButton-containedPrimary {
    color: #ffffff !important;
    border-color: color-mix(in srgb, var(--glass-cyan) 52%, transparent) !important;
    background:
      radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.42), transparent 30%),
      linear-gradient(135deg, var(--glass-blue), var(--glass-cyan) 58%, var(--glass-violet)) !important;
    box-shadow:
      0 18px 42px color-mix(in srgb, var(--glass-blue) 32%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.52) !important;
  }

  html[data-ultra-theme-preset="glass"] :is(.MuiOutlinedInput-root, .MuiInputBase-root, .MuiSelect-select) {
    border-radius: 18px !important;
    background:
      radial-gradient(circle at 12% 0%, rgba(255, 255, 255, 0.5), transparent 34%),
      var(--glass-field) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.52),
      0 8px 20px rgba(20, 80, 180, 0.07) !important;
  }

  html[data-ultra-theme-preset="glass"] :is(.MuiOutlinedInput-root.Mui-focused, .MuiInputBase-root.Mui-focused) {
    box-shadow:
      0 0 0 4px color-mix(in srgb, var(--glass-cyan) 20%, transparent),
      0 12px 28px color-mix(in srgb, var(--glass-blue) 14%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.64) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiTabs-root {
    border-radius: 999px;
    background: color-mix(in srgb, var(--glass-card) 76%, transparent);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.48);
  }

  html[data-ultra-theme-preset="glass"] .MuiTab-root {
    border-radius: 999px;
    font-weight: 850;
  }

  html[data-ultra-theme-preset="glass"] .MuiTab-root.Mui-selected {
    color: #ffffff !important;
    background: linear-gradient(135deg, var(--glass-blue), var(--glass-cyan)) !important;
    box-shadow: 0 12px 30px color-mix(in srgb, var(--glass-blue) 24%, transparent) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiTabs-indicator {
    display: none !important;
  }

  html[data-ultra-theme-preset="glass"] :is(.MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track, .MuiSlider-track, .MuiLinearProgress-bar) {
    background: linear-gradient(90deg, var(--glass-blue), var(--glass-cyan), var(--glass-violet)) !important;
  }

  html[data-ultra-theme-preset="glass"] :is(.MuiChip-root, .the-delay, .the-speed, .the-check, .the-speed-check) {
    border-radius: 999px !important;
    border-color: color-mix(in srgb, var(--glass-border) 80%, transparent) !important;
    background:
      radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.5), transparent 34%),
      color-mix(in srgb, var(--glass-card) 84%, transparent) !important;
    box-shadow:
      0 8px 18px rgba(20, 80, 180, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.52) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiMenu-paper,
  html[data-ultra-theme-preset="glass"] .MuiPopover-paper {
    border-radius: 20px !important;
    background:
      radial-gradient(circle at 10% 0%, rgba(255, 255, 255, 0.62), transparent 34%),
      var(--glass-panel-strong) !important;
    box-shadow: var(--glass-shadow-strong) !important;
    backdrop-filter: blur(30px) saturate(1.65) !important;
    -webkit-backdrop-filter: blur(30px) saturate(1.65) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiMenuItem-root {
    border-radius: 12px !important;
  }

  html[data-ultra-theme-preset="glass"] .theme-mode-switch {
    border-radius: 24px !important;
    background:
      radial-gradient(circle at 8% 0%, rgba(255, 255, 255, 0.64), transparent 34%),
      var(--glass-panel-strong) !important;
  }

  html[data-ultra-theme-preset="glass"] ::selection {
    background: var(--selection-color) !important;
    color: var(--glass-text) !important;
  }
`

const THEME_NODE_SELECTION_CSS = `
  html[data-ultra-theme-preset] .proxy-node-context-menu {
    width: auto !important;
    min-width: 132px !important;
    max-width: 220px !important;
    overflow: visible !important;
    border-radius: 12px !important;
    transform: none !important;
  }

  html[data-ultra-theme-preset] .proxy-node-context-menu .MuiMenu-list {
    padding: 4px !important;
  }

  html[data-ultra-theme-preset] .proxy-node-context-menu .MuiMenuItem-root {
    width: auto !important;
    min-width: 0 !important;
    max-width: 200px !important;
    min-height: 30px !important;
    margin: 0 !important;
    padding: 4px 10px !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
    font-size: 13px !important;
    line-height: 1.35 !important;
  }

  html[data-ultra-theme-preset] .proxy-node-card {
    position: relative !important;
    overflow: hidden !important;
    isolation: isolate !important;
    transition:
      transform 160ms ease,
      border-color 160ms ease,
      background 160ms ease,
      box-shadow 160ms ease !important;
  }

  html[data-ultra-theme-preset] .proxy-node-card > * {
    position: relative;
    z-index: 1;
  }

  html[data-ultra-theme-preset] .proxy-node-card[data-selected="true"]::before,
  html[data-ultra-theme-preset] .proxy-node-card[data-multi-selected="true"]::before,
  html[data-ultra-theme-preset] .proxy-node-card.Mui-selected::before {
    content: "";
    position: absolute;
    top: 6px;
    bottom: 6px;
    left: 6px;
    z-index: 0;
    width: 5px;
    border-radius: 999px;
    pointer-events: none;
  }

  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card[data-selected="true"],
  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card[data-multi-selected="true"],
  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card.Mui-selected {
    color: var(--cyber-active-text, #ffffff) !important;
    border: 1.5px solid var(--cyber-pink, #ff2bd6) !important;
    background:
      linear-gradient(90deg, rgba(255, 43, 214, 0.46), rgba(0, 229, 255, 0.28) 54%, rgba(5, 18, 43, 0.96)),
      var(--cyber-card-active, rgba(5, 18, 43, 0.98)) !important;
    box-shadow:
      0 0 0 1px rgba(0, 229, 255, 0.42),
      0 0 22px rgba(255, 43, 214, 0.54),
      0 0 34px rgba(0, 229, 255, 0.32),
      inset 0 0 24px rgba(0, 229, 255, 0.16) !important;
    transform: translateX(2px) scale(1.01) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card[data-selected="true"]::before,
  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card[data-multi-selected="true"]::before,
  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card.Mui-selected::before {
    background: linear-gradient(180deg, var(--cyber-cyan, #00e5ff), var(--cyber-pink, #ff2bd6));
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.9), 0 0 24px rgba(255, 43, 214, 0.66) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card[data-selected="true"]::after,
  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card[data-multi-selected="true"]::after,
  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card.Mui-selected::after {
    content: "ACTIVE";
    position: absolute;
    right: 8px;
    bottom: 3px;
    z-index: 0;
    color: rgba(0, 229, 255, 0.24);
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.18em;
    pointer-events: none;
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.65);
  }

  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card[data-selected="true"] .MuiTypography-root,
  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card[data-selected="true"] .MuiListItemText-secondary,
  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card[data-multi-selected="true"] .MuiTypography-root,
  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card[data-multi-selected="true"] .MuiListItemText-secondary,
  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card.Mui-selected .MuiTypography-root,
  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card.Mui-selected .MuiListItemText-secondary {
    color: var(--cyber-active-text, #ffffff) !important;
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.54) !important;
  }

  html[data-ultra-theme-preset="manga"] .proxy-node-card[data-selected="true"],
  html[data-ultra-theme-preset="manga"] .proxy-node-card[data-multi-selected="true"],
  html[data-ultra-theme-preset="manga"] .proxy-node-card.Mui-selected {
    color: #ffffff !important;
    border: 3px solid var(--manga-accent, #ff2f6d) !important;
    background:
      radial-gradient(circle at 13% 22%, rgba(255, 255, 255, 0.32) 0 11%, transparent 11.5%),
      repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.16) 0 7px, transparent 7px 14px),
      linear-gradient(135deg, #111111 0%, #371425 52%, var(--manga-accent, #ff2f6d) 100%) !important;
    box-shadow:
      7px 7px 0 color-mix(in srgb, var(--manga-accent, #ff2f6d) 46%, transparent),
      inset 0 0 0 2px rgba(255, 255, 255, 0.22) !important;
    transform: translate(-2px, -2px) rotate(-0.45deg) !important;
  }

  html[data-ultra-theme-preset="manga"] .proxy-node-card[data-selected="true"]::before,
  html[data-ultra-theme-preset="manga"] .proxy-node-card[data-multi-selected="true"]::before,
  html[data-ultra-theme-preset="manga"] .proxy-node-card.Mui-selected::before {
    background: repeating-linear-gradient(180deg, #fff8e8 0 6px, var(--manga-yellow, #facc15) 6px 12px, var(--manga-accent, #ff2f6d) 12px 18px);
    box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.28) !important;
  }

  html[data-ultra-theme-preset="manga"] .proxy-node-card[data-selected="true"]::after,
  html[data-ultra-theme-preset="manga"] .proxy-node-card[data-multi-selected="true"]::after,
  html[data-ultra-theme-preset="manga"] .proxy-node-card.Mui-selected::after {
    content: "SELECTED";
    position: absolute;
    right: 8px;
    bottom: 3px;
    z-index: 0;
    color: rgba(255, 248, 232, 0.32);
    font-size: 9px;
    font-weight: 1000;
    letter-spacing: 0.14em;
    pointer-events: none;
    transform: rotate(-2deg);
  }

  html[data-ultra-theme-preset="manga"] .proxy-node-card[data-selected="true"] .MuiTypography-root,
  html[data-ultra-theme-preset="manga"] .proxy-node-card[data-selected="true"] .MuiListItemText-secondary,
  html[data-ultra-theme-preset="manga"] .proxy-node-card[data-multi-selected="true"] .MuiTypography-root,
  html[data-ultra-theme-preset="manga"] .proxy-node-card[data-multi-selected="true"] .MuiListItemText-secondary,
  html[data-ultra-theme-preset="manga"] .proxy-node-card.Mui-selected .MuiTypography-root,
  html[data-ultra-theme-preset="manga"] .proxy-node-card.Mui-selected .MuiListItemText-secondary {
    color: #ffffff !important;
    text-shadow: 2px 2px 0 rgba(17, 17, 17, 0.38) !important;
  }

  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-selected="true"],
  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-multi-selected="true"],
  html[data-ultra-theme-preset="glass"] .proxy-node-card.Mui-selected {
    color: var(--glass-text, #0f172a) !important;
    border: 1.5px solid color-mix(in srgb, var(--glass-blue, #0a84ff) 62%, rgba(255, 255, 255, 0.86)) !important;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--glass-blue, #0a84ff) 34%, transparent), color-mix(in srgb, var(--glass-cyan, #64d2ff) 22%, transparent)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0.12)),
      var(--glass-card-hover, rgba(255, 255, 255, 0.72)) !important;
    box-shadow:
      0 18px 44px color-mix(in srgb, var(--glass-blue, #0a84ff) 28%, transparent),
      0 0 0 1px color-mix(in srgb, var(--glass-cyan, #64d2ff) 24%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.68),
      inset 0 -18px 40px rgba(255, 255, 255, 0.12) !important;
    backdrop-filter: blur(24px) saturate(1.55) !important;
    -webkit-backdrop-filter: blur(24px) saturate(1.55) !important;
    transform: translateY(-2px) scale(1.01) !important;
  }

  html[data-ultra-theme-preset="glass"][data-ultra-theme-mode="dark"] .proxy-node-card[data-selected="true"],
  html[data-ultra-theme-preset="glass"][data-ultra-theme-mode="dark"] .proxy-node-card[data-multi-selected="true"],
  html[data-ultra-theme-preset="glass"][data-ultra-theme-mode="dark"] .proxy-node-card.Mui-selected {
    color: #ffffff !important;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--glass-blue, #64d2ff) 30%, transparent), color-mix(in srgb, var(--glass-cyan, #0a84ff) 20%, transparent)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.05)),
      var(--glass-card-hover, rgba(30, 41, 59, 0.72)) !important;
  }

  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-selected="true"]::before,
  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-multi-selected="true"]::before,
  html[data-ultra-theme-preset="glass"] .proxy-node-card.Mui-selected::before {
    background: linear-gradient(180deg, var(--glass-blue, #0a84ff), var(--glass-cyan, #64d2ff));
    box-shadow: 0 0 18px color-mix(in srgb, var(--glass-blue, #0a84ff) 62%, transparent) !important;
  }

  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-selected="true"]::after,
  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-multi-selected="true"]::after,
  html[data-ultra-theme-preset="glass"] .proxy-node-card.Mui-selected::after {
    content: "";
    position: absolute;
    inset: 1px;
    z-index: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(115deg, rgba(255, 255, 255, 0.48), transparent 28%, rgba(255, 255, 255, 0.16) 52%, transparent 72%);
  }

  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-selected="true"] .MuiTypography-root,
  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-selected="true"] .MuiListItemText-secondary,
  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-multi-selected="true"] .MuiTypography-root,
  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-multi-selected="true"] .MuiListItemText-secondary,
  html[data-ultra-theme-preset="glass"] .proxy-node-card.Mui-selected .MuiTypography-root,
  html[data-ultra-theme-preset="glass"] .proxy-node-card.Mui-selected .MuiListItemText-secondary {
    color: inherit !important;
  }
`

const THEME_PERSONALITY_CSS = `
  html[data-ultra-theme-preset] body {
    isolation: isolate;
  }

  html[data-ultra-theme-preset] body::before,
  html[data-ultra-theme-preset] body::after {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }

  html[data-ultra-theme-preset] #root {
    position: relative;
    z-index: 1;
  }

  html[data-ultra-theme-preset] .layout,
  html[data-ultra-theme-preset] .base-page,
  html[data-ultra-theme-preset] .base-container,
  html[data-ultra-theme-preset] .base-content {
    position: relative;
  }

  html[data-ultra-theme-preset="cyberpunk"] body::before {
    opacity: 0.92;
    background:
      radial-gradient(circle at 18% 16%, rgba(0, 229, 255, 0.34) 0 7%, transparent 22%),
      radial-gradient(circle at 84% 18%, rgba(255, 43, 214, 0.28) 0 8%, transparent 24%),
      radial-gradient(circle at 52% 110%, rgba(248, 243, 43, 0.16) 0 12%, transparent 34%),
      linear-gradient(90deg, rgba(0, 229, 255, 0.08) 1px, transparent 1px) 0 0 / 42px 42px,
      linear-gradient(0deg, rgba(255, 43, 214, 0.07) 1px, transparent 1px) 0 0 / 42px 42px,
      linear-gradient(135deg, #020617 0%, #050510 46%, #13041d 100%) !important;
    animation: ultra-cyber-ambient 14s ease-in-out infinite alternate;
  }

  html[data-ultra-theme-preset="cyberpunk"] body::after {
    opacity: 0.34 !important;
    mix-blend-mode: screen !important;
    background:
      repeating-linear-gradient(0deg, rgba(234, 251, 255, 0.14) 0 1px, transparent 1px 5px),
      linear-gradient(115deg, transparent 0 38%, rgba(0, 229, 255, 0.22) 38.4% 38.8%, transparent 39.2%),
      linear-gradient(64deg, transparent 0 66%, rgba(255, 43, 214, 0.2) 66.4% 66.9%, transparent 67.3%);
    animation: ultra-cyber-scan 6s linear infinite;
  }

  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="light"] body::before {
    background:
      radial-gradient(circle at 18% 16%, rgba(0, 229, 255, 0.22) 0 7%, transparent 22%),
      radial-gradient(circle at 84% 18%, rgba(255, 43, 214, 0.18) 0 8%, transparent 24%),
      radial-gradient(circle at 52% 110%, rgba(248, 243, 43, 0.16) 0 12%, transparent 34%),
      linear-gradient(90deg, rgba(0, 130, 160, 0.11) 1px, transparent 1px) 0 0 / 42px 42px,
      linear-gradient(0deg, rgba(255, 43, 214, 0.09) 1px, transparent 1px) 0 0 / 42px 42px,
      linear-gradient(135deg, #f7fcff 0%, #dff2ff 52%, #f4e9ff 100%) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .layout {
    box-shadow:
      inset 0 0 0 1px rgba(0, 229, 255, 0.24),
      inset 0 0 90px rgba(0, 229, 255, 0.06) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .layout .layout-content__left {
    position: relative;
    border-right: 1px solid rgba(0, 229, 255, 0.36) !important;
    box-shadow: 18px 0 42px rgba(0, 229, 255, 0.08) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .layout .layout-content__left::after {
    content: "NETRUNNER";
    position: absolute;
    right: -33px;
    bottom: 94px;
    color: rgba(0, 229, 255, 0.5);
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.32em;
    transform: rotate(-90deg);
    text-shadow: 0 0 14px rgba(0, 229, 255, 0.76);
    pointer-events: none;
  }

  html[data-ultra-theme-preset="cyberpunk"] .layout .layout-content__left .the-logo {
    border-bottom: 1px solid rgba(0, 229, 255, 0.22);
  }

  html[data-ultra-theme-preset="cyberpunk"] .layout .layout-content__left .the-logo::after {
    content: "CYBER DECK // ONLINE";
    position: absolute;
    left: 18px;
    bottom: 6px;
    color: var(--cyber-green, #00ffa3);
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-shadow: 0 0 12px rgba(0, 255, 163, 0.72);
    pointer-events: none;
  }

  html[data-ultra-theme-preset="cyberpunk"] .the-menu .MuiListItemButton-root {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(0, 229, 255, 0.16) !important;
    background:
      linear-gradient(90deg, rgba(0, 229, 255, 0.08), transparent 58%),
      rgba(1, 8, 24, 0.34) !important;
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
  }

  html[data-ultra-theme-preset="cyberpunk"] .the-menu .MuiListItemButton-root::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(0, 229, 255, 0.2), transparent);
    opacity: 0;
    transform: translateX(-120%);
    transition: opacity 160ms ease, transform 280ms ease;
    pointer-events: none;
  }

  html[data-ultra-theme-preset="cyberpunk"] .the-menu .MuiListItemButton-root:hover::before,
  html[data-ultra-theme-preset="cyberpunk"] .the-menu .MuiListItemButton-root.Mui-selected::before {
    opacity: 1;
    transform: translateX(120%);
  }

  html[data-ultra-theme-preset="cyberpunk"] .the-menu .MuiListItemButton-root.Mui-selected {
    border-color: var(--cyber-pink, #ff2bd6) !important;
    background:
      linear-gradient(90deg, rgba(255, 43, 214, 0.28), rgba(0, 229, 255, 0.18)),
      rgba(5, 18, 43, 0.94) !important;
    box-shadow:
      0 0 18px rgba(255, 43, 214, 0.35),
      inset 0 0 18px rgba(0, 229, 255, 0.12) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-page > header {
    position: relative;
    overflow: hidden;
    min-height: 58px;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-page > header::after {
    content: "SIGNAL LOCKED";
    position: absolute;
    right: 18px;
    bottom: 7px;
    color: rgba(0, 229, 255, 0.48);
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.18em;
    pointer-events: none;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-content > .MuiBox-root,
  html[data-ultra-theme-preset="cyberpunk"] .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root,
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiGrid-root > .MuiGrid-root > .MuiBox-root,
  html[data-ultra-theme-preset="cyberpunk"] .MuiCard-root {
    position: relative;
    overflow: hidden;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-content > .MuiBox-root::after,
  html[data-ultra-theme-preset="cyberpunk"] .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root::after,
  html[data-ultra-theme-preset="cyberpunk"] .base-content .MuiGrid-root > .MuiGrid-root > .MuiBox-root::after,
  html[data-ultra-theme-preset="cyberpunk"] .MuiCard-root::after {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    width: 42px;
    height: 42px;
    border-top: 1px solid rgba(0, 229, 255, 0.38);
    border-right: 1px solid rgba(255, 43, 214, 0.34);
    pointer-events: none;
  }

  html[data-ultra-theme-preset="manga"] body::before {
    background:
      radial-gradient(circle at 8% 12%, rgba(255, 47, 109, 0.26) 0 9%, transparent 9.5%),
      radial-gradient(circle at 92% 16%, rgba(29, 78, 216, 0.16) 0 11%, transparent 11.5%),
      radial-gradient(circle at 82% 88%, rgba(251, 191, 36, 0.24) 0 13%, transparent 13.5%),
      radial-gradient(circle at 1px 1px, rgba(17, 17, 17, 0.1) 1px, transparent 1.25px) 0 0 / 12px 12px,
      linear-gradient(135deg, #fffdf7 0%, #fff1df 48%, #ffe3ed 100%) !important;
  }

  html[data-ultra-theme-preset="manga"][data-ultra-theme-mode="dark"] body::before {
    background:
      radial-gradient(circle at 8% 12%, rgba(255, 92, 147, 0.22) 0 9%, transparent 9.5%),
      radial-gradient(circle at 92% 16%, rgba(125, 211, 252, 0.12) 0 11%, transparent 11.5%),
      radial-gradient(circle at 82% 88%, rgba(250, 204, 21, 0.14) 0 13%, transparent 13.5%),
      radial-gradient(circle at 1px 1px, rgba(255, 248, 232, 0.1) 1px, transparent 1.25px) 0 0 / 12px 12px,
      linear-gradient(135deg, #09080c 0%, #171018 48%, #24111c 100%) !important;
  }

  html[data-ultra-theme-preset="manga"] body::after {
    opacity: 0.48 !important;
    background:
      repeating-radial-gradient(circle at 18% 24%, rgba(17, 17, 17, 0.12) 0 1px, transparent 1px 5px),
      repeating-linear-gradient(115deg, transparent 0 18px, rgba(17, 17, 17, 0.04) 19px 20px),
      linear-gradient(105deg, transparent 0 70%, rgba(255, 47, 109, 0.16) 70.3% 72%, transparent 72.3%) !important;
  }

  html[data-ultra-theme-preset="manga"] .layout .layout-content__left,
  html[data-ultra-theme-preset="manga"] .layout .layout-content__right {
    border-width: 2px !important;
  }

  html[data-ultra-theme-preset="manga"] .layout .layout-content__left {
    position: relative;
  }

  html[data-ultra-theme-preset="manga"] .layout .layout-content__left::after {
    content: "読む";
    position: absolute;
    right: 12px;
    bottom: 76px;
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 3px solid var(--manga-border-color, #111);
    border-radius: 50%;
    color: #fff8e8;
    background:
      radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.28) 0 12%, transparent 13%),
      var(--manga-accent, #ff2f6d);
    box-shadow: 4px 4px 0 rgba(17, 17, 17, 0.34);
    font-size: 14px;
    font-weight: 1000;
    transform: rotate(-10deg);
    pointer-events: none;
  }

  html[data-ultra-theme-preset="manga"] .layout .layout-content__left .the-logo::after {
    content: "CLASH ULTRA PANEL";
    position: absolute;
    left: 16px;
    bottom: 6px;
    padding: 2px 8px;
    border: 2px solid var(--manga-border-color, #111);
    border-radius: 999px;
    color: var(--manga-text, #111);
    background: var(--manga-yellow, #fbbf24);
    box-shadow: 3px 3px 0 rgba(17, 17, 17, 0.22);
    font-size: 9px;
    font-weight: 1000;
    letter-spacing: 0.08em;
    transform: rotate(-2deg);
    pointer-events: none;
  }

  html[data-ultra-theme-preset="manga"] .the-menu .MuiListItemButton-root {
    border: 2px solid transparent !important;
    background:
      radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--manga-ink) 8%, transparent) 1px, transparent 1.2px) 0 0 / 10px 10px,
      var(--manga-card) !important;
    transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease !important;
  }

  html[data-ultra-theme-preset="manga"] .the-menu .MuiListItemButton-root:hover {
    border-color: var(--manga-border-color, #111) !important;
    box-shadow: 4px 4px 0 rgba(17, 17, 17, 0.16) !important;
    transform: translate(-1px, -1px) rotate(-0.35deg);
  }

  html[data-ultra-theme-preset="manga"] .the-menu .MuiListItemButton-root.Mui-selected {
    border-color: var(--manga-border-color, #111) !important;
    color: #fff8e8 !important;
    background:
      repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.14) 0 6px, transparent 6px 12px),
      linear-gradient(135deg, #111 0%, #2b121c 52%, var(--manga-accent, #ff2f6d) 100%) !important;
    box-shadow: 6px 6px 0 color-mix(in srgb, var(--manga-accent, #ff2f6d) 42%, transparent) !important;
    transform: rotate(-0.8deg);
  }

  html[data-ultra-theme-preset="manga"] .the-menu .MuiListItemButton-root.Mui-selected .MuiListItemText-primary,
  html[data-ultra-theme-preset="manga"] .the-menu .MuiListItemButton-root.Mui-selected .MuiSvgIcon-root {
    color: #fff8e8 !important;
  }

  html[data-ultra-theme-preset="manga"] .base-page > header {
    position: relative;
    overflow: hidden;
    border-bottom: 3px solid var(--manga-border-color, #111) !important;
  }

  html[data-ultra-theme-preset="manga"] .base-page > header::before {
    content: "第01話";
    margin-right: 10px;
    padding: 4px 8px;
    border: 2px solid var(--manga-border-color, #111);
    border-radius: 8px;
    color: #fff8e8;
    background: var(--manga-accent, #ff2f6d);
    box-shadow: 3px 3px 0 rgba(17, 17, 17, 0.26);
    font-size: 12px;
    font-weight: 1000;
    transform: rotate(-3deg);
  }

  html[data-ultra-theme-preset="manga"] .base-content > .MuiBox-root,
  html[data-ultra-theme-preset="manga"] .MuiPaper-root,
  html[data-ultra-theme-preset="manga"] .MuiCard-root {
    border-width: 2px !important;
    box-shadow: var(--manga-shadow) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiButton-root {
    transform: rotate(-0.35deg);
  }

  html[data-ultra-theme-preset="glass"] body::before {
    background:
      radial-gradient(circle at 12% 8%, rgba(100, 210, 255, 0.42) 0 12%, transparent 28%),
      radial-gradient(circle at 86% 12%, rgba(10, 132, 255, 0.3) 0 10%, transparent 26%),
      radial-gradient(circle at 66% 90%, rgba(191, 219, 254, 0.56) 0 18%, transparent 36%),
      conic-gradient(from 210deg at 54% 42%, rgba(255, 255, 255, 0.6), rgba(100, 210, 255, 0.22), rgba(10, 132, 255, 0.14), rgba(255, 255, 255, 0.54)),
      linear-gradient(135deg, #f8fcff 0%, #eef7ff 48%, #f8f3ff 100%) !important;
    animation: ultra-glass-aurora 16s ease-in-out infinite alternate;
  }

  html[data-ultra-theme-preset="glass"][data-ultra-theme-mode="dark"] body::before {
    background:
      radial-gradient(circle at 16% 10%, rgba(100, 210, 255, 0.24) 0 11%, transparent 28%),
      radial-gradient(circle at 86% 14%, rgba(10, 132, 255, 0.24) 0 10%, transparent 26%),
      radial-gradient(circle at 62% 88%, rgba(48, 209, 88, 0.12) 0 16%, transparent 34%),
      conic-gradient(from 210deg at 54% 42%, rgba(255, 255, 255, 0.1), rgba(100, 210, 255, 0.18), rgba(10, 132, 255, 0.12), rgba(255, 255, 255, 0.08)),
      linear-gradient(135deg, #05070d 0%, #070b14 48%, #101827 100%) !important;
  }

  html[data-ultra-theme-preset="glass"] body::after {
    opacity: 0.34 !important;
    background:
      linear-gradient(115deg, transparent 0 28%, rgba(255, 255, 255, 0.58) 28.4% 29%, transparent 30%),
      linear-gradient(70deg, transparent 0 72%, rgba(10, 132, 255, 0.16) 72.5% 73.2%, transparent 74%),
      radial-gradient(circle at 22% 26%, rgba(255, 255, 255, 0.34) 0 1px, transparent 2px),
      radial-gradient(circle at 72% 18%, rgba(255, 255, 255, 0.28) 0 1px, transparent 2px),
      radial-gradient(circle at 70% 78%, rgba(255, 255, 255, 0.22) 0 1px, transparent 2px) !important;
  }

  html[data-ultra-theme-preset="glass"] .layout .layout-content__left {
    border-right-color: rgba(255, 255, 255, 0.48) !important;
    box-shadow: 22px 0 54px rgba(10, 132, 255, 0.12) !important;
  }

  html[data-ultra-theme-preset="glass"] .layout .layout-content__left .the-logo::after {
    content: "LIQUID GLASS";
    position: absolute;
    left: 18px;
    bottom: 6px;
    padding: 3px 9px;
    border: 1px solid var(--glass-border-strong, rgba(255,255,255,.82));
    border-radius: 999px;
    color: var(--glass-text, #0f172a);
    background: rgba(255, 255, 255, 0.42);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 12px 24px rgba(10, 132, 255, 0.12);
    backdrop-filter: blur(18px) saturate(1.45);
    -webkit-backdrop-filter: blur(18px) saturate(1.45);
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.12em;
    pointer-events: none;
  }

  html[data-ultra-theme-preset="glass"] .the-menu .MuiListItemButton-root {
    border: 1px solid rgba(255, 255, 255, 0.44) !important;
    border-radius: 999px !important;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.38), rgba(255, 255, 255, 0.1)),
      rgba(255, 255, 255, 0.22) !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38) !important;
    backdrop-filter: blur(18px) saturate(1.35);
    -webkit-backdrop-filter: blur(18px) saturate(1.35);
  }

  html[data-ultra-theme-preset="glass"] .the-menu .MuiListItemButton-root:hover {
    transform: translateY(-1px);
    box-shadow:
      0 12px 26px rgba(10, 132, 255, 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.56) !important;
  }

  html[data-ultra-theme-preset="glass"] .the-menu .MuiListItemButton-root.Mui-selected {
    border-color: color-mix(in srgb, var(--glass-blue, #0a84ff) 44%, white) !important;
    background:
      linear-gradient(135deg, rgba(10, 132, 255, 0.26), rgba(100, 210, 255, 0.18)),
      rgba(255, 255, 255, 0.46) !important;
    box-shadow:
      0 18px 36px rgba(10, 132, 255, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.72),
      inset 0 -18px 44px rgba(255, 255, 255, 0.12) !important;
  }

  html[data-ultra-theme-preset="glass"] .base-page > header {
    position: relative;
    overflow: hidden;
  }

  html[data-ultra-theme-preset="glass"] .base-page > header::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 0 32%, rgba(255, 255, 255, 0.44) 36%, transparent 44%);
    transform: translateX(-55%);
    animation: ultra-glass-sheen 7s ease-in-out infinite;
    pointer-events: none;
  }

  html[data-ultra-theme-preset="glass"] .base-content > .MuiBox-root,
  html[data-ultra-theme-preset="glass"] .MuiPaper-root,
  html[data-ultra-theme-preset="glass"] .MuiCard-root {
    border-radius: 20px !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiButton-root {
    border-radius: 999px !important;
  }

  @keyframes ultra-cyber-ambient {
    from { filter: hue-rotate(0deg) brightness(1); transform: scale(1); }
    to { filter: hue-rotate(10deg) brightness(1.08); transform: scale(1.02); }
  }

  @keyframes ultra-cyber-scan {
    from { background-position: 0 0, -40vw 0, 40vw 0; }
    to { background-position: 0 28px, 40vw 0, -40vw 0; }
  }

  @keyframes ultra-glass-aurora {
    from { filter: hue-rotate(0deg) saturate(1); transform: scale(1); }
    to { filter: hue-rotate(18deg) saturate(1.14); transform: scale(1.03); }
  }

  @keyframes ultra-glass-sheen {
    0%, 58% { transform: translateX(-65%); opacity: 0; }
    70% { opacity: 0.9; }
    100% { transform: translateX(68%); opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    html[data-ultra-theme-preset] body::before,
    html[data-ultra-theme-preset] body::after,
    html[data-ultra-theme-preset] .base-page > header::after {
      animation: none !important;
    }
  }
`

const THEME_READABILITY_AND_STYLE_BOOST_CSS = `
  html[data-ultra-theme-preset="cyberpunk"] {
    --theme-readable-primary: var(--cyber-text, #eafbff);
    --theme-readable-secondary: var(--cyber-muted, #9beeff);
    --theme-readable-inverse: #03111c;
    --theme-readable-surface: var(--cyber-surface-soft, rgba(7, 17, 38, 0.94));
    --theme-readable-overlay: var(--cyber-panel-strong, rgba(9, 18, 42, 0.98));
    --theme-readable-field: var(--cyber-field, rgba(1, 8, 24, 0.72));
    --theme-readable-border: var(--cyber-border, rgba(0, 229, 255, 0.5));
    --theme-readable-accent: var(--cyber-cyan, #00e5ff);
    --theme-readable-hot: var(--cyber-pink, #ff2bd6);
    --theme-readable-hover-bg: color-mix(in srgb, var(--cyber-cyan, #00e5ff) 16%, transparent);
    --theme-readable-selected-bg: color-mix(in srgb, var(--cyber-pink, #ff2bd6) 24%, transparent);
  }

  html[data-ultra-theme-preset="manga"] {
    --theme-readable-primary: var(--manga-text, #111111);
    --theme-readable-secondary: var(--manga-muted, #5f4b46);
    --theme-readable-inverse: #fff8e8;
    --theme-readable-surface: var(--manga-panel-strong, rgba(255, 253, 247, 0.98));
    --theme-readable-overlay: var(--manga-card, rgba(255, 248, 232, 0.98));
    --theme-readable-field: var(--manga-field, rgba(255, 255, 255, 0.86));
    --theme-readable-border: var(--manga-border-color, rgba(17, 17, 17, 0.84));
    --theme-readable-accent: var(--manga-accent, #ff2f6d);
    --theme-readable-hot: var(--manga-yellow, #fbbf24);
    --theme-readable-hover-bg: color-mix(in srgb, var(--manga-accent, #ff2f6d) 12%, transparent);
    --theme-readable-selected-bg: color-mix(in srgb, var(--manga-accent, #ff2f6d) 20%, transparent);
  }

  html[data-ultra-theme-preset="glass"] {
    --theme-readable-primary: var(--glass-text, #0f172a);
    --theme-readable-secondary: var(--glass-muted, #475569);
    --theme-readable-inverse: #ffffff;
    --theme-readable-surface: var(--glass-panel-strong, rgba(255, 255, 255, 0.76));
    --theme-readable-overlay: var(--glass-panel-strong, rgba(255, 255, 255, 0.82));
    --theme-readable-field: var(--glass-field, rgba(255, 255, 255, 0.42));
    --theme-readable-border: var(--glass-border, rgba(255, 255, 255, 0.58));
    --theme-readable-accent: var(--glass-blue, #0a84ff);
    --theme-readable-hot: var(--glass-cyan, #64d2ff);
    --theme-readable-hover-bg: color-mix(in srgb, var(--glass-blue, #0a84ff) 12%, transparent);
    --theme-readable-selected-bg: color-mix(in srgb, var(--glass-blue, #0a84ff) 18%, transparent);
  }

  html[data-ultra-theme-preset] :is(
    .MuiTypography-root,
    .MuiListItemText-primary,
    .MuiFormControlLabel-label,
    .MuiTableCell-root,
    .MuiInputBase-input,
    .MuiSelect-select,
    .MuiAutocomplete-input,
    .MuiTreeItem-label
  ) {
    color: var(--theme-readable-primary) !important;
  }

  html[data-ultra-theme-preset] :is(
    .MuiTypography-colorTextSecondary,
    .MuiListItemText-secondary,
    .MuiInputLabel-root,
    .MuiFormLabel-root,
    .MuiFormHelperText-root,
    .MuiTableCell-head,
    .MuiBreadcrumbs-separator,
    .MuiInputAdornment-root,
    .MuiInputAdornment-root .MuiTypography-root
  ) {
    color: var(--theme-readable-secondary) !important;
  }

  html[data-ultra-theme-preset] .MuiInputBase-input::placeholder {
    color: color-mix(in srgb, var(--theme-readable-secondary) 72%, transparent) !important;
    opacity: 1 !important;
  }

  html[data-ultra-theme-preset] .MuiOutlinedInput-notchedOutline,
  html[data-ultra-theme-preset] .MuiDivider-root {
    border-color: var(--theme-readable-border) !important;
  }

  html[data-ultra-theme-preset] .MuiMenu-paper::before,
  html[data-ultra-theme-preset] .MuiMenu-paper::after,
  html[data-ultra-theme-preset] .MuiPopover-paper::before,
  html[data-ultra-theme-preset] .MuiPopover-paper::after {
    content: none !important;
    display: none !important;
  }

  html[data-ultra-theme-preset] .MuiMenuItem-root,
  html[data-ultra-theme-preset] .MuiSelect-select,
  html[data-ultra-theme-preset] .MuiAutocomplete-option {
    color: var(--theme-readable-primary) !important;
  }

  /* 下拉框 / 菜单 / Popover 不能继承主题卡片的整页宽度和装饰。 */
  html[data-ultra-theme-preset] .MuiPopover-root .MuiPaper-root.MuiPopover-paper,
  html[data-ultra-theme-preset] .MuiMenu-root .MuiPaper-root.MuiMenu-paper,
  html[data-ultra-theme-preset] .MuiAutocomplete-popper .MuiPaper-root,
  html[data-ultra-theme-preset] .MuiPopper-root .MuiPaper-root {
    position: absolute !important;
    width: auto !important;
    min-width: var(--Paper-anchorEl-width, 120px);
    max-width: min(520px, calc(100vw - 32px)) !important;
    height: auto !important;
    max-height: min(70vh, 560px) !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    clip-path: none !important;
    color: var(--theme-readable-primary) !important;
    border-color: var(--theme-readable-border) !important;
    background: var(--theme-readable-overlay) !important;
    isolation: auto !important;
  }

  html[data-ultra-theme-preset] .MuiAutocomplete-popper .MuiPaper-root,
  html[data-ultra-theme-preset] .MuiPopper-root .MuiPaper-root {
    position: static !important;
    min-width: 0 !important;
    width: 100% !important;
  }

  html[data-ultra-theme-preset] .MuiMenu-list,
  html[data-ultra-theme-preset] .MuiAutocomplete-listbox {
    width: auto !important;
    min-width: 0 !important;
    max-width: 100% !important;
    background: transparent !important;
  }

  html[data-ultra-theme-preset] .MuiMenuItem-root,
  html[data-ultra-theme-preset] .MuiAutocomplete-option {
    width: auto !important;
    max-width: calc(100vw - 48px) !important;
    color: var(--theme-readable-primary) !important;
    background: transparent !important;
  }

  html[data-ultra-theme-preset] .MuiMenuItem-root:hover,
  html[data-ultra-theme-preset] .MuiAutocomplete-option:hover,
  html[data-ultra-theme-preset] .MuiAutocomplete-option.Mui-focused {
    color: var(--theme-readable-primary) !important;
    background: var(--theme-readable-hover-bg) !important;
  }

  html[data-ultra-theme-preset] .MuiMenuItem-root.Mui-selected,
  html[data-ultra-theme-preset] .MuiMenuItem-root.Mui-selected:hover,
  html[data-ultra-theme-preset] .MuiAutocomplete-option[aria-selected="true"],
  html[data-ultra-theme-preset] .MuiAutocomplete-option[aria-selected="true"].Mui-focused {
    color: var(--theme-readable-primary) !important;
    background: var(--theme-readable-selected-bg) !important;
  }

  html[data-ultra-theme-preset] .proxy-node-context-menu {
    position: absolute !important;
    width: auto !important;
    min-width: 132px !important;
    max-width: 220px !important;
  }

  html[data-ultra-theme-preset] .proxy-node-context-menu .MuiMenuItem-root {
    max-width: 200px !important;
  }

  html[data-ultra-theme-preset] :is(.MuiInputBase-root, .MuiOutlinedInput-root, .MuiFilledInput-root) {
    color: var(--theme-readable-primary) !important;
    background: var(--theme-readable-field) !important;
  }

  html[data-ultra-theme-preset] :is(.MuiChip-root, .MuiBadge-badge, .MuiAlert-root) {
    color: var(--theme-readable-primary) !important;
    border-color: color-mix(in srgb, var(--theme-readable-border) 72%, transparent) !important;
  }

  html[data-ultra-theme-preset] .base-content :is(
    [style*="background-color: rgb(255, 255, 255)"],
    [style*="background-color: #ffffff"],
    [style*="background-color:#ffffff"],
    [style*="background-color: white"],
    [style*="background-color:white"],
    [style*="background-color: rgb(245, 245, 245)"],
    [style*="background-color: rgb(236, 236, 236)"],
    [style*="background-color: rgb(40, 42, 54)"],
    [style*="background-color: #282a36"],
    [style*="background-color:#282a36"],
    [style*="background-color: rgb(46, 48, 61)"],
    [style*="background-color: #2e303d"],
    [style*="background-color:#2e303d"],
    [style*="background-color: rgb(36, 37, 47)"],
    [style*="background-color: #24252f"],
    [style*="background-color:#24252f"],
    [style*="background-color: rgb(30, 31, 39)"],
    [style*="background-color: #1e1f27"],
    [style*="background-color:#1e1f27"]
  ) {
    color: var(--theme-readable-primary) !important;
    border-color: color-mix(in srgb, var(--theme-readable-border) 72%, transparent) !important;
    background: var(--theme-readable-surface) !important;
  }

  /* 赛博朋克深色模式：收敛首页/代理页里组件自带的灰白底色。 */
  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="dark"] .home-enhanced-card,
  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="dark"] .base-content .home-enhanced-card,
  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="dark"] .base-content .home-enhanced-card.MuiBox-root {
    color: var(--cyber-text, #eafbff) !important;
    border: 1px solid rgba(0, 229, 255, 0.28) !important;
    background:
      linear-gradient(135deg, rgba(0, 229, 255, 0.1), transparent 36%),
      linear-gradient(315deg, rgba(255, 43, 214, 0.08), transparent 42%),
      var(--cyber-surface-soft, rgba(7, 17, 38, 0.96)) !important;
    box-shadow:
      0 0 0 1px rgba(0, 229, 255, 0.16),
      0 18px 42px rgba(0, 229, 255, 0.12),
      inset 0 0 28px rgba(0, 229, 255, 0.06) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="dark"] .home-enhanced-card > .home-enhanced-card__header {
    border-bottom-color: rgba(0, 229, 255, 0.28) !important;
    background:
      linear-gradient(90deg, rgba(0, 229, 255, 0.1), rgba(255, 43, 214, 0.06)),
      rgba(1, 8, 24, 0.48) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="dark"] .home-enhanced-card :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper),
  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="dark"] .base-content :is(.proxy-node-card, .MuiListItemButton-root.proxy-node-card),
  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="dark"] .base-content .MuiListItem-root > .MuiButtonBase-root {
    color: var(--cyber-text, #eafbff) !important;
    border-color: rgba(0, 229, 255, 0.3) !important;
    background:
      linear-gradient(90deg, rgba(0, 229, 255, 0.1), rgba(255, 43, 214, 0.055)),
      var(--cyber-card, rgba(3, 10, 28, 0.96)) !important;
    box-shadow:
      0 0 12px rgba(0, 229, 255, 0.12),
      inset 0 0 16px rgba(0, 229, 255, 0.045) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="dark"] .home-enhanced-card :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):hover,
  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="dark"] .base-content :is(.proxy-node-card, .MuiListItemButton-root.proxy-node-card):hover {
    background:
      linear-gradient(90deg, rgba(0, 229, 255, 0.18), rgba(255, 43, 214, 0.12)),
      var(--cyber-card-hover, rgba(4, 15, 38, 0.94)) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="dark"] .home-enhanced-card .MuiBox-root[style*="background-color"],
  html[data-ultra-theme-preset="cyberpunk"][data-ultra-theme-mode="dark"] .base-content .MuiBox-root[style*="background-color"] {
    color: var(--cyber-text, #eafbff) !important;
  }

  html[data-ultra-theme-preset] .MuiButton-root:not(.MuiButton-contained):not(.MuiButton-containedPrimary):not([data-theme-mode-option]) {
    color: var(--theme-readable-primary) !important;
    border-color: color-mix(in srgb, var(--theme-readable-border) 78%, transparent) !important;
  }

  html[data-ultra-theme-preset] :is(.MuiIconButton-root, .MuiSvgIcon-root, .MuiCheckbox-root, .MuiRadio-root) {
    color: var(--theme-readable-primary) !important;
  }

  html[data-ultra-theme-preset] :is(.Mui-disabled, .MuiInputBase-input.Mui-disabled, .MuiButtonBase-root.Mui-disabled) {
    color: color-mix(in srgb, var(--theme-readable-secondary) 58%, transparent) !important;
    -webkit-text-fill-color: color-mix(in srgb, var(--theme-readable-secondary) 58%, transparent) !important;
  }

  html[data-ultra-theme-preset] .proxy-node-card[data-selected="true"] .MuiSvgIcon-root,
  html[data-ultra-theme-preset] .proxy-node-card[data-multi-selected="true"] .MuiSvgIcon-root,
  html[data-ultra-theme-preset] .proxy-node-card.Mui-selected .MuiSvgIcon-root {
    color: currentColor !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card[data-selected="true"] :is(.MuiTypography-root, .MuiListItemText-primary, .MuiListItemText-secondary),
  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card[data-multi-selected="true"] :is(.MuiTypography-root, .MuiListItemText-primary, .MuiListItemText-secondary),
  html[data-ultra-theme-preset="cyberpunk"] .proxy-node-card.Mui-selected :is(.MuiTypography-root, .MuiListItemText-primary, .MuiListItemText-secondary),
  html[data-ultra-theme-preset="manga"] .proxy-node-card[data-selected="true"] :is(.MuiTypography-root, .MuiListItemText-primary, .MuiListItemText-secondary),
  html[data-ultra-theme-preset="manga"] .proxy-node-card[data-multi-selected="true"] :is(.MuiTypography-root, .MuiListItemText-primary, .MuiListItemText-secondary),
  html[data-ultra-theme-preset="manga"] .proxy-node-card.Mui-selected :is(.MuiTypography-root, .MuiListItemText-primary, .MuiListItemText-secondary) {
    color: #ffffff !important;
  }

  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-selected="true"] :is(.MuiTypography-root, .MuiListItemText-primary, .MuiListItemText-secondary),
  html[data-ultra-theme-preset="glass"] .proxy-node-card[data-multi-selected="true"] :is(.MuiTypography-root, .MuiListItemText-primary, .MuiListItemText-secondary),
  html[data-ultra-theme-preset="glass"] .proxy-node-card.Mui-selected :is(.MuiTypography-root, .MuiListItemText-primary, .MuiListItemText-secondary) {
    color: inherit !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-page > header {
    border-bottom: 2px solid var(--cyber-cyan, #00e5ff) !important;
    box-shadow:
      inset 0 -1px 0 rgba(255, 43, 214, 0.72),
      0 14px 42px rgba(0, 229, 255, 0.18) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .base-page > header::before {
    content: "///// NET-LINK";
    position: absolute;
    left: 18px;
    bottom: 7px;
    color: rgba(248, 243, 43, 0.72);
    font-size: 9px;
    font-weight: 1000;
    letter-spacing: 0.22em;
    text-shadow: 0 0 12px rgba(248, 243, 43, 0.78);
    pointer-events: none;
  }

  html[data-ultra-theme-preset="cyberpunk"] :is(.MuiCard-root, .MuiPaper-root, .base-content > .MuiBox-root):not(.MuiMenu-paper):not(.MuiPopover-paper) {
    clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px));
    border-width: 1.5px !important;
    box-shadow:
      0 0 0 1px rgba(0, 229, 255, 0.24),
      0 0 26px rgba(0, 229, 255, 0.2),
      inset 0 0 32px rgba(255, 43, 214, 0.08) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiButton-root:not([data-theme-mode-option]) {
    clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px));
    letter-spacing: 0.08em;
    font-weight: 900 !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .MuiButton-contained,
  html[data-ultra-theme-preset="cyberpunk"] .MuiButton-containedPrimary {
    color: #03111c !important;
    box-shadow:
      0 0 16px rgba(0, 229, 255, 0.56),
      0 0 28px rgba(255, 43, 214, 0.38) !important;
  }

  html[data-ultra-theme-preset="cyberpunk"] .the-menu .MuiListItemButton-root.Mui-selected::after {
    content: "ACTIVE";
    position: absolute;
    right: 10px;
    top: 50%;
    color: rgba(0, 255, 163, 0.66);
    font-size: 8px;
    font-weight: 1000;
    letter-spacing: 0.16em;
    transform: translateY(-50%);
    text-shadow: 0 0 10px rgba(0, 255, 163, 0.9);
    pointer-events: none;
  }

  html[data-ultra-theme-preset="manga"] .base-page > header {
    min-height: 62px;
    box-shadow:
      0 5px 0 color-mix(in srgb, var(--manga-accent, #ff2f6d) 42%, transparent),
      inset 0 -2px 0 var(--manga-yellow, #fbbf24) !important;
  }

  html[data-ultra-theme-preset="manga"] .base-page > header::after {
    content: "ドン!";
    position: absolute;
    right: 18px;
    top: 11px;
    z-index: 0;
    padding: 4px 9px;
    border: 3px solid var(--manga-border-color, #111);
    border-radius: 50%;
    color: #111111;
    background: var(--manga-yellow, #fbbf24);
    box-shadow: 4px 4px 0 rgba(17, 17, 17, 0.28);
    font-size: 14px;
    font-weight: 1000;
    transform: rotate(9deg);
    pointer-events: none;
  }

  html[data-ultra-theme-preset="manga"] :is(.MuiCard-root, .MuiPaper-root, .base-content > .MuiBox-root):not(.MuiMenu-paper):not(.MuiPopover-paper) {
    border: 3px solid var(--manga-border-color, #111) !important;
    border-radius: 18px !important;
    background-image:
      radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--manga-ink, #111) 11%, transparent) 1px, transparent 1.35px),
      linear-gradient(135deg, color-mix(in srgb, var(--manga-accent, #ff2f6d) 8%, transparent), transparent 42%) !important;
    background-size: 11px 11px, auto !important;
    box-shadow: 8px 8px 0 color-mix(in srgb, var(--manga-accent, #ff2f6d) 34%, transparent) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiButton-root:not([data-theme-mode-option]) {
    border: 2px solid var(--manga-border-color, #111) !important;
    border-radius: 12px !important;
    font-weight: 1000 !important;
    box-shadow: 4px 4px 0 rgba(17, 17, 17, 0.18) !important;
  }

  html[data-ultra-theme-preset="manga"] .MuiButton-contained,
  html[data-ultra-theme-preset="manga"] .MuiButton-containedPrimary {
    color: #fff8e8 !important;
    text-shadow: 2px 2px 0 rgba(17, 17, 17, 0.38) !important;
    background:
      repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.16) 0 6px, transparent 6px 12px),
      linear-gradient(135deg, #111111, var(--manga-accent, #ff2f6d)) !important;
  }

  html[data-ultra-theme-preset="manga"] .the-menu .MuiListItemButton-root.Mui-selected::after {
    content: "!!";
    position: absolute;
    right: 11px;
    top: 50%;
    color: var(--manga-yellow, #fbbf24);
    font-size: 18px;
    font-weight: 1000;
    transform: translateY(-50%) rotate(-8deg);
    text-shadow: 2px 2px 0 #111111;
    pointer-events: none;
  }

  html[data-ultra-theme-preset="glass"] body::before {
    opacity: 1 !important;
    filter: saturate(1.24) contrast(1.04);
  }

  html[data-ultra-theme-preset="glass"] .base-page > header {
    border-bottom: 1px solid rgba(255, 255, 255, 0.62) !important;
    box-shadow:
      0 24px 60px rgba(10, 132, 255, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.72),
      inset 0 -22px 48px rgba(255, 255, 255, 0.1) !important;
  }

  html[data-ultra-theme-preset="glass"] :is(.MuiCard-root, .MuiPaper-root, .base-content > .MuiBox-root):not(.MuiMenu-paper):not(.MuiPopover-paper) {
    border: 1px solid rgba(255, 255, 255, 0.56) !important;
    border-radius: 24px !important;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.54), rgba(255, 255, 255, 0.12)),
      radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--glass-cyan, #64d2ff) 24%, transparent), transparent 34%),
      var(--theme-readable-surface) !important;
    box-shadow:
      0 24px 70px rgba(10, 132, 255, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.74),
      inset 0 -24px 54px rgba(255, 255, 255, 0.1) !important;
    backdrop-filter: blur(28px) saturate(1.6) !important;
    -webkit-backdrop-filter: blur(28px) saturate(1.6) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiButton-root:not([data-theme-mode-option]) {
    border-radius: 999px !important;
    font-weight: 850 !important;
    box-shadow:
      0 14px 34px color-mix(in srgb, var(--glass-blue, #0a84ff) 18%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.62) !important;
  }

  html[data-ultra-theme-preset="glass"] .MuiButton-contained,
  html[data-ultra-theme-preset="glass"] .MuiButton-containedPrimary {
    color: #ffffff !important;
    background:
      linear-gradient(135deg, var(--glass-blue, #0a84ff), var(--glass-cyan, #64d2ff)) !important;
    text-shadow: 0 1px 8px rgba(2, 6, 23, 0.36) !important;
  }

  html[data-ultra-theme-preset="glass"] .the-menu .MuiListItemButton-root.Mui-selected::after {
    content: "";
    position: absolute;
    right: 12px;
    top: 50%;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--glass-cyan, #64d2ff);
    box-shadow:
      0 0 16px var(--glass-cyan, #64d2ff),
      0 0 28px var(--glass-blue, #0a84ff);
    transform: translateY(-50%);
    pointer-events: none;
  }
`

const DEFAULT_FRESH_MINT_PERSONALITY_CSS = `
  html:not([data-ultra-theme-preset]) {
    --fresh-mint-ink: #102f3c;
    --fresh-mint-muted: #547383;
    --fresh-mint-glow: rgba(18, 175, 160, 0.26);
    --fresh-mint-blue-glow: rgba(104, 168, 255, 0.2);
    --fresh-mint-border: rgba(18, 175, 160, 0.22);
    --fresh-mint-crystal: rgba(255, 255, 255, 0.72);
    color-scheme: light;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] {
    --fresh-mint-ink: #dffbf6;
    --fresh-mint-muted: #9ccfc7;
    --fresh-mint-glow: rgba(92, 227, 210, 0.25);
    --fresh-mint-blue-glow: rgba(104, 168, 255, 0.18);
    --fresh-mint-border: rgba(126, 237, 222, 0.2);
    --fresh-mint-crystal: rgba(255, 255, 255, 0.14);
    color-scheme: dark;
  }

  html:not([data-ultra-theme-preset]) body {
    position: relative;
    isolation: isolate;
  }

  html:not([data-ultra-theme-preset]) body::before,
  html:not([data-ultra-theme-preset]) body::after {
    content: "";
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }

  html:not([data-ultra-theme-preset]) body::before {
    opacity: 0.92;
    background:
      radial-gradient(circle at 7% 9%, rgba(18, 175, 160, 0.18) 0 8%, transparent 23%),
      radial-gradient(circle at 88% 12%, rgba(104, 168, 255, 0.18) 0 9%, transparent 25%),
      radial-gradient(circle at 62% 94%, rgba(125, 235, 221, 0.16) 0 13%, transparent 30%),
      linear-gradient(118deg, rgba(18, 175, 160, 0.1) 0 1px, transparent 1px 18px),
      linear-gradient(62deg, rgba(104, 168, 255, 0.08) 0 1px, transparent 1px 22px),
      linear-gradient(135deg, #fbfffd 0%, #edfdf9 48%, #eef7ff 100%) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] body::before {
    background:
      radial-gradient(circle at 7% 9%, rgba(92, 227, 210, 0.16) 0 8%, transparent 23%),
      radial-gradient(circle at 88% 12%, rgba(104, 168, 255, 0.14) 0 9%, transparent 25%),
      radial-gradient(circle at 62% 94%, rgba(23, 175, 160, 0.13) 0 13%, transparent 30%),
      linear-gradient(118deg, rgba(92, 227, 210, 0.07) 0 1px, transparent 1px 18px),
      linear-gradient(62deg, rgba(104, 168, 255, 0.055) 0 1px, transparent 1px 22px),
      linear-gradient(135deg, #061414 0%, #0b2023 50%, #0c1827 100%) !important;
  }

  html:not([data-ultra-theme-preset]) body::after {
    opacity: 0.62;
    mix-blend-mode: multiply;
    background:
      radial-gradient(circle at 1px 1px, rgba(18, 175, 160, 0.11) 1px, transparent 1.4px) 0 0 / 16px 16px,
      linear-gradient(105deg, transparent 0 58%, rgba(255, 255, 255, 0.54) 58.3% 59%, transparent 59.3% 100%),
      linear-gradient(285deg, transparent 0 68%, rgba(104, 168, 255, 0.12) 68.2% 69.4%, transparent 69.7% 100%);
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] body::after {
    opacity: 0.32;
    mix-blend-mode: screen;
  }

  html:not([data-ultra-theme-preset]) #root {
    position: relative;
    z-index: 1;
  }

  html:not([data-ultra-theme-preset]) * {
    scrollbar-width: thin;
    scrollbar-color: rgba(18, 175, 160, 0.34) rgba(255, 255, 255, 0.18);
  }

  html:not([data-ultra-theme-preset]) *::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  html:not([data-ultra-theme-preset]) *::-webkit-scrollbar-track {
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
  }

  html:not([data-ultra-theme-preset]) *::-webkit-scrollbar-thumb {
    border: 2px solid rgba(255, 255, 255, 0.34);
    border-radius: 999px;
    background:
      linear-gradient(180deg, rgba(18, 175, 160, 0.58), rgba(104, 168, 255, 0.42)),
      rgba(18, 175, 160, 0.42);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.48);
  }

  html:not([data-ultra-theme-preset]) *::-webkit-scrollbar-thumb:hover {
    background:
      linear-gradient(180deg, rgba(18, 175, 160, 0.76), rgba(104, 168, 255, 0.56)),
      rgba(18, 175, 160, 0.56);
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] * {
    scrollbar-color: rgba(126, 237, 222, 0.34) rgba(9, 24, 28, 0.32);
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] *::-webkit-scrollbar-track {
    background: rgba(9, 24, 28, 0.28);
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] *::-webkit-scrollbar-thumb {
    border-color: rgba(9, 24, 28, 0.42);
    background:
      linear-gradient(180deg, rgba(92, 227, 210, 0.55), rgba(104, 168, 255, 0.38)),
      rgba(92, 227, 210, 0.36);
  }

  html:not([data-ultra-theme-preset]) .layout {
    background:
      radial-gradient(circle at 8% 8%, rgba(18, 175, 160, 0.12), transparent 26%),
      radial-gradient(circle at 92% 16%, rgba(104, 168, 255, 0.1), transparent 28%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.04)),
      transparent !important;
  }

  html:not([data-ultra-theme-preset]) .layout .flux-main {
    border-color: rgba(255, 255, 255, 0.78) !important;
    background:
      radial-gradient(circle at 8% 0%, rgba(18, 175, 160, 0.18), transparent 31%),
      radial-gradient(circle at 100% 8%, rgba(104, 168, 255, 0.15), transparent 28%),
      linear-gradient(115deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.24) 42%, rgba(255, 255, 255, 0.42)),
      rgba(255, 255, 255, 0.52) !important;
    box-shadow:
      0 28px 70px rgba(18, 175, 160, 0.18),
      0 8px 22px rgba(15, 23, 42, 0.075),
      inset 0 0 0 1px rgba(18, 175, 160, 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.88) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .layout .flux-main {
    border-color: rgba(126, 237, 222, 0.16) !important;
    background:
      radial-gradient(circle at 8% 0%, rgba(92, 227, 210, 0.15), transparent 31%),
      radial-gradient(circle at 100% 8%, rgba(104, 168, 255, 0.12), transparent 28%),
      linear-gradient(115deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.035) 42%, rgba(255, 255, 255, 0.06)),
      rgba(7, 20, 24, 0.82) !important;
  }

  html:not([data-ultra-theme-preset]) .layout .flux-main::before {
    background:
      linear-gradient(90deg, rgba(18, 175, 160, 0.2), transparent 18%, transparent 82%, rgba(104, 168, 255, 0.16)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.68), transparent 18%),
      repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.16) 0 1px, transparent 1px 14px) !important;
    opacity: 0.88 !important;
  }

  html:not([data-ultra-theme-preset]) .flux-dock {
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.72);
    background:
      radial-gradient(circle at 13% 0%, rgba(255, 255, 255, 0.92), transparent 30%),
      radial-gradient(circle at 22% 15%, rgba(18, 175, 160, 0.24), transparent 34%),
      radial-gradient(circle at 84% 100%, rgba(104, 168, 255, 0.2), transparent 42%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.36)) !important;
    box-shadow:
      inset 0 0 0 1px rgba(18, 175, 160, 0.14),
      inset 0 -18px 38px rgba(18, 175, 160, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.92),
      0 20px 54px rgba(18, 175, 160, 0.2),
      0 6px 18px rgba(15, 23, 42, 0.07) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .flux-dock {
    border-color: rgba(126, 237, 222, 0.14);
    background:
      radial-gradient(circle at 13% 0%, rgba(255, 255, 255, 0.14), transparent 30%),
      radial-gradient(circle at 22% 15%, rgba(92, 227, 210, 0.2), transparent 34%),
      radial-gradient(circle at 84% 100%, rgba(104, 168, 255, 0.16), transparent 42%),
      linear-gradient(180deg, rgba(18, 34, 40, 0.86), rgba(9, 24, 28, 0.74)) !important;
  }

  html:not([data-ultra-theme-preset]) .flux-dock::before {
    content: "";
    position: absolute;
    left: 12px;
    right: 12px;
    top: 2px;
    height: 1px;
    pointer-events: none;
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.88), rgba(104, 168, 255, 0.3), transparent);
  }

  html:not([data-ultra-theme-preset]) .flux-dock::after {
    content: "";
    position: absolute;
    left: 16%;
    right: 16%;
    bottom: -7px;
    height: 9px;
    pointer-events: none;
    border-radius: 50%;
    background: radial-gradient(ellipse, rgba(18, 175, 160, 0.26), transparent 68%);
    filter: blur(8px);
  }

  html:not([data-ultra-theme-preset]) .flux-dock__item .MuiButtonBase-root {
    isolation: isolate;
    backface-visibility: hidden;
    -webkit-font-smoothing: antialiased;
    transform: translate3d(0, 0, 0);
  }

  html:not([data-ultra-theme-preset]) .flux-dock__item :is(svg, .MuiTypography-root) {
    backface-visibility: hidden;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }

  html:not([data-ultra-theme-preset]) .flux-dock__item .MuiButtonBase-root::before {
    background:
      radial-gradient(circle at 30% 0%, rgba(255, 255, 255, 0.86), transparent 42%),
      linear-gradient(135deg, rgba(18, 175, 160, 0.2), rgba(104, 168, 255, 0.16)) !important;
  }

  html:not([data-ultra-theme-preset]) .flux-dock__item .MuiButtonBase-root:hover {
    transform: translate3d(0, -2px, 0) !important;
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.72),
      0 12px 28px rgba(18, 175, 160, 0.18),
      0 0 0 4px rgba(18, 175, 160, 0.055) !important;
  }

  html:not([data-ultra-theme-preset]) .base-page > header {
    border-bottom-color: rgba(18, 175, 160, 0.18) !important;
    background:
      linear-gradient(100deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.28) 42%, rgba(104, 168, 255, 0.12)),
      radial-gradient(circle at 12% 0%, rgba(18, 175, 160, 0.2), transparent 34%),
      repeating-linear-gradient(135deg, transparent 0 13px, rgba(18, 175, 160, 0.035) 13px 14px),
      rgba(255, 255, 255, 0.74) !important;
    box-shadow:
      0 18px 46px rgba(18, 175, 160, 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      inset 0 -1px 0 rgba(18, 175, 160, 0.16) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-page > header {
    border-bottom-color: rgba(126, 237, 222, 0.16) !important;
    background:
      linear-gradient(100deg, rgba(20, 40, 46, 0.82), rgba(11, 25, 30, 0.44) 42%, rgba(104, 168, 255, 0.1)),
      radial-gradient(circle at 12% 0%, rgba(92, 227, 210, 0.16), transparent 34%),
      repeating-linear-gradient(135deg, transparent 0 13px, rgba(126, 237, 222, 0.035) 13px 14px),
      rgba(7, 18, 23, 0.74) !important;
  }

  html:not([data-ultra-theme-preset]) .base-page > header > * {
    position: relative;
    z-index: 1;
  }

  html:not([data-ultra-theme-preset]) .base-page > header::before {
    content: "MINT / FLUX";
    position: absolute;
    right: 18px;
    top: 50%;
    z-index: 0;
    transform: translateY(-50%);
    pointer-events: none;
    color: transparent;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.22em;
    opacity: 0.72;
    background: linear-gradient(90deg, rgba(18, 175, 160, 0.18), rgba(104, 168, 255, 0.22));
    -webkit-background-clip: text;
    background-clip: text;
  }

  html:not([data-ultra-theme-preset]) .base-page > header .MuiTypography-root {
    color: var(--fresh-mint-ink) !important;
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.76), 0 10px 26px rgba(18, 175, 160, 0.12) !important;
  }

  html:not([data-ultra-theme-preset]) .base-container > section::before {
    background:
      linear-gradient(90deg, rgba(18, 175, 160, 0.04) 1px, transparent 1px) 0 0 / 30px 30px,
      linear-gradient(rgba(18, 175, 160, 0.04) 1px, transparent 1px) 0 0 / 30px 30px,
      radial-gradient(circle at 10% 80%, rgba(18, 175, 160, 0.1), transparent 28%),
      radial-gradient(circle at 88% 92%, rgba(104, 168, 255, 0.12), transparent 30%) !important;
    opacity: 0.86 !important;
  }

  html:not([data-ultra-theme-preset]) .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip),
  html:not([data-ultra-theme-preset]) .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root,
  html:not([data-ultra-theme-preset]) .base-content > .MuiGrid-root > .MuiGrid-root > .MuiStack-root,
  html:not([data-ultra-theme-preset]) .home-enhanced-card {
    border-color: rgba(255, 255, 255, 0.74) !important;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.34)),
      radial-gradient(circle at 12% 0%, rgba(18, 175, 160, 0.2), transparent 34%),
      radial-gradient(circle at 100% 100%, rgba(104, 168, 255, 0.16), transparent 40%),
      repeating-linear-gradient(135deg, transparent 0 16px, rgba(255, 255, 255, 0.22) 16px 17px) !important;
    box-shadow:
      0 24px 62px rgba(18, 175, 160, 0.16),
      0 7px 20px rgba(15, 23, 42, 0.07),
      inset 0 1px 0 rgba(255, 255, 255, 0.92),
      inset 0 0 0 1px rgba(18, 175, 160, 0.12) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip),
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content > .MuiGrid-root > .MuiGrid-root > .MuiStack-root,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .home-enhanced-card {
    border-color: rgba(126, 237, 222, 0.14) !important;
    background:
      linear-gradient(135deg, rgba(18, 34, 40, 0.84), rgba(9, 23, 28, 0.62)),
      radial-gradient(circle at 12% 0%, rgba(92, 227, 210, 0.14), transparent 34%),
      radial-gradient(circle at 100% 100%, rgba(104, 168, 255, 0.12), transparent 40%),
      repeating-linear-gradient(135deg, transparent 0 16px, rgba(255, 255, 255, 0.035) 16px 17px) !important;
  }

  html:not([data-ultra-theme-preset]) .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip)::before,
  html:not([data-ultra-theme-preset]) .home-enhanced-card::before {
    opacity: 0.82 !important;
    background:
      linear-gradient(118deg, transparent 0 28%, rgba(255, 255, 255, 0.74) 39%, rgba(104, 168, 255, 0.16) 46%, transparent 58% 100%),
      radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.54), transparent 30%) !important;
    transform: translateX(-18%) !important;
    transition:
      opacity 220ms ease,
      transform 360ms cubic-bezier(.2,.8,.2,1) !important;
    will-change: opacity, transform;
  }

  html:not([data-ultra-theme-preset]) .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip):hover,
  html:not([data-ultra-theme-preset]) .home-enhanced-card:hover {
    border-color: rgba(18, 175, 160, 0.34) !important;
    box-shadow:
      0 30px 74px rgba(18, 175, 160, 0.22),
      0 10px 24px rgba(15, 23, 42, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.96),
      inset 0 0 0 1px rgba(18, 175, 160, 0.18) !important;
  }

  html:not([data-ultra-theme-preset]) .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip):hover::before,
  html:not([data-ultra-theme-preset]) .home-enhanced-card:hover::before {
    opacity: 0.72 !important;
    transform: translateX(14%) !important;
  }

  html:not([data-ultra-theme-preset]) .home-enhanced-card__header {
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.88), rgba(18, 175, 160, 0.09) 52%, rgba(104, 168, 255, 0.09)),
      repeating-linear-gradient(135deg, transparent 0 12px, rgba(18, 175, 160, 0.045) 12px 13px) !important;
    border-bottom-color: rgba(18, 175, 160, 0.15) !important;
  }

  html:not([data-ultra-theme-preset]) .home-enhanced-card__header-icon {
    border-radius: 16px !important;
    background:
      radial-gradient(circle at 32% 20%, rgba(255, 255, 255, 0.92), transparent 34%),
      linear-gradient(145deg, rgba(18, 175, 160, 0.2), rgba(104, 168, 255, 0.16)) !important;
    box-shadow:
      0 10px 22px rgba(18, 175, 160, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.92),
      inset 0 -1px 0 rgba(18, 175, 160, 0.16) !important;
  }

  html:not([data-ultra-theme-preset]) .home-enhanced-card__index {
    opacity: 1 !important;
    background: linear-gradient(90deg, rgba(18, 175, 160, 0.2), rgba(104, 168, 255, 0.2)) !important;
    -webkit-background-clip: text !important;
    background-clip: text !important;
  }

  html:not([data-ultra-theme-preset]) .home-enhanced-card__prism {
    opacity: 0.34 !important;
    filter: blur(18px) saturate(1.18) !important;
  }

  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root,
  html:not([data-ultra-theme-preset]) .proxy-node-card {
    position: relative !important;
    isolation: isolate !important;
    overflow: hidden !important;
    border: 1px solid rgba(18, 175, 160, 0.12) !important;
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.28)),
      radial-gradient(circle at 0% 0%, rgba(18, 175, 160, 0.1), transparent 30%) !important;
    transition:
      border-color 180ms ease,
      background 180ms ease,
      box-shadow 180ms ease,
      transform 180ms ease !important;
  }

  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root::before,
  html:not([data-ultra-theme-preset]) .proxy-node-card::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    opacity: 0.72;
    background:
      linear-gradient(90deg, rgba(18, 175, 160, 0.16), transparent 18% 76%, rgba(104, 168, 255, 0.1)),
      radial-gradient(circle at 10% 50%, rgba(255, 255, 255, 0.76), transparent 24%) !important;
  }

  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root::after,
  html:not([data-ultra-theme-preset]) .proxy-node-card::after {
    content: "";
    position: absolute;
    inset: 1px;
    z-index: 2;
    pointer-events: none;
    opacity: 0;
    border-radius: inherit;
    background:
      linear-gradient(105deg, transparent 0 36%, rgba(255, 255, 255, 0.74) 46%, rgba(126, 237, 222, 0.24) 52%, transparent 64% 100%) !important;
    transform: translateX(-42%);
    transition:
      opacity 180ms ease,
      transform 360ms ease !important;
    will-change: opacity, transform;
  }

  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root > *,
  html:not([data-ultra-theme-preset]) .proxy-node-card > * {
    position: relative;
    z-index: 3;
  }

  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root :is(
    .MuiTypography-root,
    .MuiListItemText-root,
    .MuiListItemText-primary,
    .MuiListItemText-secondary,
    .MuiBox-root,
    span
  ),
  html:not([data-ultra-theme-preset]) .proxy-node-card :is(
    .MuiTypography-root,
    .MuiListItemText-root,
    .MuiListItemText-primary,
    .MuiListItemText-secondary,
    .MuiBox-root,
    span
  ) {
    opacity: 1 !important;
    filter: none !important;
    mix-blend-mode: normal !important;
    text-shadow: none !important;
    -webkit-text-stroke: 0 !important;
    -webkit-font-smoothing: antialiased !important;
  }

  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root .MuiListItemText-secondary,
  html:not([data-ultra-theme-preset]) .proxy-node-card .MuiListItemText-secondary {
    color: var(--text-primary) !important;
  }

  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root:hover,
  html:not([data-ultra-theme-preset]) .proxy-node-card:hover {
    transform: translateY(-1px);
    border-color: rgba(18, 175, 160, 0.24) !important;
    background:
      linear-gradient(90deg, rgba(18, 175, 160, 0.12), rgba(104, 168, 255, 0.08), rgba(255, 255, 255, 0.36)),
      rgba(255, 255, 255, 0.58) !important;
    box-shadow:
      inset 3px 0 0 rgba(18, 175, 160, 0.64),
      0 12px 28px rgba(18, 175, 160, 0.12) !important;
  }

  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root:hover::after,
  html:not([data-ultra-theme-preset]) .proxy-node-card:hover::after {
    opacity: 0.62;
    transform: translateX(42%);
  }

  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root.Mui-selected,
  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root[aria-selected="true"],
  html:not([data-ultra-theme-preset]) .proxy-node-card[data-selected="true"],
  html:not([data-ultra-theme-preset]) .proxy-node-card[data-multi-selected="true"],
  html:not([data-ultra-theme-preset]) .proxy-node-card.Mui-selected {
    color: var(--fresh-mint-ink) !important;
    border-color: rgba(18, 175, 160, 0.36) !important;
    background:
      linear-gradient(90deg, rgba(18, 175, 160, 0.18), rgba(104, 168, 255, 0.12), rgba(255, 255, 255, 0.5)),
      rgba(255, 255, 255, 0.68) !important;
    box-shadow:
      inset 4px 0 0 #12afa0,
      inset 0 0 0 1px rgba(255, 255, 255, 0.72),
      0 14px 34px rgba(18, 175, 160, 0.18) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content .MuiListItemButton-root,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .proxy-node-card {
    border-color: rgba(126, 237, 222, 0.14) !important;
    background:
      linear-gradient(90deg, rgba(18, 34, 40, 0.78), rgba(9, 23, 28, 0.52)),
      radial-gradient(circle at 0% 0%, rgba(92, 227, 210, 0.12), transparent 30%) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content .MuiListItemButton-root::before,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .proxy-node-card::before {
    opacity: 0.5;
    background:
      linear-gradient(90deg, rgba(92, 227, 210, 0.12), transparent 18% 76%, rgba(104, 168, 255, 0.09)),
      radial-gradient(circle at 10% 50%, rgba(255, 255, 255, 0.12), transparent 24%) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content .MuiListItemButton-root:hover,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .proxy-node-card:hover {
    border-color: rgba(126, 237, 222, 0.25) !important;
    background:
      linear-gradient(90deg, rgba(92, 227, 210, 0.12), rgba(104, 168, 255, 0.08), rgba(255, 255, 255, 0.045)),
      rgba(9, 24, 28, 0.76) !important;
    box-shadow:
      inset 3px 0 0 rgba(92, 227, 210, 0.64),
      0 12px 28px rgba(0, 0, 0, 0.18) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content .MuiListItemButton-root.Mui-selected,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content .MuiListItemButton-root[aria-selected="true"],
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .proxy-node-card[data-selected="true"],
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .proxy-node-card[data-multi-selected="true"],
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .proxy-node-card.Mui-selected {
    border-color: rgba(126, 237, 222, 0.34) !important;
    background:
      linear-gradient(90deg, rgba(92, 227, 210, 0.18), rgba(104, 168, 255, 0.12), rgba(255, 255, 255, 0.06)),
      rgba(9, 24, 28, 0.82) !important;
    box-shadow:
      inset 4px 0 0 #5ce3d2,
      inset 0 0 0 1px rgba(255, 255, 255, 0.08),
      0 14px 34px rgba(0, 0, 0, 0.24) !important;
  }

  html:not([data-ultra-theme-preset]) .proxy-node-card .MuiListItemText-secondary > .MuiBox-root {
    letter-spacing: 0.01em;
  }

  html:not([data-ultra-theme-preset]) .proxy-node-card .MuiListItemText-secondary > span {
    border-color: rgba(18, 175, 160, 0.2) !important;
    color: rgba(31, 101, 112, 0.72) !important;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(18, 175, 160, 0.08)) !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.76);
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .proxy-node-card .MuiListItemText-secondary > span {
    border-color: rgba(126, 237, 222, 0.18) !important;
    color: rgba(223, 251, 246, 0.72) !important;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(92, 227, 210, 0.08)) !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.09);
  }

  html:not([data-ultra-theme-preset]) .proxy-node-card :is(.the-delay, .the-speed, .the-check, .the-speed-check) {
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
  }

  html:not([data-ultra-theme-preset]) .proxy-node-card[data-selected="true"] :is(.the-delay, .the-speed),
  html:not([data-ultra-theme-preset]) .proxy-node-card[data-multi-selected="true"] :is(.the-delay, .the-speed),
  html:not([data-ultra-theme-preset]) .proxy-node-card.Mui-selected :is(.the-delay, .the-speed) {
    background:
      radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.86), transparent 38%),
      linear-gradient(135deg, rgba(18, 175, 160, 0.18), rgba(104, 168, 255, 0.1)) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      0 0 0 3px rgba(18, 175, 160, 0.07),
      0 8px 18px rgba(18, 175, 160, 0.14) !important;
  }

  html:not([data-ultra-theme-preset]) :is(.MuiTableContainer-root, [role="table"]) {
    border: 1px solid rgba(255, 255, 255, 0.66) !important;
    background:
      radial-gradient(circle at 0% 0%, rgba(255, 255, 255, 0.82), transparent 32%),
      linear-gradient(180deg, rgba(18, 175, 160, 0.075), transparent 36%),
      rgba(255, 255, 255, 0.56) !important;
  }

  html:not([data-ultra-theme-preset]) .MuiTableHead-root .MuiTableCell-root {
    color: #1f6570 !important;
    background:
      linear-gradient(90deg, rgba(18, 175, 160, 0.13), rgba(104, 168, 255, 0.07), transparent) !important;
  }

  html:not([data-ultra-theme-preset]) .MuiButton-contained,
  html:not([data-ultra-theme-preset]) .MuiButton-containedPrimary {
    position: relative !important;
    isolation: isolate !important;
    overflow: hidden !important;
    background:
      radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.52), transparent 32%),
      linear-gradient(135deg, #12afa0, #55c7d7 48%, #68a8ff) !important;
    box-shadow:
      0 16px 34px rgba(18, 175, 160, 0.24),
      0 0 0 4px rgba(18, 175, 160, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.54) !important;
    transition:
      box-shadow 180ms ease,
      filter 180ms ease,
      transform 180ms ease !important;
  }

  html:not([data-ultra-theme-preset]) .MuiButton-contained::before,
  html:not([data-ultra-theme-preset]) .MuiButton-containedPrimary::before {
    content: "";
    position: absolute;
    inset: 1px;
    z-index: -1;
    pointer-events: none;
    border-radius: inherit;
    opacity: 0.72;
    background:
      linear-gradient(110deg, rgba(255, 255, 255, 0.5), transparent 30% 58%, rgba(255, 255, 255, 0.28)),
      radial-gradient(circle at 80% 0%, rgba(255, 255, 255, 0.48), transparent 34%);
  }

  html:not([data-ultra-theme-preset]) .MuiButton-contained:hover,
  html:not([data-ultra-theme-preset]) .MuiButton-containedPrimary:hover {
    transform: translateY(-1px);
    filter: saturate(1.08) brightness(1.02);
    box-shadow:
      0 18px 38px rgba(18, 175, 160, 0.28),
      0 0 0 5px rgba(18, 175, 160, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.62) !important;
  }

  html:not([data-ultra-theme-preset]) .MuiButton-outlined,
  html:not([data-ultra-theme-preset]) .MuiButton-text {
    border-color: rgba(18, 175, 160, 0.2) !important;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.56), rgba(18, 175, 160, 0.045)),
      rgba(255, 255, 255, 0.22) !important;
    transition:
      border-color 180ms ease,
      background 180ms ease,
      box-shadow 180ms ease,
      transform 180ms ease !important;
  }

  html:not([data-ultra-theme-preset]) .MuiButton-outlined:hover,
  html:not([data-ultra-theme-preset]) .MuiButton-text:hover {
    transform: translateY(-1px);
    border-color: rgba(18, 175, 160, 0.32) !important;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(18, 175, 160, 0.09)),
      rgba(255, 255, 255, 0.3) !important;
    box-shadow:
      0 10px 24px rgba(18, 175, 160, 0.11),
      inset 0 1px 0 rgba(255, 255, 255, 0.78) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiButton-outlined,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiButton-text {
    border-color: rgba(126, 237, 222, 0.16) !important;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.075), rgba(92, 227, 210, 0.055)),
      rgba(9, 24, 28, 0.28) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiButton-outlined:hover,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiButton-text:hover {
    border-color: rgba(126, 237, 222, 0.28) !important;
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.095), rgba(92, 227, 210, 0.09)),
      rgba(9, 24, 28, 0.38) !important;
    box-shadow:
      0 10px 24px rgba(0, 0, 0, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
  }

  html:not([data-ultra-theme-preset]) :is(.MuiOutlinedInput-root, .MuiInputBase-root) {
    border-radius: 16px !important;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.48)),
      rgba(255, 255, 255, 0.58) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      0 8px 22px rgba(18, 175, 160, 0.06) !important;
  }

  html:not([data-ultra-theme-preset]) .MuiOutlinedInput-root.Mui-focused,
  html:not([data-ultra-theme-preset]) .MuiInputBase-root.Mui-focused {
    box-shadow:
      0 0 0 4px rgba(18, 175, 160, 0.14),
      0 12px 28px rgba(18, 175, 160, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.92) !important;
  }

  html:not([data-ultra-theme-preset]) :is(.MuiOutlinedInput-root, .MuiInputBase-root) .MuiSelect-icon {
    color: rgba(31, 101, 112, 0.72) !important;
    filter: drop-shadow(0 2px 5px rgba(18, 175, 160, 0.14));
  }

  html:not([data-ultra-theme-preset]) .MuiFormControlLabel-label,
  html:not([data-ultra-theme-preset]) .MuiFormLabel-root,
  html:not([data-ultra-theme-preset]) .MuiInputLabel-root {
    color: var(--fresh-mint-muted) !important;
  }

  html:not([data-ultra-theme-preset]) .MuiSwitch-root .MuiSwitch-track {
    opacity: 1 !important;
    border: 1px solid rgba(18, 175, 160, 0.16);
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.54), rgba(18, 175, 160, 0.08)),
      rgba(255, 255, 255, 0.38) !important;
    box-shadow:
      inset 0 1px 2px rgba(15, 23, 42, 0.08),
      inset 0 0 0 1px rgba(255, 255, 255, 0.5);
    transition:
      background 180ms ease,
      border-color 180ms ease,
      box-shadow 180ms ease !important;
  }

  html:not([data-ultra-theme-preset]) .MuiSwitch-root .MuiSwitch-thumb {
    background:
      radial-gradient(circle at 32% 22%, rgba(255, 255, 255, 0.96), transparent 36%),
      linear-gradient(135deg, #ffffff, #e7fbf7) !important;
    box-shadow:
      0 5px 12px rgba(15, 23, 42, 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.94) !important;
  }

  html:not([data-ultra-theme-preset]) .MuiSwitch-root .Mui-checked + .MuiSwitch-track {
    border-color: rgba(18, 175, 160, 0.38);
    background:
      radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.5), transparent 42%),
      linear-gradient(135deg, rgba(18, 175, 160, 0.74), rgba(104, 168, 255, 0.54)) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.36),
      0 0 0 4px rgba(18, 175, 160, 0.08);
  }

  html:not([data-ultra-theme-preset]) .MuiCheckbox-root,
  html:not([data-ultra-theme-preset]) .MuiRadio-root {
    color: rgba(31, 101, 112, 0.54) !important;
    filter: drop-shadow(0 4px 10px rgba(18, 175, 160, 0.08));
    transition:
      color 160ms ease,
      filter 160ms ease,
      transform 160ms ease !important;
  }

  html:not([data-ultra-theme-preset]) .MuiCheckbox-root:hover,
  html:not([data-ultra-theme-preset]) .MuiRadio-root:hover {
    transform: scale(1.04);
    color: rgba(18, 175, 160, 0.82) !important;
  }

  html:not([data-ultra-theme-preset]) .MuiCheckbox-root.Mui-checked,
  html:not([data-ultra-theme-preset]) .MuiRadio-root.Mui-checked {
    color: #12afa0 !important;
    filter:
      drop-shadow(0 0 8px rgba(18, 175, 160, 0.26))
      drop-shadow(0 4px 12px rgba(18, 175, 160, 0.16));
  }

  html:not([data-ultra-theme-preset]) .MuiSlider-root {
    color: #12afa0 !important;
  }

  html:not([data-ultra-theme-preset]) .MuiSlider-rail {
    opacity: 1 !important;
    background:
      linear-gradient(90deg, rgba(18, 175, 160, 0.16), rgba(104, 168, 255, 0.12)),
      rgba(255, 255, 255, 0.36) !important;
  }

  html:not([data-ultra-theme-preset]) .MuiSlider-track {
    background: linear-gradient(90deg, #12afa0, #68a8ff) !important;
    box-shadow: 0 0 14px rgba(18, 175, 160, 0.22);
  }

  html:not([data-ultra-theme-preset]) .MuiSlider-thumb {
    background:
      radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.94), transparent 34%),
      linear-gradient(135deg, #12afa0, #68a8ff) !important;
    box-shadow:
      0 8px 18px rgba(18, 175, 160, 0.22),
      0 0 0 4px rgba(18, 175, 160, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.58) !important;
  }

  html:not([data-ultra-theme-preset]) :is(.MuiButtonBase-root, .MuiOutlinedInput-root, .MuiInputBase-root).Mui-focusVisible,
  html:not([data-ultra-theme-preset]) .MuiButtonBase-root:focus-visible,
  html:not([data-ultra-theme-preset]) .MuiOutlinedInput-root:focus-within {
    outline: 2px solid rgba(18, 175, 160, 0.34) !important;
    outline-offset: 2px !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] :is(.MuiOutlinedInput-root, .MuiInputBase-root) {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.045)),
      rgba(9, 24, 28, 0.58) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 8px 22px rgba(0, 0, 0, 0.16) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiSwitch-root .MuiSwitch-track {
    border-color: rgba(176, 214, 223, 0.24);
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.07), rgba(148, 163, 184, 0.08)),
      rgba(10, 25, 32, 0.72) !important;
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.26),
      inset 0 0 0 1px rgba(255, 255, 255, 0.035) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiSwitch-root .MuiSwitch-thumb {
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(circle at 32% 22%, rgba(255, 255, 255, 0.58), transparent 36%),
      linear-gradient(135deg, #eef7f8, #9fb4bf) !important;
    box-shadow:
      0 4px 11px rgba(0, 0, 0, 0.44),
      inset 0 1px 0 rgba(255, 255, 255, 0.62),
      inset 0 -1px 0 rgba(20, 38, 45, 0.18) !important;
    transition:
      background 180ms ease,
      box-shadow 180ms ease,
      transform 180ms ease !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiSwitch-root .MuiSwitch-thumb::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 8px;
    height: 2px;
    border-radius: 999px;
    background: rgba(24, 47, 57, 0.72);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.22);
    transform: translate(-50%, -50%);
    transition:
      border-color 180ms ease,
      background 180ms ease,
      box-shadow 180ms ease,
      transform 180ms ease !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiSwitch-root .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track {
    border-color: rgba(45, 244, 222, 0.6);
    background:
      radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.34), transparent 42%),
      linear-gradient(135deg, rgba(45, 244, 222, 0.92), rgba(82, 168, 255, 0.78)) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.34),
      0 0 0 3px rgba(45, 244, 222, 0.12),
      0 0 18px rgba(45, 244, 222, 0.24) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiSwitch-root .MuiSwitch-switchBase.Mui-checked .MuiSwitch-thumb {
    background:
      radial-gradient(circle at 32% 22%, rgba(255, 255, 255, 0.96), transparent 36%),
      linear-gradient(135deg, #ffffff, #dffdf8) !important;
    box-shadow:
      0 0 0 2px rgba(45, 244, 222, 0.24),
      0 5px 15px rgba(45, 244, 222, 0.34),
      inset 0 1px 0 rgba(255, 255, 255, 0.94) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiSwitch-root .MuiSwitch-switchBase.Mui-checked .MuiSwitch-thumb::after {
    width: 9px;
    height: 5px;
    border-left: 2px solid rgba(5, 113, 103, 0.96);
    border-bottom: 2px solid rgba(5, 113, 103, 0.96);
    border-radius: 1px;
    background: transparent;
    box-shadow: none;
    transform: translate(-50%, -56%) rotate(-45deg);
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiSwitch-root .MuiSwitch-switchBase.Mui-disabled .MuiSwitch-thumb {
    opacity: 0.58;
    filter: grayscale(0.18);
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiSwitch-root .MuiSwitch-switchBase.Mui-disabled + .MuiSwitch-track {
    opacity: 0.42 !important;
    filter: saturate(0.68);
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiCheckbox-root,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiRadio-root {
    color: rgba(223, 251, 246, 0.54) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiCheckbox-root.Mui-checked,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiRadio-root.Mui-checked {
    color: #5ce3d2 !important;
  }

  html:not([data-ultra-theme-preset]) :is(.MuiChip-root, .the-delay, .the-speed, .the-check, .the-speed-check) {
    border-color: rgba(18, 175, 160, 0.22) !important;
    background:
      radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.76), transparent 38%),
      linear-gradient(135deg, rgba(18, 175, 160, 0.1), rgba(104, 168, 255, 0.07)) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.88),
      0 8px 18px rgba(18, 175, 160, 0.1) !important;
  }

  html:not([data-ultra-theme-preset]) :is(.MuiMenu-paper, .MuiPopover-paper, .MuiAutocomplete-popper .MuiPaper-root, .MuiPopper-root .MuiPaper-root) {
    overflow: hidden !important;
    border-color: rgba(255, 255, 255, 0.7) !important;
    background:
      radial-gradient(circle at 10% 0%, rgba(255, 255, 255, 0.88), transparent 34%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(240, 251, 248, 0.72)) !important;
    box-shadow:
      0 22px 58px rgba(18, 175, 160, 0.16),
      0 8px 18px rgba(15, 23, 42, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
    backdrop-filter: blur(20px) saturate(1.24);
    -webkit-backdrop-filter: blur(20px) saturate(1.24);
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] :is(.MuiMenu-paper, .MuiPopover-paper, .MuiAutocomplete-popper .MuiPaper-root, .MuiPopper-root .MuiPaper-root) {
    border-color: rgba(126, 237, 222, 0.14) !important;
    background:
      radial-gradient(circle at 10% 0%, rgba(255, 255, 255, 0.11), transparent 34%),
      linear-gradient(135deg, rgba(18, 34, 40, 0.9), rgba(9, 23, 28, 0.78)) !important;
    box-shadow:
      0 24px 58px rgba(0, 0, 0, 0.34),
      0 8px 18px rgba(0, 0, 0, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
  }

  html:not([data-ultra-theme-preset]) .MuiDialog-container .MuiDialog-paper {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.72) !important;
    background:
      radial-gradient(circle at 8% 0%, rgba(255, 255, 255, 0.94), transparent 34%),
      radial-gradient(circle at 100% 0%, rgba(104, 168, 255, 0.14), transparent 38%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(240, 251, 248, 0.78)) !important;
    box-shadow:
      0 32px 82px rgba(18, 175, 160, 0.2),
      0 14px 30px rgba(15, 23, 42, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.94) !important;
    backdrop-filter: blur(24px) saturate(1.28);
    -webkit-backdrop-filter: blur(24px) saturate(1.28);
  }

  html:not([data-ultra-theme-preset]) .MuiDialog-container .MuiDialog-paper::before {
    content: "";
    position: absolute;
    left: 18px;
    right: 18px;
    top: 0;
    z-index: -1;
    height: 1px;
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, rgba(18, 175, 160, 0.34), rgba(104, 168, 255, 0.26), transparent);
  }

  html:not([data-ultra-theme-preset]) .MuiDialogTitle-root {
    color: var(--fresh-mint-ink) !important;
    font-weight: 800 !important;
    letter-spacing: -0.015em;
    background:
      linear-gradient(90deg, rgba(18, 175, 160, 0.08), rgba(104, 168, 255, 0.045), transparent) !important;
    box-shadow: inset 0 -1px 0 rgba(18, 175, 160, 0.12);
  }

  html:not([data-ultra-theme-preset]) .MuiDialogContent-root {
    color: var(--fresh-mint-ink) !important;
  }

  html:not([data-ultra-theme-preset]) .MuiDialogActions-root {
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.62), rgba(18, 175, 160, 0.045), rgba(104, 168, 255, 0.04)) !important;
    box-shadow: inset 0 1px 0 rgba(18, 175, 160, 0.1);
  }

  html:not([data-ultra-theme-preset]) .MuiBackdrop-root {
    background:
      radial-gradient(circle at 50% 30%, rgba(18, 175, 160, 0.16), transparent 34%),
      rgba(9, 24, 28, 0.26) !important;
    backdrop-filter: blur(6px) saturate(1.08);
    -webkit-backdrop-filter: blur(6px) saturate(1.08);
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiDialog-container .MuiDialog-paper {
    border-color: rgba(126, 237, 222, 0.14) !important;
    background:
      radial-gradient(circle at 8% 0%, rgba(255, 255, 255, 0.12), transparent 34%),
      radial-gradient(circle at 100% 0%, rgba(104, 168, 255, 0.12), transparent 38%),
      linear-gradient(135deg, rgba(18, 34, 40, 0.94), rgba(9, 23, 28, 0.86)) !important;
    box-shadow:
      0 34px 86px rgba(0, 0, 0, 0.42),
      0 14px 30px rgba(0, 0, 0, 0.24),
      inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiDialogTitle-root {
    background:
      linear-gradient(90deg, rgba(92, 227, 210, 0.09), rgba(104, 168, 255, 0.055), transparent) !important;
    box-shadow: inset 0 -1px 0 rgba(126, 237, 222, 0.1);
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiDialogActions-root {
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.06), rgba(92, 227, 210, 0.04), rgba(104, 168, 255, 0.035)) !important;
    box-shadow: inset 0 1px 0 rgba(126, 237, 222, 0.08);
  }

  html:not([data-ultra-theme-preset]) .MuiTooltip-tooltip {
    border: 1px solid rgba(255, 255, 255, 0.68);
    color: var(--fresh-mint-ink) !important;
    background:
      radial-gradient(circle at 12% 0%, rgba(255, 255, 255, 0.84), transparent 34%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(240, 251, 248, 0.76)) !important;
    box-shadow:
      0 14px 32px rgba(18, 175, 160, 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.84) !important;
    backdrop-filter: blur(18px) saturate(1.22);
    -webkit-backdrop-filter: blur(18px) saturate(1.22);
  }

  html:not([data-ultra-theme-preset]) .MuiTooltip-arrow::before {
    border: 1px solid rgba(255, 255, 255, 0.68);
    background: rgba(248, 255, 253, 0.9) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiTooltip-tooltip {
    border-color: rgba(126, 237, 222, 0.14);
    color: var(--fresh-mint-ink) !important;
    background:
      radial-gradient(circle at 12% 0%, rgba(255, 255, 255, 0.1), transparent 34%),
      linear-gradient(135deg, rgba(18, 34, 40, 0.94), rgba(9, 23, 28, 0.82)) !important;
    box-shadow:
      0 14px 32px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
  }

  html:not([data-ultra-theme-preset]) .MuiSnackbar-root .MuiAlert-root {
    border: 1px solid rgba(255, 255, 255, 0.7) !important;
    color: var(--fresh-mint-ink) !important;
    background:
      radial-gradient(circle at 10% 0%, rgba(255, 255, 255, 0.88), transparent 34%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(240, 251, 248, 0.78)) !important;
    box-shadow:
      0 20px 48px rgba(18, 175, 160, 0.18),
      0 8px 18px rgba(15, 23, 42, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
    backdrop-filter: blur(20px) saturate(1.22);
    -webkit-backdrop-filter: blur(20px) saturate(1.22);
  }

  html:not([data-ultra-theme-preset]) .MuiSnackbar-root .MuiAlert-icon {
    color: #12afa0 !important;
    filter: drop-shadow(0 4px 10px rgba(18, 175, 160, 0.16));
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .MuiSnackbar-root .MuiAlert-root {
    border-color: rgba(126, 237, 222, 0.14) !important;
    background:
      radial-gradient(circle at 10% 0%, rgba(255, 255, 255, 0.1), transparent 34%),
      linear-gradient(135deg, rgba(18, 34, 40, 0.94), rgba(9, 23, 28, 0.84)) !important;
    box-shadow:
      0 22px 50px rgba(0, 0, 0, 0.36),
      0 8px 18px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
  }

  html:not([data-ultra-theme-preset]) .MuiMenuItem-root:hover,
  html:not([data-ultra-theme-preset]) .MuiMenuItem-root.Mui-selected,
  html:not([data-ultra-theme-preset]) .MuiAutocomplete-option:hover,
  html:not([data-ultra-theme-preset]) .MuiAutocomplete-option.Mui-focused {
    background:
      linear-gradient(90deg, rgba(18, 175, 160, 0.14), rgba(104, 168, 255, 0.08), transparent 86%) !important;
    box-shadow: inset 3px 0 0 rgba(18, 175, 160, 0.56);
  }

  @media (prefers-reduced-motion: no-preference) {
    html:not([data-ultra-theme-preset]) body::before {
      animation: freshMintAurora 18s ease-in-out infinite alternate;
    }

    html:not([data-ultra-theme-preset]) .flux-dock::after {
      animation: freshMintGlowPulse 4.8s ease-in-out infinite;
    }
  }

  @keyframes freshMintAurora {
    from {
      filter: hue-rotate(0deg) saturate(1);
      transform: translate3d(0, 0, 0) scale(1);
    }
    to {
      filter: hue-rotate(-5deg) saturate(1.12);
      transform: translate3d(1.2%, -0.8%, 0) scale(1.018);
    }
  }

  @keyframes freshMintGlowPulse {
    0%, 100% {
      opacity: 0.58;
      transform: scaleX(0.92);
    }
    50% {
      opacity: 0.92;
      transform: scaleX(1.08);
    }
  }
`

const DARK_MODE_NO_STRIPES_CSS = `
  html[data-ultra-theme-mode="dark"] body::before,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] body::before,
  html[data-ultra-theme-preset][data-ultra-theme-mode="dark"] body::before {
    background:
      radial-gradient(ellipse 58% 42% at 8% 8%, rgba(92, 227, 210, 0.07), transparent 62%),
      radial-gradient(ellipse 54% 40% at 90% 12%, rgba(104, 168, 255, 0.056), transparent 64%),
      radial-gradient(ellipse 72% 48% at 58% 104%, rgba(23, 175, 160, 0.046), transparent 66%),
      linear-gradient(135deg, #061414 0%, #0a1d21 52%, #0b1725 100%) !important;
    background-size: auto !important;
    background-position: center !important;
    opacity: 0.88 !important;
    will-change: filter, transform;
  }

  html[data-ultra-theme-mode="dark"] body::after,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] body::after,
  html[data-ultra-theme-preset][data-ultra-theme-mode="dark"] body::after {
    background:
      radial-gradient(ellipse 70% 46% at 14% -8%, rgba(255, 255, 255, 0.009), transparent 68%),
      radial-gradient(ellipse 58% 42% at 92% 104%, rgba(104, 168, 255, 0.014), transparent 70%) !important;
    background-size: auto !important;
    opacity: 0.1 !important;
    filter: blur(24px) !important;
    mix-blend-mode: screen !important;
    transform: none !important;
  }

  html[data-ultra-theme-mode="dark"] .layout::before,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .layout::before,
  html[data-ultra-theme-preset][data-ultra-theme-mode="dark"] .layout::before {
    background: none !important;
    background-image: none !important;
    background-size: auto !important;
    background-position: center !important;
    mask-image: none !important;
    -webkit-mask-image: none !important;
    opacity: 0 !important;
    filter: none !important;
    transform: none !important;
  }

  html[data-ultra-theme-mode="dark"] .layout::after,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .layout::after,
  html[data-ultra-theme-preset][data-ultra-theme-mode="dark"] .layout::after {
    background:
      radial-gradient(ellipse 76% 44% at 18% -12%, rgba(255, 255, 255, 0.008), transparent 72%),
      radial-gradient(ellipse 70% 48% at 88% 110%, rgba(104, 168, 255, 0.012), transparent 74%) !important;
    opacity: 0.1 !important;
    filter: blur(28px) !important;
    transform: none !important;
  }

  html[data-ultra-theme-mode="dark"] .layout,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .layout {
    background:
      radial-gradient(ellipse 58% 42% at 10% 8%, rgba(92, 227, 210, 0.046), transparent 64%),
      radial-gradient(ellipse 54% 40% at 92% 14%, rgba(104, 168, 255, 0.038), transparent 66%),
      linear-gradient(135deg, #061414 0%, #0a1d21 52%, #0b1725 100%) !important;
  }

  html[data-ultra-theme-mode="dark"] .layout .flux-main,
  html[data-ultra-theme-mode="dark"] .layout .layout-content .flux-main,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .layout .flux-main {
    background:
      radial-gradient(ellipse 58% 34% at 10% -8%, rgba(92, 227, 210, 0.035), transparent 70%),
      radial-gradient(ellipse 54% 34% at 98% 0%, rgba(104, 168, 255, 0.026), transparent 72%),
      rgba(7, 20, 24, 0.88) !important;
  }

  html[data-ultra-theme-mode="dark"] .layout .flux-main::before,
  html[data-ultra-theme-mode="dark"] .layout .layout-content .flux-main::before {
    inset: -30% !important;
    background:
      radial-gradient(ellipse 66% 36% at 16% 0%, rgba(255, 255, 255, 0.012), transparent 72%),
      radial-gradient(ellipse 58% 34% at 88% 8%, rgba(104, 168, 255, 0.016), transparent 74%) !important;
    background-size: auto !important;
    opacity: 0.14 !important;
    filter: blur(26px) !important;
    transform: none !important;
  }

  html[data-ultra-theme-mode="dark"] .base-container > section::before,
  html[data-ultra-theme-mode="dark"] .base-container > section::after {
    background:
      radial-gradient(ellipse 62% 42% at 12% 0%, rgba(92, 227, 210, 0.022), transparent 72%),
      radial-gradient(ellipse 62% 42% at 92% 102%, rgba(104, 168, 255, 0.014), transparent 74%) !important;
    background-size: auto !important;
    opacity: 0.12 !important;
    filter: blur(20px) !important;
    transform: none !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-page > header,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .home-enhanced-card__header,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip),
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content > .MuiGrid-root > .MuiGrid-root > .MuiStack-root,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .home-enhanced-card {
    background-image: none !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-page > header {
    background:
      radial-gradient(ellipse 56% 42% at 12% -10%, rgba(92, 227, 210, 0.055), transparent 72%),
      radial-gradient(ellipse 52% 40% at 92% 0%, rgba(104, 168, 255, 0.035), transparent 74%),
      rgba(7, 18, 23, 0.76) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .home-enhanced-card__header {
    background:
      radial-gradient(ellipse 58% 44% at 12% -14%, rgba(92, 227, 210, 0.052), transparent 72%),
      linear-gradient(90deg, rgba(14, 30, 35, 0.82), rgba(9, 24, 28, 0.58) 58%, rgba(104, 168, 255, 0.035)) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip),
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content > .MuiGrid-root > .MuiGrid-root > .MuiStack-root,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .home-enhanced-card {
    background:
      radial-gradient(ellipse 66% 44% at 14% -10%, rgba(255, 255, 255, 0.012), transparent 74%),
      radial-gradient(ellipse 58% 40% at 100% 110%, rgba(104, 168, 255, 0.014), transparent 76%),
      linear-gradient(135deg, rgba(18, 34, 40, 0.84), rgba(9, 23, 28, 0.66)) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip)::before,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .home-enhanced-card::before {
    background:
      radial-gradient(ellipse 68% 40% at 18% -12%, rgba(255, 255, 255, 0.016), transparent 76%),
      radial-gradient(ellipse 58% 38% at 90% 108%, rgba(104, 168, 255, 0.012), transparent 78%) !important;
    opacity: 0.3 !important;
    filter: blur(16px) !important;
    transform: translateX(-18%) !important;
    transition:
      opacity 220ms ease,
      transform 360ms cubic-bezier(.2,.8,.2,1) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip):hover::before,
  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .home-enhanced-card:hover::before {
    opacity: 0.42 !important;
    transform: translateX(14%) !important;
  }
`

const TEST_PAGE_DARK_SURFACE_CSS = `
  html[data-ultra-theme-mode="dark"][data-ultra-active-page="test"] .layout::before {
    background-image: none !important;
    opacity: 0.1 !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout::before {
    background-image: none !important;
    opacity: 0.08 !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="test"] body::before,
  html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] body::before {
    background:
      radial-gradient(circle at 8% 10%, rgba(92, 227, 210, 0.11) 0 8%, transparent 24%),
      radial-gradient(circle at 88% 12%, rgba(104, 168, 255, 0.09) 0 9%, transparent 26%),
      radial-gradient(circle at 64% 94%, rgba(23, 175, 160, 0.08) 0 13%, transparent 32%),
      linear-gradient(135deg, #061414 0%, #0b2023 52%, #0c1827 100%) !important;
    opacity: 0.92 !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="test"] body::after,
  html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] body::after {
    background:
      radial-gradient(ellipse at 16% 8%, rgba(255, 255, 255, 0.026), transparent 32%),
      radial-gradient(ellipse at 88% 86%, rgba(104, 168, 255, 0.032), transparent 38%) !important;
    opacity: 0.18 !important;
    mix-blend-mode: screen !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="test"] .layout .flux-main {
    background:
      radial-gradient(ellipse at 8% 0%, color-mix(in srgb, var(--primary-main) 5%, transparent), transparent 30%),
      radial-gradient(ellipse at 100% 8%, color-mix(in srgb, var(--app-accent-cyan) 4%, transparent), transparent 32%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.038), rgba(255, 255, 255, 0.012) 42%, transparent 72%),
      rgba(7, 20, 24, 0.84) !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout .flux-main {
    background:
      radial-gradient(ellipse at 8% 0%, color-mix(in srgb, var(--primary-main) 4.8%, transparent), transparent 30%),
      radial-gradient(ellipse at 100% 8%, color-mix(in srgb, var(--app-accent-cyan) 3.8%, transparent), transparent 32%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.014), rgba(255, 255, 255, 0.004) 46%, transparent 76%),
      rgba(7, 20, 24, 0.86) !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="test"] .layout .flux-main::before {
    background:
      radial-gradient(ellipse at 10% 0%, rgba(255, 255, 255, 0.052), transparent 28%),
      radial-gradient(ellipse at 92% 8%, color-mix(in srgb, var(--app-accent-cyan) 4.5%, transparent), transparent 32%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.032), transparent 34%) !important;
    opacity: 0.4 !important;
    transform: none !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout .flux-main::before {
    background:
      radial-gradient(ellipse 64% 34% at 18% 0%, rgba(255, 255, 255, 0.01), transparent 72%),
      radial-gradient(ellipse 58% 34% at 88% 8%, rgba(104, 168, 255, 0.014), transparent 72%) !important;
    opacity: 0.12 !important;
    filter: blur(28px) !important;
    transform: none !important;
  }

  @supports selector(.layout .flux-main:has(.test-page-shell)) {
    html[data-ultra-theme-mode="dark"] .layout .flux-main:has(.test-page-shell) {
      background:
        radial-gradient(ellipse at 8% 0%, color-mix(in srgb, var(--primary-main) 5%, transparent), transparent 30%),
        radial-gradient(ellipse at 100% 8%, color-mix(in srgb, var(--app-accent-cyan) 4%, transparent), transparent 32%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.038), rgba(255, 255, 255, 0.012) 42%, transparent 72%),
        rgba(7, 20, 24, 0.84) !important;
    }

    html[data-ultra-theme-mode="dark"] .layout .flux-main:has(.test-page-shell)::before {
      background:
        radial-gradient(ellipse at 10% 0%, rgba(255, 255, 255, 0.052), transparent 28%),
        radial-gradient(ellipse at 92% 8%, color-mix(in srgb, var(--app-accent-cyan) 4.5%, transparent), transparent 32%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.032), transparent 34%) !important;
      opacity: 0.4 !important;
      transform: none !important;
    }

    html[data-ultra-theme-mode="dark"] .layout .flux-main:has(.unlock-page-shell) {
      background:
        radial-gradient(ellipse at 8% 0%, color-mix(in srgb, var(--primary-main) 4.8%, transparent), transparent 30%),
        radial-gradient(ellipse at 100% 8%, color-mix(in srgb, var(--app-accent-cyan) 3.8%, transparent), transparent 32%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.014), rgba(255, 255, 255, 0.004) 46%, transparent 76%),
        rgba(7, 20, 24, 0.86) !important;
    }

    html[data-ultra-theme-mode="dark"] .layout .flux-main:has(.unlock-page-shell)::before {
      background:
        radial-gradient(ellipse 64% 34% at 18% 0%, rgba(255, 255, 255, 0.01), transparent 72%),
        radial-gradient(ellipse 58% 34% at 88% 8%, rgba(104, 168, 255, 0.014), transparent 72%) !important;
      opacity: 0.12 !important;
      filter: blur(28px) !important;
      transform: none !important;
    }
  }

  html[data-ultra-theme-mode="dark"] .unlock-page-shell .base-container > section::before {
    background:
      radial-gradient(ellipse at 14% 18%, color-mix(in srgb, var(--primary-main) 3%, transparent), transparent 36%),
      radial-gradient(ellipse at 88% 86%, color-mix(in srgb, var(--app-accent-cyan) 2.4%, transparent), transparent 40%) !important;
    opacity: 0.18 !important;
    mask-image: linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent) !important;
    -webkit-mask-image: linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent) !important;
  }

  html[data-ultra-theme-mode="dark"] .unlock-page-shell > header {
    background:
      linear-gradient(100deg, rgba(20, 40, 46, 0.72), rgba(11, 25, 30, 0.5) 52%, rgba(104, 168, 255, 0.04)),
      radial-gradient(ellipse at 12% 0%, rgba(255, 255, 255, 0.038), transparent 34%),
      rgba(7, 18, 23, 0.74) !important;
  }

  html[data-ultra-theme-mode="dark"] .unlock-page__control-panel,
  html[data-ultra-theme-mode="dark"] .unlock-page__route-panel,
  html[data-ultra-theme-mode="dark"] .unlock-page__item-card,
  html[data-ultra-theme-mode="dark"] .unlock-page__item-card:hover {
    position: relative !important;
    overflow: hidden !important;
    border-color: color-mix(in srgb, var(--primary-main) 8%, transparent) !important;
    background:
      radial-gradient(ellipse 70% 42% at 20% -12%, rgba(255, 255, 255, 0.01), transparent 72%),
      linear-gradient(145deg, color-mix(in srgb, var(--primary-main) 3.8%, transparent), color-mix(in srgb, var(--background-color) 84%, transparent)) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.01),
      0 1px 5px rgba(0, 0, 0, 0.1) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }

  html[data-ultra-theme-mode="dark"] .unlock-page__route-panel {
    border-style: solid !important;
  }

  html[data-ultra-theme-mode="dark"] .unlock-page__control-panel::before,
  html[data-ultra-theme-mode="dark"] .unlock-page__route-panel::before,
  html[data-ultra-theme-mode="dark"] .unlock-page__item-card::before,
  html[data-ultra-theme-mode="dark"] .unlock-page__item-card:hover::before {
    content: "" !important;
    display: block !important;
    position: absolute !important;
    inset: 0 !important;
    z-index: 0 !important;
    pointer-events: none !important;
    border-radius: inherit !important;
    background:
      radial-gradient(ellipse 78% 44% at 24% -18%, rgba(255, 255, 255, 0.012), transparent 76%),
      radial-gradient(ellipse 64% 42% at 92% 112%, rgba(104, 168, 255, 0.01), transparent 78%) !important;
    opacity: 0.42 !important;
    filter: blur(16px) !important;
    transform: none !important;
  }

  html[data-ultra-theme-mode="dark"] .unlock-page__control-panel::after,
  html[data-ultra-theme-mode="dark"] .unlock-page__route-panel::after,
  html[data-ultra-theme-mode="dark"] .unlock-page__item-card::after,
  html[data-ultra-theme-mode="dark"] .unlock-page__item-card:hover::after {
    content: "" !important;
    display: none !important;
    background: none !important;
    opacity: 0 !important;
  }

  html[data-ultra-theme-mode="dark"] .unlock-page__control-panel > *,
  html[data-ultra-theme-mode="dark"] .unlock-page__route-panel > *,
  html[data-ultra-theme-mode="dark"] .unlock-page__item-card > * {
    position: relative;
    z-index: 1;
  }

  html[data-ultra-theme-mode="dark"] .unlock-page__item-card .MuiDivider-root {
    border-color: color-mix(in srgb, var(--primary-main) 4%, transparent) !important;
  }

  html[data-ultra-theme-mode="dark"] .test-page-shell .base-container > section::before {
    background:
      radial-gradient(ellipse at 14% 18%, color-mix(in srgb, var(--primary-main) 3.5%, transparent), transparent 36%),
      radial-gradient(ellipse at 88% 86%, color-mix(in srgb, var(--app-accent-cyan) 2.8%, transparent), transparent 40%) !important;
    opacity: 0.22 !important;
    mask-image: linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent) !important;
    -webkit-mask-image: linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent) !important;
  }

  html[data-ultra-theme-mode="dark"] .test-page-shell > header {
    background:
      linear-gradient(100deg, rgba(20, 40, 46, 0.78), rgba(11, 25, 30, 0.54) 52%, rgba(104, 168, 255, 0.055)),
      radial-gradient(ellipse at 12% 0%, rgba(255, 255, 255, 0.052), transparent 34%),
      rgba(7, 18, 23, 0.76) !important;
  }

  html[data-ultra-theme-mode="dark"] .test-page__item-shell,
  html[data-ultra-theme-mode="dark"] .test-page__item-shell:hover {
    background: transparent !important;
    background-image: none !important;
    box-shadow: none !important;
    transform: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }

  html[data-ultra-theme-mode="dark"] .test-page__item-shell::before,
  html[data-ultra-theme-mode="dark"] .test-page__item-shell::after,
  html[data-ultra-theme-mode="dark"] .test-page__item-card::after {
    content: "" !important;
    display: none !important;
    background: none !important;
    opacity: 0 !important;
  }

  html[data-ultra-theme-mode="dark"] .test-page__item-card,
  html[data-ultra-theme-mode="dark"] .test-page__item-card:hover {
    border-color: color-mix(in srgb, var(--primary-main) 7%, transparent) !important;
    background:
      radial-gradient(ellipse at 16% 0%, rgba(255, 255, 255, 0.042), transparent 38%),
      linear-gradient(145deg, color-mix(in srgb, var(--primary-main) 4%, transparent), color-mix(in srgb, var(--background-color) 82%, transparent)) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.032),
      0 1px 4px rgba(0, 0, 0, 0.1) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    transition: background 0.3s, border-color 0.3s, box-shadow 0.3s !important;
  }

  html[data-ultra-theme-mode="dark"] .test-page__item-card:hover {
    border-color: color-mix(in srgb, var(--primary-main) 11%, transparent) !important;
    background:
      radial-gradient(ellipse at 16% 0%, rgba(255, 255, 255, 0.052), transparent 40%),
      linear-gradient(145deg, color-mix(in srgb, var(--primary-main) 6%, transparent), color-mix(in srgb, var(--background-color) 84%, transparent)) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.038),
      0 4px 10px rgba(0, 0, 0, 0.14) !important;
  }

  html[data-ultra-theme-mode="dark"] .test-page__item-card::before,
  html[data-ultra-theme-mode="dark"] .test-page__item-card:hover::before {
    content: "" !important;
    display: block !important;
    position: absolute !important;
    inset: 0 !important;
    z-index: 0 !important;
    pointer-events: none !important;
    border-radius: inherit !important;
    background:
      radial-gradient(ellipse at 22% 0%, rgba(255, 255, 255, 0.052), transparent 38%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.018), transparent 46%) !important;
    opacity: 0.68 !important;
    transform: none !important;
    transition: opacity 0.3s ease !important;
  }

  html[data-ultra-theme-mode="dark"] .test-page__item-card:hover::before {
    opacity: 0.78 !important;
  }

  html[data-ultra-theme-mode="dark"] .test-page__item-card > * {
    position: relative;
    z-index: 1;
  }

  html[data-ultra-theme-mode="dark"] .test-page__item-card .MuiDivider-root {
    border-color: color-mix(in srgb, var(--primary-main) 4%, transparent) !important;
  }

  html[data-ultra-theme-mode="dark"] .test-page__item-card :is(.the-check, .the-delay, .the-speed, .the-speed-check) {
    border-color: color-mix(in srgb, var(--primary-main) 8%, transparent) !important;
    background:
      radial-gradient(ellipse at 18% 0%, rgba(255, 255, 255, 0.04), transparent 40%),
      linear-gradient(135deg, color-mix(in srgb, var(--primary-main) 4.5%, transparent), color-mix(in srgb, var(--background-color) 88%, transparent)) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.028),
      inset 0 0 0 1px color-mix(in srgb, var(--primary-main) 3.5%, transparent) !important;
    text-shadow: none !important;
  }
`

const UNLOCK_PAGE_DARK_FEATHER_CSS = `
  html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] body::before {
    background:
      radial-gradient(circle at 12% 10%, rgba(92, 227, 210, 0.075) 0 10%, transparent 32%),
      radial-gradient(circle at 88% 14%, rgba(104, 168, 255, 0.065) 0 10%, transparent 34%),
      radial-gradient(circle at 54% 92%, rgba(23, 175, 160, 0.052) 0 14%, transparent 40%),
      linear-gradient(135deg, #061414 0%, #0b2023 52%, #0c1827 100%) !important;
    opacity: 0.9 !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] body::after {
    background:
      radial-gradient(ellipse at 18% 6%, rgba(255, 255, 255, 0.016), transparent 38%),
      radial-gradient(ellipse at 86% 88%, rgba(104, 168, 255, 0.022), transparent 44%) !important;
    opacity: 0.14 !important;
    mix-blend-mode: screen !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout {
    background:
      radial-gradient(circle at 14% 12%, rgba(92, 227, 210, 0.055), transparent 34%),
      radial-gradient(circle at 88% 18%, rgba(104, 168, 255, 0.045), transparent 36%),
      linear-gradient(135deg, #061414 0%, #0b2023 52%, #0c1827 100%) !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout::before {
    background: none !important;
    background-image: none !important;
    background-size: auto !important;
    mask-image: none !important;
    -webkit-mask-image: none !important;
    opacity: 0 !important;
    transform: none !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout::after {
    background:
      radial-gradient(ellipse at 20% 0%, rgba(255, 255, 255, 0.018), transparent 42%),
      radial-gradient(ellipse at 84% 100%, rgba(104, 168, 255, 0.022), transparent 46%) !important;
    opacity: 0.16 !important;
    filter: blur(10px) !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout .flux-main {
    background:
      radial-gradient(ellipse at 10% 0%, rgba(92, 227, 210, 0.042), transparent 38%),
      radial-gradient(ellipse at 96% 8%, rgba(104, 168, 255, 0.034), transparent 40%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.014), rgba(255, 255, 255, 0.004) 46%, transparent 76%),
      rgba(7, 20, 24, 0.88) !important;
    box-shadow:
      0 14px 42px rgba(0, 0, 0, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.018) !important;
    backdrop-filter: blur(18px) saturate(120%) !important;
    -webkit-backdrop-filter: blur(18px) saturate(120%) !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="unlock"] .layout .flux-main::before {
    inset: -32% !important;
    background:
      radial-gradient(ellipse 64% 34% at 18% 0%, rgba(255, 255, 255, 0.01), transparent 72%),
      radial-gradient(ellipse 58% 34% at 88% 8%, rgba(104, 168, 255, 0.014), transparent 72%) !important;
    opacity: 0.12 !important;
    filter: blur(28px) !important;
    transform: none !important;
  }

  html[data-ultra-theme-mode="dark"] .unlock-page__control-panel,
  html[data-ultra-theme-mode="dark"] .unlock-page__route-panel,
  html[data-ultra-theme-mode="dark"] .unlock-page__item-card,
  html[data-ultra-theme-mode="dark"] .unlock-page__item-card:hover {
    background:
      radial-gradient(ellipse at 18% 0%, rgba(255, 255, 255, 0.024), transparent 44%),
      linear-gradient(145deg, rgba(92, 227, 210, 0.026), rgba(7, 20, 24, 0.76)) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.018),
      0 1px 5px rgba(0, 0, 0, 0.11) !important;
  }

  html[data-ultra-theme-mode="dark"] .unlock-page__control-panel::before,
  html[data-ultra-theme-mode="dark"] .unlock-page__route-panel::before,
  html[data-ultra-theme-mode="dark"] .unlock-page__item-card::before,
  html[data-ultra-theme-mode="dark"] .unlock-page__item-card:hover::before {
    background:
      radial-gradient(ellipse at 24% 0%, rgba(255, 255, 255, 0.028), transparent 46%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.01), transparent 48%) !important;
    opacity: 0.7 !important;
    filter: blur(8px) !important;
  }

  @supports selector(.layout:has(.unlock-page-shell)) {
    html[data-ultra-theme-mode="dark"] body:has(.unlock-page-shell)::before {
      background:
        radial-gradient(circle at 12% 10%, rgba(92, 227, 210, 0.075) 0 10%, transparent 32%),
        radial-gradient(circle at 88% 14%, rgba(104, 168, 255, 0.065) 0 10%, transparent 34%),
        radial-gradient(circle at 54% 92%, rgba(23, 175, 160, 0.052) 0 14%, transparent 40%),
        linear-gradient(135deg, #061414 0%, #0b2023 52%, #0c1827 100%) !important;
      opacity: 0.9 !important;
    }

    html[data-ultra-theme-mode="dark"] body:has(.unlock-page-shell)::after {
      background:
        radial-gradient(ellipse at 18% 6%, rgba(255, 255, 255, 0.016), transparent 38%),
        radial-gradient(ellipse at 86% 88%, rgba(104, 168, 255, 0.022), transparent 44%) !important;
      opacity: 0.14 !important;
      mix-blend-mode: screen !important;
    }

    html[data-ultra-theme-mode="dark"] .layout:has(.unlock-page-shell) {
      background:
        radial-gradient(circle at 14% 12%, rgba(92, 227, 210, 0.055), transparent 34%),
        radial-gradient(circle at 88% 18%, rgba(104, 168, 255, 0.045), transparent 36%),
        linear-gradient(135deg, #061414 0%, #0b2023 52%, #0c1827 100%) !important;
    }

    html[data-ultra-theme-mode="dark"] .layout:has(.unlock-page-shell)::before {
      background: none !important;
      background-image: none !important;
      opacity: 0 !important;
      transform: none !important;
    }

    html[data-ultra-theme-mode="dark"] .layout:has(.unlock-page-shell)::after {
      background:
        radial-gradient(ellipse at 20% 0%, rgba(255, 255, 255, 0.018), transparent 42%),
        radial-gradient(ellipse at 84% 100%, rgba(104, 168, 255, 0.022), transparent 46%) !important;
      opacity: 0.16 !important;
      filter: blur(10px) !important;
    }

    html[data-ultra-theme-mode="dark"] .layout .flux-main:has(.unlock-page-shell) {
      background:
        radial-gradient(ellipse at 10% 0%, rgba(92, 227, 210, 0.042), transparent 38%),
        radial-gradient(ellipse at 96% 8%, rgba(104, 168, 255, 0.034), transparent 40%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.014), rgba(255, 255, 255, 0.004) 46%, transparent 76%),
        rgba(7, 20, 24, 0.88) !important;
      box-shadow:
        0 14px 42px rgba(0, 0, 0, 0.18),
        inset 0 1px 0 rgba(255, 255, 255, 0.018) !important;
    }

    html[data-ultra-theme-mode="dark"] .layout .flux-main:has(.unlock-page-shell)::before {
      inset: -32% !important;
      background:
        radial-gradient(ellipse 64% 34% at 18% 0%, rgba(255, 255, 255, 0.01), transparent 72%),
        radial-gradient(ellipse 58% 34% at 88% 8%, rgba(104, 168, 255, 0.014), transparent 72%) !important;
      opacity: 0.12 !important;
      filter: blur(28px) !important;
      transform: none !important;
    }
  }
`

// 代理菜单页（/proxies）深色模式：保留无条纹背景，只提供柔和环境光。
// 具体卡片扫光改为组件内真实 DOM 覆层，避免伪元素被运行时主题层覆盖。
const PROXIES_PAGE_DARK_SHINE_CSS = `
  html[data-ultra-theme-mode="dark"][data-ultra-active-page="proxies"] .layout::before,
  html[data-ultra-theme-mode="dark"] .layout:has(.proxies-page-shell)::before {
    background:
      radial-gradient(ellipse 62% 36% at 18% 2%, color-mix(in srgb, var(--primary-main) 8%, transparent), transparent 72%),
      radial-gradient(ellipse 54% 34% at 88% 12%, color-mix(in srgb, var(--app-accent-cyan) 6%, transparent), transparent 74%) !important;
    background-size: auto !important;
    mask-image: none !important;
    -webkit-mask-image: none !important;
    opacity: 0.18 !important;
    filter: blur(26px) !important;
    transform: none !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="proxies"] .layout::after,
  html[data-ultra-theme-mode="dark"] .layout:has(.proxies-page-shell)::after {
    background:
      radial-gradient(ellipse 72% 44% at 18% -12%, color-mix(in srgb, #fff 1.2%, transparent), transparent 74%),
      radial-gradient(ellipse 64% 42% at 92% 106%, color-mix(in srgb, var(--app-accent-cyan) 3.5%, transparent), transparent 76%) !important;
    opacity: 0.16 !important;
    filter: blur(28px) !important;
    transform: none !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="proxies"] .layout .flux-main::before,
  html[data-ultra-theme-mode="dark"][data-ultra-active-page="proxies"] .layout .layout-content .flux-main::before,
  html[data-ultra-theme-mode="dark"] .layout .flux-main:has(.proxies-page-shell)::before {
    inset: 0 !important;
    background:
      radial-gradient(ellipse 62% 28% at 12% 0%, color-mix(in srgb, var(--primary-main) 9%, transparent), transparent 72%),
      radial-gradient(ellipse 56% 28% at 96% 6%, color-mix(in srgb, var(--app-accent-cyan) 7%, transparent), transparent 74%),
      linear-gradient(180deg, color-mix(in srgb, #fff 10%, transparent), transparent 18%) !important;
    background-size: auto !important;
    opacity: 0.34 !important;
    filter: blur(14px) !important;
    transform: none !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="proxies"] .layout .flux-main,
  html[data-ultra-theme-mode="dark"][data-ultra-active-page="proxies"] .layout .layout-content .flux-main,
  html[data-ultra-theme-mode="dark"] .layout .flux-main:has(.proxies-page-shell) {
    background:
      radial-gradient(ellipse at 8% 0%, color-mix(in srgb, var(--primary-main) 11%, transparent), transparent 30%),
      radial-gradient(ellipse at 100% 8%, color-mix(in srgb, var(--app-accent-cyan) 10%, transparent), transparent 32%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.024), rgba(255, 255, 255, 0.008) 42%, transparent 72%),
      rgba(7, 20, 24, 0.84) !important;
  }

  html[data-ultra-theme-mode="dark"][data-ultra-active-page="proxies"] .proxies-page-shell .base-container > section::before,
  html[data-ultra-theme-mode="dark"] .layout:has(.proxies-page-shell) .base-container > section::before {
    background:
      radial-gradient(ellipse at 14% 18%, color-mix(in srgb, var(--primary-main) 6%, transparent), transparent 36%),
      radial-gradient(ellipse at 88% 86%, color-mix(in srgb, var(--app-accent-cyan) 5%, transparent), transparent 40%) !important;
    opacity: 0.3 !important;
    filter: none !important;
    mask-image: linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent) !important;
    -webkit-mask-image: linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent) !important;
  }
`

// 卡片动效兜底：代理页/测试页使用真实 DOM 覆层，不再依赖容易被深色规则关闭的 ::after。
// 放在运行时注入 CSS 的最后，先禁用旧伪元素扫光，再统一浅色/深色 hover 扫光。
const DEFAULT_CARD_MOTION_SYNC_CSS = `
  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root:not(.proxy-node-card):not(.proxy-group-card) {
    position: relative !important;
    isolation: isolate !important;
    overflow: hidden !important;
  }

  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root:not(.proxy-node-card):not(.proxy-group-card)::after {
    content: "" !important;
    display: block !important;
    position: absolute !important;
    inset: 1px !important;
    z-index: 2 !important;
    pointer-events: none !important;
    opacity: 0 !important;
    border-radius: inherit !important;
    background:
      linear-gradient(105deg, transparent 0 36%, rgba(255, 255, 255, 0.74) 46%, rgba(126, 237, 222, 0.24) 52%, transparent 64% 100%) !important;
    mix-blend-mode: normal !important;
    filter: none !important;
    transform: translate3d(-44%, 0, 0) !important;
    transition:
      opacity 180ms ease,
      transform 360ms ease !important;
    will-change: opacity, transform !important;
  }

  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root:not(.proxy-node-card):not(.proxy-group-card):hover::after {
    opacity: 0.62 !important;
    transform: translate3d(42%, 0, 0) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content .MuiListItemButton-root:not(.proxy-node-card):not(.proxy-group-card)::after {
    background:
      linear-gradient(105deg, transparent 0 32%, rgba(92, 227, 210, 0.18) 41%, rgba(255, 255, 255, 0.58) 48%, rgba(126, 237, 222, 0.3) 55%, transparent 70% 100%) !important;
    filter: blur(0.25px) saturate(1.08) !important;
  }

  html:not([data-ultra-theme-preset])[data-ultra-theme-mode="dark"] .base-content .MuiListItemButton-root:not(.proxy-node-card):not(.proxy-group-card):hover::after {
    opacity: 0.74 !important;
  }

  html .base-content .MuiListItemButton-root.proxy-node-card::after,
  html .base-content .MuiListItemButton-root.proxy-group-card::after,
  html:not([data-ultra-theme-preset]) .proxy-node-card::after,
  html:not([data-ultra-theme-preset]) .proxy-group-card::after,
  html .proxy-node-card::after,
  html .proxy-group-card::after,
  html[data-ultra-theme-mode] .test-page__item-card::after,
  html .test-page__item-card::after {
    content: "" !important;
    display: none !important;
    background: none !important;
    opacity: 0 !important;
  }

  html .proxy-node-card,
  html .proxy-group-card,
  html .test-page__item-card {
    position: relative !important;
    isolation: isolate !important;
    overflow: hidden !important;
  }

  html .proxy-node-card > .proxy-card-motion,
  html .proxy-group-card > .proxy-card-motion,
  html .test-page__item-card > .test-card-motion {
    display: block !important;
    position: absolute !important;
    inset: 1px !important;
    z-index: 2 !important;
    pointer-events: none !important;
    opacity: 0 !important;
    border-radius: inherit !important;
    background:
      linear-gradient(105deg, transparent 0 36%, rgba(255, 255, 255, 0.74) 46%, rgba(126, 237, 222, 0.24) 52%, transparent 64% 100%) !important;
    mix-blend-mode: normal !important;
    filter: none !important;
    transform: translate3d(-44%, 0, 0) !important;
    transition:
      opacity 180ms ease,
      transform 360ms ease !important;
    will-change: opacity, transform !important;
  }

  html[data-ultra-theme-mode="dark"] .proxy-node-card > .proxy-card-motion,
  html[data-ultra-theme-mode="dark"] .proxy-group-card > .proxy-card-motion,
  html[data-ultra-theme-mode="dark"] .test-page__item-card > .test-card-motion {
    background:
      linear-gradient(105deg, transparent 0 32%, rgba(92, 227, 210, 0.18) 41%, rgba(255, 255, 255, 0.58) 48%, rgba(126, 237, 222, 0.3) 55%, transparent 70% 100%) !important;
    filter: blur(0.25px) saturate(1.08) !important;
  }

  html .proxy-node-card:hover > .proxy-card-motion,
  html .proxy-group-card:hover > .proxy-card-motion,
  html .test-page__item-card:hover > .test-card-motion {
    opacity: 0.62 !important;
    transform: translate3d(42%, 0, 0) !important;
  }

  html[data-ultra-theme-mode="dark"] .proxy-node-card:hover > .proxy-card-motion,
  html[data-ultra-theme-mode="dark"] .proxy-group-card:hover > .proxy-card-motion,
  html[data-ultra-theme-mode="dark"] .test-page__item-card:hover > .test-card-motion {
    opacity: 0.74 !important;
  }

  html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root:not(.proxy-node-card):not(.proxy-group-card) > *,
  html .proxy-node-card > :not(.proxy-card-motion),
  html .proxy-group-card > :not(.proxy-card-motion),
  html .test-page__item-card > :not(.test-card-motion) {
    position: relative !important;
    z-index: 3 !important;
  }

  @media (prefers-reduced-motion: reduce) {
    html:not([data-ultra-theme-preset]) .base-content .MuiListItemButton-root:not(.proxy-node-card):not(.proxy-group-card)::after,
    html .proxy-node-card > .proxy-card-motion,
    html .proxy-group-card > .proxy-card-motion,
    html .test-page__item-card > .test-card-motion {
      transition: none !important;
      opacity: 0 !important;
      transform: translate3d(-44%, 0, 0) !important;
    }
  }
`

// 字体对比度兜底：统一让常规文本跟随当前浅色/深色模式，避免组件里残留白字/黑字导致不可读。
// 注意只处理常规文本角色，不覆盖 error/success/warning/info 等语义色。
const TEXT_CONTRAST_GUARD_CSS = `
  html[data-ultra-theme-mode] {
    --ultra-readable-primary: var(--theme-readable-primary, var(--text-primary, #0a1024));
    --ultra-readable-secondary: var(--theme-readable-secondary, var(--text-secondary, #526779));
    --ultra-readable-disabled: var(--text-disabled, color-mix(in srgb, var(--ultra-readable-secondary) 58%, transparent));
    --ultra-readable-on-primary: var(--text-inverse, #ffffff);
    --ultra-placeholder-text: color-mix(in srgb, var(--ultra-readable-secondary) 72%, transparent);
  }

  html[data-ultra-theme-mode="dark"] {
    --ultra-readable-primary: var(--theme-readable-primary, var(--text-primary, #f4f8ff));
    --ultra-readable-secondary: var(--theme-readable-secondary, var(--text-secondary, #9fbbb8));
    --ultra-readable-on-primary: var(--text-inverse, #061414);
  }

  html[data-ultra-theme-mode] body,
  html[data-ultra-theme-mode] .layout,
  html[data-ultra-theme-mode] .flux-main,
  html[data-ultra-theme-mode] .base-page,
  html[data-ultra-theme-mode] .base-content {
    color: var(--ultra-readable-primary) !important;
  }

  html[data-ultra-theme-mode] :is(
    .MuiListItemText-primary,
    .MuiTableCell-root,
    .MuiInputBase-input,
    .MuiSelect-select,
    .MuiAutocomplete-input,
    .MuiAutocomplete-option,
    .MuiMenuItem-root,
    .MuiTreeItem-label,
    .MuiFormControlLabel-label,
    .MuiChip-label
  ),
  html[data-ultra-theme-mode] .MuiTypography-root:not(.MuiTypography-colorPrimary):not(.MuiTypography-colorSecondary):not(.MuiTypography-colorTextSecondary):not(.MuiTypography-colorError):not(.MuiTypography-colorInfo):not(.MuiTypography-colorSuccess):not(.MuiTypography-colorWarning) {
    color: var(--ultra-readable-primary) !important;
    -webkit-text-fill-color: currentColor !important;
    text-shadow: none;
  }

  html[data-ultra-theme-mode] :is(
    .MuiTypography-colorTextSecondary,
    .MuiListItemText-secondary,
    .MuiFormHelperText-root,
    .MuiInputLabel-root,
    .MuiFormLabel-root,
    .MuiTableCell-head,
    .MuiBreadcrumbs-separator,
    .MuiInputAdornment-root,
    .MuiInputAdornment-root .MuiTypography-root
  ) {
    color: var(--ultra-readable-secondary) !important;
    -webkit-text-fill-color: currentColor !important;
  }

  html[data-ultra-theme-mode] :is(.MuiInputBase-input, .MuiAutocomplete-input)::placeholder {
    color: var(--ultra-placeholder-text) !important;
    -webkit-text-fill-color: var(--ultra-placeholder-text) !important;
    opacity: 1 !important;
  }

  html[data-ultra-theme-mode] :is(.MuiButton-contained, .MuiButton-containedPrimary) {
    color: var(--ultra-readable-on-primary) !important;
    -webkit-text-fill-color: currentColor !important;
  }

  html[data-ultra-theme-mode] :is(.MuiButton-contained, .MuiButton-containedPrimary) :is(
    .MuiTypography-root,
    .MuiButton-startIcon,
    .MuiButton-endIcon,
    .MuiSvgIcon-root
  ) {
    color: currentColor !important;
    -webkit-text-fill-color: currentColor !important;
  }

  html[data-ultra-theme-mode] :is(
    .MuiButton-text,
    .MuiButton-outlined
  ):not(.Mui-checked):not(.Mui-disabled) {
    color: var(--ultra-readable-primary) !important;
  }

  html[data-ultra-theme-mode] :is(
    .Mui-disabled,
    .MuiInputBase-input.Mui-disabled,
    .MuiButtonBase-root.Mui-disabled,
    .MuiFormControlLabel-label.Mui-disabled
  ) {
    color: var(--ultra-readable-disabled) !important;
    -webkit-text-fill-color: var(--ultra-readable-disabled) !important;
  }

  html[data-ultra-theme-mode="light"] .base-content :is(
    .MuiTypography-root,
    .MuiListItemText-primary,
    .MuiListItemText-secondary,
    .MuiTableCell-root,
    .MuiChip-label
  )[style*="color: white"],
  html[data-ultra-theme-mode="light"] .base-content :is(
    .MuiTypography-root,
    .MuiListItemText-primary,
    .MuiListItemText-secondary,
    .MuiTableCell-root,
    .MuiChip-label
  )[style*="color: rgb(255, 255, 255)"],
  html[data-ultra-theme-mode="light"] .base-content :is(
    .MuiTypography-root,
    .MuiListItemText-primary,
    .MuiListItemText-secondary,
    .MuiTableCell-root,
    .MuiChip-label
  )[style*="color: #fff"],
  html[data-ultra-theme-mode="light"] .base-content :is(
    .MuiTypography-root,
    .MuiListItemText-primary,
    .MuiListItemText-secondary,
    .MuiTableCell-root,
    .MuiChip-label
  )[style*="color: #ffffff"] {
    color: var(--ultra-readable-primary) !important;
    -webkit-text-fill-color: var(--ultra-readable-primary) !important;
  }

  html[data-ultra-theme-mode="dark"] .base-content :is(
    .MuiTypography-root,
    .MuiListItemText-primary,
    .MuiListItemText-secondary,
    .MuiTableCell-root,
    .MuiChip-label
  )[style*="color: black"],
  html[data-ultra-theme-mode="dark"] .base-content :is(
    .MuiTypography-root,
    .MuiListItemText-primary,
    .MuiListItemText-secondary,
    .MuiTableCell-root,
    .MuiChip-label
  )[style*="color: rgb(0, 0, 0)"],
  html[data-ultra-theme-mode="dark"] .base-content :is(
    .MuiTypography-root,
    .MuiListItemText-primary,
    .MuiListItemText-secondary,
    .MuiTableCell-root,
    .MuiChip-label
  )[style*="color: #000"],
  html[data-ultra-theme-mode="dark"] .base-content :is(
    .MuiTypography-root,
    .MuiListItemText-primary,
    .MuiListItemText-secondary,
    .MuiTableCell-root,
    .MuiChip-label
  )[style*="color: #000000"] {
    color: var(--ultra-readable-primary) !important;
    -webkit-text-fill-color: var(--ultra-readable-primary) !important;
  }
`

const canUseCssScope = () => {
  if (cssScopeSupport !== null) {
    return cssScopeSupport
  }
  try {
    const testStyle = document.createElement('style')
    testStyle.textContent = '@scope (:root) { }'
    document.head.appendChild(testStyle)
    cssScopeSupport = !!testStyle.sheet?.cssRules?.length
    document.head.removeChild(testStyle)
  } catch {
    cssScopeSupport = false
  }
  return cssScopeSupport
}

const wrapCssInjectionWithScope = (css?: string) => {
  if (!css?.trim()) {
    return ''
  }
  const lowerCss = css.toLowerCase()
  const hasTopLevelOnlyRule = TOP_LEVEL_AT_RULES.some((rule) =>
    lowerCss.includes(rule),
  )
  if (hasTopLevelOnlyRule) {
    return null
  }
  const hasGlobalSelector = GLOBAL_SELECTOR_PATTERNS.some((pattern) =>
    pattern.test(css),
  )
  if (hasGlobalSelector) {
    return null
  }
  const scopeRoot = CSS_INJECTION_SCOPE_ROOT
  const scopeLimit = CSS_INJECTION_SCOPE_LIMIT
  const scopedBlock = `@scope (${scopeRoot}) to (${scopeLimit}) {
${css}
}`
  return scopedBlock
}

/**
 * custom theme
 */
export const useCustomTheme = () => {
  const appWindow: WebviewWindow | null = useMemo(
    () => getSafeCurrentWebviewWindow(),
    [],
  )
  const { verge } = useVerge()
  const { theme_mode, theme_preset, theme_setting } = verge ?? {}
  const mode = useThemeMode()
  const setMode = useSetThemeMode()
  const isDefaultThemePreset = theme_preset === 'default'
  const effectiveThemeSetting = isDefaultThemePreset
    ? EMPTY_THEME_SETTING
    : theme_setting || EMPTY_THEME_SETTING
  const userBackgroundImage = effectiveThemeSetting?.background_image || ''
  const hasUserBackground = !!userBackgroundImage

  useEffect(() => {
    if (theme_mode === 'light' || theme_mode === 'dark') {
      setMode(theme_mode)
    }
  }, [theme_mode, setMode])

  useEffect(() => {
    if (theme_mode !== 'system' || !appWindow) {
      return
    }

    let isMounted = true

    const timerId = setTimeout(() => {
      if (!isMounted) return
      appWindow
        .theme()
        .then((systemTheme) => {
          if (isMounted && systemTheme) {
            setMode(systemTheme)
          }
        })
        .catch((err) => {
          console.error('Failed to get initial system theme:', err)
        })
    }, 0)

    const unlistenPromise = appWindow.onThemeChanged(({ payload }) => {
      if (isMounted) {
        setMode(payload)
      }
    })

    return () => {
      isMounted = false
      clearTimeout(timerId)
      unlistenPromise
        .then((unlistenFn) => {
          if (typeof unlistenFn === 'function') {
            unlistenFn()
          }
        })
        .catch((err) => {
          console.error('Failed to unlisten from theme changes:', err)
        })
    }
  }, [theme_mode, appWindow, setMode])

  useEffect(() => {
    if (theme_mode === undefined || !appWindow) {
      return
    }

    if (theme_mode === 'system') {
      appWindow.setTheme(null).catch((err) => {
        console.error(
          'Failed to set window theme to follow system (setTheme(null)):',
          err,
        )
      })
    } else if (mode) {
      appWindow.setTheme(mode as TauriOsTheme).catch((err) => {
        console.error(`Failed to set window theme to ${mode}:`, err)
      })
    }
  }, [mode, appWindow, theme_mode])

  const theme = useMemo(() => {
    const setting = effectiveThemeSetting
    const preset = theme_preset || ''
    const isDefaultPreset = preset === 'default'
    const hasExplicitPreset = !!preset
    const cyberpunk =
      preset === 'cyberpunk-neon' ||
      (!hasExplicitPreset && !isDefaultPreset && isCyberpunkTheme(setting))
    const cyberpunkLight = cyberpunk && mode === 'light'
    const manga =
      preset === 'japanese-manga' ||
      (!hasExplicitPreset && !isDefaultPreset && isMangaTheme(setting))
    const mangaDark = manga && mode === 'dark'
    const glass =
      preset === 'liquid-glass' ||
      (!hasExplicitPreset && !isDefaultPreset && isLiquidGlassTheme(setting))
    const glassDark = glass && mode === 'dark'
    const dt = mode === 'light' ? defaultTheme : defaultDarkTheme
    let muiTheme: MuiTheme

    try {
      muiTheme = createTheme({
        breakpoints: {
          values: { xs: 0, sm: 650, md: 900, lg: 1200, xl: 1536 },
        },
        palette: {
          mode,
          primary: { main: setting.primary_color || dt.primary_color },
          secondary: { main: setting.secondary_color || dt.secondary_color },
          info: { main: setting.info_color || dt.info_color },
          error: { main: setting.error_color || dt.error_color },
          warning: { main: setting.warning_color || dt.warning_color },
          success: { main: setting.success_color || dt.success_color },
          text: {
            primary: glass
              ? glassDark
                ? '#eaf6ff'
                : '#0f172a'
              : manga
                ? mangaDark
                  ? '#fff8e8'
                  : '#111111'
                : cyberpunkLight
                  ? '#071126'
                  : setting.primary_text || dt.primary_text,
            secondary: glass
              ? glassDark
                ? '#a7c7df'
                : '#475569'
              : manga
                ? mangaDark
                  ? '#ffd6e2'
                  : '#5f4b46'
                : cyberpunkLight
                  ? '#24556d'
                  : setting.secondary_text || dt.secondary_text,
            disabled:
              mode === 'light'
                ? alpha(setting.secondary_text || dt.secondary_text, 0.58)
                : alpha(setting.secondary_text || dt.secondary_text, 0.52),
          },
          background: {
            paper: glass
              ? glassDark
                ? '#0f172a'
                : '#f5faff'
              : manga
                ? mangaDark
                  ? '#17131a'
                  : '#fff8e8'
                : cyberpunk
                  ? cyberpunkLight
                    ? '#f4fbff'
                    : '#071126'
                  : dt.background_color,
            default: glass
              ? glassDark
                ? '#070b14'
                : '#eef7ff'
              : manga
                ? mangaDark
                  ? '#0f0d12'
                  : '#fff4df'
                : cyberpunk
                  ? cyberpunkLight
                    ? '#eaf7ff'
                    : '#050510'
                  : dt.background_color,
          },
        },
        shadows: Array(25).fill('none') as Shadows,
        typography: {
          fontFamily: setting.font_family
            ? `${setting.font_family}, ${dt.font_family}`
            : dt.font_family,
        },
      })
    } catch (e) {
      console.error('Error creating MUI theme, falling back to defaults:', e)
      muiTheme = createTheme({
        breakpoints: {
          values: { xs: 0, sm: 650, md: 900, lg: 1200, xl: 1536 },
        },
        palette: {
          mode,
          primary: { main: dt.primary_color },
          secondary: { main: dt.secondary_color },
          info: { main: dt.info_color },
          error: { main: dt.error_color },
          warning: { main: dt.warning_color },
          success: { main: dt.success_color },
          text: {
            primary: dt.primary_text,
            secondary: dt.secondary_text,
            disabled:
              mode === 'light'
                ? alpha(dt.secondary_text, 0.58)
                : alpha(dt.secondary_text, 0.52),
          },
          background: {
            paper: dt.background_color,
            default: dt.background_color,
          },
        },
        typography: { fontFamily: dt.font_family },
      })
    }

    const rootEle = document.documentElement
    if (rootEle) {
      const backgroundColor = glass
        ? glassDark
          ? '#070b14'
          : '#eef7ff'
        : manga
          ? mangaDark
            ? '#0f0d12'
            : '#fff4df'
          : cyberpunk
            ? cyberpunkLight
              ? '#eaf7ff'
              : '#050510'
            : dt.background_color
      const selectColor = glass
        ? glassDark
          ? 'rgba(100, 210, 255, 0.3)'
          : 'rgba(10, 132, 255, 0.22)'
        : manga
          ? mangaDark
            ? 'rgba(255, 92, 147, 0.38)'
            : 'rgba(255, 47, 109, 0.28)'
          : cyberpunk
            ? cyberpunkLight
              ? 'rgba(255, 43, 214, 0.22)'
              : 'rgba(255, 43, 214, 0.34)'
            : mode === 'light'
              ? '#ffffff'
              : '#06201e'
      const scrollColor = glass
        ? glassDark
          ? 'rgba(100, 210, 255, 0.38)'
          : 'rgba(10, 132, 255, 0.3)'
        : manga
          ? mangaDark
            ? 'rgba(255, 92, 147, 0.46)'
            : 'rgba(17, 17, 17, 0.32)'
          : cyberpunk
            ? cyberpunkLight
              ? 'rgba(0, 130, 160, 0.38)'
              : 'rgba(0, 229, 255, 0.42)'
            : mode === 'light'
              ? 'rgba(18, 175, 160, 0.42)'
              : 'rgba(92, 227, 210, 0.46)'
      const dividerColor = glass
        ? glassDark
          ? 'rgba(255, 255, 255, 0.1)'
          : 'rgba(15, 23, 42, 0.08)'
        : manga
          ? mangaDark
            ? 'rgba(255, 248, 232, 0.16)'
            : 'rgba(17, 17, 17, 0.18)'
          : cyberpunk
            ? cyberpunkLight
              ? 'rgba(0, 130, 160, 0.22)'
              : 'rgba(0, 229, 255, 0.22)'
            : mode === 'light'
              ? 'rgba(18, 175, 160, 0.12)'
              : 'rgba(198, 255, 248, 0.1)'
      rootEle.style.setProperty('--divider-color', dividerColor)
      rootEle.style.setProperty('--background-color', backgroundColor)
      rootEle.style.setProperty('--selection-color', selectColor)
      rootEle.style.setProperty('--scroller-color', scrollColor)
      rootEle.style.setProperty('--primary-main', muiTheme.palette.primary.main)
      rootEle.style.setProperty('--text-primary', muiTheme.palette.text.primary)
      rootEle.style.setProperty(
        '--text-secondary',
        muiTheme.palette.text.secondary,
      )
      rootEle.style.setProperty(
        '--text-disabled',
        muiTheme.palette.text.disabled,
      )
      rootEle.style.setProperty(
        '--text-inverse',
        mode === 'light' ? '#ffffff' : '#061414',
      )
      rootEle.style.setProperty(
        '--app-accent-cyan',
        glass
          ? glassDark
            ? '#70e1ff'
            : '#64d2ff'
          : cyberpunk
            ? cyberpunkLight
              ? '#0082a0'
              : '#00e5ff'
            : manga
              ? mangaDark
                ? '#ff5c93'
                : '#ff2f6d'
              : muiTheme.palette.secondary.main,
      )
      rootEle.style.setProperty(
        '--app-surface',
        mode === 'light'
          ? alpha('#ffffff', 0.68)
          : alpha(muiTheme.palette.background.paper, 0.74),
      )
      rootEle.style.setProperty(
        '--app-surface-strong',
        mode === 'light'
          ? alpha('#ffffff', 0.86)
          : alpha(muiTheme.palette.background.paper, 0.86),
      )
      rootEle.style.setProperty(
        '--app-surface-border',
        mode === 'light'
          ? alpha(muiTheme.palette.primary.main, 0.16)
          : alpha(muiTheme.palette.common.white, 0.12),
      )
      rootEle.style.setProperty(
        '--app-surface-hover',
        mode === 'light'
          ? alpha(muiTheme.palette.primary.main, 0.08)
          : alpha(muiTheme.palette.primary.main, 0.16),
      )
      rootEle.style.setProperty(
        '--app-soft-shadow',
        mode === 'light'
          ? `0 16px 42px ${alpha('#12afa0', 0.1)}, 0 3px 12px ${alpha('#0f172a', 0.05)}`
          : `0 18px 46px ${alpha('#000000', 0.28)}, 0 4px 14px ${alpha(muiTheme.palette.primary.main, 0.08)}`,
      )
      rootEle.style.setProperty(
        '--app-focus-ring',
        `0 0 0 3px ${alpha(
          muiTheme.palette.primary.main,
          mode === 'light' ? 0.18 : 0.28,
        )}`,
      )
      rootEle.style.setProperty(
        '--app-glass-shine',
        mode === 'light'
          ? 'linear-gradient(115deg, transparent 0 34%, rgba(255, 255, 255, 0.52) 46%, transparent 58% 100%)'
          : 'linear-gradient(115deg, transparent 0 34%, rgba(255, 255, 255, 0.12) 46%, transparent 58% 100%)',
      )
      rootEle.style.setProperty(
        '--background-color-alpha',
        glass
          ? glassDark
            ? 'rgba(100, 210, 255, 0.13)'
            : 'rgba(10, 132, 255, 0.1)'
          : manga
            ? mangaDark
              ? 'rgba(255, 92, 147, 0.14)'
              : 'rgba(255, 47, 109, 0.1)'
            : cyberpunk
              ? cyberpunkLight
                ? 'rgba(0, 154, 190, 0.12)'
                : 'rgba(0, 229, 255, 0.12)'
              : alpha(
                  muiTheme.palette.primary.main,
                  mode === 'light' ? 0.08 : 0.12,
                ),
      )
      rootEle.style.setProperty(
        '--window-border-color',
        glass
          ? glassDark
            ? 'rgba(255, 255, 255, 0.16)'
            : 'rgba(255, 255, 255, 0.58)'
          : manga
            ? mangaDark
              ? 'rgba(255, 248, 232, 0.34)'
              : 'rgba(17, 17, 17, 0.38)'
            : cyberpunk
              ? cyberpunkLight
                ? 'rgba(0, 130, 160, 0.36)'
                : 'rgba(0, 229, 255, 0.44)'
              : mode === 'light'
                ? 'rgba(255, 255, 255, 0.7)'
                : 'rgba(198, 255, 248, 0.14)',
      )
      rootEle.style.setProperty(
        '--scrollbar-bg',
        glass
          ? glassDark
            ? 'rgba(7, 11, 20, 0.76)'
            : 'rgba(238, 247, 255, 0.72)'
          : manga
            ? mangaDark
              ? '#0b090d'
              : '#fff1df'
            : cyberpunk
              ? cyberpunkLight
                ? '#d7effb'
                : '#030916'
              : mode === 'light'
                ? 'rgba(240, 251, 248, 0.72)'
                : '#061414',
      )
      rootEle.style.setProperty(
        '--scrollbar-thumb',
        glass
          ? glassDark
            ? 'rgba(100, 210, 255, 0.38)'
            : 'rgba(10, 132, 255, 0.3)'
          : manga
            ? mangaDark
              ? 'rgba(255, 92, 147, 0.46)'
              : 'rgba(17, 17, 17, 0.32)'
            : cyberpunk
              ? cyberpunkLight
                ? 'rgba(0, 130, 160, 0.38)'
                : 'rgba(0, 229, 255, 0.42)'
              : mode === 'light'
                ? 'rgba(18, 175, 160, 0.38)'
                : 'rgba(92, 227, 210, 0.42)',
      )
      rootEle.style.setProperty(
        '--user-background-image',
        hasUserBackground ? `url('${userBackgroundImage}')` : 'none',
      )
      rootEle.style.setProperty(
        '--background-blend-mode',
        setting.background_blend_mode || 'normal',
      )
      rootEle.style.setProperty(
        '--background-opacity',
        setting.background_opacity !== undefined
          ? String(setting.background_opacity)
          : '1',
      )
      rootEle.setAttribute('data-css-injection-root', 'true')
      const themePreset = cyberpunk
        ? 'cyberpunk'
        : manga
          ? 'manga'
          : glass
            ? 'glass'
            : ''
      if (themePreset) {
        rootEle.setAttribute('data-ultra-theme-preset', themePreset)
        rootEle.setAttribute('data-ultra-theme-mode', mode)
        rootEle.setAttribute('data-ultra-theme-source', theme_mode || 'system')
      } else {
        rootEle.removeAttribute('data-ultra-theme-preset')
        rootEle.setAttribute('data-ultra-theme-mode', mode)
        rootEle.setAttribute('data-ultra-theme-source', theme_mode || 'system')
      }
    }

    let styleElement = document.querySelector('style#ultra-theme')
    if (!styleElement) {
      styleElement = document.createElement('style')
      styleElement.id = 'ultra-theme'
      document.head.appendChild(styleElement)
    }

    if (styleElement) {
      let scopedCss: string | null = null
      const customCssInjection = isBundledThemeCssInjection(
        setting.css_injection,
      )
        ? ''
        : setting.css_injection
      if (canUseCssScope() && customCssInjection) {
        scopedCss = wrapCssInjectionWithScope(customCssInjection)
      }
      const effectiveInjectedCss = scopedCss ?? customCssInjection ?? ''
      const globalStyles = `
        /* 修复滚动条样式 */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
          background-color: var(--scrollbar-bg);
        }
        ::-webkit-scrollbar-thumb {
          background-color: var(--scrollbar-thumb);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background-color: color-mix(in srgb, var(--primary-main) 58%, var(--scrollbar-thumb));
        }

        /* 背景图处理 */
        body {
          background-color: var(--background-color);
          text-rendering: geometricPrecision;
          ${
            hasUserBackground
              ? `
            background-image: var(--user-background-image);
            background-size: cover;
            background-position: center;
            background-attachment: fixed;
            background-blend-mode: var(--background-blend-mode);
            opacity: var(--background-opacity);
          `
              : ''
          }
        }

        /* 修复可能的白色边框 */
        .MuiPaper-root {
          border-color: var(--window-border-color) !important;
        }

        /* 确保模态框和对话框也使用暗色主题 */
        .MuiDialog-paper {
          border: 1px solid var(--app-surface-border) !important;
          background:
            radial-gradient(circle at 12% 0%, color-mix(in srgb, #fff 36%, transparent), transparent 34%),
            radial-gradient(circle at 100% 100%, color-mix(in srgb, var(--app-accent-cyan) 10%, transparent), transparent 36%),
            var(--app-surface-strong, ${mode === 'light' ? '#ffffff' : '#2E303D'}) !important;
          box-shadow: var(--app-soft-shadow) !important;
          backdrop-filter: blur(26px) saturate(1.35);
          -webkit-backdrop-filter: blur(26px) saturate(1.35);
        }

        .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip),
        .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root,
        .base-content > .MuiGrid-root > .MuiGrid-root > .MuiStack-root {
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 10% 0%, color-mix(in srgb, #fff 42%, transparent), transparent 34%),
            radial-gradient(circle at 100% 100%, color-mix(in srgb, var(--app-accent-cyan) 7%, transparent), transparent 38%),
            linear-gradient(135deg, color-mix(in srgb, var(--primary-main) 7%, transparent), transparent 50%),
            var(--app-surface-strong) !important;
          box-shadow:
            inset 0 0 0 1px var(--app-surface-border),
            var(--app-soft-shadow) !important;
          backdrop-filter: blur(22px) saturate(1.35);
          -webkit-backdrop-filter: blur(22px) saturate(1.35);
          transition:
            background 180ms ease,
            box-shadow 180ms ease,
            transform 180ms ease;
        }

        .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip)::before,
        .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root::before,
        .base-content > .MuiGrid-root > .MuiGrid-root > .MuiStack-root::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          opacity: 0.45;
          background:
            var(--app-glass-shine),
            radial-gradient(circle at 18% 0%, color-mix(in srgb, #fff 24%, transparent), transparent 26%);
          transform: translateX(-18%);
          transition:
            opacity 220ms ease,
            transform 360ms cubic-bezier(.2,.8,.2,1);
        }

        .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip)::after,
        .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root::after,
        .base-content > .MuiGrid-root > .MuiGrid-root > .MuiStack-root::after {
          content: "";
          position: absolute;
          left: 14px;
          right: 14px;
          top: 0;
          z-index: 0;
          height: 1px;
          pointer-events: none;
          background: linear-gradient(90deg, transparent, color-mix(in srgb, #fff 70%, transparent), color-mix(in srgb, var(--app-accent-cyan) 24%, transparent), transparent);
        }

        .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip) > *,
        .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root > *,
        .base-content > .MuiGrid-root > .MuiGrid-root > .MuiStack-root > * {
          position: relative;
          z-index: 1;
        }

        .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip):hover,
        .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root:hover,
        .base-content > .MuiGrid-root > .MuiGrid-root > .MuiStack-root:hover {
          transform: translateY(-1px);
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--primary-main) 26%, var(--app-surface-border)),
            0 18px 46px color-mix(in srgb, var(--primary-main) 11%, transparent),
            var(--app-soft-shadow) !important;
        }

        .base-content :is(.MuiPaper-root, .MuiCard-root):not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip):hover::before,
        .base-content > .MuiGrid-root > .MuiGrid-root > .MuiBox-root:hover::before,
        .base-content > .MuiGrid-root > .MuiGrid-root > .MuiStack-root:hover::before {
          opacity: 0.72;
          transform: translateX(14%);
        }

        html[data-ultra-theme-mode="dark"][data-ultra-active-page="test"] .layout::before {
          background-image: none !important;
          opacity: 0.12 !important;
        }

        html[data-ultra-theme-mode="dark"][data-ultra-active-page="test"] .layout .flux-main::before,
        html[data-ultra-theme-mode="dark"] .layout .flux-main:has(.test-page-shell)::before {
          background:
            radial-gradient(ellipse at 10% 0%, rgba(255, 255, 255, 0.055), transparent 28%),
            radial-gradient(ellipse at 92% 8%, color-mix(in srgb, var(--app-accent-cyan) 5%, transparent), transparent 32%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 34%) !important;
          opacity: 0.42 !important;
          transform: none !important;
        }

        html[data-ultra-theme-mode="dark"][data-ultra-active-page="test"] .layout .flux-main {
          background:
            radial-gradient(ellipse at 8% 0%, color-mix(in srgb, var(--primary-main) 6%, transparent), transparent 30%),
            radial-gradient(ellipse at 100% 8%, color-mix(in srgb, var(--app-accent-cyan) 4.5%, transparent), transparent 32%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.015) 42%, transparent 72%),
            rgba(7, 20, 24, 0.84) !important;
        }

        html[data-ultra-theme-mode="dark"] .test-page-shell .base-container > section::before {
          background:
            radial-gradient(ellipse at 14% 18%, color-mix(in srgb, var(--primary-main) 4%, transparent), transparent 36%),
            radial-gradient(ellipse at 88% 86%, color-mix(in srgb, var(--app-accent-cyan) 3%, transparent), transparent 40%) !important;
          opacity: 0.26 !important;
          mask-image: linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent) !important;
          -webkit-mask-image: linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent) !important;
        }

        html[data-ultra-theme-mode="dark"] .test-page-shell > header {
          background:
            linear-gradient(100deg, rgba(20, 40, 46, 0.78), rgba(11, 25, 30, 0.54) 52%, rgba(104, 168, 255, 0.06)),
            radial-gradient(ellipse at 12% 0%, rgba(255, 255, 255, 0.055), transparent 34%),
            rgba(7, 18, 23, 0.76) !important;
        }

        html[data-ultra-theme-mode="dark"] .base-content > .test-page__list,
        html[data-ultra-theme-mode="dark"] .base-content > .test-page__list:hover {
          background: transparent !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          transform: none !important;
        }

        html[data-ultra-theme-mode="dark"] .base-content > .test-page__list::before,
        html[data-ultra-theme-mode="dark"] .base-content > .test-page__list::after,
        html[data-ultra-theme-mode="dark"] .base-content > .test-page__list:hover::before,
        html[data-ultra-theme-mode="dark"] .test-page__item-shell::before,
        html[data-ultra-theme-mode="dark"] .test-page__item-shell::after {
          content: "" !important;
          display: none !important;
          background: none !important;
          opacity: 0 !important;
        }

        html[data-ultra-theme-mode="dark"] .test-page__item-shell,
        html[data-ultra-theme-mode="dark"] .test-page__item-shell:hover {
          background: transparent !important;
          background-image: none !important;
          box-shadow: none !important;
          transform: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        html[data-ultra-theme-mode="dark"] .test-page__item-card,
        html[data-ultra-theme-mode="dark"] .test-page__item-card:hover {
          border-color: color-mix(in srgb, var(--primary-main) 7%, transparent) !important;
          background:
            radial-gradient(ellipse at 16% 0%, rgba(255, 255, 255, 0.045), transparent 38%),
            linear-gradient(145deg, color-mix(in srgb, var(--primary-main) 4.5%, transparent), color-mix(in srgb, var(--background-color) 80%, transparent)) !important;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.035),
            0 1px 4px rgba(0, 0, 0, 0.1) !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        html[data-ultra-theme-mode="dark"] .test-page__item-card::before,
        html[data-ultra-theme-mode="dark"] .test-page__item-card:hover::before {
          content: "" !important;
          display: block !important;
          position: absolute !important;
          inset: 0 !important;
          z-index: 0 !important;
          pointer-events: none !important;
          border-radius: inherit !important;
          background:
            radial-gradient(ellipse at 22% 0%, rgba(255, 255, 255, 0.075), transparent 34%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.028), transparent 42%) !important;
          opacity: 1 !important;
          transform: none !important;
        }

        html[data-ultra-theme-mode="dark"] .test-page__item-card::after {
          content: "" !important;
          display: none !important;
          background: none !important;
          opacity: 0 !important;
        }

        html[data-ultra-theme-mode="dark"] .test-page__item-card > * {
          position: relative;
          z-index: 1;
        }

        html[data-ultra-theme-mode="dark"] .test-page__item-card .MuiDivider-root {
          border-color: color-mix(in srgb, var(--primary-main) 4.5%, transparent) !important;
        }

        html[data-ultra-theme-mode="dark"] .test-page__item-card :is(.the-check, .the-delay, .the-speed, .the-speed-check) {
          border-color: color-mix(in srgb, var(--primary-main) 9%, transparent) !important;
          background:
            radial-gradient(ellipse at 18% 0%, rgba(255, 255, 255, 0.045), transparent 40%),
            linear-gradient(135deg, color-mix(in srgb, var(--primary-main) 5%, transparent), color-mix(in srgb, var(--background-color) 86%, transparent)) !important;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.03),
            inset 0 0 0 1px color-mix(in srgb, var(--primary-main) 4%, transparent) !important;
          text-shadow: none !important;
        }

        html[data-ultra-theme-mode="dark"] .test-page__item-card :is(.the-check, .the-delay, .the-speed, .the-speed-check):hover {
          background:
            linear-gradient(135deg, color-mix(in srgb, var(--primary-main) 8%, transparent), color-mix(in srgb, var(--background-color) 88%, transparent)) !important;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-main) 8%, transparent) !important;
        }

        .base-content .MuiListItem-root {
          transition: background-color 160ms ease, box-shadow 160ms ease;
        }

        .base-content .MuiListItem-root:hover {
          background:
            radial-gradient(circle at 8% 0%, color-mix(in srgb, #fff 26%, transparent), transparent 30%),
            linear-gradient(90deg, var(--app-surface-hover), transparent 72%) !important;
          box-shadow: inset 3px 0 0 color-mix(in srgb, var(--primary-main) 50%, transparent);
        }

        .base-content .MuiListItemButton-root {
          border-radius: 12px;
          transition:
            background 180ms ease,
            box-shadow 180ms ease,
            transform 180ms ease;
        }

        .base-content .MuiListItemButton-root:hover {
          background:
            radial-gradient(circle at 8% 0%, color-mix(in srgb, #fff 26%, transparent), transparent 30%),
            linear-gradient(90deg, var(--app-surface-hover), transparent 70%) !important;
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--primary-main) 18%, transparent),
            0 10px 24px color-mix(in srgb, var(--primary-main) 9%, transparent) !important;
          transform: translateY(-1px);
        }

        .base-content .MuiListItemButton-root.Mui-selected,
        .base-content .MuiListItemButton-root[aria-selected="true"] {
          background:
            linear-gradient(90deg, color-mix(in srgb, var(--primary-main) 13%, transparent), color-mix(in srgb, var(--app-accent-cyan) 7%, transparent)) !important;
          box-shadow:
            inset 3px 0 0 var(--primary-main),
            inset 0 0 0 1px color-mix(in srgb, var(--primary-main) 22%, transparent) !important;
        }

        .base-content .MuiTableContainer-root,
        .base-content [role="table"] {
          overflow: hidden;
          background:
            radial-gradient(circle at 0% 0%, color-mix(in srgb, #fff 34%, transparent), transparent 32%),
            linear-gradient(180deg, color-mix(in srgb, #fff 24%, transparent), transparent 38%),
            var(--app-surface) !important;
          box-shadow:
            inset 0 0 0 1px var(--app-surface-border),
            var(--app-soft-shadow) !important;
          backdrop-filter: blur(20px) saturate(1.3);
          -webkit-backdrop-filter: blur(20px) saturate(1.3);
        }

        .base-content :is(.MuiTableCell-head, [role="columnheader"]) {
          color: ${mode === 'light' ? '#406474' : '#b6d8d4'} !important;
          background:
            linear-gradient(90deg, color-mix(in srgb, var(--primary-main) 8%, transparent), transparent 80%) !important;
        }

        .base-content .MuiTableBody-root .MuiTableRow-root {
          transition:
            background 160ms ease,
            box-shadow 160ms ease,
            transform 160ms ease;
        }

        .base-content .MuiTableBody-root .MuiTableRow-root:hover {
          background:
            linear-gradient(90deg, color-mix(in srgb, var(--primary-main) 7%, transparent), transparent 86%) !important;
          box-shadow: inset 3px 0 0 color-mix(in srgb, var(--primary-main) 48%, transparent);
        }

        .MuiTypography-root {
          font-feature-settings: "kern";
        }

        :is(.MuiTypography-h1, .MuiTypography-h2, .MuiTypography-h3, .MuiTypography-h4, .MuiTypography-h5, .MuiTypography-h6) {
          letter-spacing: -0.025em;
        }

        .MuiButton-root:not([data-theme-mode-option]) {
          position: relative;
          overflow: hidden;
          border-radius: 999px;
          text-transform: none;
          letter-spacing: -0.01em;
          transition:
            background 180ms ease,
            box-shadow 180ms ease,
            transform 180ms ease,
            border-color 180ms ease;
        }

        .MuiButton-root:not([data-theme-mode-option])::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          background: linear-gradient(115deg, transparent, rgba(255, 255, 255, 0.34), transparent);
          transform: translateX(-80%);
          transition:
            opacity 180ms ease,
            transform 360ms cubic-bezier(.2,.8,.2,1);
        }

        .MuiButton-root:not([data-theme-mode-option]):hover::before {
          opacity: 0.85;
          transform: translateX(80%);
        }

        .MuiButton-root:not([data-theme-mode-option]):hover {
          transform: translateY(-1px);
        }

        .MuiButton-contained,
        .MuiButton-containedPrimary {
          color: ${mode === 'light' ? '#ffffff' : '#06201e'} !important;
          background:
            radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.38), transparent 34%),
            linear-gradient(135deg, var(--primary-main), var(--app-accent-cyan)) !important;
          box-shadow:
            0 12px 28px color-mix(in srgb, var(--primary-main) 22%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.42) !important;
        }

        .MuiIconButton-root {
          transition:
            background-color 170ms ease,
            box-shadow 170ms ease,
            transform 170ms ease;
        }

        .MuiIconButton-root:hover {
          transform: translateY(-1px);
          background-color: var(--app-surface-hover) !important;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-main) 16%, transparent);
        }

        .MuiOutlinedInput-root,
        .MuiInputBase-root {
          position: relative;
          border-radius: 14px;
          background:
            linear-gradient(180deg, color-mix(in srgb, #fff 20%, transparent), transparent),
            var(--app-surface) !important;
          transition:
            background 170ms ease,
            box-shadow 170ms ease,
            border-color 170ms ease;
        }

        .MuiOutlinedInput-root.Mui-focused,
        .MuiInputBase-root.Mui-focused {
          box-shadow:
            0 0 0 3px color-mix(in srgb, var(--primary-main) 14%, transparent),
            0 8px 22px color-mix(in srgb, var(--primary-main) 9%, transparent) !important;
        }

        .MuiOutlinedInput-notchedOutline {
          border-color: color-mix(in srgb, var(--primary-main) 18%, var(--divider-color)) !important;
        }

        .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline {
          border-color: color-mix(in srgb, var(--primary-main) 34%, var(--divider-color)) !important;
        }

        .MuiChip-root {
          position: relative;
          overflow: hidden;
          border-radius: 999px;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, #fff 26%, transparent), transparent 38%),
            linear-gradient(135deg, color-mix(in srgb, var(--primary-main) 7%, transparent), transparent),
            var(--app-surface) !important;
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--primary-main) 13%, transparent),
            0 6px 16px color-mix(in srgb, var(--primary-main) 6%, transparent);
        }

        .MuiChip-root::after {
          content: "";
          position: absolute;
          left: 10px;
          right: 10px;
          top: 0;
          height: 1px;
          pointer-events: none;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.72), transparent);
        }

        .MuiTabs-root {
          overflow: hidden;
          border-radius: 999px;
          background:
            linear-gradient(180deg, color-mix(in srgb, #fff 22%, transparent), transparent),
            var(--app-surface) !important;
          box-shadow:
            inset 0 0 0 1px var(--app-surface-border),
            0 8px 22px color-mix(in srgb, var(--primary-main) 5%, transparent);
        }

        .MuiTabs-indicator {
          border-radius: 999px;
          height: 3px;
          background: linear-gradient(90deg, var(--primary-main), var(--app-accent-cyan)) !important;
        }

        .MuiTab-root {
          text-transform: none;
          transition:
            color 160ms ease,
            background-color 160ms ease;
        }

        .MuiTab-root:hover {
          background-color: color-mix(in srgb, var(--primary-main) 7%, transparent);
        }

        .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track {
          opacity: 1 !important;
          background: linear-gradient(90deg, var(--primary-main), var(--app-accent-cyan)) !important;
        }

        .MuiSwitch-thumb {
          box-shadow:
            0 3px 10px rgba(15, 23, 42, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.7) !important;
        }

        :is(.MuiCheckbox-root.Mui-checked, .MuiRadio-root.Mui-checked) {
          filter: drop-shadow(0 3px 8px color-mix(in srgb, var(--primary-main) 24%, transparent));
        }

        .MuiSlider-root {
          color: var(--primary-main) !important;
        }

        .MuiSlider-thumb {
          box-shadow:
            0 0 0 4px color-mix(in srgb, var(--primary-main) 12%, transparent),
            0 8px 18px color-mix(in srgb, var(--primary-main) 18%, transparent) !important;
        }

        :is(.MuiPopover-paper, .MuiMenu-paper, .MuiAutocomplete-popper .MuiPaper-root, .MuiPopper-root .MuiPaper-root):not(.MuiTooltip-tooltip) {
          border: 1px solid var(--app-surface-border) !important;
          background:
            radial-gradient(circle at 10% 0%, color-mix(in srgb, #fff 36%, transparent), transparent 34%),
            var(--app-surface-strong) !important;
          box-shadow:
            0 18px 48px color-mix(in srgb, var(--primary-main) 12%, transparent),
            0 6px 18px rgba(15, 23, 42, 0.08) !important;
          backdrop-filter: blur(24px) saturate(1.35);
          -webkit-backdrop-filter: blur(24px) saturate(1.35);
        }

        .MuiMenuItem-root {
          border-radius: 10px;
          transition:
            background 150ms ease,
            color 150ms ease;
        }

        .MuiMenuItem-root:hover,
        .MuiMenuItem-root.Mui-selected {
          background:
            linear-gradient(90deg, color-mix(in srgb, var(--primary-main) 12%, transparent), transparent 82%) !important;
        }

        .MuiTooltip-tooltip {
          border: 1px solid color-mix(in srgb, var(--primary-main) 18%, transparent);
          background:
            linear-gradient(135deg, color-mix(in srgb, var(--primary-main) 14%, transparent), transparent),
            color-mix(in srgb, var(--text-primary) 88%, transparent) !important;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18);
          backdrop-filter: blur(18px) saturate(1.25);
          -webkit-backdrop-filter: blur(18px) saturate(1.25);
        }

        /* 统一可访问焦点态；不要全局清空 outline/box-shadow，避免主题层级和键盘焦点丢失。 */
        :where(
          button,
          [role="button"],
          a,
          input,
          textarea,
          select,
          .MuiButtonBase-root,
          .MuiInputBase-root
        ):focus-visible,
        .Mui-focusVisible {
          outline: 2px solid color-mix(in srgb, var(--primary-main) 72%, transparent) !important;
          outline-offset: 2px !important;
          box-shadow: var(--app-focus-ring) !important;
        }

        .MuiPaper-root:not(.MuiMenu-paper):not(.MuiPopover-paper):not(.MuiTooltip-tooltip) {
          box-shadow: ${
            mode === 'light'
              ? '0 12px 34px rgba(15, 23, 42, 0.08)'
              : '0 16px 42px rgba(0, 0, 0, 0.24)'
          };
        }
      `

      styleElement.innerHTML =
        globalStyles +
        effectiveInjectedCss +
        (cyberpunk ? CYBERPUNK_RUNTIME_READABILITY_CSS : '') +
        (manga ? MANGA_RUNTIME_READABILITY_CSS : '') +
        (glass ? LIQUID_GLASS_RUNTIME_READABILITY_CSS : '') +
        THEME_NODE_SELECTION_CSS +
        THEME_PERSONALITY_CSS +
        THEME_READABILITY_AND_STYLE_BOOST_CSS +
        DEFAULT_FRESH_MINT_PERSONALITY_CSS +
        DARK_MODE_NO_STRIPES_CSS +
        TEST_PAGE_DARK_SURFACE_CSS +
        UNLOCK_PAGE_DARK_FEATHER_CSS +
        PROXIES_PAGE_DARK_SHINE_CSS +
        DEFAULT_CARD_MOTION_SYNC_CSS +
        TEXT_CONTRAST_GUARD_CSS

      // 保证运行时主题样式始终排在 Emotion/MUI 动态 style 后面，
      // 避免深色模式兜底规则被后注入的组件样式覆盖，看起来像“没穿透”。
      document.head.appendChild(styleElement)
    }

    return muiTheme
  }, [
    mode,
    theme_preset,
    effectiveThemeSetting,
    userBackgroundImage,
    hasUserBackground,
    theme_mode,
  ])

  useEffect(() => {
    const id = setTimeout(() => {
      const dom = document.querySelector('#Gradient2')
      if (dom) {
        dom.innerHTML = `
        <stop offset="0%" stop-color="${theme.palette.primary.main}" />
        <stop offset="80%" stop-color="${theme.palette.primary.dark}" />
        <stop offset="100%" stop-color="${theme.palette.primary.dark}" />
        `
      }
    }, 0)
    return () => clearTimeout(id)
  }, [theme.palette.primary.main, theme.palette.primary.dark])

  return { theme }
}
