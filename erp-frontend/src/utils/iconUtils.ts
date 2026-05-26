// Icon utility for resolving string icon names to Lucide React components
import {
  // Financial icons
  DollarSign,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  Clock,
  CreditCard,
  Wallet,
  PiggyBank,
  Receipt,

  // User and student icons
  Users,
  UserPlus,
  User,
  GraduationCap,
  BookOpen,
  Award,

  // Operations icons
  FileText,
  Package,
  Truck,
  Warehouse,
  ShoppingCart,
  Clipboard,
  CheckCircle,
  CheckCircle2,
  CheckSquare,

  // System and admin icons
  Server,
  Database,
  Activity,
  Shield,
  Settings,
  Zap,
  BarChart3,
  PieChart,

  // General icons
  AlertCircle,
  Info,
  RefreshCw,
  Eye,
  EyeOff,
  Grid,
  List,
  Calendar,
  MapPin,
  Phone,
  Mail,

  // Navigation icons
  Home,
  Menu,
  Search,
  Bell,

  // Action icons
  Plus,
  Minus,
  Edit,
  Trash2,
  Download,
  Upload,
  Save,

  // Status icons
  Check,
  X,
  Loader,

  // Directional icons
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,

  // Specialty icons
  RotateCcw,
  Filter,
  SortAsc,
  SortDesc,
  type LucideIcon,
} from 'lucide-react';

// Icon registry mapping string names to components
const iconRegistry: Record<string, LucideIcon> = {
  // Financial icons
  DollarSign: DollarSign,
  TrendingUp: TrendingUp,
  TrendingDown: TrendingDown,
  Target: Target,
  AlertTriangle: AlertTriangle,
  Clock: Clock,
  CreditCard: CreditCard,
  Wallet: Wallet,
  PiggyBank: PiggyBank,
  Receipt: Receipt,

  // User and student icons
  Users: Users,
  UserPlus: UserPlus,
  User: User,
  GraduationCap: GraduationCap,
  BookOpen: BookOpen,
  Award: Award,

  // Operations icons
  FileText: FileText,
  Package: Package,
  Truck: Truck,
  Warehouse: Warehouse,
  ShoppingCart: ShoppingCart,
  Clipboard: Clipboard,
  CheckCircle: CheckCircle,
  CheckCircle2: CheckCircle2,
  CheckSquare: CheckSquare,

  // System and admin icons
  Server: Server,
  Database: Database,
  Activity: Activity,
  Shield: Shield,
  Settings: Settings,
  Zap: Zap,
  BarChart3: BarChart3,
  PieChart: PieChart,

  // General icons
  AlertCircle: AlertCircle,
  Info: Info,
  RefreshCw: RefreshCw,
  Eye: Eye,
  EyeOff: EyeOff,
  Grid: Grid,
  List: List,
  Calendar: Calendar,
  MapPin: MapPin,
  Phone: Phone,
  Mail: Mail,

  // Navigation icons
  Home: Home,
  Menu: Menu,
  Search: Search,
  Bell: Bell,

  // Action icons
  Plus: Plus,
  Minus: Minus,
  Edit: Edit,
  Trash2: Trash2,
  Download: Download,
  Upload: Upload,
  Save: Save,

  // Status icons
  Check: Check,
  X: X,
  Loader: Loader,

  // Directional icons
  ArrowUp: ArrowUp,
  ArrowDown: ArrowDown,
  ArrowLeft: ArrowLeft,
  ArrowRight: ArrowRight,
  ChevronUp: ChevronUp,
  ChevronDown: ChevronDown,
  ChevronLeft: ChevronLeft,
  ChevronRight: ChevronRight,

  // Specialty icons
  RotateCcw: RotateCcw,
  Filter: Filter,
  SortAsc: SortAsc,
  SortDesc: SortDesc,
};

// Get icon component by string name
export const getIcon = (iconName: string | LucideIcon): LucideIcon => {
  // If it's already a component, return it
  if (typeof iconName === 'function') {
    return iconName;
  }

  // Look up in registry
  const IconComponent = iconRegistry[iconName];

  // Return the component or a fallback
  return IconComponent || AlertCircle;
};

