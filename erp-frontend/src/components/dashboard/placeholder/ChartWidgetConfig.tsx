// src/components/dashboard/ChartWidgetConfig.tsx
import React, { useState } from 'react';
import { X, Plus, Save, Grip, Trash2, BarChart3 } from 'lucide-react';

interface ChartWidgetConfigProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: any) => void;
  initialConfig?: any;
}

const ChartWidgetConfig: React.FC<ChartWidgetConfigProps> = ({
  isOpen,
  onClose,
  onSave,
  initialConfig,
}) => {
  const [chartType, setChartType] = useState(initialConfig?.chartType || 'line');
  const [title, setTitle] = useState(initialConfig?.title || 'Chart Title');
  const [dataPoints, setDataPoints] = useState(
    initialConfig?.dataPoints || [
      { label: 'Jan', value: 30 },
      { label: 'Feb', value: 45 },
      { label: 'Mar', value: 35 },
      { label: 'Apr', value: 50 },
    ]
  );
  const [colors, _setColors] = useState(initialConfig?.colors || ['#3b82f6', '#10b981', '#f59e0b']);
  const [showLegend, setShowLegend] = useState(initialConfig?.showLegend !== false);
  const [showGrid, setShowGrid] = useState(initialConfig?.showGrid !== false);

  if (!isOpen) return null;

  const addDataPoint = () => {
    setDataPoints([...dataPoints, { label: `Point ${dataPoints.length + 1}`, value: 0 }]);
  };

  const updateDataPoint = (index: number, field: string, value: any) => {
    const newPoints = [...dataPoints];
    newPoints[index] = { ...newPoints[index], [field]: value };
    setDataPoints(newPoints);
  };

  const deleteDataPoint = (index: number) => {
    setDataPoints(dataPoints.filter((_: any, i: number) => i !== index));
  };

  const handleSave = () => {
    onSave({
      chartType,
      title,
      dataPoints,
      colors,
      showLegend,
      showGrid,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Configure Chart Widget</h2>
            <p className="text-sm text-gray-500 mt-1">Visualize your data</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Chart Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Chart Type</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setChartType('line')}
                  className={`p-3 border-2 rounded-lg flex flex-col items-center gap-2 ${
                    chartType === 'line' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <BarChart3 className="w-5 h-5" />
                  <span className="text-sm font-medium">Line</span>
                </button>
                <button
                  onClick={() => setChartType('bar')}
                  className={`p-3 border-2 rounded-lg flex flex-col items-center gap-2 ${
                    chartType === 'bar' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <BarChart3 className="w-5 h-5" />
                  <span className="text-sm font-medium">Bar</span>
                </button>
                <button
                  onClick={() => setChartType('area')}
                  className={`p-3 border-2 rounded-lg flex flex-col items-center gap-2 ${
                    chartType === 'area' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <BarChart3 className="w-5 h-5" />
                  <span className="text-sm font-medium">Area</span>
                </button>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Chart Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Data Points */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Data Points ({dataPoints.length})
                </label>
                <button
                  onClick={addDataPoint}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Point
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {dataPoints.map((point: any, _index: number) => (
                  <div key={_index} className="flex items-center gap-3 border rounded-lg p-3">
                    <Grip className="w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={point.label}
                      onChange={e => updateDataPoint(_index, 'label', e.target.value)}
                      placeholder="Label"
                      className="flex-1 px-2 py-1 border rounded text-sm"
                    />
                    <input
                      type="number"
                      value={point.value}
                      onChange={e =>
                        updateDataPoint(_index, 'value', parseFloat(e.target.value) || 0)
                      }
                      placeholder="Value"
                      className="w-24 px-2 py-1 border rounded text-sm"
                    />
                    <button
                      onClick={() => deleteDataPoint(_index)}
                      className="p-1 hover:bg-red-50 rounded text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-lg">
                <input
                  type="checkbox"
                  checked={showLegend}
                  onChange={e => setShowLegend(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm font-medium">Show Legend</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-lg">
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={e => setShowGrid(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm font-medium">Show Grid</span>
              </label>
            </div>

            {/* Preview */}
            <div className="pt-4 border-t">
              <label className="block text-sm font-medium text-gray-700 mb-3">Preview</label>
              <div className="bg-white border-2 rounded-lg p-4">
                <h3 className="font-medium mb-4">{title}</h3>
                <div className="h-48 flex items-end justify-around gap-2">
                  {dataPoints.map((point: any, _index: number) => (
                    <div key={_index} className="flex-1 flex flex-col items-center gap-2">
                      <div
                        className="w-full rounded-t transition-all"
                        style={{
                          height: `${
                            (point.value / Math.max(...dataPoints.map((p: any) => p.value))) * 100
                          }%`,
                          backgroundColor: colors[_index % colors.length],
                          minHeight: '4px',
                        }}
                      />
                      <span className="text-xs text-gray-600">{point.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Chart
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChartWidgetConfig;
