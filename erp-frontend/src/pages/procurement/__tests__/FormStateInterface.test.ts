import { describe, test, expect } from 'vitest';
import { UrgencyLevel } from '../../../types/procurement';

// Test the enhanced form state interface
interface WorkflowInfo {
  workflow_run_id?: number;
  workflow_status?: string;
}

interface FormData {
  department_id: string;
  title: string;
  justification: string;
  budget_code: string;
  expected_delivery_date: string;
  priority: UrgencyLevel;
  notes: string;
  items: any[];
  submissionType?: 'draft' | 'manual' | 'workflow';
  workflowInfo?: WorkflowInfo;
}

describe('Enhanced Form State Interface', () => {
  test('should support all existing form fields', () => {
    const formData: FormData = {
      department_id: 'IT Department',
      title: 'Test Requisition',
      justification: 'This is a test justification',
      budget_code: 'DEPT-2024-001',
      expected_delivery_date: '2026-02-15',
      priority: UrgencyLevel.MEDIUM,
      notes: 'Additional notes',
      items: [],
    };

    expect(formData.department_id).toBe('IT Department');
    expect(formData.title).toBe('Test Requisition');
    expect(formData.justification).toBe('This is a test justification');
    expect(formData.budget_code).toBe('DEPT-2024-001');
    expect(formData.expected_delivery_date).toBe('2026-02-15');
    expect(formData.priority).toBe(UrgencyLevel.MEDIUM);
    expect(formData.notes).toBe('Additional notes');
    expect(formData.items).toEqual([]);
  });

  test('should support new submissionType field', () => {
    const formData: FormData = {
      department_id: 'IT Department',
      title: 'Test Requisition',
      justification: 'This is a test justification',
      budget_code: 'DEPT-2024-001',
      expected_delivery_date: '2026-02-15',
      priority: UrgencyLevel.MEDIUM,
      notes: 'Additional notes',
      items: [],
      submissionType: 'workflow',
    };

    expect(formData.submissionType).toBe('workflow');
  });

  test('should support new workflowInfo field', () => {
    const formData: FormData = {
      department_id: 'IT Department',
      title: 'Test Requisition',
      justification: 'This is a test justification',
      budget_code: 'DEPT-2024-001',
      expected_delivery_date: '2026-02-15',
      priority: UrgencyLevel.MEDIUM,
      notes: 'Additional notes',
      items: [],
      submissionType: 'workflow',
      workflowInfo: {
        workflow_run_id: 123,
        workflow_status: 'pending',
      },
    };

    expect(formData.workflowInfo?.workflow_run_id).toBe(123);
    expect(formData.workflowInfo?.workflow_status).toBe('pending');
  });

  test('should maintain backward compatibility with undefined new fields', () => {
    const formData: FormData = {
      department_id: 'IT Department',
      title: 'Test Requisition',
      justification: 'This is a test justification',
      budget_code: 'DEPT-2024-001',
      expected_delivery_date: '2026-02-15',
      priority: UrgencyLevel.MEDIUM,
      notes: 'Additional notes',
      items: [],
      // submissionType and workflowInfo are optional
    };

    expect(formData.submissionType).toBeUndefined();
    expect(formData.workflowInfo).toBeUndefined();
  });

  test('should support all submission types', () => {
    const draftForm: FormData = {
      department_id: 'IT Department',
      title: 'Test Requisition',
      justification: 'This is a test justification',
      budget_code: 'DEPT-2024-001',
      expected_delivery_date: '2026-02-15',
      priority: UrgencyLevel.MEDIUM,
      notes: 'Additional notes',
      items: [],
      submissionType: 'draft',
    };

    const manualForm: FormData = {
      ...draftForm,
      submissionType: 'manual',
    };

    const workflowForm: FormData = {
      ...draftForm,
      submissionType: 'workflow',
      workflowInfo: {
        workflow_run_id: 456,
        workflow_status: 'approved',
      },
    };

    expect(draftForm.submissionType).toBe('draft');
    expect(manualForm.submissionType).toBe('manual');
    expect(workflowForm.submissionType).toBe('workflow');
    expect(workflowForm.workflowInfo?.workflow_run_id).toBe(456);
    expect(workflowForm.workflowInfo?.workflow_status).toBe('approved');
  });
});
