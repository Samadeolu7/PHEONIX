import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  ArrowLeft,
  Play,
  Square,
  RotateCcw,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Activity,
} from 'lucide-react';
import { useWorkflowRun, useCancelWorkflowRun, useRetryWorkflowRun } from '../hooks/useAutomation';
import { useToast } from '../hooks/useToast';

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: var(--text-primary-color, #2c3e50);
  cursor: pointer;
  margin-bottom: 1rem;
  transition: all 0.2s;

  &:hover {
    background-color: #f7fafc;
  }
`;

const TitleSection = styled.div`
  flex: 1;
`;

const Title = styled.h1`
  font-size: 2rem;
  color: var(--text-primary-color, #2c3e50);
  margin: 0 0 0.5rem 0;
`;

const Subtitle = styled.p`
  color: var(--text-secondary-color, #718096);
  margin: 0;
  font-size: 1.1rem;
`;

const Actions = styled.div`
  display: flex;
  gap: 1rem;
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' | 'danger' }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  ${props => {
    switch (props.variant) {
      case 'primary':
        return `
          background: var(--primary-color, #1a73e8);
          color: white;
          &:hover:not(:disabled) { opacity: 0.9; }
        `;
      case 'danger':
        return `
          background: #dc2626;
          color: white;
          &:hover:not(:disabled) { opacity: 0.9; }
        `;
      default:
        return `
          background: transparent;
          border: 1px solid #e2e8f0;
          color: var(--text-primary-color, #2c3e50);
          &:hover:not(:disabled) { background-color: #f7fafc; }
        `;
    }
  }}
`;

const StatusBadge = styled.span<{ status: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;

  ${props => {
    switch (props.status) {
      case 'completed':
        return `background-color: #d1fae5; color: #065f46;`;
      case 'running':
        return `background-color: #dbeafe; color: #1e40af;`;
      case 'queued':
        return `background-color: #fef3c7; color: #78350f;`;
      case 'failed':
        return `background-color: #fee2e2; color: #991b1b;`;
      case 'awaiting_approval':
        return `background-color: #fce7f3; color: #831843;`;
      case 'cancelled':
        return `background-color: #f1f5f9; color: #475569;`;
      default:
        return `background-color: #e2e8f0; color: #4a5568;`;
    }
  }}
`;

const Content = styled.div`
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 2rem;
`;

const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const Sidebar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const Card = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
`;

const CardTitle = styled.h3`
  margin: 0 0 1rem 0;
  font-size: 1.25rem;
  color: var(--text-primary-color, #2c3e50);
`;

const Tabs = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid #e2e8f0;
`;

const Tab = styled.button<{ active: boolean }>`
  padding: 1rem 1.5rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid
    ${props => (props.active ? 'var(--primary-color, #1a73e8)' : 'transparent')};
  color: ${props =>
    props.active ? 'var(--primary-color, #1a73e8)' : 'var(--text-secondary-color, #718096)'};
  font-weight: ${props => (props.active ? '600' : '400')};
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: -2px;

  &:hover {
    color: var(--primary-color, #1a73e8);
  }
`;

const InfoGrid = styled.div`
  display: grid;
  gap: 1rem;
`;

const InfoItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid #f1f5f9;

  &:last-child {
    border-bottom: none;
  }
`;

const InfoLabel = styled.span`
  color: var(--text-secondary-color, #718096);
  font-size: 0.875rem;
`;

const InfoValue = styled.span`
  color: var(--text-primary-color, #2c3e50);
  font-weight: 500;
`;

const LogEntry = styled.div`
  padding: 1rem;
  border-left: 3px solid #e2e8f0;
  margin-bottom: 1rem;
  background: #f8fafc;
  border-radius: 0 6px 6px 0;
`;

const LogTimestamp = styled.div`
  font-size: 0.75rem;
  color: var(--text-secondary-color, #718096);
  margin-bottom: 0.5rem;
`;

const LogStep = styled.div`
  font-weight: 500;
  color: var(--text-primary-color, #2c3e50);
  margin-bottom: 0.25rem;
`;

const LogStatus = styled.div<{ status: string }>`
  font-size: 0.875rem;
  font-weight: 600;

  ${props => {
    switch (props.status) {
      case 'completed':
        return `color: #065f46;`;
      case 'running':
        return `color: #1e40af;`;
      case 'failed':
        return `color: #991b1b;`;
      default:
        return `color: #4a5568;`;
    }
  }}
