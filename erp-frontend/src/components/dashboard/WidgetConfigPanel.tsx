import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Palette,
  Eye,
  EyeOff,
  Type,
  BarChart3,
  RefreshCw,
  Lock,
  Unlock,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardWidget } from '../../types/dashboardTemplates';

export interface WidgetConfigPanelProps {
  widget: DashboardWidget;
  onUpdate: (updates: Partial<DashboardWidget>) => void;
  onClose: () => void;
}

interface ConfigSection {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

const configSections: ConfigSection[] = [
  { id: 'general', title: 'General', icon: Settings },
  { id: 'appearance', title: 'Appearance', icon: Palette },
  { id: 'data', title: 'Data Source', icon: BarChart3 },
  { id: 'permissions', title: 'Permissions', icon: Lock },
];

const colorOptions = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'gray', label: 'Gray', class: 'bg-gray-500' },
  { value: 'indigo', label: 'Indigo', class: 'bg-indigo-500' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-500' },
];

const sizeOptions = [
  { value: 'small', label: 'Small (3×2)', w: 3, h: 2 },
  { value: 'medium', label: 'Medium (4×3)', w: 4, h: 3 },
  { value: 'large', label: 'Large (6×4)', w: 6, h: 4 },
  { value: 'full', label: 'Full Width (12×2)', w: 12, h: 2 },
];

const formatOptions = [
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percentage', label: 'Percentage' },
];

const chartTypeOptions = [
  { value: 'line', label: 'Line Chart' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'pie', label: 'Pie Chart' },
  { value: 'area', label: 'Area Chart' },
  { value: 'donut', label: 'Donut Chart' },
];

