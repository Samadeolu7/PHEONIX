// src/components/widgets/WidgetLibrary.tsx - Updated with all widgets
import React, { useState, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  Loader,
  ChevronRight,
  Users,
  DollarSign,
  Clock,
  Package,
  FileText,
  FolderOpen,
  Layout as LayoutIcon,
  CheckCircle,
  Calendar,
  ShoppingCart,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  MapPin,
  Video,
  Image as ImageIcon,
  List,
  Grid,
  ExternalLink,
} from 'lucide-react';
// Load charting libs lazily via ChartWidget wrapper to avoid pulling recharts into main bundles
// The concrete recharts imports live inside `ChartWidgetImpl.tsx` and will be loaded only when needed.

// Lazy-load chart implementations so `recharts` is not imported into main bundle
const LazyBarChartInner = React.lazy(() => import('./BarChartWidgetImpl'));
const LazyLineChartInner = React.lazy(() => import('./LineChartWidgetImpl'));
const LazyPieChartInner = React.lazy(() => import('./PieChartWidgetImpl'));
const LazyAreaChartInner = React.lazy(() => import('./AreaChartWidgetImpl'));

// ============================================================================
// TYPES
// ============================================================================

interface BaseWidgetProps {
  widget: any;
  data?: any;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onClick?: () => void;
  children: React.ReactNode;
}

interface WidgetConfig {
  format?: 'currency' | 'percentage' | 'number';
  color?: string;
  icon?: string;
  show_trend?: boolean;
  static_value?: any;
  colors?: string[];
  show_legend?: boolean;
  show_grid?: boolean;
  x_axis?: string;
  y_axis?: string;
  columns?: Array<{ label: string; field: string; format?: string }>;
  pagination?: boolean;
  page_size?: number;
  links?: Array<{
    label: string;
    description?: string;
    url?: string;
    icon?: string;
    color?: string;
  }>;
  layout?: 'grid' | 'horizontal' | 'vertical';
  show_icons?: boolean;
  show_descriptions?: boolean;
  items?: any[];
  show_icon?: boolean;
  clickable?: boolean;
  content?: string;
  target?: number;
  show_percentage?: boolean;
  item_template?: any;
}

// ============================================================================
// ICON MAPPER
// ============================================================================

const IconMap: Record<string, any> = {
  users: Users,
  'dollar-sign': DollarSign,
  clock: Clock,
  package: Package,
  'file-text': FileText,
  folder: FolderOpen,
  layout: LayoutIcon,
  'check-circle': CheckCircle,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  calendar: Calendar,
  'shopping-cart': ShoppingCart,
  'bar-chart': BarChart3,
  'pie-chart': PieChartIcon,
  activity: Activity,
  'map-pin': MapPin,
  video: Video,
  image: ImageIcon,
  list: List,
  grid: Grid,
  'external-link': ExternalLink,
};

interface DynamicIconProps {
  name: string;
  className?: string;
  size?: number;
  style?: { [key: string]: string | number };
}

const DynamicIcon: React.FC<DynamicIconProps> = ({ name, className = '', size = 24, style }) => {
  const Icon = IconMap[name] || FileText;
  return <Icon className={className} size={size} style={style} />;
};

// ============================================================================
// BASE WIDGET WRAPPER
// ============================================================================

