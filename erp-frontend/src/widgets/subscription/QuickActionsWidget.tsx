import React from 'react';
import styled from 'styled-components';
import { Send, FileText, HelpCircle, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
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

const ActionButton = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: none;
  border-radius: 8px;
  background: #f8fafc;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: #f1f5f9;
    transform: translateX(2px);
  }

  &.primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;

    &:hover {
      background: linear-gradient(135deg, #5a67d8 0%, #6a3f8f 100%);
    }

    svg {
      color: white;
    }
  }
`;

const ActionIcon = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
`;

const ActionText = styled.div`
  flex: 1;
  text-align: left;
`;

const ActionTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 2px;

  .primary & {
    color: white;
  }
`;

const ActionDescription = styled.div`
  font-size: 12px;
  color: #64748b;

  .primary & {
    color: rgba(255, 255, 255, 0.9);
  }
`;

interface QuickActionsWidgetProps {
  subscription: any;
}

const QuickActionsWidget: React.FC<QuickActionsWidgetProps> = ({ subscription }) => {
  const navigate = useNavigate();

  const hasOverduePayment =
    subscription.status === 'overdue' || subscription.status === 'suspended';

  return (
    <Widget>
      <WidgetHeader>
        <IconContainer>
          <Settings size={20} />
        </IconContainer>
        <HeaderText>
          <WidgetTitle>Quick Actions</WidgetTitle>
          <WidgetSubtitle>Common tasks</WidgetSubtitle>
        </HeaderText>
      </WidgetHeader>

      {hasOverduePayment && (
        <ActionButton className="primary" onClick={() => navigate('/subscription/submit-payment')}>
          <ActionIcon>
            <Send size={16} />
          </ActionIcon>
          <ActionText>
            <ActionTitle>Submit Payment</ActionTitle>
            <ActionDescription>Pay your subscription fee</ActionDescription>
          </ActionText>
        </ActionButton>
      )}

      <ActionButton onClick={() => navigate('/subscription/invoices')}>
        <ActionIcon>
          <FileText size={16} />
        </ActionIcon>
        <ActionText>
          <ActionTitle>View Invoices</ActionTitle>
          <ActionDescription>All billing history</ActionDescription>
        </ActionText>
      </ActionButton>

      <ActionButton onClick={() => navigate('/subscription/support')}>
        <ActionIcon>
          <HelpCircle size={16} />
        </ActionIcon>
        <ActionText>
          <ActionTitle>Get Support</ActionTitle>
          <ActionDescription>Contact our team</ActionDescription>
        </ActionText>
      </ActionButton>
    </Widget>
  );
};

export default QuickActionsWidget;
