import { useState, useCallback } from 'react';
import { Variable, WorkflowStep } from '../types/workflow';

export const useWorkflowBuilder = () => {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);

  const addStep = useCallback((type: string) => {
    const step: WorkflowStep = {
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Step`,
      type: type as any,
      config: {},
    };
    setSteps(prev => [...prev, step]);
  }, []);

  const updateStep = useCallback((stepId: string, updates: Partial<WorkflowStep>) => {
    setSteps(prev => prev.map(step => (step.id === stepId ? { ...step, ...updates } : step)));
  }, []);

  const deleteStep = useCallback((stepId: string) => {
    setSteps(prev => prev.filter(step => step.id !== stepId));
  }, []);

  const addVariable = useCallback((variable: Omit<Variable, 'id'>) => {
    const newVariable: Variable = {
      ...variable,
      id: `calc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    setVariables(prev => [...prev, newVariable]);
  }, []);

  const loadFormVariables = useCallback(async (formId: number) => {
    try {
      const res = await fetch(`/api/automations/forms/${formId}/`);
      const form = await res.json();
      const vars: Variable[] = form.schema.fields.map((f: any) => ({
        id: `form_${f.id}`,
        name: f.label,
        type: f.type === 'number' ? 'number' : 'string',
        source: 'form',
        path: `form.${f.id}`,
      }));
      setVariables(vars);
    } catch (error) {
      console.error('Failed to load form variables:', error);
      throw error;
    }
  }, []);

  return {
    steps,
    variables,
    addStep,
    updateStep,
    deleteStep,
    addVariable,
    loadFormVariables,
    setSteps,
    setVariables,
  };
};
