import { renderHook, act } from '@testing-library/react';
import {
  useEnhancedFormValidation,
  useEnhancedFieldValidation,
} from '../useEnhancedFormValidation';
import { RequisitionFormData } from '../../utils/EnhancedFormValidator';

// Mock form data for testing
const createMockFormData = (overrides: Partial<RequisitionFormData> = {}): RequisitionFormData => ({
  department_id: 'IT Department',
  title: 'Test Requisition',
  justification: 'This is a test justification for the requisition',
  budget_code: 'IT-2024-001',
  expected_delivery_date: '2024-12-31',
  priority: 'medium',
  notes: 'Test notes',
  items: [
    {
      item_id: '1',
      quantity: 5,
      estimated_cost: 100.0,
      specification: 'Test specification',
      urgency: 'medium',
      justification: 'Test item justification',
      budget_code: 'IT-2024-001',
      notes: 'Test item notes',
    },
  ],
  submissionType: 'manual',
  workflowInfo: undefined,
  ...overrides,
});

describe('useEnhancedFormValidation', () => {
  describe('basic functionality', () => {
    it('should initialize with valid form data', () => {
      const formData = createMockFormData();

      const { result } = renderHook(() =>
        useEnhancedFormValidation(formData, { validateOnChange: false })
      );

      expect(result.current.validationState.isValid).toBe(true);
      expect(result.current.validationState.canSubmitAsDraft).toBe(true);
      expect(result.current.validationState.canSubmitForApproval).toBe(true);
      expect(result.current.validationState.canCreateWithWorkflow).toBe(true);
    });

    it('should initialize with invalid form data', () => {
      const formData = createMockFormData({
        department_id: '',
        title: '',
        justification: '',
        items: [],
      });

      const { result } = renderHook(() =>
        useEnhancedFormValidation(formData, { validateOnChange: false })
      );

      expect(result.current.validationState.isValid).toBe(false);
      expect(result.current.validationState.canSubmitAsDraft).toBe(true); // Draft is always allowed
      expect(result.current.validationState.canSubmitForApproval).toBe(false);
      expect(result.current.validationState.canCreateWithWorkflow).toBe(false);
    });
  });

  describe('validateForSubmission', () => {
    it('should validate for different submission types', () => {
      const formData = createMockFormData();

      const { result } = renderHook(() =>
        useEnhancedFormValidation(formData, { validateOnChange: false })
      );

      const draftResult = result.current.validateForSubmission('draft');
      const manualResult = result.current.validateForSubmission('manual');
      const workflowResult = result.current.validateForSubmission('workflow');

      expect(draftResult.canSubmitAsDraft).toBe(true);
      expect(manualResult.canSubmitForApproval).toBe(true);
      expect(workflowResult.canCreateWithWorkflow).toBe(true);
    });

    it('should handle workflow validation requirements', () => {
      const formData = createMockFormData({
        expected_delivery_date: '', // Missing expected delivery date
      });

      const { result } = renderHook(() =>
        useEnhancedFormValidation(formData, { validateOnChange: false })
      );

      const workflowResult = result.current.validateForSubmission('workflow');

      expect(workflowResult.canCreateWithWorkflow).toBe(false);
      expect(workflowResult.submissionTypeErrors.workflow).toContain(
        'Expected delivery date is recommended for workflow submissions'
      );
    });
  });

  describe('field validation helpers', () => {
    it('should mark fields as touched', () => {
      const formData = createMockFormData();

      const { result } = renderHook(() =>
        useEnhancedFormValidation(formData, { validateOnChange: false })
      );

      expect(result.current.touchedFields.department_id).toBeUndefined();

      act(() => {
        result.current.markFieldTouched('department_id');
      });

      expect(result.current.touchedFields.department_id).toBe(true);
    });

    it('should get field validation state', () => {
      const formData = createMockFormData({
        department_id: '',
      });

      const { result } = renderHook(() =>
        useEnhancedFormValidation(formData, { validateOnChange: false })
      );

      // Mark field as touched
      act(() => {
        result.current.markFieldTouched('department_id');
      });

      const fieldValidation = result.current.getFieldValidation('department_id');

      expect(fieldValidation.hasError).toBe(true);
      expect(fieldValidation.isTouched).toBe(true);
      expect(fieldValidation.showError).toBe(true);
      expect(fieldValidation.errorMessage).toContain('Department is required');
    });
  });

  describe('submission button states', () => {
    it('should get submission button state for valid form', () => {
      const formData = createMockFormData();

      const { result } = renderHook(() =>
        useEnhancedFormValidation(formData, { validateOnChange: false })
      );

      const draftState = result.current.getSubmissionButtonState('draft');
      const manualState = result.current.getSubmissionButtonState('manual');
      const workflowState = result.current.getSubmissionButtonState('workflow');

      expect(draftState.canSubmit).toBe(true);
      expect(draftState.disabled).toBe(false);
      expect(manualState.canSubmit).toBe(true);
      expect(manualState.disabled).toBe(false);
      expect(workflowState.canSubmit).toBe(true);
      expect(workflowState.disabled).toBe(false);
    });

    it('should get submission button state for invalid form', () => {
      const formData = createMockFormData({
        department_id: '',
        items: [],
      });

      const { result } = renderHook(() =>
        useEnhancedFormValidation(formData, { validateOnChange: false })
      );

      const draftState = result.current.getSubmissionButtonState('draft');
      const manualState = result.current.getSubmissionButtonState('manual');
      const workflowState = result.current.getSubmissionButtonState('workflow');

      expect(draftState.canSubmit).toBe(true); // Draft is always allowed
      expect(draftState.disabled).toBe(false);
      expect(manualState.canSubmit).toBe(false);
      expect(manualState.disabled).toBe(true);
      expect(workflowState.canSubmit).toBe(false);
      expect(workflowState.disabled).toBe(true);
    });
  });

  describe('reset functionality', () => {
    it('should reset validation state', () => {
      const formData = createMockFormData();

      const { result } = renderHook(() =>
        useEnhancedFormValidation(formData, { validateOnChange: false })
      );

      // Mark field as touched
      act(() => {
        result.current.markFieldTouched('department_id');
      });

      expect(result.current.touchedFields.department_id).toBe(true);

      // Reset validation
      act(() => {
        result.current.resetValidation();
      });

      expect(result.current.touchedFields.department_id).toBeUndefined();
    });
  });
});

