import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Settings,
  Eye,
  Save,
  Palette,
  Menu,
  BarChart3,
  Grid,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Copy,
  TrendingUp,
  Activity,
  AlignLeft,
  Table2,
  List,
  GitBranch,
  ChevronLeft,
  Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Dashboard, ModulePage, Widget } from '../types';
import { api } from '../services/api';
import { authService } from '../services/authService';
import { UserRole } from '../types/roles';
import SidebarWidgetConfigModal from '../components/dashboard/SidebarWidgetConfigModal';
import WidgetCanvasStyled from '../components/dashboard/WidgetCanvasStyled';
import RenderedSidebar from '../components/dashboard/RenderedSidebar';
import KPIWidgetConfig from '../components/dashboard/placeholder/KPIWidgetConfig';
import QuickLinksConfig from '../components/dashboard/placeholder/QuickLinksConfigStyled';
import ThemeCustomizationModal from '../components/dashboard/placeholder/ThemeCustomizationModalStyled';
import ChartWidgetConfig from '../components/dashboard/placeholder/ChartWidgetConfigStyled';
import { useDashboardTheme } from '../hooks/useDashboardTheme';
import { processWidgetConfig } from '../utils/dashboardUtils';
import { BRAND } from '../constants/brand';
import {
  featureRegistryToModulePages,
  fetchSystemLinksFlat,
  systemLinksToModulePages,
} from '../services/systemLinksService';
import { usePermission } from '../hooks/usePermissions'; // add to component imports

const C = BRAND.colors;

// ── Widget library definition ────────────────────────────────────────────────

const WIDGET_LIBRARY = [
  {
    type: 'sidebar',
    icon: Menu,
    label: 'Sidebar Navigation',
    desc: 'Hierarchical nav menu. Sections expand to reveal child links.',
    defaultSize: { w: 3, h: 12 },
    color: C.navyPrimary,
    tip: 'Drag to the left of your canvas. Configure once → reuse on all dashboards.',
  },
  {
    type: 'kpi',
    icon: TrendingUp,
    label: 'KPI Card',
    desc: 'Single headline number with optional trend arrow.',
    defaultSize: { w: 3, h: 3 },
    color: '#059669',
    tip: 'Connect to a live data source or set a static placeholder.',
  },
  {
    type: 'quick_links',
    icon: Grid,
    label: 'Quick Links',
    desc: 'Icon-grid of navigation shortcuts. Great for dashboards.',
    defaultSize: { w: 9, h: 4 },
    color: '#7c3aed',
    tip: 'Add up to 12 links. Grid or list layout options available.',
  },
  {
    type: 'bar_chart',
    icon: BarChart3,
    label: 'Bar Chart',
    desc: 'Vertical / horizontal bars. Compare categories at a glance.',
    defaultSize: { w: 6, h: 5 },
    color: '#2563eb',
    tip: 'Supports grouping and stacking.',
  },
  {
    type: 'line_chart',
    icon: Activity,
    label: 'Line Chart',
    desc: 'Trend over time. Ideal for financial or attendance data.',
    defaultSize: { w: 6, h: 5 },
    color: '#0891b2',
    tip: 'Multiple data series supported.',
  },
  {
    type: 'pie_chart',
    icon: BarChart3,
    label: 'Pie / Donut Chart',
    desc: 'Part-to-whole breakdown. Use donut variant for a modern look.',
    defaultSize: { w: 4, h: 5 },
    color: '#d97706',
    tip: 'Shows legend automatically when ≥ 3 segments.',
  },
  {
    type: 'area_chart',
    icon: Activity,
    label: 'Area Chart',
    desc: 'Like a line chart but with filled area — shows volume nicely.',
    defaultSize: { w: 6, h: 5 },
    color: '#0891b2',
    tip: 'Good for cumulative totals.',
  },
  {
    type: 'table',
    icon: Table2,
    label: 'Data Table',
    desc: 'Paginated rows with sortable columns. Pull live records.',
    defaultSize: { w: 9, h: 6 },
    color: '#475569',
    tip: 'Define column mappings in the config. Supports search.',
  },
  {
    type: 'stat_grid',
    icon: BarChart3,
    label: 'Stats Grid',
    desc: '2-column grid of small stat blocks. Compact summary view.',
    defaultSize: { w: 6, h: 4 },
    color: '#dc2626',
    tip: 'Good companion to a KPI card.',
  },
  {
    type: 'progress',
    icon: TrendingUp,
    label: 'Progress Bar',
    desc: 'Visual target tracker. Shows value vs goal as a filled bar.',
    defaultSize: { w: 4, h: 3 },
    color: '#059669',
    tip: 'Set a target value; the bar fills proportionally.',
  },
  {
    type: 'list',
    icon: List,
    label: 'List Widget',
    desc: 'Bulleted or numbered list. Pull dynamic items from an endpoint.',
    defaultSize: { w: 4, h: 4 },
    color: '#64748b',
    tip: 'Useful for recent activity feeds or announcements.',
  },
  {
    type: 'text',
    icon: AlignLeft,
    label: 'Text / HTML',
    desc: 'Rich text block. Paste HTML or write plain announcements.',
    defaultSize: { w: 6, h: 3 },
    color: '#374151',
    tip: 'Good for notices, instructions or embedded links.',
  },
];

