import React from 'react';
import styled from 'styled-components';
import { TrendingUp, Users, FileText, Database } from 'lucide-react';

const Widget = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const WidgetHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
`;

const IconContainer = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1a1a2e;
`;

const HeaderText = styled.div`
  flex: 1;
`;

const WidgetTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
`;

const WidgetSubtitle = styled.p`
  font-size: 12px;
  color: #64748b;
  margin: 2px 0 0 0;
`;

const MetricsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const MetricItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const MetricIcon = styled.div<{ color: string }>`
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => props.color}15;
  color: ${props => props.color};
`;

const MetricDetails = styled.div`
  flex: 1;
`;

const MetricLabel = styled.div`
  font-size: 13px;
  color: #64748b;
  margin-bottom: 4px;
`;

const MetricValue = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: #1a1a2e;
`;

const MetricBar = styled.div`
  width: 100%;
  height: 6px;
  background: #f1f5f9;
  border-radius: 3px;
  overflow: hidden;
  margin-top: 6px;
`;

const MetricProgress = styled.div<{ percentage: number; color: string }>`
  width: ${props => props.percentage}%;
  height: 100%;
  background: ${props => props.color};
  border-radius: 3px;
  transition: width 0.3s ease;
`;

const MetricLimit = styled.div`
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
`;

interface UsageMetricsWidgetProps {
  subscription: any;
}

const UsageMetricsWidget: React.FC<UsageMetricsWidgetProps> = ({ subscription }) => {
  // Mock data - replace with actual API data
  const metrics = [
    {
      icon: Users,
      label: 'Active Users',
      value: subscription.active_users || 0,
      limit: subscription.subscription_product?.max_users || 100,
      color: '#667eea',
    },
    {
      icon: FileText,
      label: 'Invoices This Month',
      value: subscription.invoices_this_month || 0,
      limit: subscription.subscription_product?.max_invoices || 1000,
      color: '#f093fb',
    },
    {
      icon: Database,
      label: 'Storage Used',
      value: subscription.storage_used_gb || 0,
      limit: subscription.subscription_product?.max_storage_gb || 50,
      color: '#4facfe',
      unit: 'GB',
    },
  ];

  const calculatePercentage = (value: number, limit: number) => {
    return Math.min((value / limit) * 100, 100);
  };

  return (
    <Widget>
      <WidgetHeader>
        <IconContainer>
          <TrendingUp size={20} />
        </IconContainer>
        <HeaderText>
          <WidgetTitle>Usage Metrics</WidgetTitle>
          <WidgetSubtitle>Current billing period</WidgetSubtitle>
        </HeaderText>
      </WidgetHeader>

      <MetricsList>
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          const percentage = calculatePercentage(metric.value, metric.limit);

          return (
            <MetricItem key={index}>
              <MetricIcon color={metric.color}>
                <Icon size={18} />
              </MetricIcon>
              <MetricDetails>
                <MetricLabel>{metric.label}</MetricLabel>
                <MetricValue>
                  {metric.value}
                  {metric.unit || ''}{' '}
                  <span style={{ fontSize: '14px', fontWeight: 400, color: '#94a3b8' }}>
                    / {metric.limit}
                    {metric.unit || ''}
                  </span>
                </MetricValue>
                <MetricBar>
                  <MetricProgress percentage={percentage} color={metric.color} />
                </MetricBar>
                <MetricLimit>{percentage.toFixed(0)}% used</MetricLimit>
              </MetricDetails>
            </MetricItem>
          );
        })}
      </MetricsList>
    </Widget>
  );
};

export default UsageMetricsWidget;