// Get all available icon names
export const getAvailableIcons = (): string[] => {
  return Object.keys(iconRegistry);
};

// Check if an icon exists
export const hasIcon = (iconName: string): boolean => {
  return iconName in iconRegistry;
};

// Get icons by category
export const getIconsByCategory = () => {
  return {
    financial: [
      'DollarSign',
      'TrendingUp',
      'TrendingDown',
      'Target',
      'AlertTriangle',
      'Clock',
      'CreditCard',
      'Wallet',
      'PiggyBank',
      'Receipt',
    ],
    users: ['Users', 'UserPlus', 'User', 'GraduationCap', 'BookOpen', 'Award'],
    operations: [
      'FileText',
      'Package',
      'Truck',
      'Warehouse',
      'ShoppingCart',
      'Clipboard',
      'CheckCircle',
      'CheckCircle2',
      'CheckSquare',
    ],
    system: [
      'Server',
      'Database',
      'Activity',
      'Shield',
      'Settings',
      'Zap',
      'BarChart3',
      'PieChart',
    ],
    general: [
      'AlertCircle',
      'Info',
      'RefreshCw',
      'Eye',
      'EyeOff',
      'Grid',
      'List',
      'Calendar',
      'MapPin',
      'Phone',
      'Mail',
    ],
    navigation: ['Home', 'Menu', 'Search', 'Bell'],
    actions: ['Plus', 'Minus', 'Edit', 'Trash2', 'Download', 'Upload', 'Save'],
    status: ['Check', 'X', 'Loader'],
    directional: [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ChevronUp',
      'ChevronDown',
      'ChevronLeft',
      'ChevronRight',
    ],
    specialty: ['RotateCcw', 'Filter', 'SortAsc', 'SortDesc'],
  };
};

// Get suggested icons for different stat types
export const getSuggestedIcons = (statType: string, category?: string): string[] => {
  const suggestions: Record<string, string[]> = {
    // By stat type
    revenue: ['DollarSign', 'TrendingUp', 'PiggyBank'],
    receivables: ['Receipt', 'Clock', 'AlertTriangle'],
    students: ['Users', 'GraduationCap', 'UserPlus'],
    enrollment: ['UserPlus', 'BookOpen', 'Award'],
    inventory: ['Package', 'Warehouse', 'Truck'],
    procurement: ['ShoppingCart', 'FileText', 'Clipboard'],
    system: ['Server', 'Database', 'Activity'],
    performance: ['TrendingUp', 'Target', 'Zap'],
    efficiency: ['Zap', 'Target', 'CheckCircle'],
    completion: ['CheckCircle', 'CheckSquare', 'Award'],
    health: ['Shield', 'Activity', 'TrendingUp'],
    alerts: ['AlertTriangle', 'AlertCircle', 'Bell'],

    // By category
    'Financial Operations': ['DollarSign', 'TrendingUp', 'Receipt', 'Target'],
    'Student Management': ['Users', 'GraduationCap', 'UserPlus', 'BookOpen'],
    Operations: ['Package', 'Truck', 'Warehouse', 'Clipboard'],
    'System Administration': ['Server', 'Database', 'Shield', 'Settings'],
    'User Management': ['Users', 'User', 'UserPlus', 'Shield'],
  };

  // Get suggestions by stat type first, then by category
  const typeKey = statType.toLowerCase();
  const typeSuggestions = suggestions[typeKey] || [];

  const categorySuggestions = category ? suggestions[category] || [] : [];

  // Combine and deduplicate
  const combined = [...new Set([...typeSuggestions, ...categorySuggestions])];

  // Return top 5 suggestions or fallback to general icons
  return combined.length > 0
    ? combined.slice(0, 5)
    : ['BarChart3', 'Activity', 'TrendingUp', 'Target', 'Info'];
};

// Register a new icon (for extensibility)
export const registerIcon = (name: string, icon: LucideIcon): void => {
  iconRegistry[name] = icon;
};

// Unregister an icon
export const unregisterIcon = (name: string): void => {
  delete iconRegistry[name];
};

export default {
  getIcon,
  getAvailableIcons,
  hasIcon,
  getIconsByCategory,
  getSuggestedIcons,
  registerIcon,
  unregisterIcon,
};
