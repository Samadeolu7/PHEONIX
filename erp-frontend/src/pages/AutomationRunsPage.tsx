import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { useWorkflowRuns } from '../hooks/useAutomation';

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  color: var(--text-primary-color, #2c3e50);
  margin: 0;
`;

const BackButton = styled.button`
  padding: 0.75rem 1.5rem;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: var(--text-primary-color, #2c3e50);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: #f7fafc;
  }
`;

const Filters = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  padding: 1rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const Select = styled.select`
  padding: 0.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.875rem;
`;

const Table = styled.table`
  width: 100%;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-collapse: collapse;
  overflow: hidden;
`;

const Thead = styled.thead`
  background: #f7fafc;
`;

const Th = styled.th`
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  color: var(--text-secondary-color, #4a5568);
  border-bottom: 2px solid #e2e8f0;
`;

const Tbody = styled.tbody``;

const Tr = styled.tr`
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f7fafc;
  }

  &:not(:last-child) {
    border-bottom: 1px solid #e2e8f0;
  }
`;

const Td = styled.td`
  padding: 1rem;
  color: var(--text-primary-color, #2c3e50);
`;

const StatusBadge = styled.span<{ status: string }>`
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;

  ${props => {
    switch (props.status) {
      case 'completed':
        return `
          background-color: #d1fae5;
          color: #065f46;
        `;
      case 'running':
        return `
          background-color: #dbeafe;
          color: #1e40af;
        `;
      case 'queued':
        return `
          background-color: #fef3c7;
          color: #78350f;
        `;
      case 'failed':
        return `
          background-color: #fee2e2;
          color: #991b1b;
        `;
      case 'awaiting_approval':
        return `
          background-color: #fce7f3;
          color: #831843;
        `;
      default:
        return `
          background-color: #e2e8f0;
          color: #4a5568;
        `;
    }
  }}
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 1.2rem;
  color: var(--text-secondary-color, #718096);
`;

const ErrorContainer = styled.div`
  padding: 2rem;
  background-color: #fee;
  border: 1px solid #fcc;
  border-radius: 8px;
  color: #c00;
  margin: 2rem 0;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-secondary-color, #718096);
`;

const AutomationRunsPage: React.FC = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // React Query hook
  const filters = statusFilter !== 'all' ? { status: statusFilter } : undefined;
  const { data: runs = [], isLoading, error, refetch } = useWorkflowRuns(filters);

  const handleRowClick = (run: any) => {
    // Navigate to run details (create this page later)
    console.log('View run:', run.id);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (isLoading) {
    return (
      <Container>
        <LoadingContainer>Loading runs...</LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorContainer>
          <h2>Error Loading Runs</h2>
          <p>{error instanceof Error ? error.message : 'Failed to load automation runs'}</p>
          <BackButton onClick={() => refetch()}>Retry</BackButton>
        </ErrorContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>Automation Runs</Title>
        <BackButton onClick={() => navigate('/automations/templates')}>
          ← Back to Templates
        </BackButton>
      </Header>

      <Filters>
        <label>
          Status:
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="awaiting_approval">Awaiting Approval</option>
          </Select>
        </label>
      </Filters>

      {runs.length === 0 ? (
        <EmptyState>
          <h2>No Automation Runs</h2>
          <p>No runs found with the selected filters.</p>
          <BackButton onClick={() => navigate('/automations/templates')}>
            Start New Automation
          </BackButton>
        </EmptyState>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Reference</Th>
              <Th>Template</Th>
              <Th>Status</Th>
              <Th>Current Step</Th>
              <Th>Amount</Th>
              <Th>Description</Th>
              <Th>Started</Th>
              <Th>Completed</Th>
              <Th>Duration</Th>
            </Tr>
          </Thead>
          <Tbody>
            {runs.map(run => {
              // Handle both old and new API response formats
              const templateName =
                run.template_name ||
                (typeof run.template === 'string' ? 'Unknown' : run.template?.name) ||
                'Unknown';

              const currentStepId =
                run.current_step_id ||
                (typeof run.currentStep === 'string' ? run.currentStep : run.currentStep?.id) ||
                '-';

              const startedAt = run.started_at || run.scheduledAt;
              const completedAt = run.completed_at || run.executedAt;
              const context = run.context || {};

              // Calculate duration if both start and end times are available
              let duration = '-';
              if (startedAt && completedAt) {
                const start = new Date(startedAt);
                const end = new Date(completedAt);
                const durationMs = end.getTime() - start.getTime();
                if (durationMs > 0) {
                  if (durationMs < 1000) {
                    duration = `${durationMs}ms`;
                  } else if (durationMs < 60000) {
                    duration = `${(durationMs / 1000).toFixed(1)}s`;
                  } else {
                    duration = `${(durationMs / 60000).toFixed(1)}m`;
                  }
                }
              }

              return (
                <Tr key={run.id} onClick={() => handleRowClick(run)}>
                  <Td>
                    <strong>{run.run_reference || run.runReference}</strong>
                  </Td>
                  <Td>{templateName}</Td>
                  <Td>
                    <StatusBadge status={run.status}>{run.status.replace('_', ' ')}</StatusBadge>
                  </Td>
                  <Td>
                    <code
                      style={{
                        fontSize: '0.75rem',
                        background: '#f1f5f9',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        color: '#475569',
                      }}
                    >
                      {currentStepId}
                    </code>
                  </Td>
                  <Td>
                    {context.amount ? (
                      <span
                        style={{
                          color: '#059669',
                          fontWeight: '600',
                          fontSize: '0.875rem',
                        }}
                      >
                        ${context.amount}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>-</span>
                    )}
                  </Td>
                  <Td>
                    {context.description ? (
                      <div
                        style={{
                          maxWidth: '200px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '0.875rem',
                        }}
                        title={context.description}
                      >
                        {context.description}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>-</span>
                    )}
                  </Td>
                  <Td>{startedAt ? formatDate(startedAt) : '-'}</Td>
                  <Td>{completedAt ? formatDate(completedAt) : '-'}</Td>
                  <Td>
                    <span
                      style={{
                        fontSize: '0.875rem',
                        color: duration === '-' ? '#94a3b8' : '#059669',
                        fontWeight: duration === '-' ? 'normal' : '600',
                      }}
                    >
                      {duration}
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}
    </Container>
  );
};

export default AutomationRunsPage;
