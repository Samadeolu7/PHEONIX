// src/pages/DashboardPage.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Responsive, WidthProvider } from 'react-grid-layout';
import WidgetRenderer from '../components/widgets/WidgetRenderer';
import { api } from '../services/api';
import { AlertTriangle, Settings, LayoutDashboard } from 'lucide-react';
import RenderedSidebar from '../components/dashboard/RenderedSidebar';
import { BRAND } from '../constants/brand';
import { useDashboardTheme } from '../hooks/useDashboardTheme';
import { processSidebarButtons } from '../utils/dashboardUtils';
import { useAuth } from '../contexts/AuthContext';
import { collectionSheetService } from '../services/collectionSheetService';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const DashboardPage: React.FC = () => {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const navigate = useNavigate();
  const { applyTheme, theme: activeTheme } = useDashboardTheme();
  const { selectedRole } = useAuth();

  // Feature #14: warn CO about unreconciled prior-day collection sheets
  const [unreconciledSheetWarning, setUnreconciledSheetWarning] = useState<string | null>(null);

  useEffect(() => {
    if (selectedRole !== 'credit_officer') return;
    const today = new Date().toISOString().split('T')[0];
    collectionSheetService
      .getUnreconciledPriorSheets(today)
      .then(sheets => {
        if (sheets.length > 0) {
          const oldest = sheets[sheets.length - 1];
          setUnreconciledSheetWarning(
            `You have ${sheets.length} unreconciled collection sheet(s) from a previous date ` +
            `(earliest: ${oldest.collection_date}). Please ask your supervisor to reconcile ` +
            `before you can post new collections.`
          );
        }
      })
      .catch(() => {
        // Silent — don't block the dashboard if check fails
      });
  }, [selectedRole]);

  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modulesData, setModulesData] = useState<any[]>([]);
  const [formsData, setFormsData] = useState<any[]>([]);
  const [sidebarWidget, setSidebarWidget] = useState<any>(null);
  const [contentWidgets, setContentWidgets] = useState<any[]>([]);
  const [processedSidebarConfig, setProcessedSidebarConfig] = useState<any>(null);

  useEffect(() => {
    loadDashboard();
  }, [dashboardId]);

  // Process sidebar configuration when both dashboard and modules data are available
  useEffect(() => {
    if (sidebarWidget && modulesData.length > 0) {
      const config = sidebarWidget.config || {};
      if (config.buttons && config.buttons.length > 0) {
        const processedButtons = processSidebarButtons(config.buttons, modulesData);
        setProcessedSidebarConfig({
          ...config,
          buttons: processedButtons,
        });
      } else {
        setProcessedSidebarConfig(config);
      }
    }
  }, [sidebarWidget, modulesData]);

  // ── Memoised layout values — MUST stay before any early returns (Rules of Hooks) ──
  const sidebarW = useMemo(
    () => (sidebarWidget ? (sidebarWidget.layout?.w ?? 3) : 0),
    [sidebarWidget]
  );

  const layouts = useMemo(
    () => ({
      lg: contentWidgets.map((w: any) => {
        const minW = w.layout.minW || 2;
        const minH = w.layout.minH || 2;
        // Clamp w/h so they are never less than their minimums
        const itemW = Math.max(minW, w.layout.w ?? 4);
        const itemH = Math.max(minH, w.layout.h ?? 4);
        const entry: Record<string, any> = {
          i: w.instanceKey,
          x: Math.max(0, (w.layout.x ?? 0) - sidebarW),
          y: w.layout.y ?? 0,
          w: itemW,
          h: itemH,
          minW,
          minH,
        };
        // Only pass maxW/maxH when they are actual finite numbers
        if (typeof w.layout.maxW === 'number' && isFinite(w.layout.maxW)) {
          entry.maxW = w.layout.maxW;
        }
        if (typeof w.layout.maxH === 'number' && isFinite(w.layout.maxH)) {
          entry.maxH = w.layout.maxH;
        }
        return entry;
      }),
    }),
    [contentWidgets, sidebarW]
  );

  // ── Helper: normalise widget list and push all data into state ───────────
  const _applyDashboardData = (data: any) => {
    if (!data) return;
    if (data.widgets) {
      data.widgets = data.widgets.map((w: any) => ({
        ...w,
        instanceKey: w.instance_key || w.instanceKey || `widget-${w.id}`,
        layout: w.layout || {
          x: w.layout_x || 0,
          y: w.layout_y || 0,
          w: w.layout_w || 4,
          h: w.layout_h || 4,
          minW: w.layout_min_w || 2,
          minH: w.layout_min_h || 2,
        },
      }));
      const sidebar = data.widgets.find((w: any) => w.widget_type === 'sidebar');
      const content = data.widgets.filter((w: any) => w.widget_type !== 'sidebar');
      setSidebarWidget(sidebar);
      setContentWidgets(content);
    }
    setDashboard(data);
    if (data.theme) {
      const sidebarConfig =
        data.widgets?.find((w: any) => w.widget_type === 'sidebar')?.config || {};
      applyTheme(data.id, data.theme, sidebarConfig);
    }
  };

  const loadDashboard = async () => {
    const CACHE_KEY = `phoenix_dash_${dashboardId}`;

    // ── 1. Show cached data instantly (zero-flicker back-navigation) ─────────
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { dashData, modules, forms } = JSON.parse(cached);
        _applyDashboardData(dashData);
        setModulesData(modules || []);
        setFormsData(forms || []);
        setLoading(false); // display cached content immediately — no spinner
      } else {
        setLoading(true);
      }
    } catch {
      setLoading(true);
    }

    setError(null);

    // ── 2. Fetch dashboard + modules + forms all at once ─────────────────────
    const endpoint = dashboardId ? `/dashboards/${dashboardId}/` : '/dashboards/default/';
    try {
      const [dashRes, modulesRes, formsRes] = await Promise.all([
        api.get(endpoint),
        api.get('/pages/modules/navigation/').catch(() => ({ data: [] })),
        api.get('/automations/forms/').catch(() => ({ data: [] })),
      ]);

      const dashData = dashRes.data?.data || dashRes.data;
      if (!dashData) throw new Error('No dashboard data received');

      const modules = modulesRes.data?.data || modulesRes.data || [];
      const forms = formsRes.data?.data || formsRes.data?.results || [];

      // Cache for instant re-render on next visit
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ dashData, modules, forms }));
      } catch {
        /* storage quota exceeded – ignore */
      }

      _applyDashboardData(dashData);
      setModulesData(modules);
      setFormsData(forms);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = () => {
    navigate(`/dashboard/${dashboard.id}/edit`);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: '#f0f2f5' }}>
        <style>{`
          @keyframes ph-shimmer {
            0%,100% { opacity: 1 }
            50%      { opacity: 0.4 }
          }
        `}</style>

        {/* Sidebar skeleton — navy branded */}
        <div
          style={{
            width: '256px',
            flexShrink: 0,
            background: 'linear-gradient(180deg,#060e30 0%,#0a1857 100%)',
            padding: '20px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {/* Logo area */}
          <div
            style={{
              height: '60px',
              borderRadius: '10px',
              background: 'rgba(201,168,76,0.25)',
              animation: 'ph-shimmer 1.5s ease-in-out infinite',
            }}
          />
          {/* Nav items */}
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              style={{
                height: '40px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.08)',
                animation: `ph-shimmer 1.5s ${i * 0.07}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>

        {/* Main area skeleton */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Header skeleton */}
          <div
            style={{
              height: '60px',
              flexShrink: 0,
              background: 'linear-gradient(135deg,#060e30,#0a1857)',
              borderBottom: '3px solid #c9a84c',
            }}
          />

          {/* Widget grid skeleton */}
          <div
            style={{
              flex: 1,
              padding: '16px 8px',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridAutoRows: '160px',
              gap: '12px',
              alignContent: 'start',
            }}
          >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div
                key={i}
                style={{
                  borderRadius: '12px',
                  background: i % 4 === 0 ? '#dde3ec' : '#e8ecf2',
                  gridRow: i === 0 ? 'span 1' : undefined,
                  animation: `ph-shimmer 1.5s ${i * 0.06}s ease-in-out infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '32px' }}>
        <div
          style={{
            maxWidth: '896px',
            margin: '0 auto',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '24px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#7f1d1d', marginBottom: '8px' }}>
            Error
          </h2>
          <p style={{ color: '#b91c1c' }}>{error || 'Dashboard not found'}</p>
          <button
            onClick={loadDashboard}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              backgroundColor: '#dc2626',
              color: 'white',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseOver={e => (e.currentTarget.style.backgroundColor = '#b91c1c')}
            onMouseOut={e => (e.currentTarget.style.backgroundColor = '#dc2626')}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const appliedTheme = activeTheme || dashboard?.theme;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        backgroundColor: appliedTheme?.backgroundColor || '#f9fafb',
        color: appliedTheme?.textColor || '#1f2937',
        fontFamily: appliedTheme?.fontFamily || 'inherit',
      }}
    >
      {/* Sidebar (if configured) */}
      {sidebarWidget && (
        <div style={{ width: '256px', flexShrink: 0 }}>
          <RenderedSidebar
            config={processedSidebarConfig || sidebarWidget.config || {}}
            onNavigate={url => navigate(url)}
            onSwitch={() => navigate('/dashboard/select')}
            onEdit={() => navigate(`/dashboard/${dashboard.id}/edit`)}
          />
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header — Krystar Trust branding */}
        <header
          style={{
            background: appliedTheme?.primaryColor
              ? appliedTheme.primaryColor
              : `linear-gradient(135deg,${BRAND.colors.navyDark},${BRAND.colors.navyPrimary})`,
            borderBottom: `3px solid ${BRAND.colors.gold}`,
            padding: '0 24px',
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
          }}
        >
          {/* Left: logo + name (truncated) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                border: `2px solid ${BRAND.colors.gold}`,
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <img
                src={BRAND.logoUrl}
                alt="Krystar Trust"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  fontSize: '17px',
                  fontWeight: 700,
                  color: '#fff',
                  margin: 0,
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {dashboard.name}
              </h1>
              {dashboard.description && (
                <p style={{ color: `${BRAND.colors.gold}cc`, fontSize: '11px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dashboard.description}
                </p>
              )}
            </div>
          </div>
          {/* Right: Switch Dashboards + Edit icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={() => navigate('/dashboard/select')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                color: BRAND.colors.navyDark,
                background: BRAND.colors.gold,
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '13px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                whiteSpace: 'nowrap',
              }}
              onMouseOver={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseOut={e => (e.currentTarget.style.opacity = '1')}
              title="Switch dashboard"
            >
              <LayoutDashboard style={{ width: '14px', height: '14px' }} />
              <span>Dashboards</span>
            </button>
            <button
              onClick={handleEditClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                color: 'rgba(255,255,255,0.7)',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#fff'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
              title="Edit layout"
            >
              <Settings style={{ width: '15px', height: '15px' }} />
            </button>
          </div>
        </header>

        {/* Feature #14: EOD unreconciled collection sheet warning for credit officers */}
        {unreconciledSheetWarning && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              margin: '12px 16px 0',
              padding: '12px 16px',
              background: '#fffbeb',
              border: '1px solid #f59e0b',
              borderLeft: '4px solid #d97706',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#92400e',
            }}
          >
            <AlertTriangle style={{ width: '16px', height: '16px', flexShrink: 0, marginTop: '1px', color: '#d97706' }} />
            <div>
              <strong style={{ display: 'block', marginBottom: '2px' }}>Action Required: Unreconciled Collection Sheet</strong>
              {unreconciledSheetWarning}
              <button
                onClick={() => navigate('/cash-management/collection-sheets')}
                style={{
                  display: 'inline-block',
                  marginTop: '6px',
                  padding: '4px 10px',
                  background: '#d97706',
                  color: '#fff',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                View Sheets
              </button>
            </div>
          </div>
        )}

        {/* Dashboard Grid */}
        <div style={{ flex: 1, padding: '16px 8px' }}>
          <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12 - sidebarW, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={80}
            isDraggable={false}
            isResizable={false}
            margin={[12, 12]}
            compactType={null}
            preventCollision
          >
            {contentWidgets.map((widget: any) => (
              <div key={widget.instanceKey} style={{ overflow: 'hidden' }}>
                <WidgetRenderer widget={widget} modulesData={modulesData} formsData={formsData} />
              </div>
            ))}
          </ResponsiveGridLayout>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
