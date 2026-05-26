import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { useAutomationManagement } from '../hooks/useAutomationManagement';
import { AutomationTemplate, WorkflowStep } from '../types/automation';
import { Button, Tag } from '../components/ui';
import { DynamicForm } from '../components/DynamicForm';
import { useForm } from '../hooks/useForm';

const Container = styled.div`
  padding: 20px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
`;

const TitleSection = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 15px;
`;

const Tags = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
`;

const Content = styled.div`
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 20px;
`;

const Card = styled.div`
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const Steps = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 15px;
`;

const Step = styled.div<{ isActive?: boolean }>`
  padding: 15px;
  border: 1px solid ${props => (props.isActive ? '#0066cc' : '#eee')};
  background-color: ${props => (props.isActive ? '#f8f9fa' : 'transparent')};
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #0066cc;
  }
`;

const StepHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const StepLabel = styled.span`
  font-weight: 500;
`;

const StepFunction = styled.div`
  font-size: 14px;
  color: #666;
`;

const ErrorBanner = styled.div`
  background-color: #fff2f2;
  border: 1px solid #ffcdd2;
  color: #d32f2f;
  padding: 10px 20px;
  border-radius: 4px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const LoadingContainer = styled.div`
  text-align: center;
  padding: 40px;
  color: #666;
`;

const ErrorContainer = styled.div`
  text-align: center;
  padding: 40px;
  color: #666;
`;

export const AutomationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loading, error, getAutomationTemplates, runAutomation, clearError } =
    useAutomationManagement();

  const [template, setTemplate] = useState<AutomationTemplate | null>(null);
  const [activeStep, setActiveStep] = useState<WorkflowStep | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    loadTemplate();
  }, [id]);

  const loadTemplate = async () => {
    if (!id) return;

    try {
      const templates = (await getAutomationTemplates?.()) || [];
      const template = templates.find(t => String(t.id) === id);
      if (template) {
        setTemplate(template);
        setActiveStep(template.steps?.[0] || null);
      }
    } catch (err: unknown) {
      // Error handled by hook
    }
  };

  // Set up form if template has a form schema
  const form = useForm(template?.formSchema || { id: 0, name: '', fields: [] });

  const handleSubmit = async () => {
    if (!template || !runAutomation) return;

    try {
      setIsRunning(true);
      if (!runAutomation) return;
      const result = await runAutomation(template.id, form.values);

      // Show success message
      alert('Automation started successfully!');

      // Navigate to runs page
      navigate(`/runs/${result.id}`);
    } catch (err: unknown) {
      // Error handled by hook
    } finally {
      setIsRunning(false);
    }
  };

  if (loading) {
    return <LoadingContainer>Loading...</LoadingContainer>;
  }

  if (!template) {
    return <ErrorContainer>Template not found</ErrorContainer>;
  }

  return (
    <Container>
      <Header>
        <TitleSection>
          <div>
            <h1>{template.name}</h1>
            <Tags>
              {template.requiresApproval && <Tag color="blue">Requires Approval</Tag>}
              {template.schedulingEnabled && <Tag color="green">Scheduled</Tag>}
            </Tags>
          </div>
        </TitleSection>

        <Button variant="secondary" onClick={() => navigate('/templates')}>
          Back to List
        </Button>
      </Header>

      {error && (
        <ErrorBanner>
          {error}
          <Button variant="text" onClick={clearError}>
            ✕
          </Button>
        </ErrorBanner>
      )}

      <Content>
        <Card>
          <h2>Workflow Steps</h2>
          <Steps>
            {template.steps.map(step => (
              <Step
                key={step.id}
                isActive={step === activeStep}
                onClick={() => setActiveStep(step)}
              >
                <StepHeader>
                  <StepLabel>{step.label}</StepLabel>
                  {step.type === 'approval' && <Tag color="yellow">Requires Approval</Tag>}
                </StepHeader>
                <StepFunction>{step.label}</StepFunction>
              </Step>
            ))}
          </Steps>
        </Card>

        {template.formSchema && (
          <Card>
            <h2>Start Automation</h2>
            <DynamicForm
              schema={template.formSchema}
              values={form.values}
              errors={form.errors}
              onChange={form.handleChange}
              onSubmit={handleSubmit}
              isSubmitting={isRunning}
            />
          </Card>
        )}
      </Content>
    </Container>
  );
};
