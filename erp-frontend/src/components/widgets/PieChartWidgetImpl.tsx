import React from 'react';
import { ResponsiveContainer, PieChart as RechartsPie, Pie, Tooltip, Cell, Legend } from 'recharts';

interface Props {
  chartData: any[];
  colors?: string[];
  innerRadius?: number;
  widgetTitle?: string;
}

const PieChartWidgetImpl: React.FC<Props> = ({ chartData, colors, innerRadius }) => {
  const COLORS = colors || ['#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#9334ea'];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsPie role="img" aria-label="Pie chart">
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={entry => `${entry.name}: ${entry.value}`}
          innerRadius={innerRadius}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
          nameKey="name"
        >
          {chartData.map((entry: any, index: number) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={value => [value, 'Value']} />
        <Legend />
      </RechartsPie>
    </ResponsiveContainer>
  );
};

export default PieChartWidgetImpl;
