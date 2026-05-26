import {
  Home,
  FileText,
  Grid,
  Layers,
  BarChart3,
  Link2,
  LayoutDashboard,
  Menu,
  DollarSign,
  GraduationCap,
  Package,
  Settings,
  Clock,
  CheckSquare,
  ArrowLeftRight,
  Inbox,
  List,
  GitBranch,
  CheckCircle,
  TrendingUp,
  ShoppingCart,
  Users,
  Warehouse,
  Calculator,
  BarChart2,
} from 'lucide-react';

export interface ModulePage {
  id: string;
  code: string;
  title: string;
  description?: string;
  icon: string;
  page_type: string;
  url_path: string;
  module?: string;
  category?: string;    // sub-category from featureRegistry e.g. "Invoicing", "HR & Payroll"
  isNew?: boolean;
  isEnhanced?: boolean;
  page_config?: {
    report_code?: string;
    form_schema_id?: number;
    [key: string]: any;
  };
}

export interface HierarchyButton {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  url?: string;
  frontendUrl?: string;
  children?: HierarchyButton[];
}

export interface Widget {
  id: string;
  instance_key: string;
  widget_type: string;
  title: string;
  icon?: string;
  config: any;
  layout: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface Dashboard {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  theme?: DashboardTheme;
  widgets: Widget[];
}

export interface DashboardTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  widgetBorderRadius: number;
  widgetShadow: string;
}

export const ICON_OPTIONS = [
  // Original set
  { name: 'home', component: Home },
  { name: 'file-text', component: FileText },
  { name: 'grid', component: Grid },
  { name: 'layers', component: Layers },
  { name: 'bar-chart', component: BarChart3 },
  { name: 'link', component: Link2 },
  { name: 'layout', component: LayoutDashboard },
  { name: 'layout-dashboard', component: LayoutDashboard },
  { name: 'menu', component: Menu },
  // Finance & admin
  { name: 'dollar-sign', component: DollarSign },
  { name: 'settings', component: Settings },
  { name: 'calculator', component: Calculator },
  { name: 'bar-chart-2', component: BarChart2 },
  // People & education
  { name: 'graduation-cap', component: GraduationCap },
  { name: 'users', component: Users },
  // Operations
  { name: 'package', component: Package },
  { name: 'shopping-cart', component: ShoppingCart },
  { name: 'warehouse', component: Warehouse },
  // Status & time
  { name: 'clock', component: Clock },
  { name: 'check-square', component: CheckSquare },
  { name: 'check-circle', component: CheckCircle },
  { name: 'trending-up', component: TrendingUp },
  // Misc navigation
  { name: 'arrow-left-right', component: ArrowLeftRight },
  { name: 'inbox', component: Inbox },
  { name: 'list', component: List },
  { name: 'git-branch', component: GitBranch },
];

// Export toast types
export * from './toast';

// Export procurement types
export * from './procurement';

// Export inventory types
export * from './inventory';
