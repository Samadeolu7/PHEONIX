// src/components/dashboard/ChartWidgetConfigStyled.tsx
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
  const [colors] = useState(initialConfig?.colors || ['#3b82f6', '#10b981', '#f59e0b']);
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          width: '100%',
          maxWidth: '48rem',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>
              Configure Chart Widget
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Visualize your data
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#f3f4f6')}
            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X style={{ width: '1.25rem', height: '1.25rem' }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Chart Type */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.5rem',
                }}
              >
                Chart Type
              </label>
              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}
              >
                {['line', 'bar', 'area'].map(type => (
                  <button
                    key={type}
                    onClick={() => setChartType(type)}
                    style={{
                      padding: '0.75rem',
                      border: chartType === type ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                      borderRadius: '0.5rem',
                      background: chartType === type ? '#eff6ff' : 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <BarChart3 style={{ width: '1.25rem', height: '1.25rem' }} />
                    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.5rem',
                }}
              >
                Chart Title
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                }}
              />
            </div>

            {/* Data Points */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.75rem',
                }}
              >
                <label style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                  Data Points ({dataPoints.length})
                </label>
                <button
                  onClick={addDataPoint}
                  style={{
                    padding: '0.375rem 0.75rem',
                    background: '#3b82f6',
                    color: 'white',
                    borderRadius: '0.5rem',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = '#2563eb')}
                  onMouseOut={e => (e.currentTarget.style.background = '#3b82f6')}
                >
                  <Plus style={{ width: '1rem', height: '1rem' }} />
                  Add Point
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  maxHeight: '16rem',
                  overflowY: 'auto',
                }}
              >
                {dataPoints.map((point: any, _index: number) => (
                  <div
                    key={_index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                    }}
                  >
                    <Grip style={{ width: '1rem', height: '1rem', color: '#9ca3af' }} />
                    <input
                      type="text"
                      value={point.label}
                      onChange={e => updateDataPoint(_index, 'label', e.target.value)}
                      placeholder="Label"
                      style={{
                        flex: 1,
                        padding: '0.25rem 0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                      }}
                    />
                    <input
                      type="number"
                      value={point.value}
                      onChange={e =>
                        updateDataPoint(_index, 'value', parseFloat(e.target.value) || 0)
                      }
                      placeholder="Value"
                      style={{
                        width: '6rem',
                        padding: '0.25rem 0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                      }}
                    />
                    <button
                      onClick={() => deleteDataPoint(_index)}
                      style={{
                        padding: '0.25rem',
                        borderRadius: '0.25rem',
                        border: 'none',
                        background: 'transparent',
                        color: '#dc2626',
                        cursor: 'pointer',
                      }}
                      onMouseOver={e => (e.currentTarget.style.background = '#fef2f2')}
                      onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Trash2 style={{ width: '1rem', height: '1rem' }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Options */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  cursor: 'pointer',
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={showLegend}
                  onChange={e => setShowLegend(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Show Legend</span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  cursor: 'pointer',
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={e => setShowGrid(e.target.checked)}
                  style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Show Grid</span>
              </label>
            </div>

            {/* Preview */}
            <div style={{ paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: '0.75rem',
                }}
              >
                Preview
              </label>
              <div
                style={{
                  background: 'white',
                  border: '2px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                }}
              >
                <h3 style={{ fontWeight: 500, marginBottom: '1rem' }}>{title}</h3>
                <div
                  style={{
                    height: '12rem',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-around',
                    gap: '0.5rem',
                  }}
                >
                  {dataPoints.map((point: any, _index: number) => (
                    <div
                      key={_index}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          borderTopLeftRadius: '0.25rem',
                          borderTopRightRadius: '0.25rem',
                          transition: 'all 0.3s',
                          height: `${(point.value / Math.max(...dataPoints.map((p: any) => p.value))) * 100}%`,
                          backgroundColor: 'var(--chart-color)',
                          minHeight: '4px',
                        }}
                      />
                      <span style={{ fontSize: '0.75rem', color: '#4b5563' }}>{point.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            background: '#f9fafb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              background: 'white',
              cursor: 'pointer',
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#f9fafb')}
            onMouseOut={e => (e.currentTarget.style.background = 'white')}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '0.5rem 1rem',
              background: '#3b82f6',
              color: 'white',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#2563eb')}
            onMouseOut={e => (e.currentTarget.style.background = '#3b82f6')}
          >
            <Save style={{ width: '1rem', height: '1rem' }} />
            Save Chart
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChartWidgetConfig;