// ── Dashboard templates ──────────────────────────────────────────────────────
interface RawWidget {
  type: string;
  title: string;
  layout: { x: number; y: number; w: number; h: number };
  config?: Record<string, any>;
}
interface DashboardTemplate {
  id: string;
  name: string;
  desc: string;
  badge?: string;
  icon: LucideIcon;
  color: string;
  rawWidgets: RawWidget[];
}

const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: 'blank',
    name: 'Blank Canvas',
    desc: 'Empty grid — place every widget exactly where you want it.',
    icon: Plus,
    color: '#64748b',
    rawWidgets: [],
  },
  {
    id: 'navigation-hub',
    name: 'Navigation Hub',
    desc: 'Sidebar + quick-link tiles + a KPI card and notice board. Clean starting point.',
    icon: Menu,
    color: C.navyPrimary,
    rawWidgets: [
      { type: 'sidebar', title: 'Navigation', layout: { x: 0, y: 0, w: 3, h: 10 } },
      { type: 'quick_links', title: 'Quick Links', layout: { x: 3, y: 0, w: 9, h: 4 } },
      { type: 'kpi', title: 'Key Metric', layout: { x: 3, y: 4, w: 3, h: 3 } },
      { type: 'text', title: 'Notice Board', layout: { x: 6, y: 4, w: 6, h: 3 } },
    ],
  },
  {
    id: 'finance-overview',
    name: 'Finance Overview',
    desc: 'KPI row + line / pie / area charts + a data table. Ready for financial dashboards.',
    icon: TrendingUp,
    color: '#059669',
    rawWidgets: [
      { type: 'sidebar', title: 'Finance Nav', layout: { x: 0, y: 0, w: 3, h: 17 } },
      { type: 'kpi', title: 'Total Revenue', layout: { x: 3, y: 0, w: 3, h: 3 } },
      { type: 'kpi', title: 'Total Expenses', layout: { x: 6, y: 0, w: 3, h: 3 } },
      { type: 'kpi', title: 'Net Profit', layout: { x: 9, y: 0, w: 3, h: 3 } },
      { type: 'line_chart', title: 'Revenue Trend', layout: { x: 3, y: 3, w: 5, h: 5 } },
      { type: 'pie_chart', title: 'Expense Breakdown', layout: { x: 8, y: 3, w: 4, h: 5 } },
      { type: 'area_chart', title: 'Cash Flow', layout: { x: 3, y: 8, w: 9, h: 4 } },
      { type: 'table', title: 'Recent Transactions', layout: { x: 3, y: 12, w: 9, h: 5 } },
    ],
  },
  {
    id: 'operations-hub',
    name: 'Operations Hub',
    desc: 'Quick links + stat grid + progress tracker + bar chart + list + table.',
    icon: BarChart3,
    color: '#7c3aed',
    rawWidgets: [
      { type: 'sidebar', title: 'Operations Nav', layout: { x: 0, y: 0, w: 3, h: 18 } },
      { type: 'quick_links', title: 'Quick Links', layout: { x: 3, y: 0, w: 9, h: 4 } },
      { type: 'stat_grid', title: 'Key Stats', layout: { x: 3, y: 4, w: 5, h: 4 } },
      { type: 'progress', title: 'Monthly Target', layout: { x: 8, y: 4, w: 4, h: 4 } },
      { type: 'bar_chart', title: 'Spend by Month', layout: { x: 3, y: 8, w: 5, h: 5 } },
      { type: 'list', title: 'Recent Updates', layout: { x: 8, y: 8, w: 4, h: 5 } },
      { type: 'table', title: 'Open Orders', layout: { x: 3, y: 13, w: 9, h: 5 } },
    ],
  },
  {
    id: 'full-showcase',
    name: 'Full Showcase',
    desc: 'Every widget type on one canvas — the best way to verify they all work correctly.',
    badge: '⭐ All 13 types',
    icon: LayoutDashboard,
    color: C.goldDark,
    rawWidgets: [
      { type: 'sidebar', title: 'Navigation', layout: { x: 0, y: 0, w: 3, h: 26 } },
      { type: 'quick_links', title: 'Quick Links', layout: { x: 3, y: 0, w: 9, h: 4 } },
      { type: 'kpi', title: 'KPI – Revenue', layout: { x: 3, y: 4, w: 3, h: 3 } },
      { type: 'kpi', title: 'KPI – Students', layout: { x: 6, y: 4, w: 3, h: 3 } },
      { type: 'progress', title: 'Monthly Target', layout: { x: 9, y: 4, w: 3, h: 3 } },
      { type: 'bar_chart', title: 'Bar Chart', layout: { x: 3, y: 7, w: 4, h: 5 } },
      { type: 'line_chart', title: 'Line Chart', layout: { x: 7, y: 7, w: 5, h: 5 } },
      { type: 'pie_chart', title: 'Pie Chart', layout: { x: 3, y: 12, w: 3, h: 5 } },
      { type: 'area_chart', title: 'Area Chart', layout: { x: 6, y: 12, w: 3, h: 5 } },
      { type: 'stat_grid', title: 'Stats Grid', layout: { x: 9, y: 12, w: 3, h: 5 } },
      { type: 'table', title: 'Data Table', layout: { x: 3, y: 17, w: 6, h: 5 } },
      { type: 'list', title: 'Item List', layout: { x: 9, y: 17, w: 3, h: 5 } },
      { type: 'navigation', title: 'Nav Grid', layout: { x: 3, y: 22, w: 6, h: 4 } },
      { type: 'text', title: 'Notice Board', layout: { x: 9, y: 22, w: 3, h: 4 } },
    ],
  },
];

