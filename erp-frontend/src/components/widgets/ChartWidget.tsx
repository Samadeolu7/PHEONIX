import React from 'react';

const ChartWidget = React.lazy(() =>
  import('./ChartWidgetImpl').then(m => ({ default: m.default }))
);

export { ChartWidget };
