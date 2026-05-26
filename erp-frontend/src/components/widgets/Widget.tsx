import React, { Suspense } from 'react';
import styled from '@emotion/styled';
import {
  WidgetProps,
  WidgetRendererProps,
  KpiWidgetConfig,
  ChartWidgetConfig,
  TableWidgetConfig,
  TextWidgetConfig,
  WidgetTypes,
} from './types';
import { KpiWidget } from './KpiWidget';
const ChartWidget = React.lazy(() =>
  import('./ChartWidget').then(m => ({ default: m.ChartWidget }))
);
import { TableWidget } from './TableWidget';
import { TextWidget } from './TextWidget';

const WidgetRenderer: React.FC<WidgetRendererProps> = ({
  widgetType = 'text' as WidgetTypes,
  config,
  data,
  onRefresh,
  className,
}) => {
  const renderWidget = () => {
    switch (widgetType) {
      case 'kpi':
        return (
          <KpiWidget
            config={config as KpiWidgetConfig}
            data={
              data as { value: number; previousValue?: number; trend?: 'up' | 'down' | 'neutral' }
            }
          />
        );
      case 'line_chart':
      case 'bar_chart':
        return (
          <Suspense fallback={<div style={{ height: 300 }} />}>
            <ChartWidget
              type={widgetType}
              config={config as ChartWidgetConfig}
              data={data as Record<string, any>[]}
            />
          </Suspense>
        );
      case 'table':
        return (
          <TableWidget config={config as TableWidgetConfig} data={data as Record<string, any>[]} />
        );
      case 'text':
        return <TextWidget config={config as TextWidgetConfig} />;
      default:
        return <div className={className}>Unsupported widget type: {widgetType}</div>;
    }
  };

  return (
    <div className="widget">
      {renderWidget()}
      {onRefresh && (
        <button onClick={onRefresh} className="widget-refresh">
          Refresh
        </button>
      )}
    </div>
  );
};

export const Widget: React.FC<WidgetProps> = ({ instance, onRefresh, className }) => {
  // Extract widget type from definition code
  const rawType = instance.definition.code?.split('_')[0] || 'text';
  const widgetType = (['kpi', 'line_chart', 'bar_chart', 'table', 'text'] as const).includes(
    rawType as any
  )
    ? (rawType as WidgetTypes)
    : ('text' as WidgetTypes);

  const WidgetContainer = styled.div`
    position: absolute;
    left: ${instance.position.x}px;
    top: ${instance.position.y}px;
    width: ${instance.position.w}px;
    height: ${instance.position.h}px;
  `;

  return (
    <WidgetContainer className={`widget-container ${className || ''}`}>
      <WidgetRenderer
        widgetType={widgetType}
        config={instance.configuration}
        data={instance.data}
        onRefresh={onRefresh}
        className="widget-content"
      />
    </WidgetContainer>
  );
};

export default Widget;
