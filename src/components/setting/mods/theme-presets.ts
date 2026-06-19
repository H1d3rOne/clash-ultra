export type ThemePreset = {
  id: string
  name: string
  description: string
  tags: string[]
  colors: string[]
  theme: NonNullable<IVergeConfig['theme_setting']>
}

export const defaultThemePreset: ThemePreset = {
  id: 'default',
  name: '默认主题',
  description:
    'Fresh Mint 默认视觉：薄荷青、冰蓝玻璃、清透留白和柔和数字光影。',
  tags: ['Fresh Mint', '冰玉玻璃', '薄荷青', '默认'],
  colors: ['#F0FBF8', '#12AFA0', '#68A8FF', '#061414'],
  theme: {},
}

export const mangaThemePreset: ThemePreset = {
  id: 'japanese-manga',
  name: '日系漫画',
  description: '漫画分镜式布局、粗描边组件、网点纸张背景和速度线装饰。',
  tags: ['漫画分镜', '粗描边', '网点纸张', '速度线'],
  colors: ['#111111', '#FF2F6D', '#FBBF24', '#FFF8E8'],
  theme: {
    primary_color: '#111111',
    secondary_color: '#FF2F6D',
    primary_text: '#111111',
    secondary_text: '#5F4B46',
    info_color: '#1D4ED8',
    warning_color: '#FBBF24',
    error_color: '#EF233C',
    success_color: '#16A34A',
    font_family:
      '"Hiragino Sans GB", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Yu Gothic UI", "Noto Sans JP", "Noto Sans CJK JP", "PingFang SC", "Microsoft YaHei UI", sans-serif',
  },
}

export const cyberpunkThemePreset: ThemePreset = {
  id: 'cyberpunk-neon',
  name: '赛博朋克',
  description: '霓虹网格、玻璃 HUD 面板、扫描线、发光边框和未来科技终端感。',
  tags: ['霓虹', 'HUD', '玻璃拟态', '扫描线'],
  colors: ['#050510', '#00E5FF', '#FF2BD6', '#F8F32B'],
  theme: {
    primary_color: '#00E5FF',
    secondary_color: '#FF2BD6',
    primary_text: '#EAFBFF',
    secondary_text: '#8BE9FF',
    info_color: '#00E5FF',
    warning_color: '#F8F32B',
    error_color: '#FF3864',
    success_color: '#00FFA3',
    font_family:
      '"Rajdhani", "Orbitron", "Share Tech Mono", "DIN Alternate", "SF Pro Display", "PingFang SC", "Microsoft YaHei UI", sans-serif',
  },
}

export const liquidGlassThemePreset: ThemePreset = {
  id: 'liquid-glass',
  name: '高级玻璃拟态',
  description: '棱镜光晕、液态玻璃分层、现代艺术构图和高对比清透组件。',
  tags: ['棱镜玻璃', '现代艺术', '景深层次', '清透高光'],
  colors: ['#F4FBFF', '#2F7BFF', '#70E1FF', '#07111F'],
  theme: {
    primary_color: '#2F7BFF',
    secondary_color: '#70E1FF',
    primary_text: '#0F172A',
    secondary_text: '#475569',
    info_color: '#2F7BFF',
    warning_color: '#FF9F0A',
    error_color: '#FF453A',
    success_color: '#30D158',
    font_family:
      '"SF Pro Display", "SF Pro Text", "Inter", "PingFang SC", "Microsoft YaHei UI", sans-serif',
  },
}

export const themePresets = [
  defaultThemePreset,
  mangaThemePreset,
  cyberpunkThemePreset,
  liquidGlassThemePreset,
] as const
