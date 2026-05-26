import React, { useState } from 'react';
import styled from '@emotion/styled';
import type {
  ApprovalRequest,
  AutomationRun,
  ApprovalActionRequest,
} from '../../types/automation.types';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const Header = styled.div`
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1.5rem;
`;

const Title = styled.h3`
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
`;

const Subtitle = styled.p`
  margin: 0;
  opacity: 0.9;
  font-size: 0.875rem;
`;

const Content = styled.div`
  padding: 1.5rem;
`;

const Section = styled.div`
  margin-bottom: 1.5rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h4`
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary-color, #718096);
  margin: 0 0 0.75rem 0;
  letter-spacing: 0.05em;
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
`;

const InfoCard = styled.div`
  background: #f7fafc;
  border-radius: 6px;
  padding: 1rem;
`;

const InfoLabel = styled.div`
  font-size: 0.75rem;
  color: var(--text-secondary-color, #718096);
  margin-bottom: 0.25rem;
`;

const InfoValue = styled.div`
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary-color, #2c3e50);
`;

const ParametersTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableRow = styled.tr`
  border-bottom: 1px solid #e2e8f0;

  &:last-child {
    border-bottom: none;
  }
`;

const TableCell = styled.td`
  padding: 0.75rem;

  &:first-of-type {
    font-weight: 500;
    color: var(--text-secondary-color, #4a5568);
    width: 40%;
  }

  &:last-of-type {
    color: var(--text-primary-color, #2c3e50);
  }
`;

const CommentBox = styled.div`
  margin-top: 1rem;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 100px;
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.875rem;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: var(--primary-color, #1a73e8);
    box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.1);
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
`;

const Button = styled.button<{ variant?: 'approve' | 'reject' | 'secondary' }>`
  flex: 1;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;

  ${props => {
    switch (props.variant) {
      case 'approve':
        return `
          background-color: #48bb78;
          color: white;
          
          &:hover:not(:disabled) {
            background-color: #38a169;
          }
        `;
      case 'reject':
        return `
          background-color: #f56565;
          color: white;
          
          &:hover:not(:disabled) {
            background-color: #e53e3e;
          }
        `;
      case 'secondary':
      default:
        return `
          background-color: transparent;
          color: var(--text-primary-color, #2c3e50);
          border: 1px solid #e2e8f0;
          
          &:hover:not(:disabled) {
            background-color: #f7fafc;
          }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const StatusBadge = styled.span<{ status: ApprovalRequest['status'] }>`
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;

  ${props => {
    switch (props.status) {
      case 'pending':
        return `
          background-color: #fef3c7;
          color: #78350f;
        `;
      case 'approved':
        return `
          background-color: #d1fae5;
          color: #065f46;
        `;
      case 'rejected':
        return `
          background-color: #fee2e2;
          color: #991b1b;
        `;
      default:
        return `
          background-color: #e2e8f0;
          color: #4a5568;
        `;
    }
  }}
`;

const AlertBox = styled.div<{ type: 'warning' | 'info' }>`
  padding: 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;

  ${props =>
    props.type === 'warning'
      ? `
    background-color: #fef3c7;
    border-left: 4px solid #f59e0b;
    color: #78350f;
  `
      : `
    background-color: #dbeafe;
    border-left: 4px solid #3b82f6;
    color: #1e40af;
  `}
`;

export interface ApprovalInterfaceProps {
  approval: ApprovalRequest;
  run: AutomationRun;
  onApprove: (request: ApprovalActionRequest) => Promise<void>;
  onReject: (request: ApprovalActionRequest) => Promise<void>;
  readonly?: boolean;
}

export const ApprovalInterface: React.FC<ApprovalInterfaceProps> = ({
  approval,
  run,
  onApprove,
  onReject,
  readonly = false,
}) => {
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await onApprove({ approval_id: approval.id, action: 'approve', comments });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!comments.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    setIsSubmitting(true);
    try {
      await onReject({ approval_id: approval.id, action: 'reject', comments });
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepLabel =
    typeof approval.step === 'string'
      ? 'Approval Step'
      : (approval.step as any)?.label || 'Unknown Step';

  const isPending = approval.status === 'pending';

  return (
    <Container>
      <Header>
        <Title>Approval Request</Title>
        <Subtitle>{stepLabel}</Subtitle>
      </Header>

      <Content>
        {isPending && !readonly && (
          <AlertBox type="warning">
            ⚠️ <strong>Action Required:</strong> This request is awaiting your approval.
          </AlertBox>
        )}

        {!isPending && (
          <AlertBox type="info">
            ℹ️ This request has been <strong>{approval.status}</strong>.
          </AlertBox>
        )}

        <Section>
          <SectionTitle>Request Information</SectionTitle>
          <InfoGrid>
            <InfoCard>
              <InfoLabel>Run Reference</InfoLabel>
              <InfoValue>{run.run_reference || (run as any).runReference}</InfoValue>
            </InfoCard>
            <InfoCard>
              <InfoLabel>Status</InfoLabel>
              <InfoValue>
                <StatusBadge status={approval.status}>{approval.status}</StatusBadge>
              </InfoValue>
            </InfoCard>
            <InfoCard>
              <InfoLabel>Requested</InfoLabel>
              <InfoValue>{new Date(approval.requested_at).toLocaleString()}</InfoValue>
            </InfoCard>
            {approval.responded_at && (
              <InfoCard>
                <InfoLabel>Responded</InfoLabel>
                <InfoValue>{new Date(approval.responded_at).toLocaleString()}</InfoValue>
              </InfoCard>
            )}
          </InfoGrid>
        </Section>

        {run.parameters && Object.keys(run.parameters).length > 0 && (
          <Section>
            <SectionTitle>Request Parameters</SectionTitle>
            <ParametersTable>
              <tbody>
                {Object.entries(run.parameters || {}).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell>{key}</TableCell>
                    <TableCell>
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </ParametersTable>
          </Section>
        )}

        {approval.comments && (
          <Section>
            <SectionTitle>Previous Comments</SectionTitle>
            <InfoCard>
              <InfoValue>{approval.comments}</InfoValue>
              {approval.respondedBy && (
                <InfoLabel style={{ marginTop: '0.5rem' }}>
                  —{' '}
                  {typeof approval.respondedBy === 'string'
                    ? approval.respondedBy
                    : (approval.respondedBy as any)?.name || String(approval.respondedBy)}
                </InfoLabel>
              )}
            </InfoCard>
          </Section>
        )}

        {isPending && !readonly && (
          <Section>
            <SectionTitle>Your Response</SectionTitle>
            <CommentBox>
              <TextArea
                value={comments}
                onChange={e => setComments(e.target.value)}
                placeholder="Add comments (required for rejection)..."
                disabled={isSubmitting}
              />
            </CommentBox>
            <Actions>
              <Button variant="approve" onClick={handleApprove} disabled={isSubmitting}>
                {isSubmitting ? 'Processing...' : '✓ Approve'}
              </Button>
              <Button
                variant="reject"
                onClick={handleReject}
                disabled={isSubmitting || !comments.trim()}
              >
                {isSubmitting ? 'Processing...' : '✗ Reject'}
              </Button>
            </Actions>
          </Section>
        )}
      </Content>
    </Container>
  );
};