export const WidgetConfigPanel: React.FC<WidgetConfigPanelProps> = ({
  widget,
  onUpdate,
  onClose,
}) => {
  const [activeSection, setActiveSection] = useState('general');
  const [localConfig, setLocalConfig] = useState(widget.config || {});
  const [title, setTitle] = useState(widget.title);
  const [size, setSize] = useState(widget.size);
  const [visible, setVisible] = useState(widget.visible);

  // Update local state when widget changes
  useEffect(() => {
    setLocalConfig(widget.config || {});
    setTitle(widget.title);
    setSize(widget.size);
    setVisible(widget.visible);
  }, [widget]);

  const handleConfigChange = (key: string, value: any) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    onUpdate({ config: newConfig });
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    onUpdate({ title: newTitle });
  };

  const handleSizeChange = (newSize: DashboardWidget['size']) => {
    setSize(newSize);
    const sizeOption = sizeOptions.find(opt => opt.value === newSize);
    if (sizeOption) {
      onUpdate({
        size: newSize,
        position: {
          ...widget.position,
          w: sizeOption.w,
          h: sizeOption.h,
        },
      });
    }
  };

  const handleVisibilityToggle = () => {
    const newVisible = !visible;
    setVisible(newVisible);
    onUpdate({ visible: newVisible });
  };

  const renderGeneralSection = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Widget Title</label>
        <input
          type="text"
          value={title}
          onChange={e => handleTitleChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter widget title"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Size</label>
        <select
          value={size}
          onChange={e => handleSizeChange(e.target.value as DashboardWidget['size'])}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {sizeOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Visible</label>
        <button
          onClick={handleVisibilityToggle}
          className={cn(
            'flex items-center space-x-2 px-3 py-2 rounded-md transition-colors',
            visible
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          <span>{visible ? 'Visible' : 'Hidden'}</span>
        </button>
      </div>

      {widget.type === 'stats' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
            <select
              value={localConfig.format || 'number'}
              onChange={e => handleConfigChange('format', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {formatOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prefix</label>
              <input
                type="text"
                value={localConfig.prefix || ''}
                onChange={e => handleConfigChange('prefix', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., $"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Suffix</label>
              <input
                type="text"
                value={localConfig.suffix || ''}
                onChange={e => handleConfigChange('suffix', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., %"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Show Trend</label>
            <button
              onClick={() => handleConfigChange('showTrend', !localConfig.showTrend)}
              className={cn(
                'w-12 h-6 rounded-full transition-colors relative',
                localConfig.showTrend ? 'bg-blue-600' : 'bg-gray-300'
              )}
            >
              <div
                className={cn(
                  'w-5 h-5 bg-white rounded-full shadow-sm transition-transform absolute top-0.5',
                  localConfig.showTrend ? 'translate-x-6' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>
        </>
      )}
    </div>
  );

  const renderAppearanceSection = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Color Theme</label>
        <div className="grid grid-cols-4 gap-2">
          {colorOptions.map(color => (
            <button
              key={color.value}
              onClick={() => handleConfigChange('color', color.value)}
              className={cn(
                'p-3 rounded-lg border-2 transition-all',
                localConfig.color === color.value
                  ? 'border-gray-900 shadow-md'
                  : 'border-gray-200 hover:border-gray-300'
              )}
              title={color.label}
            >
              <div className={cn('w-full h-4 rounded', color.class)} />
            </button>
          ))}
        </div>
      </div>

      {widget.type === 'stats' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Theme Style</label>
            <select
              value={localConfig.theme || 'light'}
              onChange={e => handleConfigChange('theme', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="gradient">Gradient</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Layout</label>
            <select
              value={localConfig.layout || 'vertical'}
              onChange={e => handleConfigChange('layout', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
            </select>
          </div>
        </>
      )}

      {widget.type === 'chart' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Chart Type</label>
          <select
            value={localConfig.chartType || 'line'}
            onChange={e => handleConfigChange('chartType', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {chartTypeOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );

  const renderDataSection = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Data Source</label>
        <input
          type="text"
          value={localConfig.dataSource || ''}
          onChange={e => handleConfigChange('dataSource', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter API endpoint or data source"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Auto Refresh</label>
        <button
          onClick={() => handleConfigChange('autoRefresh', !localConfig.autoRefresh)}
          className={cn(
            'w-12 h-6 rounded-full transition-colors relative',
            localConfig.autoRefresh ? 'bg-blue-600' : 'bg-gray-300'
          )}
        >
          <div
            className={cn(
              'w-5 h-5 bg-white rounded-full shadow-sm transition-transform absolute top-0.5',
              localConfig.autoRefresh ? 'translate-x-6' : 'translate-x-0.5'
            )}
          />
        </button>
      </div>

      {localConfig.autoRefresh && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Refresh Interval (seconds)
          </label>
          <input
            type="number"
            min="5"
            max="3600"
            value={localConfig.refreshInterval || 30}
            onChange={e => handleConfigChange('refreshInterval', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {(widget.type === 'list' || widget.type === 'activity') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Max Items</label>
          <input
            type="number"
            min="1"
            max="50"
            value={localConfig.maxItems || 10}
            onChange={e => handleConfigChange('maxItems', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {widget.type === 'chart' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Time Range</label>
          <select
            value={localConfig.timeRange || '30d'}
            onChange={e => handleConfigChange('timeRange', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="12m">Last 12 months</option>
            <option value="1y">Last year</option>
          </select>
        </div>
      )}
    </div>
  );

  const renderPermissionsSection = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Required Permissions</label>
        <p className="text-sm text-gray-600 mb-3">
          Select which permissions are required to view this widget
        </p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {[
            'dashboard.view',
            'financial.view',
            'students.view',
            'hr.view',
            'inventory.view',
            'reports.view',
          ].map(permission => (
            <label key={permission} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={widget.permissions?.includes(permission) || false}
                onChange={e => {
                  const currentPermissions = widget.permissions || [];
                  const newPermissions = e.target.checked
                    ? [...currentPermissions, permission]
                    : currentPermissions.filter(p => p !== permission);
                  onUpdate({ permissions: newPermissions });
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{permission}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'general':
        return renderGeneralSection();
      case 'appearance':
        return renderAppearanceSection();
      case 'data':
        return renderDataSection();
      case 'permissions':
        return renderPermissionsSection();
      default:
        return renderGeneralSection();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Widget Settings</h3>
          <p className="text-sm text-gray-600">{widget.title}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Section tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-1 p-1">
          {configSections.map(section => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  'flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  activeSection === section.id
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{section.title}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">{renderSectionContent()}</div>
    </div>
  );
};

export default WidgetConfigPanel;
