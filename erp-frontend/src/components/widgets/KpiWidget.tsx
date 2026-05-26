import styled from '@emotion/styled';

interface KpiWidgetProps {
  config: {
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
  data?: {
    value: number;
    previousValue?: number;
    trend?: 'up' | 'down' | 'neutral';
  };
}

const KpiContainer = styled.div`
  padding: 16px;
  text-align: center;
`;

const Value = styled.div`
  font-size: 2rem;
  font-weight: 500;
  color: var(--color-text, #000);
  margin-bottom: 8px;
`;

const Title = styled.div`
  font-size: 0.875rem;
  color: var(--color-text-secondary, #666);
`;

const Delta = styled.div<{ trend: 'up' | 'down' | 'neutral' }>`
  font-size: 0.875rem;
  color: ${({ trend }) => {
    switch (trend) {
      case 'up':
        return 'var(--color-success, #4caf50)';
      case 'down':
        return 'var(--color-error, #f44336)';
      default:
        return 'var(--color-text-secondary, #666)';
    }
  }};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 8px;
`;

export const KpiWidget = ({ config, data }: KpiWidgetProps) => {
  const formatValue = (value: number): string => {
    const precision = config.precision ?? 2;

    if (config.format === 'currency') {
      return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: config.currency || 'NGN',
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
      }).format(value);
    }

    if (config.format === 'percentage') {
      return `${value.toFixed(precision)}%`;
    }

    return new Intl.NumberFormat('en-NG', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(value);
  };

  const renderValue = (): string => {
    if (!data?.value && data?.value !== 0) return '—';

    let formatted = formatValue(data.value);

    if (config.prefix) formatted = config.prefix + formatted;
    if (config.suffix) formatted = formatted + config.suffix;

    return formatted;
  };

  const renderComparison = () => {
    if (!config.comparison?.enabled || !data?.previousValue || data?.value === undefined) {
      return null;
    }

    const diff = data.value - data.previousValue;
    const percentage = ((diff / Math.abs(data.previousValue)) * 100).toFixed(1);
    const trend: 'up' | 'down' | 'neutral' = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';

    return (
      <Delta trend={trend}>
        {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—'}
        {config.comparison.type === 'percentage'
          ? `${Math.abs(Number(percentage))}%`
          : formatValue(Math.abs(diff))}
      </Delta>
    );
  };

  return (
    <KpiContainer>
      {config.title && <Title>{config.title}</Title>}
      <Value>{renderValue()}</Value>
      {renderComparison()}
    </KpiContainer>
  );
};
