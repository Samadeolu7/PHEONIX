import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line as RechartsLine,
  BarChart,
  Bar as RechartsBar,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  TooltipProps,
} from 'recharts';

const Line = RechartsLine as any;
const Bar = RechartsBar as any;
const XAxis = RechartsXAxis as any;
const YAxis = RechartsYAxis as any;
const Tooltip = RechartsTooltip as any;
const Legend = RechartsLegend as any;

export interface ChartWidgetProps {
  type: 'line_chart' | 'bar_chart';
  config: any;
  data?: Array<Record<string, any>>;
}

const ChartTooltip = (props: TooltipProps<any, any>) => {
  return <Tooltip {...props} />;
};

const ChartWidgetImpl: React.FC<ChartWidgetProps> = ({ type, config, data = [] }) => {
  const commonProps = {
    data,
    margin: { top: 5, right: 30, left: 20, bottom: 5 },
  };

  if (type === 'line_chart') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey={config.xAxis.dataKey}
            label={{ value: config.xAxis.label, position: 'bottom' }}
          />
          <YAxis label={{ value: config.yAxis.label, angle: -90, position: 'insideLeft' }} />
          <ChartTooltip />
          <Legend />
          {config.series.map((s: any, i: number) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name}
              stroke={s.color || `var(--chart-color-${i + 1})`}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart {...commonProps}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey={config.xAxis.dataKey}
          label={{ value: config.xAxis.label, position: 'bottom' }}
        />
        <YAxis label={{ value: config.yAxis.label, angle: -90, position: 'insideLeft' }} />
        <ChartTooltip />
        <Legend />
        {config.series.map((s: any, i: number) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            fill={s.color || `var(--chart-color-${i + 1})`}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ChartWidgetImpl;
