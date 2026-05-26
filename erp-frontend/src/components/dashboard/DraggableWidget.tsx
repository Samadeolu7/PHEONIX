import React, { useState, useEffect } from 'react';
import { Grip, Trash2, Maximize2, Menu, BarChart3, Grid, FileText } from 'lucide-react';
import { Widget } from '../../types';

interface DraggableWidgetProps {
  widget: Widget;
  onUpdate: (widget: Widget) => void;
  onDelete: () => void;
  onSelect: () => void;
  isSelected: boolean;
  gridSize: number;
}

const DraggableWidget: React.FC<DraggableWidgetProps> = ({
  widget,
  onUpdate,
  onDelete,
  onSelect,
  isSelected,
  gridSize,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ w: 0, h: 0, x: 0, y: 0 });

  const IconComp =
    widget.widget_type === 'sidebar'
      ? Menu
      : widget.widget_type === 'kpi'
        ? BarChart3
        : widget.widget_type === 'quick_links'
          ? Grid
          : widget.widget_type === 'chart'
            ? BarChart3
            : FileText;

  const handleMouseDown = (e: any) => {
    if ((e.target as HTMLElement).closest('.resize-handle')) return;
    if ((e.target as HTMLElement).closest('button')) return;

    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - widget.layout.x * gridSize,
      y: e.clientY - widget.layout.y * gridSize,
    });
    onSelect();
  };

  const handleResizeMouseDown = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      w: widget.layout.w,
      h: widget.layout.h,
      x: e.clientX,
      y: e.clientY,
    });
    onSelect();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = Math.round((e.clientX - dragStart.x) / gridSize);
        const newY = Math.round((e.clientY - dragStart.y) / gridSize);

        onUpdate({
          ...widget,
          layout: {
            ...widget.layout,
            x: Math.max(0, Math.min(12 - widget.layout.w, newX)),
            y: Math.max(0, newY),
          },
        });
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;

        const newW = Math.max(2, resizeStart.w + Math.round(deltaX / gridSize));
        const newH = Math.max(2, resizeStart.h + Math.round(deltaY / gridSize));

        onUpdate({
          ...widget,
          layout: {
            ...widget.layout,
            w: Math.min(12 - widget.layout.x, newW),
            h: newH,
          },
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isDragging ? 'grabbing' : 'se-resize';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
      };
    }
  }, [isDragging, isResizing, dragStart, resizeStart, widget, onUpdate, gridSize]);

  return (
    <div
      style={{
        position: 'absolute',
        left: `${widget.layout.x * gridSize}px`,
        top: `${widget.layout.y * gridSize}px`,
        width: `${widget.layout.w * gridSize - 16}px`,
        height: `${widget.layout.h * gridSize - 16}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
        background: 'white',
        borderRadius: '0.5rem',
        boxShadow: isSelected
          ? '0 0 0 2px #3b82f6, 0 10px 15px -3px rgba(0, 0, 0, 0.1)'
          : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        opacity: isDragging || isResizing ? 0.75 : 1,
        zIndex: isDragging || isResizing ? 50 : 'auto',
        transition: 'box-shadow 0.2s',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Widget Header */}
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f9fafb',
          borderTopLeftRadius: '0.5rem',
          borderTopRightRadius: '0.5rem',
          cursor: 'move',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Grip style={{ width: '1rem', height: '1rem', color: '#9ca3af' }} />
          <IconComp style={{ width: '1rem', height: '1rem', color: '#4b5563' }} />
          <span style={{ fontWeight: 500, fontSize: '0.875rem', color: '#111827' }}>
            {widget.title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <button
            onClick={e => {
              e.stopPropagation();
              onDelete();
            }}
            style={{
              padding: '0.25rem',
              borderRadius: '0.25rem',
              border: 'none',
              background: 'transparent',
              color: '#dc2626',
              cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Trash2 style={{ width: '1rem', height: '1rem' }} />
          </button>
        </div>
      </div>

      {/* Widget Content */}
      <div style={{ padding: '1rem', height: 'calc(100% - 56px)', overflow: 'auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#9ca3af',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <IconComp
              style={{ width: '3rem', height: '3rem', margin: '0 auto 0.5rem', opacity: 0.3 }}
            />
            <p style={{ fontSize: '0.875rem' }}>{widget.widget_type}</p>
            <p style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
              {widget.layout.w}×{widget.layout.h} grid units
            </p>
          </div>
        </div>
      </div>

      {/* Resize Handle */}
      {isSelected && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '1.5rem',
            height: '1.5rem',
            cursor: 'se-resize',
          }}
          className="resize-handle"
          onMouseDown={handleResizeMouseDown}
        >
          <Maximize2
            style={{
              width: '1rem',
              height: '1rem',
              color: '#2563eb',
              position: 'absolute',
              bottom: '0.25rem',
              right: '0.25rem',
            }}
          />
        </div>
      )}

      {/* Grid Position Indicator */}
      {(isDragging || isResizing) && (
        <div
          style={{
            position: 'absolute',
            top: '-2rem',
            left: 0,
            padding: '0.25rem 0.5rem',
            background: '#2563eb',
            color: 'white',
            fontSize: '0.75rem',
            borderRadius: '0.25rem',
          }}
        >
          x:{widget.layout.x} y:{widget.layout.y} {widget.layout.w}×{widget.layout.h}
        </div>
      )}
    </div>
  );
};

export default DraggableWidget;