`;

const LogError = styled.div`
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: #fee2e2;
  border-radius: 4px;
  color: #991b1b;
  font-size: 0.875rem;
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

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle size={16} />;
    case 'running':
      return <Activity size={16} />;
    case 'queued':
      return <Clock size={16} />;
    case 'failed':
      return <XCircle size={16} />;
    case 'awaiting_approval':
      return <AlertCircle size={16} />;
    default:
      return <Clock size={16} />;
  }
};

const AutomationRunDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'overview' | 'logs'>('overview');
  const toast = useToast();

  const runId = id ? parseInt(id) : 0;
  const { data: run, isLoading, error } = useWorkflowRun(runId, !!id);
  const cancelRunMutation = useCancelWorkflowRun();
  const retryRunMutation = useRetryWorkflowRun();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (startDate?: string, endDate?: string) => {
    if (!startDate) return '-';

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const durationMs = end.getTime() - start.getTime();

    if (durationMs < 1000) return `${durationMs}ms`;
    if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
    return `${(durationMs / 60000).toFixed(1)}m`;
  };

  const handleCancel = async () => {
    if (!run?.id || !confirm('Are you sure you want to cancel this run?')) return;

    try {
      await cancelRunMutation.mutateAsync(run.id);
      toast.success('Run cancelled successfully');
    } catch (err) {
      console.error('Failed to cancel run:', err);
      toast.error('Failed to cancel run');
    }
  };

  const handleRetry = async () => {
    if (!run?.id || !confirm('Are you sure you want to retry this run?')) return;

    try {
      await retryRunMutation.mutateAsync(run.id);
      toast.success('Run retried successfully');
    } catch (err) {
      console.error('Failed to retry run:', err);
      toast.error('Failed to retry run');
    }
  };

  if (isLoading) {
    return (
      <Container>
        <LoadingContainer>Loading run details...</LoadingContainer>
      </Container>
    );
  }

  if (error || !run) {
    return (
      <Container>
        <ErrorContainer>
          <h2>Error Loading Run</h2>
          <p>{error instanceof Error ? error.message : 'Run not found'}</p>
          <Button onClick={() => navigate('/automations/runs')}>Back to Runs</Button>
        </ErrorContainer>
      </Container>
    );
  }

  const canCancel = run.status === 'running' || run.status === 'queued';
  const canRetry = run.status === 'failed';

  return (
    <Container>
      <BackButton onClick={() => navigate('/automations/runs')}>
        <ArrowLeft size={16} />
        Back to Runs
      </BackButton>

      <Header>
        <TitleSection>
          <Title>Run #{run.run_reference}</Title>
          <Subtitle>
            Template:{' '}
            {typeof run.template === 'string' ? 'Unknown' : run.template?.name || 'Unknown'}
          </Subtitle>
        </TitleSection>

        <Actions>
          <StatusBadge status={run.status}>
            {getStatusIcon(run.status)}
            {run.status.replace('_', ' ')}
          </StatusBadge>

          {canCancel && (
            <Button variant="danger" onClick={handleCancel} disabled={cancelRunMutation.isPending}>
              <Square size={16} />
              {cancelRunMutation.isPending ? 'Cancelling...' : 'Cancel'}
            </Button>
          )}

          {canRetry && (
            <Button variant="primary" onClick={handleRetry} disabled={retryRunMutation.isPending}>
              <RotateCcw size={16} />
              {retryRunMutation.isPending ? 'Retrying...' : 'Retry'}
            </Button>
          )}
        </Actions>
      </Header>

      <Tabs>
        <Tab active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
          Overview
        </Tab>
        <Tab active={activeTab === 'logs'} onClick={() => setActiveTab('logs')}>
          Execution Logs
        </Tab>
      </Tabs>

      <Content>
        <MainContent>
          {activeTab === 'overview' && (
            <Card>
              <CardTitle>Execution Context</CardTitle>
              {run.context && Object.keys(run.context).length > 0 ? (
                <pre
                  style={{
                    background: '#f8fafc',
                    padding: '1rem',
                    borderRadius: '6px',
                    overflow: 'auto',
                    fontSize: '0.875rem',
                  }}
                >
                  {JSON.stringify(run.context, null, 2)}
                </pre>
              ) : (
                <p style={{ color: 'var(--text-secondary-color, #718096)' }}>
                  No context data available.
                </p>
              )}
            </Card>
          )}

          {activeTab === 'logs' && (
            <Card>
              <CardTitle>Execution Logs</CardTitle>
              {run.execution_log && run.execution_log.length > 0 ? (
                <div>
                  {run.execution_log.map((log, index) => (
                    <LogEntry key={index}>
                      <LogTimestamp>{formatDate(log.timestamp)}</LogTimestamp>
                      <LogStep>Step: {log.step_id}</LogStep>
                      <LogStatus status={log.status}>{log.status}</LogStatus>
                      {log.error && <LogError>{log.error}</LogError>}
                      {log.result && (
                        <pre
                          style={{
                            marginTop: '0.5rem',
                            fontSize: '0.75rem',
                            background: '#f1f5f9',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            overflow: 'auto',
                          }}
                        >
                          {JSON.stringify(log.result, null, 2)}
                        </pre>
                      )}
                    </LogEntry>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary-color, #718096)' }}>
                  No execution logs available.
                </p>
              )}
            </Card>
          )}
        </MainContent>

        <Sidebar>
          <Card>
            <CardTitle>Run Information</CardTitle>
            <InfoGrid>
              <InfoItem>
                <InfoLabel>Current Step</InfoLabel>
                <InfoValue>
                  <code
                    style={{
                      fontSize: '0.75rem',
                      background: '#f1f5f9',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    {run.current_step_id}
                  </code>
                </InfoValue>
              </InfoItem>

              {run.scheduled_at && (
                <InfoItem>
                  <InfoLabel>Scheduled</InfoLabel>
                  <InfoValue>{formatDate(run.scheduled_at)}</InfoValue>
                </InfoItem>
              )}

              {run.started_at && (
                <InfoItem>
                  <InfoLabel>Started</InfoLabel>
                  <InfoValue>{formatDate(run.started_at)}</InfoValue>
                </InfoItem>
              )}

              {run.completed_at && (
                <InfoItem>
                  <InfoLabel>Completed</InfoLabel>
                  <InfoValue>{formatDate(run.completed_at)}</InfoValue>
                </InfoItem>
              )}

              <InfoItem>
                <InfoLabel>Duration</InfoLabel>
                <InfoValue>{formatDuration(run.started_at, run.completed_at)}</InfoValue>
              </InfoItem>

              {run.form_submission_reference && (
                <InfoItem>
                  <InfoLabel>Form Reference</InfoLabel>
                  <InfoValue>{run.form_submission_reference}</InfoValue>
                </InfoItem>
              )}
            </InfoGrid>
          </Card>

          {run.error_message && (
            <Card>
              <CardTitle style={{ color: '#dc2626' }}>Error Details</CardTitle>
              <div
                style={{
                  background: '#fee2e2',
                  padding: '1rem',
                  borderRadius: '6px',
                  color: '#991b1b',
                  fontSize: '0.875rem',
                }}
              >
                {run.error_message}
              </div>
            </Card>
          )}
        </Sidebar>
      </Content>
    </Container>
  );
};

export default AutomationRunDetailPage;
