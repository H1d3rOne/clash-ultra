import getSystem from '@/utils/get-system'
const OS = getSystem()

// default theme setting
export const defaultTheme = {
  primary_color: '#12AFA0',
  secondary_color: '#68A8FF',
  primary_text: '#0A1024',
  secondary_text: '#526779',
  info_color: '#3E96FF',
  error_color: '#EF4444',
  warning_color: '#F59E0B',
  success_color: '#10B981',
  background_color: '#F0FBF8',
  font_family: `-apple-system, BlinkMacSystemFont,"Microsoft YaHei UI", "Microsoft YaHei", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji"${
    OS === 'windows' ? ', twemoji mozilla' : ''
  }`,
}

// dark mode
export const defaultDarkTheme = {
  ...defaultTheme,
  primary_color: '#5CE3D2',
  secondary_color: '#86B9FF',
  primary_text: '#F4F8FF',
  background_color: '#061414',
  secondary_text: '#9FBBB8',
  info_color: '#86B9FF',
  error_color: '#FB7185',
  warning_color: '#FBBF24',
  success_color: '#34D399',
}
