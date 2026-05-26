export interface CreateTemplateInput {
  name: string;
  description: string;
  requiresApproval: boolean;
  initialStepId: string;
  finalStepId: string;
  mappings: {
    stepId: string;
    debitAccountId?: string;
    creditAccountId?: string;
  }[];
}

export interface CreateTemplateApiInput {
  name: string;
  description: string;
  requires_approval: boolean;
  initial_step_id: number;
  final_step_id: number;
  mappings: {
    step_id: number;
    debit_account_id?: number;
    credit_account_id?: number;
  }[];
}

export const transformTemplateInput = (input: CreateTemplateInput): CreateTemplateApiInput => ({
  name: input.name,
  description: input.description,
  requires_approval: input.requiresApproval,
  initial_step_id: Number(input.initialStepId),
  final_step_id: Number(input.finalStepId),
  mappings: input.mappings.map(mapping => ({
    step_id: Number(mapping.stepId),
    debit_account_id: mapping.debitAccountId ? Number(mapping.debitAccountId) : undefined,
    credit_account_id: mapping.creditAccountId ? Number(mapping.creditAccountId) : undefined,
  })),
});
