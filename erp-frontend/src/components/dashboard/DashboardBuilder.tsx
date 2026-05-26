import React, { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Layout, Layouts, Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  Plus,
  Save,
  Eye,
  Settings,
  Trash2,
  Copy,
  Grid3X3,
  Smartphone,
  Tablet,
  Monitor,
  Undo,
  Redo,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DashboardWidget, DashboardTemplate } from '../../types/dashboardTemplates';
import { WidgetLibrary } from './WidgetLibrary';
import { WidgetConfigPanel } from './WidgetConfigPanel';
import { DashboardPreview } from './DashboardPreview';
import { GridWidget } from './GridWidget';
import { useUserPreferences } from '../../hooks/useUserPreferences';

const ResponsiveGridLayout = WidthProvider(Responsive);

export interface DashboardBuilderProps {
  template: DashboardTemplate;
  onSave: (template: DashboardTemplate) => void;
  onPreview: (template: DashboardTemplate) => void;
  className?: string;
}

interface BuilderState {
  widgets: DashboardWidget[];
  layouts: Layouts;
  selectedWidget: string | null;
  draggedWidget: DashboardWidget | null;
  mode: 'edit' | 'preview';
  breakpoint: 'lg' | 'md' | 'sm' | 'xs';
  history: DashboardWidget[][];
  historyIndex: number;
}

