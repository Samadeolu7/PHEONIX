import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from '@emotion/styled';
import {
  ArrowLeft,
  Edit,
  Play,
  Settings,
  Calendar,
  User,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useWorkflowTemplate } from '../hooks/useAutomation';
import { useAuth } from '../contexts/AuthContext';

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

const Description = styled.p`
  color: var(--text-secondary-color, #718096);
  margin: 0;
  font-size: 1.1rem;
`;

const Actions = styled.div`
  display: flex;
  gap: 1rem;
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' }>`
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

  ${props =>
    props.variant === 'primary'
      ? `
    background: var(--primary-color, #1a73e8);
    color: white;
    &:hover {
      opacity: 0.9;
    }
  `
      : `
    background: transparent;
    border: 1px solid #e2e8f0;
    color: var(--text-primary-color, #2c3e50);
    &:hover {
      background-color: #f7fafc;
    }
  `}
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

const Badge = styled.span<{ variant?: 'success' | 'warning' | 'info' }>`
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;

  ${props => {
    switch (props.variant) {
      case 'success':
        return `background-color: #d1fae5; color: #065f46;`;
      case 'warning':
        return `background-color: #fef3c7; color: #78350f;`;
      case 'info':
        return `background-color: #dbeafe; color: #1e40af;`;
      default:
        return `background-color: #e2e8f0; color: #4a5568;`;
    }
  }}
`;

const StepsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const StepItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #f8fafc;
  border-radius: 6px;
  border-left: 3px solid var(--primary-color, #1a73e8);
`;

const StepIcon = styled.div`
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--primary-color, #1a73e8);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
`;

const StepInfo = styled.div`
  flex: 1;
`;

const StepName = styled.div`
  font-weight: 500;
  color: var(--text-primary-color, #2c3e50);
`;

const StepType = styled.div`
  font-size: 0.75rem;
  color: var(--text-secondary-color, #718096);
  text-transform: uppercase;
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

const AutomationTemplateDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = Boolean(user?.role === 'admin' || user?.role === 'sys_admin');

  const templateId = id ? parseInt(id) : 0;
  const { data: template, isLoading, error } = useWorkflowTemplate(templateId, !!id);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getTriggerDisplay = () => {
    if (!template) return 'Unknown';

    switch (template.trigger_type) {
      case 'event':
        return `Event: ${template.trigger_config?.event_name || 'Unknown'}`;
      case 'schedule':
        return `Schedule: ${template.trigger_config?.cron || 'Unknown'}`;
      case 'manual':
        return 'Manual';
      default:
        return template.trigger_type;
    }
  };

  if (isLoading) {
    return (
      <Container>
        <LoadingContainer>Loading template details...</LoadingContainer>
      </Container>
    );
  }

  if (error || !template) {
    return (
      <Container>
        <ErrorContainer>
          <h2>Error Loading Template</h2>
          <p>{error instanceof Error ? error.message : 'Template not found'}</p>
          <Button onClick={() => navigate('/automations/templates')}>Back to Templates</Button>
        </ErrorContainer>
      </Container>
    );
  }

  return (
    <Container>
      <BackButton onClick={() => navigate('/automations/templates')}>
        <ArrowLeft size={16} />
        Back to Templates
      </BackButton>

      <Header>
        <TitleSection>
          <Title>{template.name}</Title>
          <Description>{template.description}</Description>
        </TitleSection>

        <Actions>
          <Button variant="secondary" onClick={() => navigate(`/automations/run/${template.id}`)}>
            <Play size={16} />
            Run Template
          </Button>
          {isAdmin && (
            <Button
              variant="primary"
              onClick={() => navigate(`/automations/templates/${template.id}/edit`)}
            >
              <Edit size={16} />
              Edit Template
            </Button>
          )}
        </Actions>
      </Header>

      <Content>
        <MainContent>
          <Card>
            <CardTitle>Workflow Steps</CardTitle>
            {template.workflow_definition?.steps?.length > 0 ? (
              <StepsList>
                {template.workflow_definition.steps.map((step, index) => (
                  <StepItem key={step.id}>
                    <StepIcon>{index + 1}</StepIcon>
                    <StepInfo>
                      <StepName>{step.name}</StepName>
                      <StepType>{step.type.replace('_', ' ')}</StepType>
                    </StepInfo>
                  </StepItem>
                ))}
              </StepsList>
            ) : (
              <p style={{ color: 'var(--text-secondary-color, #718096)' }}>
                No steps defined for this workflow.
              </p>
            )}
          </Card>
        </MainContent>

        <Sidebar>
          <Card>
            <CardTitle>Template Information</CardTitle>
            <InfoGrid>
              <InfoItem>
                <InfoLabel>Status</InfoLabel>
                <InfoValue>
                  <Badge variant={template.is_active ? 'success' : 'warning'}>
                    {template.is_active ? (
                      <>
                        <CheckCircle size={12} style={{ marginRight: '0.25rem' }} />
                        Active
                      </>
                    ) : (
                      <>
                        <XCircle size={12} style={{ marginRight: '0.25rem' }} />
                        Inactive
                      </>
                    )}
                  </Badge>
                </InfoValue>
              </InfoItem>

              <InfoItem>
                <InfoLabel>Trigger Type</InfoLabel>
                <InfoValue>{getTriggerDisplay()}</InfoValue>
              </InfoItem>

              <InfoItem>
                <InfoLabel>Requires Approval</InfoLabel>
                <InfoValue>
                  <Badge variant={template.requires_approval ? 'warning' : 'success'}>
                    {template.requires_approval ? 'Yes' : 'No'}
                  </Badge>
                </InfoValue>
              </InfoItem>

              <InfoItem>
                <InfoLabel>Version</InfoLabel>
                <InfoValue>{template.version || 1}</InfoValue>
              </InfoItem>

              {template.created_at && (
                <InfoItem>
                  <InfoLabel>Created</InfoLabel>
                  <InfoValue>{formatDate(template.created_at)}</InfoValue>
                </InfoItem>
              )}
            </InfoGrid>
          </Card>

          {template.approval_config && (
            <Card>
              <CardTitle>Approval Configuration</CardTitle>
              <InfoGrid>
                <InfoItem>
                  <InfoLabel>At Step</InfoLabel>
                  <InfoValue>{template.approval_config.at_step}</InfoValue>
                </InfoItem>

                <InfoItem>
                  <InfoLabel>Required Roles</InfoLabel>
                  <InfoValue>
                    {template.approval_config.required_roles?.join(', ') || 'None'}
                  </InfoValue>
                </InfoItem>

                {template.approval_config.timeout_hours && (
                  <InfoItem>
                    <InfoLabel>Timeout</InfoLabel>
                    <InfoValue>{template.approval_config.timeout_hours} hours</InfoValue>
                  </InfoItem>
                )}
              </InfoGrid>
            </Card>
          )}
        </Sidebar>
      </Content>
    </Container>
  );
};

export default AutomationTemplateDetailPage;
