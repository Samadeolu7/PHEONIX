// src/components/workflow/WorkflowVisualizer.tsx
import React from 'react';
import styled from '@emotion/styled';
import { WorkflowStep } from '../../types/automation.types';

interface WorkflowVisualizerProps {
  steps: WorkflowStep[];
  initialStepId: string;
  selectedStepId?: string;
  onStepSelect: (stepId: string) => void;
}

const VisualizerContainer = styled.div`
  width: 100%;
  height: 100%;
  padding: 1rem;
  overflow: auto;
`;

const StepsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
  justify-items: center;
`;

const StepNode = styled.div<{ isSelected?: boolean; isInitial?: boolean }>`
  width: 100px;
  padding: 0.75rem 0.5rem;
  border: 2px solid ${p => (p.isSelected ? '#1a73e8' : p.isInitial ? '#10b981' : '#d1d5db')};
  border-radius: 8px;
  background: ${p => (p.isSelected ? '#eff6ff' : p.isInitial ? '#f0fdf4' : '#fff')};
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
`;

const StepName = styled.div`
  font-weight: 600;
  font-size: 0.75rem;
  margin-bottom: 0.25rem;
  color: #374151;
  word-break: break-word;
`;

const StepId = styled.div`
  font-size: 0.625rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
  word-break: break-all;
`;

const StepType = styled.div`
  font-size: 0.625rem;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const InitialBadge = styled.div`
  position: absolute;
  top: -6px;
  right: -6px;
  background: #10b981;
  color: white;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  font-size: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StepNodeContainer = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const Connections = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: -1;
`;

export const WorkflowVisualizer: React.FC<WorkflowVisualizerProps> = ({
  steps,
  initialStepId,
  selectedStepId,
  onStepSelect,
}) => {
  if (steps.length === 0) {
    return (
      <VisualizerContainer>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#6b7280',
            fontSize: '0.875rem',
          }}
        >
          Add steps to visualize your workflow
        </div>
      </VisualizerContainer>
    );
  }

  return (
    <VisualizerContainer>
      <StepsGrid>
        {steps.map(step => (
          <StepNodeContainer key={step.id}>
            <StepNode
              isSelected={selectedStepId === step.id}
              isInitial={initialStepId === step.id}
              onClick={() => onStepSelect(step.id)}
            >
              <StepName title={step.name}>
                {step.name.length > 12 ? `${step.name.slice(0, 12)}...` : step.name}
              </StepName>
              <StepId title={step.id}>
                {step.id.length > 10 ? `${step.id.slice(0, 10)}...` : step.id}
              </StepId>
              <StepType>{step.type}</StepType>
            </StepNode>
            {initialStepId === step.id && <InitialBadge title="Initial Step">S</InitialBadge>}
          </StepNodeContainer>
        ))}
      </StepsGrid>

      {/* Simple connections visualization */}
      <Connections>
        {/* This would be enhanced with proper SVG line connections in a real implementation */}
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            {/* Simple indicators for connections */}
            {step.next && (
              <circle
                cx={(index % 3) * 120 + 60}
                cy={Math.floor(index / 3) * 120 + 100}
                r="4"
                fill="#1a73e8"
                opacity="0.6"
              />
            )}
            {step.on_true && (
              <circle
                cx={(index % 3) * 120 + 50}
                cy={Math.floor(index / 3) * 120 + 90}
                r="3"
                fill="#10b981"
                opacity="0.6"
              />
            )}
            {step.on_false && (
              <circle
                cx={(index % 3) * 120 + 70}
                cy={Math.floor(index / 3) * 120 + 90}
                r="3"
                fill="#dc2626"
                opacity="0.6"
              />
            )}
          </React.Fragment>
        ))}
      </Connections>
    </VisualizerContainer>
  );
};
