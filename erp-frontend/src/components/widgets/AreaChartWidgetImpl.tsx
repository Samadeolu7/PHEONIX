import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Area,
} from 'recharts';

interface Props {
  chartData: any[];
  x_axis?: string;
  y_axis?: string;
  colors?: string[];
}

const AreaChartWidgetImpl: React.FC<Props> = ({ chartData, x_axis, y_axis, colors }) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} accessibilityLayer role="img">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={x_axis || 'name'} />
        <YAxis />
        <Tooltip />
        <Area
          type="monotone"
          dataKey={y_axis || 'value'}
          stroke={colors?.[0] || '#1a73e8'}
          fill={colors?.[0] || '#1a73e8'}
          fillOpacity={0.3}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default AreaChartWidgetImpl;
