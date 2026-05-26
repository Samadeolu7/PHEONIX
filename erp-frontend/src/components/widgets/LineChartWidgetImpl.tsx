import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
} from 'recharts';

interface Props {
  chartData: any[];
  x_axis?: string;
  y_axis?: string;
  colors?: string[];
  show_legend?: boolean;
  show_grid?: boolean;
}

const LineChartWidgetImpl: React.FC<Props> = ({
  chartData,
  x_axis,
  y_axis,
  colors,
  show_legend,
  show_grid,
}) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} accessibilityLayer role="img">
        {show_grid && <CartesianGrid strokeDasharray="3 3" />}
        <XAxis dataKey={x_axis || 'name'} />
        <YAxis />
        <Tooltip />
        {show_legend && <Legend />}
        <Line
          type="monotone"
          dataKey={y_axis || 'value'}
          stroke={colors?.[0] || '#1a73e8'}
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default LineChartWidgetImpl;