// ── Component ────────────────────────────────────────────────────────────────

const DashboardBuilderStyled: React.FC = () => {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!!dashboardId && dashboardId !== 'new');
  const [error, setError] = useState<string | null>(null);
  const [hoveredWidget, setHoveredWidget] = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(
    !dashboardId || dashboardId === 'new'
  );

  const [dashboard, setDashboard] = useState<Dashboard>({
    id: '1',
    name: 'My Dashboard',
    slug: 'my-dashboard',
    widgets: [],
  });

  const [pages, setPages] = useState<ModulePage[]>([]);

  const [sidebarConfig, setSidebarConfig] = useState<any>({
    hierarchyLevels: 2,
    buttons: [],
    logoUrl: '',
    logoSize: 'medium',
  });

  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [currentPage, setCurrentPage] = useState<string>('/home');
  const [selectedWidgetIndex, setSelectedWidgetIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingAs, setIsSavingAs] = useState(false);
  const [showSidebarConfig, setShowSidebarConfig] = useState(false);
  const [showKPIConfig, setShowKPIConfig] = useState(false);
  const [showQuickLinksConfig, setShowQuickLinksConfig] = useState(false);
  const [showChartConfig, setShowChartConfig] = useState(false);
  const [showThemeConfig, setShowThemeConfig] = useState(false);

  const { applyTheme } = useDashboardTheme();

  const { hasPermission } = usePermission();

  useEffect(() => {
    loadPages();
  }, []);

  useEffect(() => {
    if (dashboardId && dashboardId !== 'new') {
      loadDashboard();
    } else {
      setLoading(false);
    }
  }, [dashboardId]);

  const loadPages = async () => {
    try {
      const storedUser = authService.getStoredUser();
      const userRole = (storedUser?.roles?.[0] ?? null) as UserRole | null;

      // ── 1. Feature registry is the primary source ────────────────────────
      // featureRegistryToModulePages returns 150+ entries, emoji-stripped,
      // permission-filtered, sorted A→Z.
      const registryPages = featureRegistryToModulePages({
        role: userRole,
        hasPermission: hasPermission,
      });

      // Build a set of paths already covered so we can deduplicate below
      const registryPaths = new Set(registryPages.map(p => p.url_path));

      // ── 2. API module-pages (backend-configured pages) ───────────────────
      let apiPages: typeof registryPages = [];
      try {
        const response = await api.get('/pages/module-pages/');
        const pagesData = response.results ?? response.data?.results ?? response.data ?? response;

        if (Array.isArray(pagesData)) {
          apiPages = pagesData
            .filter((page: any) => !registryPaths.has(page.url_path))
            .map((page: any) => ({
              id: String(page.id),
              code: page.code,
              title: page.title,
              description: page.description ?? page.title,
              url_path: page.url_path,
              page_type: page.page_type,
              page_config: page.page_config,
              icon: page.icon ?? 'file-text',
              category: page.module?.name ?? 'Other',
              module: page.module?.name ?? 'Other',
            }));
        }
      } catch {
        // API unavailable — registry alone is sufficient
      }

      // ── 3. Route-mapping fallback via systemLinksFlat ────────────────────
      // Catches any App.tsx routes not yet in the feature registry
      let fallbackPages: typeof registryPages = [];
      try {
        const systemLinks = await fetchSystemLinksFlat(userRole, hasPermission);
        fallbackPages = systemLinksToModulePages(
          systemLinks.filter(l => l.source === 'routes' && !registryPaths.has(l.url_path))
        ) as typeof registryPages;
      } catch {
        // Non-fatal
      }

      // ── 4. Merge + deduplicate on url_path ───────────────────────────────
      const seenPaths = new Set<string>();
      const merged: typeof registryPages = [];

      for (const page of [...registryPages, ...apiPages, ...fallbackPages]) {
        if (seenPaths.has(page.url_path)) continue;
        seenPaths.add(page.url_path);
        merged.push(page);
      }

      // ── 5. Final A→Z sort by title ───────────────────────────────────────
      merged.sort((a, b) => a.title.localeCompare(b.title));

      setPages(merged);
    } catch {
      setPages([]);
    }
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/dashboards/${dashboardId}/`);
      const data = response.data?.data || response.data;
      if (!data) throw new Error('No dashboard data received');

      if (data.widgets) {
        data.widgets = data.widgets.map((w: any) => ({
          ...w,
          instance_key: w.instance_key || w.instanceKey || `widget-${w.id}`,
          layout: w.layout || {
            x: w.layout_x || 0,
            y: w.layout_y || 0,
            w: w.layout_w || 4,
            h: w.layout_h || 4,
          },
        }));
      }

      setDashboard({
        id: data.id,
        name: data.name || 'My Dashboard',
        slug: data.slug || 'my-dashboard',
        widgets: data.widgets || [],
        theme: data.theme,
      });

      const sidebarWidget = data.widgets?.find((w: any) => w.widget_type === 'sidebar');
      if (sidebarWidget?.config) setSidebarConfig(sidebarWidget.config);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleDashboardNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    setDashboard({ ...dashboard, name, slug });
  };

  // ── Save (update existing) ─────────────────────────────────────────────────
  const handleSaveDashboard = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const dashboardData: any = {
        name: dashboard.name,
        slug: dashboard.slug,
        widgets: dashboard.widgets || [],
      };
      if (dashboard.theme && Object.keys(dashboard.theme).length > 0) {
        dashboardData.theme = dashboard.theme;
      }
      if (dashboardId) dashboardData.id = dashboard.id;

      const url = dashboardId ? `/dashboards/${dashboardId}/` : '/dashboards/';
      const response = dashboardId
        ? await api.put(url, dashboardData)
        : await api.post(url, dashboardData);

      const savedData = response.data?.data || response.data;
      if (savedData?.id && !dashboardId) {
        window.history.replaceState({}, '', `/dashboard/${savedData.id}/edit`);
        setDashboard({ ...dashboard, id: savedData.id });
      }
      if (dashboard.theme && savedData) {
        applyTheme(savedData.id || dashboard.id, dashboard.theme, sidebarConfig);
      }
    } catch (error: any) {
      let msg = 'Failed to save dashboard';
      if (error.response?.status === 500) msg = 'Server error. Check dashboard data.';
      else if (error.response?.status === 400)
        msg = error.response.data?.message || 'Invalid dashboard data.';
      else if (error.message) msg = error.message;
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Save As New ────────────────────────────────────────────────────────────
  const handleSaveAsNew = async () => {
    const newName = window.prompt('Name for the new dashboard:', `${dashboard.name} (Copy)`);
    if (!newName) return;

    setIsSavingAs(true);
    setError(null);
    try {
      const newSlug =
        newName
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim() + `-${Date.now()}`;

      const payload: any = {
        name: newName,
        slug: newSlug,
        widgets: dashboard.widgets || [],
      };
      if (dashboard.theme && Object.keys(dashboard.theme).length > 0) {
        payload.theme = dashboard.theme;
      }

      const response = await api.post('/dashboards/', payload);
      const saved = response.data?.data || response.data;
      if (saved?.id) {
        navigate(`/dashboard/${saved.id}/edit`);
      }
    } catch (error: any) {
      setError(error.message || 'Failed to save as new dashboard');
    } finally {
      setIsSavingAs(false);
    }
  };

  const handleAddWidget = (wDef: (typeof WIDGET_LIBRARY)[0]) => {
    const newWidget: Widget = {
      id: `widget-${Date.now()}`,
      instance_key: `widget-${Date.now()}`,
      widget_type: wDef.type,
      title: wDef.label,
      config: {},
      layout: {
        x: 0,
        y: dashboard.widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0),
        w: wDef.defaultSize.w,
        h: wDef.defaultSize.h,
      },
    };
    setDashboard({ ...dashboard, widgets: [...dashboard.widgets, newWidget] });
    setSelectedWidgetIndex(dashboard.widgets.length);
  };

  const handleUpdateWidget = (index: number, updatedWidget: Widget) => {
    const newWidgets = [...dashboard.widgets];
    newWidgets[index] = updatedWidget;
    setDashboard({ ...dashboard, widgets: newWidgets });
  };

  const handleDeleteWidget = (index: number) => {
    const newWidgets = dashboard.widgets.filter((_, i) => i !== index);
    setDashboard({ ...dashboard, widgets: newWidgets });
    if (selectedWidgetIndex === index) setSelectedWidgetIndex(null);
  };

  const handleSaveSidebarConfig = (config: any) => {
    const processed = processWidgetConfig(config, pages);
    setSidebarConfig(processed);
    if (
      selectedWidgetIndex !== null &&
      dashboard.widgets[selectedWidgetIndex]?.widget_type === 'sidebar'
    ) {
      handleUpdateWidget(selectedWidgetIndex, {
        ...dashboard.widgets[selectedWidgetIndex],
        config: processed,
      });
    }
  };

  const handleNavigate = (url: string) => setCurrentPage(url);

  const applyTemplate = (tpl: DashboardTemplate) => {
    const now = Date.now();
    const widgets: Widget[] = tpl.rawWidgets.map((w, i) => ({
      id: `tpl-${w.type}-${i}-${now}`,
      instance_key: `tpl-${w.type}-${i}-${now}`,
      widget_type: w.type,
      title: w.title,
      config: w.config || {},
      layout: w.layout,
    }));
    setDashboard(prev => ({ ...prev, widgets }));
    setShowTemplatePicker(false);
  };

  const openWidgetConfig = () => {
    if (selectedWidgetIndex === null) return;
    const type = dashboard.widgets[selectedWidgetIndex].widget_type;
    if (type === 'sidebar') setShowSidebarConfig(true);
    else if (type === 'kpi') setShowKPIConfig(true);
    else if (type === 'quick_links') setShowQuickLinksConfig(true);
    else if (
      ['chart', 'bar_chart', 'line_chart', 'pie_chart', 'donut_chart', 'area_chart'].includes(type)
    )
      setShowChartConfig(true);
    else setShowKPIConfig(true); // generic fallback
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: C.offWhite,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <RefreshCw
            style={{
              width: '2rem',
              height: '2rem',
              color: C.gold,
              margin: '0 auto 1rem',
              animation: 'spin 1s linear infinite',
            }}
          />
          <p style={{ color: C.textSecondary }}>Loading dashboard...</p>
        </div>
        <style
          dangerouslySetInnerHTML={{
            __html: '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
          }}
        />
      </div>
    );
  }

  const selectedWidget =
    selectedWidgetIndex !== null ? dashboard.widgets[selectedWidgetIndex] : null;

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.offWhite,
        position: 'relative',
      }}
    >
      {/* ── Template Picker Overlay ───────────────────────────────────────── */}
      {showTemplatePicker && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(10,15,35,0.93)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '88vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 40px 100px rgba(0,0,0,0.5)',
            }}
          >
            {/* Modal header */}
            <div
              style={{
                background: `linear-gradient(135deg,${C.navyDark},${C.navyPrimary})`,
                padding: '22px 28px',
                borderBottom: `3px solid ${C.gold}`,
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: `2px solid ${C.gold}`,
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <img
                  src={BRAND.logoUrl}
                  alt={BRAND.shortName}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ color: 'white', fontSize: '19px', fontWeight: 700, margin: 0 }}>
                  Choose a Starting Template
                </h2>
                <p style={{ color: `${C.gold}bb`, fontSize: '12px', margin: 0 }}>
                  Pick a layout to get started quickly, or begin with a blank canvas
                </p>
              </div>
              {dashboardId && dashboardId !== 'new' && (
                <button
                  onClick={() => setShowTemplatePicker(false)}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: 'rgba(255,255,255,0.6)',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Skip
                </button>
              )}
            </div>

            {/* Template card grid */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px',
              }}
            >
              {DASHBOARD_TEMPLATES.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => applyTemplate(tpl)}
                  style={{
                    textAlign: 'left',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: 'white',
                    padding: 0,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = tpl.color;
                    e.currentTarget.style.boxShadow = `0 8px 28px ${tpl.color}30`;
                    e.currentTarget.style.transform = 'translateY(-3px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Coloured header strip */}
                  <div
                    style={{
                      background: tpl.color,
                      padding: '16px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <tpl.icon style={{ width: '17px', height: '17px', color: 'white' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: 'white',
                          margin: 0,
                          lineHeight: 1.3,
                        }}
                      >
                        {tpl.name}
                      </p>
                      {tpl.badge && (
                        <span
                          style={{
                            fontSize: '9px',
                            background: 'rgba(255,255,255,0.25)',
                            color: 'white',
                            padding: '1px 7px',
                            borderRadius: '9px',
                            fontWeight: 700,
                          }}
                        >
                          {tpl.badge}
                        </span>
                      )}
                    </div>
                    {tpl.rawWidgets.length > 0 && (
                      <span
                        style={{
                          fontSize: '10px',
                          background: 'rgba(255,255,255,0.2)',
                          color: 'white',
                          padding: '3px 8px',
                          borderRadius: '9px',
                          flexShrink: 0,
                        }}
                      >
                        {tpl.rawWidgets.length} widgets
                      </span>
                    )}
                  </div>
                  {/* Body */}
                  <div style={{ padding: '14px 16px' }}>
                    <p
                      style={{
                        fontSize: '11px',
                        color: '#64748b',
                        lineHeight: 1.55,
                        margin: '0 0 10px',
                      }}
                    >
                      {tpl.desc}
                    </p>
                    {tpl.rawWidgets.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {[...new Set(tpl.rawWidgets.map(w => w.type))].map(type => {
                          const lib = WIDGET_LIBRARY.find(l => l.type === type);
                          return (
                            <span
                              key={type}
                              style={{
                                fontSize: '9px',
                                background: `${lib?.color || '#64748b'}12`,
                                color: lib?.color || '#64748b',
                                border: `1px solid ${lib?.color || '#64748b'}25`,
                                padding: '2px 7px',
                                borderRadius: '5px',
                                fontWeight: 700,
                              }}
                            >
                              {(lib?.label || type).replace(' Chart', '').replace(' Widget', '')}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p
                        style={{
                          fontSize: '11px',
                          color: '#94a3b8',
                          fontStyle: 'italic',
                          margin: 0,
                        }}
                      >
                        Empty — full creative control
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Top Toolbar ──────────────────────────────────────────────────── */}
      <div
        style={{
          background: C.navyPrimary,
          borderBottom: `3px solid ${C.gold}`,
          padding: '0 1.25rem',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
        }}
      >
        {/* Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '6px 8px',
              border: 'none',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.7)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            title="Back to dashboard"
          >
            <ChevronLeft style={{ width: '14px', height: '14px' }} />
          </button>

          <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.15)' }} />

          {/* Logo */}
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              border: `2px solid ${C.gold}`,
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <img
              src={BRAND.logoUrl}
              alt={BRAND.shortName}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>

          <input
            type="text"
            value={dashboard.name}
            onChange={e => handleDashboardNameChange(e.target.value)}
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: '#fff',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: '4px 8px',
              borderRadius: '6px',
              minWidth: '200px',
            }}
            placeholder="Dashboard Name"
            onFocus={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onBlur={e => (e.currentTarget.style.background = 'transparent')}
          />

          <span
            style={{
              padding: '3px 10px',
              background: mode === 'edit' ? `${C.gold}25` : 'rgba(5,150,105,0.25)',
              color: mode === 'edit' ? C.gold : '#34d399',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '20px',
              border: `1px solid ${mode === 'edit' ? C.gold + '60' : 'rgba(52,211,153,0.5)'}`,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {mode === 'edit' ? 'Builder' : 'Preview'}
          </span>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}
            style={{
              padding: '7px 14px',
              border: `1px solid rgba(255,255,255,0.2)`,
              borderRadius: '7px',
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.85)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          >
            <Eye style={{ width: '14px', height: '14px' }} />
            {mode === 'edit' ? 'Preview' : 'Edit'}
          </button>

          <button
            onClick={() => setShowThemeConfig(true)}
            style={{
              padding: '7px 10px',
              border: `1px solid rgba(232,184,0,0.3)`,
              borderRadius: '7px',
              background: 'rgba(232,184,0,0.08)',
              color: C.gold,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '13px',
              fontWeight: 500,
            }}
            title="Theme Settings"
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,184,0,0.16)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(232,184,0,0.08)')}
          >
            <Palette style={{ width: '14px', height: '14px' }} />
            Theme
          </button>

          {/* Save as new */}
          {dashboardId && (
            <button
              onClick={handleSaveAsNew}
              disabled={isSavingAs}
              style={{
                padding: '7px 14px',
                border: `1px solid rgba(255,255,255,0.2)`,
                borderRadius: '7px',
                background: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.85)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: isSavingAs ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                opacity: isSavingAs ? 0.6 : 1,
              }}
              title="Duplicate this dashboard with a new name"
              onMouseEnter={e =>
                !isSavingAs && (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')
              }
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            >
              <Copy style={{ width: '14px', height: '14px' }} />
              Save as New
            </button>
          )}

          <button
            onClick={handleSaveDashboard}
            disabled={isSaving}
            style={{
              padding: '7px 18px',
              background: isSaving
                ? '#6b7280'
                : `linear-gradient(135deg,${C.navyLight},${C.navyDark})`,
              color: 'white',
              border: `1px solid ${C.gold}60`,
              borderRadius: '7px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
            onMouseEnter={e =>
              !isSaving && (e.currentTarget.style.boxShadow = `0 4px 16px rgba(232,184,0,0.25)`)
            }
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)')}
          >
            {isSaving ? (
              <>
                <div
                  style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid white',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                Saving...
              </>
            ) : (
              <>
                <Save style={{ width: '14px', height: '14px', color: C.gold }} />
                Save Dashboard
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            borderBottom: '1px solid #fecaca',
            padding: '10px 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <p style={{ color: '#b91c1c', fontSize: '14px' }}>{error}</p>
          <button
            onClick={() => setError(null)}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#dc2626',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Main Area ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {mode === 'preview' ? (
          <>
            <div style={{ width: '256px', flexShrink: 0 }}>
              <RenderedSidebar
                config={sidebarConfig}
                onNavigate={handleNavigate}
                onEdit={() => setMode('edit')}
              />
            </div>
            <div style={{ flex: 1, padding: '2rem', overflow: 'auto', background: C.offWhite }}>
              <div
                style={{
                  background: 'white',
                  borderRadius: '10px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  padding: '2rem',
                  minHeight: '100%',
                }}
              >
                <h2
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: C.navyPrimary,
                    marginBottom: '8px',
                  }}
                >
                  {dashboard.name}
                </h2>
                <p style={{ color: C.textSecondary, fontSize: '14px', marginBottom: '2rem' }}>
                  Preview page: <strong>{currentPage}</strong>
                </p>
                <p style={{ color: '#9ca3af', fontSize: '13px' }}>
                  Full widget rendering is shown on the live dashboard view.
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* ── Left Panel: Widget Library ─────────────────────────── */}
            <div
              style={{
                width: '220px',
                background: 'white',
                borderRight: `1px solid #e2e8f0`,
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  padding: '14px 16px 10px',
                  borderBottom: '1px solid #e2e8f0',
                  background: C.navyDark,
                }}
              >
                <h3
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: C.gold,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    margin: 0,
                  }}
                >
                  Widget Library
                </h3>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                  Click to add to canvas
                </p>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                {WIDGET_LIBRARY.map(wDef => (
                  <div key={wDef.type} style={{ position: 'relative', marginBottom: '6px' }}>
                    <button
                      onClick={() => handleAddWidget(wDef)}
                      onMouseEnter={() => setHoveredWidget(wDef.type)}
                      onMouseLeave={() => setHoveredWidget(null)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1.5px dashed ${hoveredWidget === wDef.type ? wDef.color : '#d1d5db'}`,
                        borderRadius: '8px',
                        background: hoveredWidget === wDef.type ? `${wDef.color}08` : 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '3px',
                        }}
                      >
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '5px',
                            background: `${wDef.color}15`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <wDef.icon style={{ width: '13px', height: '13px', color: wDef.color }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                          {wDef.label}
                        </span>
                        <Plus
                          style={{
                            width: '12px',
                            height: '12px',
                            color: wDef.color,
                            marginLeft: 'auto',
                            flexShrink: 0,
                            opacity: hoveredWidget === wDef.type ? 1 : 0,
                          }}
                        />
                      </div>
                      <p style={{ fontSize: '10px', color: '#94a3b8', lineHeight: 1.4, margin: 0 }}>
                        {wDef.desc}
                      </p>
                    </button>
                    {hoveredWidget === wDef.type && (
                      <div
                        style={{
                          position: 'absolute',
                          left: '100%',
                          top: 0,
                          zIndex: 100,
                          width: '200px',
                          background: C.navyDark,
                          color: 'white',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                          border: `1px solid ${C.gold}40`,
                          marginLeft: '8px',
                          pointerEvents: 'none',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '6px',
                          }}
                        >
                          <Info
                            style={{ width: '12px', height: '12px', color: C.gold, flexShrink: 0 }}
                          />
                          <span style={{ fontSize: '11px', fontWeight: 700, color: C.gold }}>
                            Tip
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: '11px',
                            color: 'rgba(255,255,255,0.75)',
                            lineHeight: 1.5,
                            margin: 0,
                          }}
                        >
                          {wDef.tip}
                        </p>
                        <p
                          style={{
                            fontSize: '10px',
                            color: 'rgba(255,255,255,0.35)',
                            marginTop: '6px',
                          }}
                        >
                          Default: {wDef.defaultSize.w}×{wDef.defaultSize.h} grid units
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Center: Canvas ──────────────────────────────────────── */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: '#f1f5f9',
              }}
            >
              <div
                style={{
                  padding: '10px 16px',
                  background: 'white',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0,
                }}
              >
                <div>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', margin: 0 }}>
                    <LayoutDashboard
                      style={{
                        width: '12px',
                        height: '12px',
                        display: 'inline',
                        marginRight: '4px',
                      }}
                    />
                    12-column responsive grid
                  </p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '1px 0 0' }}>
                    Drag &amp; resize widgets. What you see here matches the live dashboard.
                  </p>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {dashboard.widgets.length} widget{dashboard.widgets.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
                <WidgetCanvasStyled
                  widgets={dashboard.widgets}
                  onUpdateWidget={handleUpdateWidget}
                  onDeleteWidget={handleDeleteWidget}
                  onSelectWidget={setSelectedWidgetIndex}
                  selectedIndex={selectedWidgetIndex}
                />
              </div>
            </div>

            {/* ── Right Panel: Properties ─────────────────────────────── */}
            <div
              style={{
                width: '240px',
                background: 'white',
                borderLeft: `1px solid #e2e8f0`,
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  padding: '14px 16px 10px',
                  borderBottom: '1px solid #e2e8f0',
                  background: C.navyDark,
                }}
              >
                <h3
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: C.gold,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    margin: 0,
                  }}
                >
                  Properties
                </h3>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {selectedWidget ? (
                  <div>
                    {/* Type badge */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '16px',
                        padding: '10px 12px',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '7px',
                          background: `${WIDGET_LIBRARY.find(w => w.type === selectedWidget.widget_type)?.color || C.navyPrimary}15`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {(() => {
                          const IconComp =
                            WIDGET_LIBRARY.find(w => w.type === selectedWidget.widget_type)?.icon ||
                            LayoutDashboard;
                          const iconColor =
                            WIDGET_LIBRARY.find(w => w.type === selectedWidget.widget_type)
                              ?.color || C.navyPrimary;
                          return (
                            <IconComp style={{ width: '16px', height: '16px', color: iconColor }} />
                          );
                        })()}
                      </div>
                      <div>
                        <p
                          style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b', margin: 0 }}
                        >
                          {WIDGET_LIBRARY.find(w => w.type === selectedWidget.widget_type)?.label ||
                            selectedWidget.widget_type}
                        </p>
                        <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>
                          {selectedWidget.layout.w}×{selectedWidget.layout.h} grid units
                        </p>
                      </div>
                    </div>

                    <label
                      style={{
                        display: 'block',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: C.navyPrimary,
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Widget Title
                    </label>
                    <input
                      type="text"
                      value={selectedWidget.title}
                      onChange={e =>
                        handleUpdateWidget(selectedWidgetIndex!, {
                          ...selectedWidget,
                          title: e.target.value,
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: `1.5px solid #e2e8f0`,
                        borderRadius: '7px',
                        fontSize: '13px',
                        color: C.textPrimary,
                        marginBottom: '16px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = C.gold)}
                      onBlur={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                    />

                    <button
                      onClick={openWidgetConfig}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: `linear-gradient(135deg,${C.navyLight},${C.navyPrimary})`,
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        marginBottom: '8px',
                        boxShadow: '0 2px 8px rgba(26,40,82,0.25)',
                      }}
                      onMouseEnter={e =>
                        (e.currentTarget.style.boxShadow = `0 4px 14px rgba(232,184,0,0.2)`)
                      }
                      onMouseLeave={e =>
                        (e.currentTarget.style.boxShadow = '0 2px 8px rgba(26,40,82,0.25)')
                      }
                    >
                      <Settings style={{ width: '14px', height: '14px', color: C.gold }} />
                      Configure Widget
                    </button>

                    <button
                      onClick={() => {
                        handleDeleteWidget(selectedWidgetIndex!);
                      }}
                      style={{
                        width: '100%',
                        padding: '9px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        fontWeight: 500,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fef2f2')}
                    >
                      Delete Widget
                    </button>

                    {/* Tip */}
                    {WIDGET_LIBRARY.find(w => w.type === selectedWidget.widget_type) && (
                      <div
                        style={{
                          marginTop: '16px',
                          padding: '10px 12px',
                          background: `${C.gold}10`,
                          borderRadius: '8px',
                          border: `1px solid ${C.gold}30`,
                        }}
                      >
                        <p
                          style={{
                            fontSize: '10px',
                            color: C.goldDark,
                            fontWeight: 600,
                            marginBottom: '4px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          Tip
                        </p>
                        <p
                          style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.5, margin: 0 }}
                        >
                          {WIDGET_LIBRARY.find(w => w.type === selectedWidget.widget_type)?.tip}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0' }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: '#f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 12px',
                      }}
                    >
                      <GitBranch style={{ width: '22px', height: '22px', opacity: 0.4 }} />
                    </div>
                    <p
                      style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        marginBottom: '6px',
                        color: '#64748b',
                      }}
                    >
                      No widget selected
                    </p>
                    <p style={{ fontSize: '11px' }}>
                      Click a widget on the canvas to edit its properties
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Config Modals ─────────────────────────────────────────────────── */}
      <SidebarWidgetConfigModal
        isOpen={showSidebarConfig}
        onClose={() => setShowSidebarConfig(false)}
        onSave={handleSaveSidebarConfig}
        pages={pages}
        initialConfig={sidebarConfig}
      />

      <KPIWidgetConfig
        isOpen={showKPIConfig}
        onClose={() => setShowKPIConfig(false)}
        onSave={config => {
          if (selectedWidgetIndex !== null)
            handleUpdateWidget(selectedWidgetIndex, {
              ...dashboard.widgets[selectedWidgetIndex],
              config,
            });
          setShowKPIConfig(false);
        }}
        initialConfig={selectedWidget?.config || {}}
      />

      <QuickLinksConfig
        isOpen={showQuickLinksConfig}
        onClose={() => setShowQuickLinksConfig(false)}
        onSave={config => {
          const processed = processWidgetConfig(config, pages);
          if (selectedWidgetIndex !== null)
            handleUpdateWidget(selectedWidgetIndex, {
              ...dashboard.widgets[selectedWidgetIndex],
              config: processed,
            });
          setShowQuickLinksConfig(false);
        }}
        pages={pages}
        initialConfig={selectedWidget?.config || {}}
      />

      <ChartWidgetConfig
        isOpen={showChartConfig}
        onClose={() => setShowChartConfig(false)}
        onSave={config => {
          const processed = processWidgetConfig(config, pages);
          if (selectedWidgetIndex !== null)
            handleUpdateWidget(selectedWidgetIndex, {
              ...dashboard.widgets[selectedWidgetIndex],
              config: processed,
            });
          setShowChartConfig(false);
        }}
        initialConfig={selectedWidget?.config || {}}
      />

      <ThemeCustomizationModal
        isOpen={showThemeConfig}
        onClose={() => setShowThemeConfig(false)}
        onSave={theme => {
          setDashboard({ ...dashboard, theme });
          setShowThemeConfig(false);
        }}
        initialTheme={dashboard?.theme}
      />

      <style
        dangerouslySetInnerHTML={{
          __html: '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
        }}
      />
    </div>
  );
};

export default DashboardBuilderStyled;
