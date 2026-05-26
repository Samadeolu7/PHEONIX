import React from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import {
  LayoutDashboard,
  Grip,
  Trash2,
  Menu,
  BarChart3,
  Grid,
  FileText,
  TrendingUp,
  AlignLeft,
  Table2,
  Activity,
  List,
} from 'lucide-react';
import { Widget } from '../../types';
import { BRAND } from '../../constants/brand';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);
const C = BRAND.colors;

const WIDGET_ICONS: Record<string, any> = {
  sidebar: Menu,
  kpi: TrendingUp,
  quick_links: Grid,
  chart: BarChart3,
  bar_chart: BarChart3,
  line_chart: Activity,
  pie_chart: BarChart3,
  donut_chart: BarChart3,
  area_chart: Activity,
  table: Table2,
  navigation: Grid,
  list: List,
  progress: TrendingUp,
  stat_grid: BarChart3,
  text: AlignLeft,
};

const WIDGET_COLORS: Record<string, string> = {
  sidebar: C.navyPrimary,
  kpi: '#059669',
  quick_links: '#7c3aed',
  chart: '#2563eb',
  bar_chart: '#2563eb',
  line_chart: '#0891b2',
  pie_chart: '#d97706',
  donut_chart: '#d97706',
  area_chart: '#0891b2',
  table: '#475569',
  navigation: '#7c3aed',
  list: '#64748b',
  progress: '#059669',
  stat_grid: '#dc2626',
  text: '#374151',
};

const WIDGET_LABELS: Record<string, string> = {
  sidebar: 'Sidebar Navigation',
  kpi: 'KPI Card',
  quick_links: 'Quick Links',
  chart: 'Chart',
  bar_chart: 'Bar Chart',
  line_chart: 'Line Chart',
  pie_chart: 'Pie Chart',
  donut_chart: 'Donut Chart',
  area_chart: 'Area Chart',
  table: 'Data Table',
  navigation: 'Navigation',
  list: 'List',
  progress: 'Progress Bar',
  stat_grid: 'Stats Grid',
  text: 'Text / HTML',
};

interface WidgetCanvasProps {
  widgets: Widget[];
  onUpdateWidget: (index: number, widget: Widget) => void;
  onDeleteWidget: (index: number) => void;
  selectedIndex: number | null;
  onSelectWidget: (index: number | null) => void;
}

const WidgetCanvasStyled: React.FC<WidgetCanvasProps> = ({
  widgets,
  onUpdateWidget,
  onDeleteWidget,
  selectedIndex,
  onSelectWidget,
}) => {
  if (widgets.length === 0) {
    return (
      <div
        style={{
          height: '400px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          color: '#9ca3af',
          background: '#f8fafc',
          borderRadius: '12px',
          border: '2px dashed #d1d5db',
        }}
      >
        <LayoutDashboard
          style={{ width: '48px', height: '48px', marginBottom: '12px', opacity: 0.35 }}
        />
        <p style={{ fontSize: '16px', fontWeight: 500, marginBottom: '6px' }}>Canvas is empty</p>
        <p style={{ fontSize: '13px' }}>Click any widget from the panel on the left to add it</p>
      </div>
    );
  }

  const layouts = {
    lg: widgets.map(w => ({
      i: w.instance_key || w.id,
      x: w.layout.x,
      y: w.layout.y,
      w: w.layout.w,
      h: w.layout.h,
      minW: 2,
      minH: 2,
    })),
  };

  const handleLayoutChange = (currentLayout: any[]) => {
    currentLayout.forEach(item => {
      const idx = widgets.findIndex(w => (w.instance_key || w.id) === item.i);
      if (idx === -1) return;
      const w = widgets[idx];
      if (
        w.layout.x !== item.x ||
        w.layout.y !== item.y ||
        w.layout.w !== item.w ||
        w.layout.h !== item.h
      ) {
        onUpdateWidget(idx, {
          ...w,
          layout: { ...w.layout, x: item.x, y: item.y, w: item.w, h: item.h },
        });
      }
    });
  };

  return (
    <div
      style={{ background: '#f1f5f9', borderRadius: '10px', padding: '8px', minHeight: '400px' }}
    >
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={80}
        isDraggable
        isResizable
        onLayoutChange={handleLayoutChange}
        margin={[12, 12]}
        compactType={null}
        preventCollision
      >
        {widgets.map((widget, index) => {
          const IconComp = WIDGET_ICONS[widget.widget_type] || FileText;
          const color = WIDGET_COLORS[widget.widget_type] || C.navyPrimary;
          const isSelected = selectedIndex === index;

          return (
            <div
              key={widget.instance_key || widget.id}
              onClick={() => onSelectWidget(index)}
              style={{
                background: 'white',
                borderRadius: '10px',
                border: isSelected ? `2px solid ${C.gold}` : '2px solid #e2e8f0',
                boxShadow: isSelected
                  ? `0 0 0 3px ${C.gold}30, 0 8px 24px rgba(0,0,0,0.12)`
                  : '0 2px 8px rgba(0,0,0,0.06)',
                overflow: 'hidden',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Widget header bar */}
              <div
                style={{
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: isSelected ? `${color}10` : '#f8fafc',
                  borderBottom: `1px solid ${isSelected ? color + '30' : '#e2e8f0'}`,
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                  <Grip
                    style={{
                      width: '12px',
                      height: '12px',
                      color: '#94a3b8',
                      flexShrink: 0,
                      cursor: 'grab',
                    }}
                  />
                  <div
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '5px',
                      background: `${color}18`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <IconComp style={{ width: '12px', height: '12px', color }} />
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#334155',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {widget.title || WIDGET_LABELS[widget.widget_type]}
                  </span>
                </div>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onDeleteWidget(index);
                  }}
                  style={{
                    padding: '3px',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'transparent',
                    color: '#ef4444',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  title="Delete widget"
                >
                  <Trash2 style={{ width: '12px', height: '12px' }} />
                </button>
              </div>

              {/* Widget body preview */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px',
                  overflow: 'hidden',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <IconComp
                    style={{
                      width: '28px',
                      height: '28px',
                      color: `${color}50`,
                      margin: '0 auto 6px',
                    }}
                  />
                  <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
                    {WIDGET_LABELS[widget.widget_type]}
                  </p>
                  <p style={{ fontSize: '10px', color: '#cbd5e1', marginTop: '2px' }}>
                    {widget.layout.w}×{widget.layout.h} units
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </div>
  );
};

export default WidgetCanvasStyled;
