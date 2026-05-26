import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from '@emotion/styled';
import { automationService } from '../services/automationService';
import { AutomationRunForm } from '../components/automation/AutomationRunForm';
import type { AutomationTemplate, CreateAutomationRunRequest } from '../types/automation.types';

const Container = styled.div`
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
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
  margin-bottom: 2rem;
  transition: all 0.2s;

  &:hover {
    background-color: #f7fafc;
  }
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

const SuccessModal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 8px;
  padding: 2rem;
  max-width: 500px;
  width: 90%;
  text-align: center;
`;

const SuccessIcon = styled.div`
  font-size: 4rem;
  margin-bottom: 1rem;
`;

const ModalTitle = styled.h2`
  margin: 0 0 1rem 0;
  color: var(--text-primary-color, #2c3e50);
`;

const ModalText = styled.p`
  margin: 0 0 1.5rem 0;
  color: var(--text-secondary-color, #718096);
`;

const RunReference = styled.div`
  background: #f7fafc;
  padding: 1rem;
  border-radius: 6px;
  font-family: monospace;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--primary-color, #1a73e8);
  margin-bottom: 1.5rem;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' }>`
  flex: 1;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;

  ${props =>
    props.variant === 'primary'
      ? `
    background-color: var(--primary-color, #1a73e8);
    color: white;

    &:hover {
      background-color: var(--primary-color-dark, #1557b0);
    }
  `
      : `
    background-color: transparent;
    color: var(--text-primary-color, #2c3e50);
    border: 1px solid #e2e8f0;

    &:hover {
      background-color: #f7fafc;
    }
  `}
`;

const RunAutomationPage: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<AutomationTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    runReference: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (templateId) {
      loadTemplate();
    }
  }, [templateId]);

  const loadTemplate = async () => {
    if (!templateId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await automationService.getTemplate(templateId);
      setTemplate(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load template');
      console.error('Error loading template:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (request: CreateAutomationRunRequest) => {
    try {
      const response = await automationService.createRun(request);
      setSuccessData({
        runReference: response.run.runReference,
        message: response.message,
      });
    } catch (err: any) {
      alert(err.response?.data?.error || err.message || 'Failed to start automation');
      console.error('Error starting automation:', err);
    }
  };

  const handleViewRuns = () => {
    navigate('/automations/runs');
  };

  const handleStartAnother = () => {
    setSuccessData(null);
  };

  const handleBackToTemplates = () => {
    navigate('/automations/templates');
  };

  if (loading) {
    return (
      <Container>
        <LoadingContainer>Loading template...</LoadingContainer>
      </Container>
    );
  }

  if (error || !template) {
    return (
      <Container>
        <ErrorContainer>
          <h2>Error Loading Template</h2>
          <p>{error || 'Template not found'}</p>
          <Button onClick={handleBackToTemplates}>Back to Templates</Button>
        </ErrorContainer>
      </Container>
    );
  }

  return (
    <>
      <Container>
        <BackButton onClick={handleBackToTemplates}>← Back to Templates</BackButton>

        <AutomationRunForm
          template={template}
          onSubmit={handleSubmit}
          onCancel={handleBackToTemplates}
        />
      </Container>

      {successData && (
        <SuccessModal>
          <ModalContent>
            <SuccessIcon>✓</SuccessIcon>
            <ModalTitle>Automation Started Successfully!</ModalTitle>
            <ModalText>{successData.message}</ModalText>
            <RunReference>{successData.runReference}</RunReference>
            <ModalText>
              {template.requiresApproval
                ? 'The request has been sent to approvers. You will be notified when action is taken.'
                : 'The automation is now running. You can track its progress in the runs page.'}
            </ModalText>
            <ButtonGroup>
              <Button variant="secondary" onClick={handleStartAnother}>
                Start Another
              </Button>
              <Button variant="primary" onClick={handleViewRuns}>
                View All Runs
              </Button>
            </ButtonGroup>
          </ModalContent>
        </SuccessModal>
      )}
    </>
  );
};

export default RunAutomationPage;
