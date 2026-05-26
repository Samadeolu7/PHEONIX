import React, { useRef } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { Widget } from '../../types';
import DraggableWidget from './DraggableWidget';

interface WidgetCanvasProps {
  widgets: Widget[];
  onUpdateWidget: (index: number, widget: Widget) => void;
  onDeleteWidget: (index: number) => void;
  selectedIndex: number | null;
  onSelectWidget: (index: number | null) => void;
}

const WidgetCanvas: React.FC<WidgetCanvasProps> = ({
  widgets,
  onUpdateWidget,
  onDeleteWidget,
  selectedIndex,
  onSelectWidget,
}) => {
  const GRID_SIZE = 80;
  const GRID_COLS = 12;
  const GRID_ROWS = 16;

  const canvasRef = useRef<HTMLDivElement>(null);

  const maxY = widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), GRID_ROWS);
  const canvasHeight = Math.max(GRID_ROWS, maxY) * GRID_SIZE;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px', backgroundColor: '#f9fafb' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        <div
          ref={canvasRef}
          style={{
            position: 'relative',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            border: '2px dashed #d1d5db',
            width: `${GRID_COLS * GRID_SIZE}px`,
            height: `${canvasHeight}px`,
            backgroundImage: `
              linear-gradient(to right, #e5e7eb 1px, transparent 1px),
              linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
            `,
            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          }}
          onClick={e => {
            if (e.target === canvasRef.current) {
              onSelectWidget(null);
            }
          }}
        >
          {widgets.length === 0 ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <LayoutDashboard
                  style={{ width: '64px', height: '64px', color: '#d1d5db', margin: '0 auto 16px' }}
                />
                <p style={{ color: '#6b7280', marginBottom: '8px' }}>No widgets yet</p>
                <p style={{ fontSize: '14px', color: '#9ca3af' }}>
                  Click widgets from the left panel to add them
                </p>
              </div>
            </div>
          ) : null}

          {widgets.map((widget, index) => (
            <DraggableWidget
              key={widget.id}
              widget={widget}
              onUpdate={updated => onUpdateWidget(index, updated)}
              onDelete={() => onDeleteWidget(index)}
              onSelect={() => onSelectWidget(index)}
              isSelected={selectedIndex === index}
              gridSize={GRID_SIZE}
            />
          ))}

          {/* Grid Size Indicator */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              padding: '8px 12px',
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            }}
          >
            <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
              Grid: 12 columns
            </p>
            <p style={{ fontSize: '12px', color: '#6b7280' }}>Unit: {GRID_SIZE}px</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WidgetCanvas;
