import React from 'react';
import styled from 'styled-components';
import { Calendar, AlertCircle, CheckCircle } from 'lucide-react';

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
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
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

const BillingInfo = styled.div`
  text-align: center;
  padding: 20px 0;
`;

const NextBillingDate = styled.div`
  font-size: 32px;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 8px;
`;

const DateLabel = styled.div`
  font-size: 14px;
  color: #64748b;
  margin-bottom: 24px;
`;

const AmountDue = styled.div`
  font-size: 24px;
  font-weight: 600;
  color: #667eea;
  margin-bottom: 4px;
`;

const AmountLabel = styled.div`
  font-size: 13px;
  color: #64748b;
`;

const DaysRemaining = styled.div<{ urgent: boolean }>`
  margin-top: 20px;
  padding: 12px;
  border-radius: 8px;
  background: ${props => (props.urgent ? '#fef2f2' : '#ecfdf5')};
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: ${props => (props.urgent ? '#dc2626' : '#059669')};
`;

interface NextBillingWidgetProps {
  subscription: any;
}

const NextBillingWidget: React.FC<NextBillingWidgetProps> = ({ subscription }) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount);
  };

  const calculateDaysRemaining = (nextBillingDate: string) => {
    const today = new Date();
    const billing = new Date(nextBillingDate);
    const diff = billing.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  const formatBillingDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const nextBillingDate = subscription.next_billing_date;
  const daysRemaining = calculateDaysRemaining(nextBillingDate);
  const isUrgent = daysRemaining <= 7;
  const amount = subscription.subscription_product?.monthly_price || 0;

  // Calculate actual amount based on frequency
  const getActualAmount = () => {
    switch (subscription.billing_frequency) {
      case 'quarterly':
        return amount * 3;
      case 'yearly':
        return amount * 12;
      default:
        return amount;
    }
  };

  return (
    <Widget>
      <WidgetHeader>
        <IconContainer>
          <Calendar size={20} />
        </IconContainer>
        <HeaderText>
          <WidgetTitle>Next Billing</WidgetTitle>
          <WidgetSubtitle>Upcoming payment</WidgetSubtitle>
        </HeaderText>
      </WidgetHeader>

      <BillingInfo>
        <NextBillingDate>{formatBillingDate(nextBillingDate)}</NextBillingDate>
        <DateLabel>Next payment due date</DateLabel>

        <AmountDue>{formatCurrency(getActualAmount())}</AmountDue>
        <AmountLabel>Amount due</AmountLabel>

        <DaysRemaining urgent={isUrgent}>
          {isUrgent ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
          {daysRemaining > 0
            ? `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`
            : daysRemaining === 0
              ? 'Due today'
              : `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? 's' : ''} overdue`}
        </DaysRemaining>
      </BillingInfo>
    </Widget>
  );
};

export default NextBillingWidget;
