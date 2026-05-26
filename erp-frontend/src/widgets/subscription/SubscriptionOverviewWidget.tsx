import React from 'react';
import styled from 'styled-components';
import { DollarSign, Calendar, CreditCard, TrendingUp } from 'lucide-react';

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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
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

const DetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  &:first-child {
    padding-top: 0;
  }
`;

const DetailLabel = styled.span`
  font-size: 14px;
  color: #64748b;
`;

const DetailValue = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
`;

const StatusBadge = styled.span<{ status: string }>`
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background: ${props => {
    switch (props.status) {
      case 'active':
        return '#ecfdf5';
      case 'suspended':
        return '#fef2f2';
      case 'overdue':
        return '#fef3c7';
      default:
        return '#f3f4f6';
    }
  }};
  color: ${props => {
    switch (props.status) {
      case 'active':
        return '#059669';
      case 'suspended':
        return '#dc2626';
      case 'overdue':
        return '#d97706';
      default:
        return '#6b7280';
    }
  }};
`;

const PlanBadge = styled.span`
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background: #ede9fe;
  color: #7c3aed;
`;

interface SubscriptionOverviewWidgetProps {
  subscription: any;
}

const SubscriptionOverviewWidget: React.FC<SubscriptionOverviewWidgetProps> = ({
  subscription,
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'monthly':
        return 'Monthly';
      case 'quarterly':
        return 'Quarterly';
      case 'yearly':
        return 'Yearly';
      default:
        return frequency;
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <Widget>
      <WidgetHeader>
        <IconContainer>
          <CreditCard size={20} />
        </IconContainer>
        <HeaderText>
          <WidgetTitle>Subscription Overview</WidgetTitle>
          <WidgetSubtitle>Your plan details</WidgetSubtitle>
        </HeaderText>
      </WidgetHeader>

      <DetailRow>
        <DetailLabel>Plan</DetailLabel>
        <PlanBadge>{subscription.subscription_product?.name || 'Standard'}</PlanBadge>
      </DetailRow>

      <DetailRow>
        <DetailLabel>Status</DetailLabel>
        <StatusBadge status={subscription.status}>
          {getStatusLabel(subscription.status)}
        </StatusBadge>
      </DetailRow>

      <DetailRow>
        <DetailLabel>Billing Frequency</DetailLabel>
        <DetailValue>{getFrequencyLabel(subscription.billing_frequency)}</DetailValue>
      </DetailRow>

      <DetailRow>
        <DetailLabel>Monthly Rate</DetailLabel>
        <DetailValue>
          {formatCurrency(subscription.subscription_product?.monthly_price || 0)}
        </DetailValue>
      </DetailRow>

      <DetailRow>
        <DetailLabel>Start Date</DetailLabel>
        <DetailValue>{formatDate(subscription.start_date)}</DetailValue>
      </DetailRow>

      {subscription.end_date && (
        <DetailRow>
          <DetailLabel>End Date</DetailLabel>
          <DetailValue>{formatDate(subscription.end_date)}</DetailValue>
        </DetailRow>
      )}
    </Widget>
  );
};

export default SubscriptionOverviewWidget;
