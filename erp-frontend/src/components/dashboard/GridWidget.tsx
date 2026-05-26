import React, { useState } from 'react';
import { Settings, Copy, Trash2, MoreVertical, Eye, EyeOff, Move, Maximize2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardWidget } from '../../types/dashboardTemplates';
import { StatsCard } from './StatsCard';

export interface GridWidgetProps {
  widget: DashboardWidget;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  className?: string;
}

export const GridWidget: React.FC<GridWidgetProps> = ({
  widget,
  isSelected,
  onSelect,
  onDuplicate,
  onRemove,
  className = '',
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleMenuAction = (action: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setShowMenu(false);

    switch (action) {
      case 'duplicate':
        onDuplicate();
        break;
      case 'remove':
        onRemove();
        break;
    }
  };

  const renderWidgetContent = () => {
    switch (widget.type) {
      case 'stats':
        return (
          <StatsCard
            id={widget.id}
            title={widget.title}
            value={widget.config?.sampleValue || '1,234'}
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
                    value: 12.5,
                    type: 'increase',
                    period: 'last month',
                  }
                : undefined
            }
            className="h-full"
          />
        );

      case 'chart':
        return (
          <div className="h-full bg-white rounded-lg border border-gray-200 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">{widget.title}</h3>
              <div className="text-xs text-gray-500">
                {widget.config?.chartType || 'line'} chart
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center bg-gray-50 rounded border-2 border-dashed border-gray-300">
              <div className="text-center text-gray-500">
                <div className="text-2xl mb-2">📊</div>
                <div className="text-sm">Chart Preview</div>
                <div className="text-xs">{widget.config?.chartType || 'Line'} Chart</div>
              </div>
            </div>
          </div>
        );

      case 'list':
        return (
          <div className="h-full bg-white rounded-lg border border-gray-200 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">{widget.title}</h3>
              <div className="text-xs text-gray-500">List</div>
            </div>
            <div className="flex-1 space-y-2">
              {Array.from({ length: Math.min(widget.config?.maxItems || 5, 5) }).map((_, i) => (
                <div key={i} className="flex items-center space-x-3 p-2 bg-gray-50 rounded">
                  <div className="w-8 h-8 bg-gray-300 rounded-full flex-shrink-0"></div>
                  <div className="flex-1">
                    <div className="h-3 bg-gray-300 rounded w-3/4 mb-1"></div>
                    <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'activity':
        return (
          <div className="h-full bg-white rounded-lg border border-gray-200 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">{widget.title}</h3>
              <div className="text-xs text-gray-500">Activity</div>
            </div>
            <div className="flex-1 space-y-3">
              {Array.from({ length: Math.min(widget.config?.maxItems || 4, 4) }).map((_, i) => (
                <div key={i} className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div className="flex-1">
                    <div className="h-3 bg-gray-300 rounded w-full mb-1"></div>
                    <div className="h-2 bg-gray-200 rounded w-2/3"></div>
                  </div>
                  <div className="text-xs text-gray-400">2m</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'alerts':
        return (
          <div className="h-full bg-white rounded-lg border border-gray-200 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">{widget.title}</h3>
              <div className="text-xs text-gray-500">Alerts</div>
            </div>
            <div className="flex-1 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'p-3 rounded-lg border-l-4',
                    i === 0 && 'bg-red-50 border-red-500',
                    i === 1 && 'bg-yellow-50 border-yellow-500',
                    i === 2 && 'bg-blue-50 border-blue-500'
                  )}
                >
                  <div className="h-3 bg-gray-300 rounded w-3/4 mb-1"></div>
                  <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return (
          <div className="h-full bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <div className="text-2xl mb-2">🔧</div>
              <div className="text-sm">Widget Preview</div>
              <div className="text-xs">{widget.type}</div>
            </div>
          </div>
        );
    }
  };

  return (
    <div
      className={cn(
        'relative h-full group transition-all duration-200',
        isSelected && 'ring-2 ring-blue-500 ring-offset-2',
        !widget.visible && 'opacity-50',
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMenu(false);
      }}
      onClick={onSelect}
    >
      {/* Widget content */}
      <div className="h-full">{renderWidgetContent()}</div>

      {/* Overlay controls */}
      {(isHovered || isSelected) && (
        <div className="absolute inset-0 bg-blue-500 bg-opacity-10 border-2 border-blue-500 rounded-lg pointer-events-none">
          {/* Selection indicator */}
          <div className="absolute -top-2 -left-2 w-4 h-4 bg-blue-500 rounded-full border-2 border-white"></div>

          {/* Drag handle */}
          <div className="absolute top-2 left-2 p-1 bg-white rounded shadow-sm pointer-events-auto cursor-move">
            <Move className="h-3 w-3 text-gray-600" />
          </div>

          {/* Resize handle */}
          <div className="absolute bottom-2 right-2 p-1 bg-white rounded shadow-sm pointer-events-auto cursor-se-resize">
            <Maximize2 className="h-3 w-3 text-gray-600" />
          </div>
        </div>
      )}

      {/* Action menu */}
      {isHovered && (
        <div className="absolute top-2 right-2 z-10">
          <div className="relative">
            <button
              onClick={e => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 bg-white rounded shadow-sm hover:bg-gray-50 transition-colors"
            >
              <MoreVertical className="h-4 w-4 text-gray-600" />
            </button>

            {showMenu && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                <button
                  onClick={onSelect}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                >
                  <Settings className="h-4 w-4" />
                  <span>Configure</span>
                </button>

                <button
                  onClick={e => handleMenuAction('duplicate', e)}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                >
                  <Copy className="h-4 w-4" />
                  <span>Duplicate</span>
                </button>

                <div className="border-t border-gray-100 my-1"></div>

                <button
                  onClick={e => handleMenuAction('remove', e)}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Remove</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visibility indicator */}
      {!widget.visible && (
        <div className="absolute top-2 left-2 p-1 bg-gray-800 text-white rounded shadow-sm">
          <EyeOff className="h-3 w-3" />
        </div>
      )}
    </div>
  );
};

export default GridWidget;
