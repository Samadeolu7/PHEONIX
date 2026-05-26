import { useCallback, type FC } from 'react';
import styled from '@emotion/styled';
import { Responsive, WidthProvider } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import WidgetRenderer, { WidgetConfig } from '../widgets/WidgetRenderer';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

const DashboardContainer = styled.div`
  min-height: calc(100vh - 64px);
  padding: 1rem;
  background-color: var(--dashboard-bg-color, #f5f5f5);
`;

interface DashboardRendererProps {
  widgets: WidgetConfig[];
  onLayoutChange?: (layout: Layout[]) => void;
  onWidgetDataRequest?: (widgetId: string) => Promise<unknown>;
}

const DashboardRenderer: FC<DashboardRendererProps> = ({
  widgets = [],
  onLayoutChange,
  onWidgetDataRequest,
}) => {
  const layouts = {
    lg: widgets.map(widget => ({
      i: widget.instanceKey,
      x: widget.position.x,
      y: widget.position.y,
      w: widget.position.w,
      h: widget.position.h,
      minW: 2,
      minH: 2,
    })),
  };

  const handleLayoutChange = useCallback(
    (currentLayout: Layout[]) => {
      onLayoutChange?.(currentLayout);
    },
    [onLayoutChange]
  );

  return (
    <DashboardContainer>
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={100}
        onLayoutChange={handleLayoutChange}
        isDraggable
        isResizable
        containerPadding={[16, 16]}
        margin={[16, 16]}
      >
        {widgets.map(widget => (
          <div key={widget.instanceKey}>
            <WidgetRenderer widget={widget} onDataRequest={onWidgetDataRequest} />
          </div>
        ))}
      </ResponsiveGridLayout>
    </DashboardContainer>
  );
};

export default DashboardRenderer;
