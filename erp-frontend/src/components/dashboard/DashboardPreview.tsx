import React, { useState } from 'react';
import { ArrowLeft, Monitor, Tablet, Smartphone, RefreshCw, Settings, Eye } from 'lucide-react';
import { Responsive, WidthProvider, Layouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { cn } from '../../lib/utils';
import { DashboardTemplate } from '../../types/dashboardTemplates';
import { StatsCard } from './StatsCard';

const ResponsiveGridLayout = WidthProvider(Responsive);

export interface DashboardPreviewProps {
  template: DashboardTemplate;
  onBack: () => void;
  className?: string;
}

type PreviewMode = 'desktop' | 'tablet' | 'mobile';

export const DashboardPreview: React.FC<DashboardPreviewProps> = ({
  template,
  onBack,
  className = '',
}) => {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('desktop');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Generate sample data for preview
  const generateSampleData = (widgetId: string, type: string) => {
    const sampleValues = {
      revenue: Math.floor(Math.random() * 1000000) + 500000,
      students: Math.floor(Math.random() * 500) + 200,
      staff: Math.floor(Math.random() * 50) + 20,
      pending_payments: Math.floor(Math.random() * 100000) + 50000,
      active_staff: Math.floor(Math.random() * 30) + 15,
    };

    return (
      sampleValues[type as keyof typeof sampleValues] || Math.floor(Math.random() * 1000) + 100
    );
  };

  // Breakpoint configurations for preview
  const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480 };
  const cols = { lg: 12, md: 10, sm: 6, xs: 4 };

  // Generate layouts from widget positions
  const layouts: Layouts = {
    lg:
      template.widgets?.map(w => ({
        i: w.id,
        x: w.position.x,
        y: w.position.y,
        w: w.position.w,
        h: w.position.h,
        static: true, // Make widgets non-draggable in preview
      })) || [],
    md:
      template.widgets?.map(w => ({
        i: w.id,
        x: Math.min(w.position.x, 8),
        y: w.position.y,
        w: Math.min(w.position.w, 10),
        h: w.position.h,
        static: true,
      })) || [],
    sm:
      template.widgets?.map(w => ({
        i: w.id,
        x: Math.min(w.position.x, 4),
        y: w.position.y,
        w: Math.min(w.position.w, 6),
        h: w.position.h,
        static: true,
      })) || [],
    xs:
      template.widgets?.map(w => ({
        i: w.id,
        x: 0,
        y: w.position.y,
        w: 4,
        h: w.position.h,
        static: true,
      })) || [],
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate data refresh
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsRefreshing(false);
  };

  const getPreviewWidth = () => {
    switch (previewMode) {
      case 'desktop':
        return '100%';
      case 'tablet':
        return '768px';
      case 'mobile':
        return '375px';
      default:
        return '100%';
    }
  };

  const renderWidget = (widget: any) => {
    if (!widget.visible) return null;

    switch (widget.type) {
      case 'stats':
        return (
          <StatsCard
            id={widget.id}
            title={widget.title}
            value={generateSampleData(widget.id, widget.config?.metric || 'revenue')}
            icon={widget.config?.icon || 'BarChart3'}
            color={widget.config?.color || 'blue'}
            format={widget.config?.format || 'number'}
            prefix={widget.config?.prefix || ''}
            suffix={widget.config?.suffix || ''}
            showTrend={widget.config?.showTrend !== false}
            size={widget.size === 'small' ? 'small' : widget.size === 'large' ? 'large' : 'medium'}
            layout={widget.config?.layout || 'vertical'}
            theme={widget.config?.theme || 'light'}
            change={
              widget.config?.showTrend !== false
                ? {
                    value: Math.floor(Math.random() * 30) - 15,
                    type: Math.random() > 0.5 ? 'increase' : 'decrease',
                    period: 'last month',
                  }
                : undefined
            }
            lastUpdated={new Date()}
            className="h-full"
          />
        );

      case 'chart':
        return (
          <div className="h-full bg-white rounded-lg border border-gray-200 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{widget.title}</h3>
              <div className="text-sm text-gray-500">
                {widget.config?.chartType || 'line'} chart
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg flex items-center justify-center">
                <div className="text-center text-gray-600">
                  <div className="text-4xl mb-3">📈</div>
                  <div className="font-medium">Live Chart Data</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {widget.config?.chartType || 'Line'} Chart Preview
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'list':
        return (
          <div className="h-full bg-white rounded-lg border border-gray-200 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{widget.title}</h3>
              <div className="text-sm text-gray-500">{widget.config?.maxItems || 10} items</div>
            </div>
            <div className="flex-1 space-y-3 overflow-auto">
              {Array.from({ length: Math.min(widget.config?.maxItems || 8, 8) }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">Sample Item {i + 1}</div>
                    <div className="text-sm text-gray-600">Sample description or details</div>
                  </div>
                  <div className="text-sm text-gray-500">₦{(Math.random() * 1000).toFixed(0)}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'activity':
        return (
          <div className="h-full bg-white rounded-lg border border-gray-200 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{widget.title}</h3>
              <div className="text-sm text-gray-500">Live feed</div>
            </div>
            <div className="flex-1 space-y-4 overflow-auto">
              {Array.from({ length: Math.min(widget.config?.maxItems || 6, 6) }).map((_, i) => (
                <div key={i} className="flex items-start space-x-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full mt-2 flex-shrink-0 animate-pulse"></div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">Activity Event {i + 1}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Sample activity description with relevant details
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 whitespace-nowrap">{i + 1}m ago</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'alerts':
        return (
          <div className="h-full bg-white rounded-lg border border-gray-200 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{widget.title}</h3>
              <div className="text-sm text-gray-500">System alerts</div>
            </div>
            <div className="flex-1 space-y-3 overflow-auto">
              {[
                { type: 'error', message: 'Payment processing error detected', time: '2m ago' },
                { type: 'warning', message: 'Low inventory levels in warehouse', time: '15m ago' },
                { type: 'info', message: 'System maintenance scheduled', time: '1h ago' },
              ].map((alert, i) => (
                <div
                  key={i}
                  className={cn(
                    'p-4 rounded-lg border-l-4',
                    alert.type === 'error' && 'bg-red-50 border-red-500',
                    alert.type === 'warning' && 'bg-yellow-50 border-yellow-500',
                    alert.type === 'info' && 'bg-blue-50 border-blue-500'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="font-medium text-gray-900">{alert.message}</div>
                    <div className="text-xs text-gray-500 ml-4">{alert.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return (
          <div className="h-full bg-white rounded-lg border border-gray-200 p-6 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <div className="text-3xl mb-3">🔧</div>
              <div className="font-medium">Widget Preview</div>
              <div className="text-sm text-gray-400 mt-1">{widget.type}</div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className={cn('h-full flex flex-col bg-gray-50', className)}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Editor</span>
            </button>
            <div className="h-6 w-px bg-gray-300" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Dashboard Preview - {template.name}
              </h2>
              <p className="text-sm text-gray-600">Preview how your dashboard will look to users</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Device preview selector */}
            <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
              {[
                { key: 'desktop', icon: Monitor, label: 'Desktop' },
                { key: 'tablet', icon: Tablet, label: 'Tablet' },
                { key: 'mobile', icon: Smartphone, label: 'Mobile' },
              ].map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setPreviewMode(key as PreviewMode)}
                  className={cn(
                    'p-2 rounded-md transition-colors',
                    previewMode === key
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  )}
                  title={label}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
              <span>Refresh Data</span>
            </button>
          </div>
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="flex justify-center">
          <div
            className="bg-white rounded-lg shadow-sm border border-gray-200 transition-all duration-300"
            style={{
              width: getPreviewWidth(),
              minHeight: '600px',
            }}
          >
            {/* Dashboard header */}
            {template.showWelcomeBanner && (
              <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-t-lg">
                <h1 className="text-2xl font-bold mb-2">Welcome back!</h1>
                <p className="text-blue-100">
                  Here's what's happening with your {template.role} dashboard today.
                </p>
              </div>
            )}

            {/* Widgets grid */}
            <div className="p-6">
              {template.widgets && template.widgets.length > 0 ? (
                <ResponsiveGridLayout
                  className="layout"
                  layouts={layouts}
                  breakpoints={breakpoints}
                  cols={cols}
                  rowHeight={60}
                  isDraggable={false}
                  isResizable={false}
                  margin={[16, 16]}
                  containerPadding={[0, 0]}
                >
                  {template.widgets.map(widget => (
                    <div key={widget.id}>{renderWidget(widget)}</div>
                  ))}
                </ResponsiveGridLayout>
              ) : (
                <div className="flex flex-col items-center justify-center h-96 text-gray-500">
                  <Eye className="h-16 w-16 mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium mb-2">No widgets to preview</h3>
                  <p className="text-sm text-center">
                    Add some widgets to see how your dashboard will look
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPreview;
