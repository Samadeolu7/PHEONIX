import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Clock, DollarSign, Calendar, TrendingUp } from 'lucide-react';
import styled from 'styled-components';
import { subscriptionService } from '../../services/subscriptionService';
import SubscriptionOverviewWidget from '../../widgets/subscription/SubscriptionOverviewWidget';
import PaymentHistoryWidget from '../../widgets/subscription/PaymentHistoryWidget';
import NextBillingWidget from '../../widgets/subscription/NextBillingWidget';
import UsageMetricsWidget from '../../widgets/subscription/UsageMetricsWidget';
import QuickActionsWidget from '../../widgets/subscription/QuickActionsWidget';

const DashboardContainer = styled.div`
  padding: 24px;
  background: #f5f7fa;
  min-height: 100vh;
`;

const Header = styled.div`
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: #64748b;
`;

const WidgetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
  margin-bottom: 24px;
`;

const StatusBanner = styled.div<{ status: string }>`
  padding: 16px 24px;
  border-radius: 8px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
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
  border-left: 4px solid
    ${props => {
      switch (props.status) {
        case 'active':
          return '#10b981';
        case 'suspended':
          return '#ef4444';
        case 'overdue':
          return '#f59e0b';
        default:
          return '#9ca3af';
      }
    }};
`;

const StatusIcon = styled.div<{ status: string }>`
  color: ${props => {
    switch (props.status) {
      case 'active':
        return '#10b981';
      case 'suspended':
        return '#ef4444';
      case 'overdue':
        return '#f59e0b';
      default:
        return '#9ca3af';
    }
  }};
`;

const StatusText = styled.div`
  flex: 1;
`;

const StatusTitle = styled.div`
  font-weight: 600;
  font-size: 14px;
  color: #1a1a2e;
  margin-bottom: 2px;
`;

const StatusDescription = styled.div`
  font-size: 13px;
  color: #64748b;
`;

const LargeWidgetSection = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
  margin-bottom: 24px;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const SubscriptionDashboard: React.FC = () => {
  const { data: subscription, isLoading } = useQuery({
    queryKey: ['subscription', 'current'],
    queryFn: () => subscriptionService.getCurrentSubscription(),
  });

  if (isLoading) {
    return (
      <DashboardContainer>
        <Header>
          <Title>Loading subscription...</Title>
        </Header>
      </DashboardContainer>
    );
  }

  if (!subscription) {
    return (
      <DashboardContainer>
        <Header>
          <Title>No Active Subscription</Title>
          <Subtitle>Contact your administrator to set up a subscription plan.</Subtitle>
        </Header>
      </DashboardContainer>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle size={20} />;
      case 'suspended':
        return <AlertCircle size={20} />;
      case 'overdue':
        return <Clock size={20} />;
      default:
        return <Clock size={20} />;
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'active':
        return {
          title: 'Subscription Active',
          description: 'Your subscription is active and all features are available.',
        };
      case 'suspended':
        return {
          title: 'Subscription Suspended',
          description: 'Your account has been suspended. Please contact support or make a payment.',
        };
      case 'overdue':
        return {
          title: 'Payment Overdue',
          description: 'You have an overdue payment. Please submit payment to avoid suspension.',
        };
      default:
        return {
          title: 'Subscription Status',
          description: 'Check your subscription details below.',
        };
    }
  };

  const statusMessage = getStatusMessage(subscription.status);

  return (
    <DashboardContainer>
      <Header>
        <Title>Subscription Dashboard</Title>
        <Subtitle>Manage your Phoenix ERP subscription and payments</Subtitle>
      </Header>

      <StatusBanner status={subscription.status}>
        <StatusIcon status={subscription.status}>{getStatusIcon(subscription.status)}</StatusIcon>
        <StatusText>
          <StatusTitle>{statusMessage.title}</StatusTitle>
          <StatusDescription>{statusMessage.description}</StatusDescription>
        </StatusText>
      </StatusBanner>

      <WidgetGrid>
        <SubscriptionOverviewWidget subscription={subscription} />
        <NextBillingWidget subscription={subscription} />
        <QuickActionsWidget subscription={subscription} />
      </WidgetGrid>

      <LargeWidgetSection>
        <PaymentHistoryWidget subscriptionId={subscription.id} />
        <UsageMetricsWidget subscription={subscription} />
      </LargeWidgetSection>
    </DashboardContainer>
  );
};

export default SubscriptionDashboard;
