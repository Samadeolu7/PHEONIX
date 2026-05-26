// Permission-aware navigation component that hides unauthorized menu items
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Users,
  Shield,
  Building,
  Building2,
  Lock,
  FileText,
  FilePlus,
  FileStack,
  BookOpen,
  Plus,
  TrendingUp,
  List,
  CreditCard,
  Clock,
  FileX,
  Wallet,
  Receipt,
  UserPlus,
  Tags,
  Award,
  BarChart3,
  DollarSign,
  Percent,
  Calculator,
  Scale,
  FileBarChart,
  LineChart,
  Package,
  ShoppingCart,
  ShoppingBag,
  Truck,
  PackageCheck,
  FileSearch,
  Warehouse,
  ArrowRightLeft,
  MapPin,
  Settings,
  UserCheck,
  Calendar,
  Zap,
  Layers,
  Ticket,
  HardDrive,
  GitBranch,
  Play,
  Send,
  Layout,
  CheckCircle,
  type LucideIcon,
} from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../contexts/AuthContext';
import {
  FunctionalCategory,
  PageDefinition,
  FUNCTIONAL_CATEGORIES,
  getPagesByCategory,
} from '../../types/permissions';
import {
  getNavigationStructure,
  getRoutesByCategory,
  RouteMapping,
  canUserAccessRoute,
} from '../../utils/routeMapping';

// Icon mapping for dynamic icon loading - only includes icons actually used in routes
const ICON_MAP: Record<string, LucideIcon> = {
  Users,
  Shield,
  Building,
  Building2,
  Lock,
  FileText,
  FilePlus,
  FileStack,
  BookOpen,
  Plus,
  TrendingUp,
  List,
  CreditCard,
  Clock,
  FileX,
  Wallet,
  Receipt,
  UserPlus,
  Tags,
  Award,
  BarChart3,
  DollarSign,
  Percent,
  Calculator,
  Scale,
  FileBarChart,
  LineChart,
  Package,
  ShoppingCart,
  ShoppingBag,
  Truck,
  PackageCheck,
  FileSearch,
  Warehouse,
  ArrowRightLeft,
  MapPin,
  Settings,
  UserCheck,
  Calendar,
  Zap,
  Layers,
  Ticket,
  HardDrive,
  GitBranch,
  Play,
  Send,
  Layout,
  CheckCircle,
};

interface NavigationItemProps {
  route: RouteMapping;
  isActive?: boolean;
  onClick?: () => void;
}

const NavigationItem: React.FC<NavigationItemProps> = ({ route, isActive, onClick }) => {
  const IconComponent = route.icon ? ICON_MAP[route.icon] : null;

  return (
    <Link
      to={route.path}
      onClick={onClick}
      className={`
        flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors
        ${
          isActive
            ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-500'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
        }
      `}
    >
      {IconComponent && <IconComponent className="h-4 w-4 mr-3 flex-shrink-0" />}
      <span className="truncate">{route.title}</span>
      {route.isNew && (
        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          New
        </span>
      )}
      {route.isEnhanced && (
        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Enhanced
        </span>
      )}
    </Link>
  );
};

interface CategorySectionProps {
  category: FunctionalCategory;
  routes: RouteMapping[];
  isExpanded: boolean;
  onToggle: () => void;
  currentPath: string;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  routes,
  isExpanded,
  onToggle,
  currentPath,
}) => {
  if (routes.length === 0) return null;

  const hasActivePage = routes.some(
    route => route.path === currentPath || currentPath.startsWith(route.path + '/')
  );

  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className={`
          w-full flex items-center justify-between px-3 py-2 text-left text-sm font-semibold rounded-md transition-colors
          ${hasActivePage ? 'text-blue-700 bg-blue-50' : 'text-gray-900 hover:bg-gray-100'}
        `}
      >
        <span>{category}</span>
        <span className="text-xs text-gray-500 ml-2">({routes.length})</span>
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {isExpanded && (
        <div className="mt-2 ml-4 space-y-1">
          {routes.map((route, index) => (
            <NavigationItem
              key={`${route.path}-${index}`}
              route={route}
              isActive={route.path === currentPath || currentPath.startsWith(route.path + '/')}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface PermissionAwareNavigationProps {
  className?: string;
  onNavigate?: () => void;
}

export const PermissionAwareNavigation: React.FC<PermissionAwareNavigationProps> = ({
  className = '',
  onNavigate,
}) => {
  const location = useLocation();
  const { user } = useAuth();

  const [expandedCategories, setExpandedCategories] = React.useState<Set<FunctionalCategory>>(
    new Set(['Financial Operations', 'Client Management']) // Default expanded categories
  );

  // Get navigation structure based on user role using new route mapping system
  const navigationStructure = getNavigationStructure(user?.role || null);
  const accessibleCategories = Object.keys(navigationStructure) as FunctionalCategory[];

  const toggleCategory = (category: FunctionalCategory) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Auto-expand category if current page is in it
  React.useEffect(() => {
    Object.entries(navigationStructure).forEach(([category, routes]) => {
      const hasCurrentRoute = routes.some(
        route => route.path === location.pathname || location.pathname.startsWith(route.path + '/')
      );
      if (hasCurrentRoute) {
        setExpandedCategories(prev => new Set([...prev, category as FunctionalCategory]));
      }
    });
  }, [location.pathname, navigationStructure]);

  if (accessibleCategories.length === 0) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-center text-gray-500">
          <p className="text-sm">No accessible pages found.</p>
          <p className="text-xs mt-1">Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <nav className={`p-4 ${className}`}>
      <div className="space-y-2">
        {accessibleCategories.map(category => {
          const categoryRoutes = navigationStructure[category] || [];
          return (
            <CategorySection
              key={category}
              category={category}
              routes={categoryRoutes}
              isExpanded={expandedCategories.has(category)}
              onToggle={() => toggleCategory(category)}
              currentPath={location.pathname}
            />
          );
        })}
      </div>
    </nav>
  );
};

// Simplified navigation for mobile or compact views
export const CompactPermissionAwareNavigation: React.FC<PermissionAwareNavigationProps> = ({
  className = '',
  onNavigate,
}) => {
  const location = useLocation();
  const { user } = useAuth();

  // Get all accessible routes for the user using new route mapping system
  const navigationStructure = getNavigationStructure(user?.role || null);
  const accessibleRoutes = Object.values(navigationStructure).flat();

  if (accessibleRoutes.length === 0) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-center text-gray-500">
          <p className="text-sm">No accessible pages found.</p>
        </div>
      </div>
    );
  }

  return (
    <nav className={`p-4 ${className}`}>
      <div className="space-y-1">
        {accessibleRoutes.map((route, index) => (
          <NavigationItem
            key={`${route.path}-${index}`}
            route={route}
            isActive={
              route.path === location.pathname || location.pathname.startsWith(route.path + '/')
            }
            onClick={onNavigate}
          />
        ))}
      </div>
    </nav>
  );
};
