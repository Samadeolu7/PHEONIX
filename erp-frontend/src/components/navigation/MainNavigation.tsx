// src/components/navigation/MainNavigation.tsx
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  DollarSign,
  Users,
  Package,
  BarChart3,
  CreditCard,
  Settings,
  FileText,
  ShoppingCart,
  BookOpen,
  Landmark,
  Briefcase,
  Layers,
  Activity,
  PieChart,
  Building2,
} from 'lucide-react';
import { api } from '../../services/api';
import { BRAND } from '../../constants/brand';

interface Module {
  id: string;
  code: string;
  name: string;
  icon: string;
  color: string;
  pages: ModulePage[];
}

interface ModulePage {
  id: string;
  code: string;
  title: string;
  url_path: string;
  show_in_menu: boolean;
  sub_pages?: ModulePage[];
}

// Map backend icon strings / module codes to lucide icons
const MODULE_ICONS: Record<string, React.ElementType> = {
  financial: DollarSign,
  finance: DollarSign,
  accounting: BookOpen,
  accounts: Landmark,
  client: Users,
  clients: Users,
  'client-services': Users,
  hr: Briefcase,
  human: Briefcase,
  staff: Users,
  operations: Package,
  procurement: ShoppingCart,
  inventory: Package,
  treasury: CreditCard,
  'cash-management': CreditCard,
  loans: CreditCard,
  savings: PieChart,
  reports: BarChart3,
  sales: Activity,
  administration: Building2,
  admin: Settings,
  modules: Layers,
  settings: Settings,
  income: FileText,
  incomes: FileText,
};

function getModuleIcon(module: Module): React.ElementType {
  const key = (module.code || '').toLowerCase();
  const iconKey = (module.icon || '').toLowerCase();
  return (
    MODULE_ICONS[key] ||
    MODULE_ICONS[iconKey] ||
    Object.entries(MODULE_ICONS).find(([k]) => key.includes(k))?.[1] ||
    Layers
  );
}

const gold = BRAND.colors.gold;

interface MainNavigationProps {
  collapsed?: boolean;
}

export const MainNavigation: React.FC<MainNavigationProps> = ({ collapsed = false }) => {
  const [modules, setModules] = useState<Module[]>([]);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const location = useLocation();

  const fetchNavigation = async () => {
    try {
      const response = await api.get('/pages/modules/navigation/');
      const data = response.data?.data || response.data;
      if (Array.isArray(data)) setModules(data);
    } catch {
      setModules([]);
    }
  };

  useEffect(() => {
    fetchNavigation();
  }, []);

  const isPathActive = (path: string) => location.pathname.startsWith(path);
  const isModuleActive = (mod: Module) =>
    isPathActive(`/${mod.code}`) ||
    mod.pages.some(p => isPathActive(p.url_path));

  if (modules.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {modules.map(module => {
        const Icon = getModuleIcon(module);
        const active = isModuleActive(module);
        const expanded = expandedModule === module.code;
        const visiblePages = module.pages.filter(p => p.show_in_menu);

        return (
          <div key={module.id}>
            {/* Module toggle button */}
            <button
              onClick={() =>
                setExpandedModule(expanded ? null : module.code)
              }
              className="w-full flex items-center rounded-lg px-3 py-2.5 transition-all duration-150 group"
              style={{
                background: active ? 'rgba(183,151,88,0.15)' : 'transparent',
                borderLeft: active ? `3px solid ${gold}` : '3px solid transparent',
                justifyContent: collapsed ? 'center' : undefined,
              }}
              title={module.name}
            >
              <Icon
                className="flex-shrink-0 w-5 h-5 transition-colors"
                style={{ color: active ? gold : 'rgba(255,255,255,0.6)' }}
              />
              {!collapsed && (
                <>
                  <span
                    className="ml-3 flex-1 text-sm font-medium text-left whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{ color: active ? gold : 'rgba(255,255,255,0.78)' }}
                  >
                    {module.name}
                  </span>
                  {visiblePages.length > 0 && (
                    expanded
                      ? <ChevronDown className="flex-shrink-0 w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.4)' }} />
                      : <ChevronRight className="flex-shrink-0 w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.4)' }} />
                  )}
                </>
              )}
            </button>

            {/* Sub-pages — hidden when collapsed */}
            {!collapsed && expanded && visiblePages.length > 0 && (
              <div className="ml-5 mt-0.5 space-y-0.5">
                {visiblePages.map(page => {
                  const pageActive = isPathActive(page.url_path);
                  return (
                    <div key={page.id}>
                      <Link
                        to={page.url_path}
                        className="flex items-center rounded-lg pl-5 pr-3 py-2 transition-all duration-150"
                        style={{
                          background: pageActive ? 'rgba(183,151,88,0.12)' : 'transparent',
                          borderLeft: pageActive ? `2px solid ${gold}` : '2px solid rgba(255,255,255,0.1)',
                          color: pageActive ? gold : 'rgba(255,255,255,0.65)',
                        }}
                      >
                        <span className="text-xs font-medium truncate">{page.title}</span>
                      </Link>

                      {page.sub_pages && page.sub_pages.length > 0 && (
                        <div className="ml-4 mt-0.5 space-y-0.5">
                          {page.sub_pages.map(sub => {
                            const subActive = isPathActive(sub.url_path);
                            return (
                              <Link
                                key={sub.id}
                                to={sub.url_path}
                                className="flex items-center rounded-lg pl-4 pr-3 py-1.5 transition-all duration-150"
                                style={{
                                  color: subActive ? gold : 'rgba(255,255,255,0.5)',
                                }}
                              >
                                <span
                                  className="w-1 h-1 rounded-full mr-2 flex-shrink-0"
                                  style={{ background: subActive ? gold : 'rgba(255,255,255,0.3)' }}
                                />
                                <span className="text-xs truncate">{sub.title}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