export const DashboardBuilder: React.FC<DashboardBuilderProps> = ({
  template,
  onSave,
  onPreview,
  className = '',
}) => {
  const { preferences } = useUserPreferences();

  const [state, setState] = useState<BuilderState>({
    widgets: template.widgets || [],
    layouts: {
      lg:
        template.widgets?.map(w => ({
          i: w.id,
          x: w.position.x,
          y: w.position.y,
          w: w.position.w,
          h: w.position.h,
          minW: 1,
          minH: 1,
        })) || [],
      md: [],
      sm: [],
      xs: [],
    },
    selectedWidget: null,
    draggedWidget: null,
    mode: 'edit',
    breakpoint: 'lg',
    history: [template.widgets || []],
    historyIndex: 0,
  });

  const [showWidgetLibrary, setShowWidgetLibrary] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  // Breakpoint configurations
  const breakpoints = { lg: 1200, md: 996, sm: 768, xs: 480 };
  const cols = { lg: 12, md: 10, sm: 6, xs: 4 };

  // History management
  const saveToHistory = useCallback((widgets: DashboardWidget[]) => {
    setState(prev => {
      const newHistory = prev.history.slice(0, prev.historyIndex + 1);
      newHistory.push([...widgets]);
      return {
        ...prev,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  }, []);

  const undo = useCallback(() => {
    setState(prev => {
      if (prev.historyIndex > 0) {
        const newIndex = prev.historyIndex - 1;
        const widgets = prev.history[newIndex];
        return {
          ...prev,
          widgets: [...widgets],
          historyIndex: newIndex,
        };
      }
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    setState(prev => {
      if (prev.historyIndex < prev.history.length - 1) {
        const newIndex = prev.historyIndex + 1;
        const widgets = prev.history[newIndex];
        return {
          ...prev,
          widgets: [...widgets],
          historyIndex: newIndex,
        };
      }
      return prev;
    });
  }, []);

  // Widget management
  const addWidget = useCallback(
    (widgetTemplate: Partial<DashboardWidget>) => {
      const newWidget: DashboardWidget = {
        id: `widget-${Date.now()}`,
        type: widgetTemplate.type || 'stats',
        title: widgetTemplate.title || 'New Widget',
        size: widgetTemplate.size || 'medium',
        position: { x: 0, y: 0, w: 4, h: 3 },
        config: widgetTemplate.config || {},
        permissions: widgetTemplate.permissions || [],
        visible: true,
        ...widgetTemplate,
      };

      setState(prev => {
        const newWidgets = [...prev.widgets, newWidget];
        const newLayout = {
          i: newWidget.id,
          x: newWidget.position.x,
          y: newWidget.position.y,
          w: newWidget.position.w,
          h: newWidget.position.h,
          minW: 1,
          minH: 1,
        };

        saveToHistory(newWidgets);

        return {
          ...prev,
          widgets: newWidgets,
          layouts: {
            ...prev.layouts,
            [prev.breakpoint]: [...prev.layouts[prev.breakpoint], newLayout],
          },
        };
      });
    },
    [saveToHistory]
  );

  const updateWidget = useCallback(
    (widgetId: string, updates: Partial<DashboardWidget>) => {
      setState(prev => {
        const newWidgets = prev.widgets.map(w => (w.id === widgetId ? { ...w, ...updates } : w));
        saveToHistory(newWidgets);
        return { ...prev, widgets: newWidgets };
      });
    },
    [saveToHistory]
  );

  const removeWidget = useCallback(
    (widgetId: string) => {
      setState(prev => {
        const newWidgets = prev.widgets.filter(w => w.id !== widgetId);
        const newLayouts = { ...prev.layouts };

        Object.keys(newLayouts).forEach(bp => {
          newLayouts[bp as keyof Layouts] =
            newLayouts[bp as keyof Layouts]?.filter(l => l.i !== widgetId) || [];
        });

        saveToHistory(newWidgets);

        return {
          ...prev,
          widgets: newWidgets,
          layouts: newLayouts,
          selectedWidget: prev.selectedWidget === widgetId ? null : prev.selectedWidget,
        };
      });
    },
    [saveToHistory]
  );

  const duplicateWidget = useCallback(
    (widgetId: string) => {
      const widget = state.widgets.find(w => w.id === widgetId);
      if (widget) {
        addWidget({
          ...widget,
          title: `${widget.title} (Copy)`,
          position: { ...widget.position, x: widget.position.x + 1, y: widget.position.y + 1 },
        });
      }
    },
    [state.widgets, addWidget]
  );

  // Layout change handler
  const handleLayoutChange = useCallback((layout: Layout[], layouts: Layouts) => {
    setState(prev => {
      const newWidgets = prev.widgets.map(widget => {
        const layoutItem = layout.find(l => l.i === widget.id);
        if (layoutItem) {
          return {
            ...widget,
            position: {
              x: layoutItem.x,
              y: layoutItem.y,
              w: layoutItem.w,
              h: layoutItem.h,
            },
          };
        }
        return widget;
      });

      return {
        ...prev,
        widgets: newWidgets,
        layouts,
      };
    });
  }, []);

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const widget = state.widgets.find(w => w.id === active.id);
      setState(prev => ({ ...prev, draggedWidget: widget || null }));
    },
    [state.widgets]
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setState(prev => ({ ...prev, draggedWidget: null }));
  }, []);

  // Save and preview handlers
  const handleSave = useCallback(() => {
    const updatedTemplate: DashboardTemplate = {
      ...template,
      widgets: state.widgets,
    };
    onSave(updatedTemplate);
  }, [template, state.widgets, onSave]);

  const handlePreview = useCallback(() => {
    const updatedTemplate: DashboardTemplate = {
      ...template,
      widgets: state.widgets,
    };
    onPreview(updatedTemplate);
  }, [template, state.widgets, onPreview]);

  const selectedWidget = useMemo(
    () => state.widgets.find(w => w.id === state.selectedWidget),
    [state.widgets, state.selectedWidget]
  );

  const canUndo = state.historyIndex > 0;
  const canRedo = state.historyIndex < state.history.length - 1;

  if (state.mode === 'preview') {
    return (
      <DashboardPreview
        template={{ ...template, widgets: state.widgets }}
        onBack={() => setState(prev => ({ ...prev, mode: 'edit' }))}
      />
    );
  }

  return (
    <div className={cn('h-full flex flex-col bg-gray-50', className)}>
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
              Dashboard Builder - {template.name}
            </h2>
            <div className="flex items-center space-x-1 sm:space-x-2">
              <button
                onClick={undo}
                disabled={!canUndo}
                className={cn(
                  'p-1.5 sm:p-2 rounded-md transition-colors',
                  canUndo
                    ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    : 'text-gray-300 cursor-not-allowed'
                )}
                title="Undo"
              >
                <Undo className="h-3 w-3 sm:h-4 sm:w-4" />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className={cn(
                  'p-1.5 sm:p-2 rounded-md transition-colors',
                  canRedo
                    ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    : 'text-gray-300 cursor-not-allowed'
                )}
                title="Redo"
              >
                <Redo className="h-3 w-3 sm:h-4 sm:w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end space-x-2 sm:space-x-3">
            {/* Breakpoint selector */}
            <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
              {[
                { key: 'lg', icon: Monitor, label: 'Desktop' },
                { key: 'md', icon: Tablet, label: 'Tablet' },
                { key: 'sm', icon: Smartphone, label: 'Mobile' },
              ].map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setState(prev => ({ ...prev, breakpoint: key as any }))}
                  className={cn(
                    'p-1.5 sm:p-2 rounded-md transition-colors',
                    state.breakpoint === key
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  )}
                  title={label}
                >
                  <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
                </button>
              ))}
            </div>

            <div className="h-4 sm:h-6 w-px bg-gray-300 hidden sm:block" />

            <button
              onClick={() => setShowWidgetLibrary(true)}
              className="flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
            >
              <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Add Widget</span>
              <span className="sm:hidden">Add</span>
            </button>

            <button
              onClick={handlePreview}
              className="flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm"
            >
              <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Preview</span>
            </button>

            <button
              onClick={handleSave}
              className="flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
            >
              <Save className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Save</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Grid area */}
        <div className="flex-1 p-3 sm:p-6 overflow-auto">
          <DndContext
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="bg-white rounded-lg border border-gray-200 min-h-[400px] sm:min-h-[600px] p-2 sm:p-4">
              <ResponsiveGridLayout
                className="layout"
                layouts={state.layouts}
                breakpoints={breakpoints}
                cols={cols}
                rowHeight={60}
                onLayoutChange={handleLayoutChange}
                isDraggable={true}
                isResizable={true}
                margin={[12, 12]}
                containerPadding={[0, 0]}
              >
                {state.widgets.map(widget => (
                  <div key={widget.id}>
                    <GridWidget
                      widget={widget}
                      isSelected={state.selectedWidget === widget.id}
                      onSelect={() =>
                        setState(prev => ({
                          ...prev,
                          selectedWidget: widget.id,
                          showConfigPanel: true,
                        }))
                      }
                      onDuplicate={() => duplicateWidget(widget.id)}
                      onRemove={() => removeWidget(widget.id)}
                    />
                  </div>
                ))}
              </ResponsiveGridLayout>

              {state.widgets.length === 0 && (
                <div className="flex flex-col items-center justify-center h-64 sm:h-96 text-gray-500">
                  <Grid3X3 className="h-12 w-12 sm:h-16 sm:w-16 mb-3 sm:mb-4 text-gray-300" />
                  <h3 className="text-base sm:text-lg font-medium mb-2">No widgets added yet</h3>
                  <p className="text-xs sm:text-sm text-center mb-3 sm:mb-4 px-4">
                    Start building your dashboard by adding widgets from the library
                  </p>
                  <button
                    onClick={() => setShowWidgetLibrary(true)}
                    className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Your First Widget</span>
                  </button>
                </div>
              )}
            </div>

            <DragOverlay>
              {state.draggedWidget && (
                <div className="bg-white rounded-lg border-2 border-blue-500 shadow-lg p-3 sm:p-4 opacity-90">
                  <div className="font-medium text-gray-900 text-sm sm:text-base">
                    {state.draggedWidget.title}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500">{state.draggedWidget.type}</div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Configuration panel */}
        {showConfigPanel && selectedWidget && (
          <div className="w-full lg:w-80 bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex-shrink-0 max-h-96 lg:max-h-none overflow-y-auto">
            <WidgetConfigPanel
              widget={selectedWidget}
              onUpdate={updates => updateWidget(selectedWidget.id, updates)}
              onClose={() => setShowConfigPanel(false)}
            />
          </div>
        )}
      </div>

      {/* Widget Library Modal */}
      {showWidgetLibrary && (
        <WidgetLibrary onAddWidget={addWidget} onClose={() => setShowWidgetLibrary(false)} />
      )}
    </div>
  );
};

export default DashboardBuilder;