const BaseWidget: React.FC<BaseWidgetProps> = ({
  widget,
  _data,
  loading,
  error,
  onRefresh,
  onClick,
  children,
}) => {
  const config: WidgetConfig = widget.config || {};

  return (
    <div
      onClick={onClick}
      style={{
        height: '100%',
        overflow: 'hidden',
        backgroundColor: widget.background_color || '#fff',
        borderRadius: '8px',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s',
        cursor: onClick ? 'pointer' : 'default',
        borderColor: widget.border_color,
        color: widget.text_color,
        ...widget.custom_style,
        ...(onClick && { ':hover': { boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' } }),
      }}
      onMouseOver={e => {
        if (onClick) e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
      }}
      onMouseOut={e => {
        if (onClick) e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
      }}
    >
      {/* Header */}
      {widget.title && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {widget.icon && (
              <DynamicIcon
                name={widget.icon}
                style={{ width: '20px', height: '20px', color: '#4b5563' }}
              />
            )}
            <h3 style={{ fontWeight: 600, color: '#111827', margin: 0 }}>{widget.title}</h3>
          </div>

          {onRefresh && !config.static_value && (
            <button
              onClick={e => {
                e.stopPropagation();
                onRefresh();
              }}
              style={{
                color: '#9ca3af',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: '4px',
                transition: 'color 0.2s',
              }}
              onMouseOver={e => (e.currentTarget.style.color = '#4b5563')}
              onMouseOut={e => (e.currentTarget.style.color = '#9ca3af')}
              aria-label="Refresh widget"
            >
              <RefreshCw style={{ width: '16px', height: '16px' }} />
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div
        style={{
          padding: '16px',
          height: widget.title ? 'calc(100% - 56px)' : '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Loader
              style={{
                width: '24px',
                height: '24px',
                color: '#3b82f6',
                animation: 'spin 1s linear infinite',
              }}
              aria-label="Loading"
            />
          </div>
        ) : error ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#ef4444',
            }}
            role="alert"
          >
            <AlertCircle style={{ width: '20px', height: '20px', marginRight: '8px' }} />
            <span style={{ fontSize: '14px' }}>{error}</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

// ============================================================================
// KPI WIDGET (with static value support)
// ============================================================================

export const KPIWidget: React.FC<any> = ({ widget, data, ...props }) => {
  const config: WidgetConfig = widget.config || {};
  const { format, color, icon, show_trend, static_value } = config;

  // Use static value if provided, otherwise use data
  const actualValue = static_value !== undefined ? static_value : data?.value;

  const formatValue = (value: any): string => {
    if (value === undefined || value === null) return '0';

    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
        }).format(value);
      case 'percentage':
        return `${value}%`;
      case 'number':
        return new Intl.NumberFormat('en-NG').format(value);
      default:
        return String(value);
    }
  };

  const formattedValue = data?.formatted || formatValue(actualValue);

  // Scale font down so the value always fits without wrapping or overflow
  const valueFontSize = (() => {
    const len = formattedValue.length;
    if (len <= 8) return '32px';
    if (len <= 12) return '26px';
    if (len <= 16) return '21px';
    if (len <= 20) return '18px';
    return '15px';
  })();

  return (
    <BaseWidget widget={widget} data={data} {...props}>
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {/* Icon: small badge anchored top-right — never competes with the value */}
        {icon && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${color || '#1a73e8'}18`,
            }}
            aria-hidden="true"
          >
            <DynamicIcon name={icon} size={20} style={{ color: color || '#1a73e8' }} />
          </div>
        )}

        {widget.description && (
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 6px 0' }}>
            {widget.description}
          </p>
        )}

        <h2 style={{ fontSize: valueFontSize, fontWeight: 700, color: color || '#1a73e8', margin: 0, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {formattedValue}
        </h2>

        {show_trend && data?.trend && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: '10px',
              fontSize: '13px',
              color: data.trend.direction === 'up' ? '#059669' : '#dc2626',
            }}
            role="status"
          >
            {data.trend.direction === 'up' ? (
              <TrendingUp
                style={{ width: '14px', height: '14px', marginRight: '4px', flexShrink: 0 }}
                aria-hidden="true"
              />
            ) : (
              <TrendingDown
                style={{ width: '14px', height: '14px', marginRight: '4px', flexShrink: 0 }}
                aria-hidden="true"
              />
            )}
            <span style={{ fontWeight: 500 }}>{data.trend.percentage}%</span>
            {data.trend.comparison && (
              <span style={{ marginLeft: '4px', color: '#6b7280', fontSize: '12px' }}>{data.trend.comparison}</span>
            )}
          </div>
        )}
      </div>
    </BaseWidget>
  );
};

// ============================================================================
// NAVIGATION WIDGET
// ============================================================================

export const NavigationWidget: React.FC<any> = ({ widget, onLinkClick, ...props }) => {
  const navigate = useNavigate();
  const config: WidgetConfig = widget.config || {};
  const links = config.links || [];
  const layout = config.layout || 'grid';
  const showIcons = config.show_icons !== false;
  const showDescriptions = config.show_descriptions !== false;

  const handleLinkClick = (link: any) => {
    if (onLinkClick) {
      // Use the callback which will handle frontendUrl properly
      onLinkClick(link);
    } else if (link.url) {
      // Fallback to direct navigation
      navigate(link.url);
    }
  };

  if (links.length === 0) {
    return (
      <BaseWidget widget={widget} {...props}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#9ca3af',
          }}
        >
          <p>No links configured</p>
        </div>
      </BaseWidget>
    );
  }

  return (
    <BaseWidget widget={widget} {...props}>
      <div
        style={{
          ...(layout === 'grid' && {
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
          }),
          ...(layout === 'horizontal' && { display: 'flex', flexWrap: 'wrap', gap: '8px' }),
          ...(layout !== 'grid' &&
            layout !== 'horizontal' && { display: 'flex', flexDirection: 'column', gap: '8px' }),
        }}
      >
        {links.map((link: any, index: number) => (
          <button
            key={index}
            onClick={() => handleLinkClick(link)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              backgroundColor: 'white',
              textAlign: 'left',
              width: '100%',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => {
              e.currentTarget.style.borderColor = '#3b82f6';
              e.currentTarget.style.backgroundColor = '#eff6ff';
            }}
            onMouseOut={e => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.backgroundColor = 'white';
            }}
            aria-label={`Navigate to ${link.label}`}
          >
            {showIcons && (
              <div
                style={{
                  padding: '8px',
                  borderRadius: '8px',
                  marginRight: '12px',
                  flexShrink: 0,
                  backgroundColor: `${link.color || '#3b82f6'}20`,
                  transition: 'transform 0.2s',
                }}
              >
                <DynamicIcon
                  name={link.icon || 'file-text'}
                  style={{ width: '20px', height: '20px', color: link.color || '#3b82f6' }}
                />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontWeight: 500,
                  color: '#111827',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  margin: 0,
                }}
              >
                {link.label}
              </p>
              {showDescriptions && link.description && (
                <p
                  style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    marginTop: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {link.description}
                </p>
              )}
            </div>
            <ChevronRight
              style={{
                width: '16px',
                height: '16px',
                color: '#9ca3af',
                flexShrink: 0,
                marginLeft: '8px',
              }}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </BaseWidget>
  );
};

// ============================================================================
// LIST WIDGET
// ============================================================================

export const ListWidget: React.FC<any> = ({ widget, data, onClick, ...props }) => {
  const navigate = useNavigate();
  const config: WidgetConfig = widget.config || {};
  const items = config.items || data?.data || [];
  const { show_icon, clickable } = config;

  const handleItemClick = (item: any) => {
    if (clickable && item.url) {
      navigate(item.url);
    } else if (onClick) {
      onClick(item);
    }
  };

  if (items.length === 0) {
    return (
      <BaseWidget widget={widget} data={data} {...props}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#9ca3af',
          }}
        >
          <p>No items to display</p>
        </div>
      </BaseWidget>
    );
  }

  return (
    <BaseWidget widget={widget} data={data} {...props}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((item: any, index: number) => (
          <div
            key={index}
            onClick={() => handleItemClick(item)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              backgroundColor: 'white',
              cursor: clickable ? 'pointer' : 'default',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => {
              if (clickable) {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.backgroundColor = '#eff6ff';
              }
            }}
            onMouseOut={e => {
              if (clickable) {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.backgroundColor = 'white';
              }
            }}
            role={clickable ? 'button' : 'listitem'}
            tabIndex={clickable ? 0 : undefined}
          >
            {show_icon && (
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: '#f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '12px',
                  flexShrink: 0,
                }}
              >
                <DynamicIcon
                  name={item.icon || 'file-text'}
                  style={{ width: '20px', height: '20px', color: '#4b5563' }}
                />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontWeight: 500,
                  color: '#111827',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  margin: 0,
                }}
              >
                {item.title || item.name || item.label}
              </p>
              {(item.description || item.subtitle || item.module) && (
                <p
                  style={{
                    fontSize: '14px',
                    color: '#6b7280',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: '2px',
                  }}
                >
                  {item.description || item.subtitle || item.module}
                </p>
              )}
              {item.page && (
                <p
                  style={{
                    fontSize: '12px',
                    color: '#9ca3af',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: '2px',
                  }}
                >
                  {item.page}
                </p>
              )}
            </div>
            {clickable && item.url && (
              <ChevronRight
                style={{
                  width: '16px',
                  height: '16px',
                  color: '#9ca3af',
                  flexShrink: 0,
                  marginLeft: '8px',
                }}
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>
    </BaseWidget>
  );
};

// ============================================================================
// TEXT WIDGET
// ============================================================================

export const TextWidget: React.FC<any> = ({ widget, ...props }) => {
  const config: WidgetConfig = widget.config || {};

  return (
    <BaseWidget widget={widget} {...props}>
      <div
        style={{ maxWidth: 'none', fontSize: '14px', lineHeight: '1.75' }}
        dangerouslySetInnerHTML={{ __html: config.content || '' }}
      />
    </BaseWidget>
  );
};

// ============================================================================
// LINE CHART WIDGET
// ============================================================================

export const LineChartWidget: React.FC<any> = ({ widget, data, ...props }) => {
  const config: WidgetConfig = widget.config || {};
  const { colors, show_legend, show_grid, x_axis, y_axis } = config;
  const chartData = data?.data || [];

  if (chartData.length === 0) {
    return (
      <BaseWidget widget={widget} data={data} {...props}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#9ca3af',
          }}
        >
          <p>No data available</p>
        </div>
      </BaseWidget>
    );
  }

  return (
    <BaseWidget widget={widget} data={data} {...props}>
      <Suspense
        fallback={
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Loading chart...
          </div>
        }
      >
        <LazyLineChartInner
          chartData={chartData}
          x_axis={x_axis}
          y_axis={y_axis}
          colors={colors}
          show_legend={show_legend}
          show_grid={show_grid}
        />
      </Suspense>
    </BaseWidget>
  );
};

// ============================================================================
// BAR CHART WIDGET
// ============================================================================

export const BarChartWidget: React.FC<any> = ({ widget, data, ...props }) => {
  const config: WidgetConfig = widget.config || {};
  const { colors, show_legend, x_axis, y_axis } = config;
  const chartData = data?.data || [];

  if (chartData.length === 0) {
    return (
      <BaseWidget widget={widget} data={data} {...props}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#9ca3af',
          }}
        >
          <p>No data available</p>
        </div>
      </BaseWidget>
    );
  }

  return (
    <BaseWidget widget={widget} data={data} {...props}>
      <Suspense
        fallback={
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Loading chart...
          </div>
        }
      >
        <LazyBarChartInner
          chartData={chartData}
          x_axis={x_axis}
          y_axis={y_axis}
          colors={colors}
          show_legend={show_legend}
        />
      </Suspense>
    </BaseWidget>
  );
};

// ============================================================================
// PIE CHART WIDGET
// ============================================================================

export const PieChartWidget: React.FC<any> = ({ widget, data, ...props }) => {
  const config: WidgetConfig = widget.config || {};
  const { colors } = config;
  const chartData = data?.data || [];

  const COLORS = colors || ['#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#9334ea'];

  if (chartData.length === 0) {
    return (
      <BaseWidget widget={widget} data={data} {...props}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#9ca3af',
          }}
        >
          <p>No data available</p>
        </div>
      </BaseWidget>
    );
  }

  return (
    <BaseWidget widget={widget} data={data} {...props}>
      <Suspense
        fallback={
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Loading chart...
          </div>
        }
      >
        <LazyPieChartInner chartData={chartData} colors={colors} />
      </Suspense>
    </BaseWidget>
  );
};

// ============================================================================
// DONUT CHART WIDGET
// ============================================================================

export const DonutChartWidget: React.FC<any> = ({ widget, data, ...props }) => {
  const config: WidgetConfig = widget.config || {};
  const { colors } = config;
  const chartData = data?.data || [];

  const COLORS = colors || ['#1a73e8', '#34a853', '#fbbc04', '#ea4335'];

  if (chartData.length === 0) {
    return (
      <BaseWidget widget={widget} data={data} {...props}>
        <div className="flex items-center justify-center h-full text-gray-400">
          <p>No data available</p>
        </div>
      </BaseWidget>
    );
  }

  return (
    <BaseWidget widget={widget} data={data} {...props}>
      <Suspense
        fallback={
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Loading chart...
          </div>
        }
      >
        <LazyPieChartInner chartData={chartData} colors={colors} innerRadius={60} />
      </Suspense>
    </BaseWidget>
  );
};

// ============================================================================
// AREA CHART WIDGET
// ============================================================================

export const AreaChartWidget: React.FC<any> = ({ widget, data, ...props }) => {
  const config: WidgetConfig = widget.config || {};
  const { colors, x_axis, y_axis } = config;
  const chartData = data?.data || [];

  if (chartData.length === 0) {
    return (
      <BaseWidget widget={widget} data={data} {...props}>
        <div className="flex items-center justify-center h-full text-gray-400">
          <p>No data available</p>
        </div>
      </BaseWidget>
    );
  }

  return (
    <BaseWidget widget={widget} data={data} {...props}>
      <Suspense
        fallback={
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Loading chart...
          </div>
        }
      >
        <LazyAreaChartInner chartData={chartData} x_axis={x_axis} y_axis={y_axis} colors={colors} />
      </Suspense>
    </BaseWidget>
  );
};

// ============================================================================
// TABLE WIDGET
// ============================================================================

export const TableWidget: React.FC<any> = ({ widget, data, onClick, ...props }) => {
  const config: WidgetConfig = widget.config || {};
  const { columns: configColumns, pagination, page_size = 10 } = config;
  // Prefer live data columns (from API response) over static config columns
  const columns = data?.columns || configColumns;
  const rows = data?.data || [];

  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / page_size));

  const paginatedRows = pagination
    ? rows.slice((currentPage - 1) * page_size, currentPage * page_size)
    : rows;

  const formatCell = (value: any, format?: string): string => {
    if (value === null || value === undefined) return '-';

    if (format === 'currency') {
      return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
      }).format(value);
    }
    if (format === 'date') {
      return new Date(value).toLocaleDateString();
    }
    if (format === 'percentage') {
      return `${value}%`;
    }
    return String(value);
  };

  if (rows.length === 0) {
    return (
      <BaseWidget widget={widget} data={data} {...props}>
        <div className="flex items-center justify-center h-full text-gray-400">
          <p>No data available</p>
        </div>
      </BaseWidget>
    );
  }

  return (
    <BaseWidget widget={widget} data={data} {...props}>
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {columns?.map((col: any, idx: number) => (
                  <th
                    key={idx}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedRows.map((row: any, rowIdx: number) => (
                <tr
                  key={rowIdx}
                  onClick={() => onClick?.(row)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  role="row"
                >
                  {columns?.map((col: any, colIdx: number) => (
                    <td key={colIdx} className="px-4 py-3 text-sm text-gray-900 border-b">
                      {formatCell(row[col.field], col.format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50 transition-colors"
              aria-label="Previous page"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50 transition-colors"
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </BaseWidget>
  );
};

// ============================================================================
// PROGRESS WIDGET
// ============================================================================

export const ProgressWidget: React.FC<any> = ({ widget, data, ...props }) => {
  const config: WidgetConfig = widget.config || {};
  const { color, show_percentage, target } = config;
  const value = data?.value || 0;
  const percentage = target ? (value / target) * 100 : value;

  return (
    <BaseWidget widget={widget} data={data} {...props}>
      <div className="flex flex-col justify-center h-full">
        <div className="mb-4">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            {show_percentage && (
              <span className="text-sm font-medium text-gray-700">
                {Math.min(percentage, 100).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="h-4 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: color || '#1a73e8',
              }}
              role="progressbar"
              aria-valuenow={Math.min(percentage, 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {target && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>Current: {value}</span>
            <span>Target: {target}</span>
          </div>
        )}
      </div>
    </BaseWidget>
  );
};

// ============================================================================
// STAT GRID WIDGET
// ============================================================================

export const StatGridWidget: React.FC<any> = ({ widget, data, ...props }) => {
  const stats = data?.stats || widget.config?.stats || [];

  if (stats.length === 0) {
    return (
      <BaseWidget widget={widget} data={data} {...props}>
        <div className="flex items-center justify-center h-full text-gray-400">
          <p>No stats configured</p>
        </div>
      </BaseWidget>
    );
  }

  return (
    <BaseWidget widget={widget} data={data} {...props}>
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat: any, index: number) => (
          <div
            key={index}
            className="text-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <p className="text-2xl font-bold" style={{ color: stat.color || '#1a73e8', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {stat.value}
            </p>
            <p className="text-sm text-gray-600 mt-1">{stat.label}</p>
            {stat.description && <p className="text-xs text-gray-500 mt-1">{stat.description}</p>}
          </div>
        ))}
      </div>
    </BaseWidget>
  );
};

// ============================================================================
// WIDGET TYPE MAPPER
// ============================================================================

const WIDGET_TYPE_MAP: Record<string, React.FC<any>> = {
  kpi: KPIWidget,
  line_chart: LineChartWidget,
  bar_chart: BarChartWidget,
  pie_chart: PieChartWidget,
  donut_chart: DonutChartWidget,
  area_chart: AreaChartWidget,
  table: TableWidget,
  navigation: NavigationWidget,
  list: ListWidget,
  progress: ProgressWidget,
  stat_grid: StatGridWidget,
  text: TextWidget,
  // Dashboard builder widget types - map to closest existing widgets
  sidebar: NavigationWidget, // Sidebar is essentially hierarchical navigation
  quick_links: NavigationWidget, // Quick links are navigation too
  chart: BarChartWidget, // Generic chart defaults to bar chart
};

export default WIDGET_TYPE_MAP;
