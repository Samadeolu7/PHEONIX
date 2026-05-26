import { WorkflowStep } from '@/types/automation.types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';

import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { arrayMove } from '@dnd-kit/sortable';
import React, { useState } from 'react';

const StepList: React.FC<{
  steps: WorkflowStep[];
  onReorder: (steps: WorkflowStep[]) => void;
  onSelect: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
}> = ({ steps, onReorder, onSelect, onDuplicate, onDelete }) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = steps.findIndex(step => step.id === active.id);
      const newIndex = steps.findIndex(step => step.id === over?.id);

      const newSteps = arrayMove(steps, oldIndex, newIndex);
      onReorder(newSteps);
    }

    setActiveId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
        <List>
          {steps.map((step, index) => (
            <SortableStep
              key={step.id}
              step={step}
              index={index}
              onSelect={onSelect}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          ))}
        </List>
      </SortableContext>
      <DragOverlay>
        {activeId ? (
          <StepBox>
            <StepHeader>
              <div>
                <strong>{steps.find(s => s.id === activeId)?.name}</strong>
              </div>
            </StepHeader>
          </StepBox>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default StepList;
