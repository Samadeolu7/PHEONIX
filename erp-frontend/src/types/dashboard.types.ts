// Widget Types
export type WidgetType =
  | 'kpi'
  | 'line_chart'
  | 'bar_chart'
  | 'pie_chart'
  | 'table'
  | 'text'
  | 'link'
  | 'navigation'
  | 'composite';

export interface BaseWidgetConfig {
  title: string;
  description?: string;
  refreshInterval?: number; // in seconds
}

export interface KpiWidgetConfig extends BaseWidgetConfig {
  format?: 'number' | 'currency' | 'percentage';
  prefix?: string;
  suffix?: string;
  showTrend?: boolean;
  dataSource: string; // API endpoint or query identifier
}

export interface ChartWidgetConfig extends BaseWidgetConfig {
  xAxisKey: string;
  yAxisKey: string;
  dataSource: string;
  colors?: string[];
}

export interface TableWidgetConfig extends BaseWidgetConfig {
  columns: Array<{
    key: string;
    label: string;
    sortable?: boolean;
    format?: 'text' | 'number' | 'currency' | 'date';
  }>;
  dataSource: string;
  pageSize?: number;
}

export interface TextWidgetConfig extends BaseWidgetConfig {
  content: string;
  fontSize?: number;
  alignment?: 'left' | 'center' | 'right';
}

export interface LinkWidgetConfig extends BaseWidgetConfig {
  url: string;
  icon?: string;
  target?: '_blank' | '_self';
  variant?: 'button' | 'link' | 'card';
  style?: {
    backgroundColor?: string;
    color?: string;
    borderRadius?: string;
  };
}

export interface NavigationWidgetConfig extends BaseWidgetConfig {
  items: Array<{
    label: string;
    url: string;
    icon?: string;
  }>;
  orientation?: 'horizontal' | 'vertical';
  variant?: 'tabs' | 'pills' | 'buttons' | 'menu';
}

export interface CompositeWidgetConfig extends BaseWidgetConfig {
  widgets: Array<{
    type: WidgetType;
    config: WidgetConfig;
    layout?: {
      x: number;
      y: number;
      w: number;
      h: number;
    };
  }>;
  layout?: 'grid' | 'flex' | 'tabs';
  spacing?: number;
}

export type WidgetConfig =
  | KpiWidgetConfig
  | ChartWidgetConfig
  | TableWidgetConfig
  | TextWidgetConfig
  | LinkWidgetConfig
  | NavigationWidgetConfig
  | CompositeWidgetConfig;

// Widget Instance (on a dashboard)
export interface WidgetInstance {
  id: string;
  widgetType: WidgetType;
  instanceKey: string; // Unique key for this instance
  config: WidgetConfig;
  layout: {
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
  };
  data?: any;
}

// Dashboard
export interface Dashboard {
  id: string;
  name: string;
  slug: string;
  description?: string;
  widgets: WidgetInstance[];
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Dashboard template for creating new dashboards
export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  previewImage?: string;
  widgets: Omit<WidgetInstance, 'id' | 'instanceKey'>[];
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}