describe('useEnhancedFieldValidation', () => {
  it('should validate single field', () => {
    const formData = createMockFormData({
      department_id: '',
    });

    const { result } = renderHook(() =>
      useEnhancedFieldValidation('department', formData, 'manual')
    );

    expect(result.current.isValid).toBe(false);
    expect(result.current.errorMessage).toContain('Department is required');
  });

  it('should handle field blur', () => {
    const formData = createMockFormData();

    const { result } = renderHook(() =>
      useEnhancedFieldValidation('department', formData, 'manual')
    );

    expect(result.current.isTouched).toBe(false);

    act(() => {
      result.current.handleBlur();
    });

    expect(result.current.isTouched).toBe(true);
  });

  it('should reset field validation', () => {
    const formData = createMockFormData({
      department_id: '',
    });

    const { result } = renderHook(() =>
      useEnhancedFieldValidation('department', formData, 'manual')
    );

    // Mark as touched
    act(() => {
      result.current.markTouched();
    });

    expect(result.current.isTouched).toBe(true);

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.isTouched).toBe(false);
    expect(result.current.isValid).toBe(true);
    expect(result.current.errorMessage).toBe('');
  });

  it('should show error only when touched and invalid', () => {
    const formData = createMockFormData({
      department_id: '',
    });

    const { result } = renderHook(() =>
      useEnhancedFieldValidation('department', formData, 'manual')
    );

    expect(result.current.showError).toBe(false); // Not touched yet

    act(() => {
      result.current.markTouched();
    });

    expect(result.current.showError).toBe(true); // Now touched and invalid
  });
});
