import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
} from 'recharts';

interface Props {
  chartData: any[];
  x_axis?: string;
  y_axis?: string;
  colors?: string[];
  show_legend?: boolean;
  show_grid?: boolean;
  widgetTitle?: string;
}

const BarChartWidgetImpl: React.FC<Props> = ({
  chartData,
  x_axis,
  y_axis,
  colors,
  show_legend,
  show_grid,
}) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} accessibilityLayer role="img">
        {show_grid && <CartesianGrid strokeDasharray="3 3" />}
        <XAxis dataKey={x_axis || 'name'} />
        <YAxis />
        <Tooltip />
        {show_legend && <Legend />}
        <Bar dataKey={y_axis || 'value'} fill={colors?.[0] || '#1a73e8'} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default BarChartWidgetImpl;
