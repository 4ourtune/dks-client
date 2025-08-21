import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export const Dimensions_ = {
  window: {
    width,
    height,
  },
  
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    '2xl': 48,
    '3xl': 64,
  },
  
  borderRadius: {
    none: 0,
    xs: 2,
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
    '2xl': 16,
    '3xl': 24,
    full: 9999,
  },
  
  borderWidth: {
    hairline: 0.5,
    thin: 1,
    base: 2,
    thick: 4,
  },
  
  elevation: {
    none: 0,
    sm: 2,
    base: 4,
    md: 6,
    lg: 8,
    xl: 12,
    '2xl': 16,
  },
  
  opacity: {
    disabled: 0.38,
    inactive: 0.54,
    placeholder: 0.6,
    secondary: 0.7,
    active: 0.87,
    primary: 1,
  },
  
  hitSlop: {
    sm: { top: 8, bottom: 8, left: 8, right: 8 },
    md: { top: 12, bottom: 12, left: 12, right: 12 },
    lg: { top: 16, bottom: 16, left: 16, right: 16 },
  },
  
  icon: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 28,
    xl: 32,
    '2xl': 40,
    '3xl': 48,
  },
  
  header: {
    height: 56,
    heightLarge: 64,
  },
  
  tabBar: {
    height: 60,
  },
  
  minTouchTarget: 44,
  
  isSmallDevice: width < 375,
  isMediumDevice: width >= 375 && width < 414,
  isLargeDevice: width >= 414,
};