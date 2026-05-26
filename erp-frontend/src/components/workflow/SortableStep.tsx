import { WorkflowStep } from '@/types/automation.types';
import React from 'react';
import styled from '@emotion/styled';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { StepTypeBadge } from '../ui/StepTypeBadge';
import { AVAILABLE_STEP_TYPES } from '../../constants/workflow.constants';
import { Button } from '../ui/Button';

interface SortableStepProps {
  step: WorkflowStep;
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onEdit: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
}

const SortableStep: React.FC<SortableStepProps> = ({
  step,
  index,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <StepItem
      ref={setNodeRef}
      style={style}
      isSelected={isSelected}
      isDragging={isDragging}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(index)}
    >
      <StepHeader>
        <StepContent>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{step.name}</div>
          <div style={{ fontSize: '0.875rem', color: '#718096', marginBottom: '0.5rem' }}>
            ID: {step.id}
          </div>
          <StepTypeBadge variant="outline">
            {AVAILABLE_STEP_TYPES.find(t => t.value === step.type)?.label || step.type}
          </StepTypeBadge>
        </StepContent>
        <StepActions>
          <Button
            size="sm"
            variant="outline"
            onClick={e => {
              e.stopPropagation();
              onEdit(index);
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={e => {
              e.stopPropagation();
              onDuplicate(index);
            }}
          >
            Duplicate
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={e => {
              e.stopPropagation();
              onDelete(index);
            }}
          >
            Delete
          </Button>
        </StepActions>
      </StepHeader>
    </StepItem>
  );
};
