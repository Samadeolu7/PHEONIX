// src/types/theme.ts

export interface DashboardTheme {
  // Basic Colors
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;

  // Component-Specific Colors
  headerBackgroundColor?: string;
  headerTextColor?: string;
  sidebarBackgroundColor?: string;
  sidebarTextColor?: string;
  sidebarActiveColor?: string;
  widgetBackgroundColor?: string;
  buttonPrimaryColor?: string;
  buttonSecondaryColor?: string;
  linkColor?: string;
  linkHoverColor?: string;
  borderColor?: string;

  // Typography
  fontFamily: string;
  headingFontFamily?: string;
  fontSizeBase?: number; // in px
  fontSizeHeading?: number;
  fontSizeSmall?: number;
  fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
  lineHeight?: number;

  // Layout & Spacing
  widgetBorderRadius: number;
  buttonBorderRadius?: number;
  inputBorderRadius?: number;
  containerMaxWidth?: string;
  spacing?: 'compact' | 'normal' | 'spacious'; // affects padding/margins
  gridGap?: number;

  // Effects
  widgetShadow: string;
  buttonShadow?: string;
  hoverEffect?: 'lift' | 'glow' | 'none';
  transitionSpeed?: 'fast' | 'normal' | 'slow';

  // Advanced Styling
  buttonStyle?: 'rounded' | 'square' | 'pill';
  inputStyle?: 'outlined' | 'filled' | 'underlined';
  cardStyle?: 'elevated' | 'outlined' | 'flat';

  // Custom CSS
  customCSS?: string;

  // Metadata
  name?: string;
  description?: string;
  author?: string;
  createdAt?: string;
  tags?: string[];
}

export interface ThemePreset extends DashboardTheme {
  id: string;
  thumbnail?: string;
  isPublic?: boolean;
  downloads?: number;
  rating?: number;
}
