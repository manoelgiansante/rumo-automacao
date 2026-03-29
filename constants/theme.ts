import { Platform } from 'react-native';

export const Colors = {
  // Primary - vibrant agricultural greens (Ponta Agro inspired)
  primary: '#2D8F47',
  primaryLight: '#5BB96A',
  primaryDark: '#1A4D3E',
  primaryMedium: '#3EA857',
  primarySubtle: '#EFF8F2',
  primaryMuted: '#D6F0DC',

  // Secondary - golden amber (Ponta Agro accent)
  secondary: '#F5A623',
  secondaryLight: '#FFCC4D',
  secondaryDark: '#C78400',

  // Surfaces
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceSubtle: '#F2F4F7',

  // Status
  error: '#DC2626',
  errorLight: '#FEE2E2',
  errorSubtle: '#FEF2F2',
  warning: '#E67E22',
  warningLight: '#FDEBD0',
  warningSubtle: '#FFF8F0',
  success: '#059669',
  successLight: '#D1FAE5',
  successSubtle: '#ECFDF5',
  info: '#2563EB',
  infoLight: '#BFDBFE',
  infoSubtle: '#EFF6FF',

  // Text
  text: '#1A2332',
  textSecondary: '#5A6B7D',
  textTertiary: '#8E9BAA',
  textLight: '#FFFFFF',

  // Borders
  border: '#E0E5EC',
  borderLight: '#F2F4F7',
  borderDark: '#C4CDD8',

  // Misc
  disabled: '#C4CDD8',
  placeholder: '#8E9BAA',
  overlay: 'rgba(26, 35, 50, 0.6)',
  overlayLight: 'rgba(26, 35, 50, 0.04)',

  // Gender
  female: '#EC4899',
  femaleLight: '#FCE7F3',
  male: '#3B82F6',
  maleLight: '#DBEAFE',
  purple: '#8B5CF6',
  purpleLight: '#EDE9FE',

  // Shimmer
  shimmer: '#E0E5EC',
  shimmerHighlight: '#F2F4F7',

  // Premium card accent backgrounds
  cardGreen: '#EBF7EE',
  cardBlue: '#EFF6FF',
  cardAmber: '#FFF9E6',
  cardRose: '#FFF1F2',
  cardPurple: '#F5F3FF',

  // Notification badge
  badge: '#EF4444',
  badgeText: '#FFFFFF',
};

export const Gradients = {
  primary: ['#1A4D3E', '#2D8F47', '#3EA857'],
  primaryDark: ['#0F3329', '#1A4D3E'],
  primarySoft: ['#2D8F47', '#5BB96A'],
  header: ['#0F3329', '#1A4D3E', '#2D8F47'],
  headerEmerald: ['#135352', '#1A6B5A', '#2D8F47'],
  secondary: ['#C78400', '#F5A623'],
  success: ['#059669', '#34D399'],
  info: ['#1D4ED8', '#3B82F6'],
  warning: ['#C2610C', '#E67E22'],
  error: ['#B91C1C', '#EF4444'],
  sunset: ['#E67E22', '#F5A623', '#FFCC4D'],
  ocean: ['#1E3A8A', '#2563EB', '#60A5FA'],
  forest: ['#1A4D3E', '#2D8F47', '#66B34A'],
  card: ['#FFFFFF', '#F9FAFB'],
  dark: ['#1A2332', '#2A3545'],
  premium: ['#1A2332', '#2A3545', '#3D4F63'],
};

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  smmd: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const FontSize = {
  xxs: 9,
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  xxxl: 28,
  title: 34,
  hero: 42,
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};

export const FontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
};

export const LineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
  loose: 1.8,
};

export const BorderRadius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
  full: 9999,
};

export const Shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 12,
  },
  colored: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  }),
  soft: {
    shadowColor: '#2D8F47',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  card: {
    shadowColor: '#1A2332',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
};

export const Animation = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: {
    damping: 15,
    stiffness: 150,
    mass: 0.8,
  },
  springBouncy: {
    damping: 10,
    stiffness: 120,
    mass: 0.6,
  },
  springSmooth: {
    damping: 20,
    stiffness: 200,
    mass: 1,
  },
  easing: {
    enter: [0.0, 0.0, 0.2, 1.0] as const,
    exit: [0.4, 0.0, 1.0, 1.0] as const,
    standard: [0.4, 0.0, 0.2, 1.0] as const,
  },
};

export const IconSize = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 28,
  xl: 36,
  xxl: 48,
};

export const Typography = {
  h1: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.title,
    lineHeight: FontSize.title * LineHeight.tight,
    letterSpacing: -0.5,
    color: Colors.text,
  } as const,
  h2: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xxxl,
    lineHeight: FontSize.xxxl * LineHeight.tight,
    letterSpacing: -0.3,
    color: Colors.text,
  } as const,
  h3: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.xxl,
    lineHeight: FontSize.xxl * LineHeight.normal,
    color: Colors.text,
  } as const,
  h4: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.xl,
    lineHeight: FontSize.xl * LineHeight.normal,
    color: Colors.text,
  } as const,
  body: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    lineHeight: FontSize.md * LineHeight.relaxed,
    color: Colors.text,
  } as const,
  bodySmall: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * LineHeight.relaxed,
    color: Colors.textSecondary,
  } as const,
  caption: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.xs,
    lineHeight: FontSize.xs * LineHeight.normal,
    color: Colors.textTertiary,
  } as const,
  overline: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.xxs,
    lineHeight: FontSize.xxs * LineHeight.normal,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
  } as const,
  button: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.md,
    letterSpacing: 0.2,
  } as const,
  buttonSmall: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.sm,
    letterSpacing: 0.2,
  } as const,
};

/**
 * Paleta de cores consistente para series de dados em graficos.
 * Inspirada em paletas de dashboards profissionais (Stripe, Linear).
 */
export const ChartColors = {
  series: [
    '#2D8F47', // primary green
    '#2563EB', // blue
    '#F5A623', // golden amber
    '#8B5CF6', // purple
    '#EC4899', // pink
    '#135352', // dark teal
    '#E67E22', // orange
    '#6366F1', // indigo
  ],
  positive: '#2D8F47',
  negative: '#DC2626',
  neutral: '#5A6B7D',
  grid: '#F2F4F7',
  gridDark: '#E0E5EC',
  tooltip: '#1A2332',
  tooltipText: '#FFFFFF',
  area: {
    green: ['rgba(45,143,71,0.18)', 'rgba(45,143,71,0.03)'],
    blue: ['rgba(37,99,235,0.18)', 'rgba(37,99,235,0.03)'],
    red: ['rgba(220,38,38,0.18)', 'rgba(220,38,38,0.03)'],
  },
};
