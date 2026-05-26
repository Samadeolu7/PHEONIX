import React from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { Receipt, CheckCircle, XCircle, Clock, Download } from 'lucide-react';
import { subscriptionService } from '../../services/subscriptionService';

const Widget = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const WidgetHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const IconContainer = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
`;

const HeaderText = styled.div``;

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

const ViewAllLink = styled.button`
  background: none;
  border: none;
  color: #667eea;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;

  &:hover {
    color: #5a67d8;
  }
`;

const PaymentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const PaymentItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: #f8fafc;
  transition: background 0.2s;

  &:hover {
    background: #f1f5f9;
  }
`;

const PaymentIcon = styled.div<{ status: string }>`
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => {
    switch (props.status) {
      case 'paid':
        return '#ecfdf5';
      case 'pending':
        return '#fef3c7';
      case 'rejected':
        return '#fef2f2';
      default:
        return '#f3f4f6';
    }
  }};
  color: ${props => {
    switch (props.status) {
      case 'paid':
        return '#059669';
      case 'pending':
        return '#d97706';
      case 'rejected':
        return '#dc2626';
      default:
        return '#6b7280';
    }
  }};
`;

const PaymentDetails = styled.div`
  flex: 1;
`;

const PaymentAmount = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 2px;
`;

const PaymentDate = styled.div`
  font-size: 12px;
  color: #64748b;
`;

const PaymentStatus = styled.span<{ status: string }>`
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  background: ${props => {
    switch (props.status) {
      case 'paid':
        return '#ecfdf5';
      case 'pending':
        return '#fef3c7';
      case 'rejected':
        return '#fef2f2';
      default:
        return '#f3f4f6';
    }
  }};
  color: ${props => {
    switch (props.status) {
      case 'paid':
        return '#059669';
      case 'pending':
        return '#d97706';
      case 'rejected':
        return '#dc2626';
      default:
        return '#6b7280';
    }
  }};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px 20px;
  color: #64748b;
`;

const LoadingState = styled.div`
  text-align: center;
  padding: 40px 20px;
  color: #64748b;
`;

interface PaymentHistoryWidgetProps {
  subscriptionId: number;
}

const PaymentHistoryWidget: React.FC<PaymentHistoryWidgetProps> = ({ subscriptionId }) => {
  const { data: payments, isLoading } = useQuery({
    queryKey: ['subscription-payments', subscriptionId],
    queryFn: () => subscriptionService.getPaymentHistory(subscriptionId, 5), // Last 5 payments
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle size={18} />;
      case 'pending':
        return <Clock size={18} />;
      case 'rejected':
        return <XCircle size={18} />;
      default:
        return <Clock size={18} />;
    }
  };

  const getStatusLabel = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <Widget>
      <WidgetHeader>
        <HeaderLeft>
          <IconContainer>
            <Receipt size={20} />
          </IconContainer>
          <HeaderText>
            <WidgetTitle>Payment History</WidgetTitle>
            <WidgetSubtitle>Recent transactions</WidgetSubtitle>
          </HeaderText>
        </HeaderLeft>
        <ViewAllLink onClick={() => {}}>View All</ViewAllLink>
      </WidgetHeader>

      {isLoading ? (
        <LoadingState>Loading payment history...</LoadingState>
      ) : !payments || payments.length === 0 ? (
        <EmptyState>No payment history yet</EmptyState>
      ) : (
        <PaymentList>
          {payments.map((payment: any) => (
            <PaymentItem key={payment.id}>
              <PaymentIcon status={payment.status}>{getStatusIcon(payment.status)}</PaymentIcon>
              <PaymentDetails>
                <PaymentAmount>{formatCurrency(payment.amount)}</PaymentAmount>
                <PaymentDate>
                  {payment.payment_date ? formatDate(payment.payment_date) : 'Pending'}
                  {payment.reference_number && ` • ${payment.reference_number}`}
                </PaymentDate>
              </PaymentDetails>
              <PaymentStatus status={payment.status}>
                {getStatusLabel(payment.status)}
              </PaymentStatus>
            </PaymentItem>
          ))}
        </PaymentList>
      )}
    </Widget>
  );
};

export default PaymentHistoryWidget;
