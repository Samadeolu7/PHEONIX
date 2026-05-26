import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { useAuth } from '../contexts/AuthContext';
import {
  useWorkflowTemplates,
  useActivateWorkflow,
  useDeactivateWorkflow,
} from '../hooks/useAutomation';
import { useToast } from '../hooks/useToast';

// ... keep all your existing styled components ...

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

const Button = styled.button`
  padding: 0.75rem 1.5rem;
  background-color: var(--primary-color, #1a73e8);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  &:hover {
    background-color: var(--primary-color-dark, #1557b0);
    transform: translateY(-1px);
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
`;

const Card = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: all 0.2s;
  cursor: pointer;
  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
  }
`;

const CardHeader = styled.div`
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1.25rem 1.5rem;
`;

const CardTitle = styled.h3`
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
`;

const CardDescription = styled.p`
  margin: 0;
  opacity: 0.95;
  font-size: 0.9rem;
`;

const CardBody = styled.div`
  padding: 1.25rem 1.5rem;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  font-size: 0.9rem;
  &:not(:last-child) {
    border-bottom: 1px solid #e8eef8;
  }
`;

const InfoLabel = styled.span`
  color: var(--text-secondary-color, #718096);
`;

const InfoValue = styled.span`
  color: var(--text-primary-color, #2c3e50);
  font-weight: 600;
`;

const Badge = styled.span<{ variant?: 'success' | 'warning' }>`
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  ${p =>
    p.variant === 'success'
      ? `background-color: #d1fae5; color: #065f46;`
      : `background-color: #fef3c7; color: #78350f;`}
`;

const CardActions = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
`;

const SmallButton = styled.button<{ ghost?: boolean }>`
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  border-radius: 6px;
  border: ${p => (p.ghost ? '1px solid #e2e8f0' : 'none')};
  background: ${p => (p.ghost ? 'transparent' : 'var(--primary-color, #1a73e8)')};
  color: ${p => (p.ghost ? 'var(--text-primary-color,#2c3e50)' : 'white')};
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
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

/** Component */
const AutomationTemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = Boolean(user?.role === 'admin' || user?.role === 'sys_admin');

  // React Query hooks
  const { data: workflows = [], isLoading, error, refetch } = useWorkflowTemplates();
  const activateWorkflowMutation = useActivateWorkflow();
  const deactivateWorkflowMutation = useDeactivateWorkflow();

  const handleView = (id?: number) => {
    if (!id) return;
    navigate(`/admin/workflows/${id}`);
  };

  const handleRun = (id?: number) => {
    if (!id) return;
    navigate(`/automations/run/${id}`);
  };

  const handleCreate = () => {
    navigate('/admin/workflows/new');
  };

  const handleActivate = async (id?: number) => {
    if (!id) return;
    try {
      await activateWorkflowMutation.mutateAsync(id);
      toast.success('Workflow activated successfully');
    } catch (err: any) {
      console.error('Failed to activate workflow', err);
      toast.error(err?.message || 'Failed to activate workflow');
    }
  };

  const handleDeactivate = async (id?: number) => {
    if (!id) return;
    try {
      await deactivateWorkflowMutation.mutateAsync(id);
      toast.success('Workflow deactivated successfully');
    } catch (err: any) {
      console.error('Failed to deactivate workflow', err);
      toast.error(err?.message || 'Failed to deactivate workflow');
    }
  };

  if (isLoading) {
    return (
      <Container>
        <LoadingContainer>Loading workflows...</LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorContainer>
          <h2>Error Loading Workflows</h2>
          <p>{error instanceof Error ? error.message : 'Failed to load workflows'}</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </ErrorContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>Workflows</Title>
        {isAdmin && <Button onClick={handleCreate}>+ Create Workflow</Button>}
      </Header>

      {!Array.isArray(workflows) || workflows.length === 0 ? (
        <EmptyState>
          <h2>No Workflows</h2>
          <p>
            {!Array.isArray(workflows)
              ? 'Unable to load workflows. Please check API connection.'
              : 'Create your first workflow to get started.'}
          </p>
          {isAdmin && Array.isArray(workflows) && (
            <Button onClick={handleCreate}>Create Workflow</Button>
          )}
        </EmptyState>
      ) : (
        <Grid>
          {workflows.map(wf => {
            const initialStep =
              wf.workflow_definition?.initial_step || wf.workflow_definition?.steps?.[0]?.id;
            const initialStepName =
              wf.workflow_definition?.steps?.find(s => s.id === initialStep)?.name ??
              initialStep ??
              'N/A';

            const requiresApproval = !!wf.requires_approval;
            const trigger = wf.trigger_type ?? 'manual';
            const cron = wf.trigger_config?.cron;
            const eventName = wf.trigger_config?.event_name;

            return (
              <Card key={wf.id} onClick={() => handleView(wf.id)}>
                <CardHeader>
                  <CardTitle>{wf.name}</CardTitle>
                  <CardDescription>{wf.description}</CardDescription>
                </CardHeader>

                <CardBody>
                  <InfoRow>
                    <InfoLabel>Trigger</InfoLabel>
                    <InfoValue>
                      {trigger === 'event'
                        ? `Event: ${eventName ?? '—'}`
                        : trigger === 'schedule'
                          ? `Schedule: ${cron ?? '—'}`
                          : 'Manual'}
                    </InfoValue>
                  </InfoRow>

                  <InfoRow>
                    <InfoLabel>Approval Required</InfoLabel>
                    <InfoValue>
                      <Badge variant={requiresApproval ? 'warning' : 'success'}>
                        {requiresApproval ? 'Yes' : 'No'}
                      </Badge>
                    </InfoValue>
                  </InfoRow>

                  <InfoRow>
                    <InfoLabel>Initial Step</InfoLabel>
                    <InfoValue>{initialStepName}</InfoValue>
                  </InfoRow>

                  <InfoRow>
                    <InfoLabel>Active</InfoLabel>
                    <InfoValue>
                      {wf.is_active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="warning">Inactive</Badge>
                      )}
                    </InfoValue>
                  </InfoRow>

                  <InfoRow>
                    <InfoLabel>Version</InfoLabel>
                    <InfoValue>{wf.version ?? 1}</InfoValue>
                  </InfoRow>

                  <InfoRow>
                    <InfoLabel>Created</InfoLabel>
                    <InfoValue>
                      {wf.created_at ? new Date(wf.created_at).toLocaleString() : '—'}
                    </InfoValue>
                  </InfoRow>

                  <CardActions onClick={e => e.stopPropagation()}>
                    <SmallButton ghost onClick={() => handleView(wf.id)}>
                      View
                    </SmallButton>
                    <SmallButton ghost onClick={() => handleRun(wf.id)}>
                      Run
                    </SmallButton>

                    {isAdmin &&
                      (wf.is_active ? (
                        <SmallButton
                          onClick={() => handleDeactivate(wf.id)}
                          disabled={deactivateWorkflowMutation.isPending}
                        >
                          {deactivateWorkflowMutation.isPending ? 'Stopping…' : 'Deactivate'}
                        </SmallButton>
                      ) : (
                        <SmallButton
                          onClick={() => handleActivate(wf.id)}
                          disabled={activateWorkflowMutation.isPending}
                        >
                          {activateWorkflowMutation.isPending ? 'Starting…' : 'Activate'}
                        </SmallButton>
                      ))}
                  </CardActions>
                </CardBody>
              </Card>
            );
          })}
        </Grid>
      )}
    </Container>
  );
};

export default AutomationTemplatesPage;
