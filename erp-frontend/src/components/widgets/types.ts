export type KpiWidgetConfig = {
  title: string;
  format?: 'number' | 'currency' | 'percentage';
  precision?: number;
  currency?: string;
  prefix?: string;
  suffix?: string;
  comparison?: {
    enabled: boolean;
    type: 'absolute' | 'percentage';
  };
};

export type ChartWidgetConfig = {
  title: string;
  xAxis: {
    dataKey: string;
    label?: string;
  };
  yAxis: {
    label?: string;
    format?: string;
  };
  series: Array<{
    dataKey: string;
    name: string;
    color?: string;
  }>;
};

export interface Column {
  key: string;
  header: string;
  label?: string;
  format?: 'currency' | 'percentage' | 'number' | 'date';
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: Record<string, any>) => React.ReactNode;
}

export type TableWidgetConfig = {
  title: string;
  columns: Column[];
  pagination?: {
    enabled: boolean;
    pageSize: number;
  };
};

export type TextWidgetConfig = {
  title?: string;
  content: string;
  format?: 'plain' | 'markdown';
  textAlign?: 'left' | 'center' | 'right';
};

export type WidgetTypes = 'kpi' | 'line_chart' | 'bar_chart' | 'table' | 'text';

export type WidgetConfig = {
  instanceKey: string;
  definition: {
    code: string;
  };
  configuration: WidgetTypeConfig;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  data?: unknown;
};

export type WidgetTypeConfig =
  | KpiWidgetConfig
  | ChartWidgetConfig
  | TableWidgetConfig
  | TextWidgetConfig;

export type WidgetProps = {
  instance: WidgetConfig;
  onRefresh?: () => Promise<void>;
  className?: string;
};

export type WidgetRendererProps = {
  widgetType: WidgetTypes;
  config: WidgetTypeConfig;
  data?: unknown;
  onRefresh?: () => Promise<void>;
  className?: string;
};

export type CommonWidgetProps = {
  config: WidgetTypeConfig;
  data?: unknown;
  className?: string;
};
