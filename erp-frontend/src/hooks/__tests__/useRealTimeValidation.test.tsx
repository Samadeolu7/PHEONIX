import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useRealTimeValidation } from '../useRealTimeValidation';
import { RequisitionFormData } from '../../utils/EnhancedFormValidator';

// Mock form data for testing
const mockFormData: RequisitionFormData = {
  department_id: '',
  title: '',
  justification: '',
  budget_code: '',
  expected_delivery_date: '',
  priority: 'medium',
  notes: '',
  items: [],
};

const validFormData: RequisitionFormData = {
  department_id: 'IT Department',
  title: 'Office Equipment Request',
  justification:
    'We need new laptops for the development team to improve productivity and support remote work capabilities.',
  budget_code: 'IT-2024-001',
  expected_delivery_date: '2024-03-15',
  priority: 'medium',
  notes: 'Urgent requirement for Q1 projects',
  items: [
    {
      item_id: '1',
      quantity: 5,
      estimated_cost: 1200,
      specification: 'Dell Latitude 5520 or equivalent',
      urgency: 'medium',
      justification: 'Required for new team members',
      budget_code: 'IT-2024-001',
      notes: 'Prefer Dell or HP brands',
    },
  ],
};

describe('useRealTimeValidation', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Initial State', () => {
    it('should initialize with correct validation state for empty form', () => {
      const { result } = renderHook(() => useRealTimeValidation(mockFormData));

      expect(result.current.validationState.isValid).toBe(false);
      expect(result.current.validationState.canSubmitAsDraft).toBe(true);
      expect(result.current.validationState.canSubmitForApproval).toBe(false);
      expect(result.current.validationState.canCreateWithWorkflow).toBe(false);
      expect(result.current.touchedFields).toEqual({});
    });

    it('should initialize with correct validation state for valid form', () => {
      const { result } = renderHook(() => useRealTimeValidation(validFormData));

      expect(result.current.validationState.isValid).toBe(true);
      expect(result.current.validationState.canSubmitAsDraft).toBe(true);
      expect(result.current.validationState.canSubmitForApproval).toBe(true);
      expect(result.current.validationState.canCreateWithWorkflow).toBe(true);
    });
  });

  describe('Field Validation', () => {
    it('should return correct field validation state', () => {
      const { result } = renderHook(() => useRealTimeValidation(mockFormData));

      const fieldValidation = result.current.getFieldValidation('department_id');

      expect(fieldValidation.isValid).toBe(false);
      expect(fieldValidation.hasError).toBe(true);
      expect(fieldValidation.errorMessage).toContain('Department is required');
      expect(fieldValidation.showError).toBe(false); // Not touched yet
      expect(fieldValidation.isTouched).toBe(false);
    });

    it('should show error when field is touched', () => {
      const { result } = renderHook(() => useRealTimeValidation(mockFormData));

      act(() => {
        result.current.markFieldTouched('department_id');
      });

      const fieldValidation = result.current.getFieldValidation('department_id');

      expect(fieldValidation.showError).toBe(true);
      expect(fieldValidation.isTouched).toBe(true);
    });

    it('should clear field error when clearFieldError is called', () => {
      const { result } = renderHook(() => useRealTimeValidation(mockFormData));

      act(() => {
        result.current.markFieldTouched('department_id');
      });

      let fieldValidation = result.current.getFieldValidation('department_id');
      expect(fieldValidation.hasError).toBe(true);

      act(() => {
        result.current.clearFieldError('department_id');
      });

      fieldValidation = result.current.getFieldValidation('department_id');
      expect(fieldValidation.hasError).toBe(false);
    });
  });

  describe('Real-time Feedback', () => {
    it('should handle field change with debouncing', () => {
      const { result } = renderHook(() => useRealTimeValidation(mockFormData, { debounceMs: 100 }));

      act(() => {
        result.current.handleFieldChange('department_id', 'IT Department');
      });

      // Should clear error immediately
      const fieldValidation = result.current.getFieldValidation('department_id');
      expect(fieldValidation.hasError).toBe(false);

      // Validation should be debounced
      act(() => {
        jest.advanceTimersByTime(50);
      });

      // Should not have updated validation state yet
      expect(result.current.validationState.errors.department_id).toBeDefined();

      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Should have updated validation state after debounce
      expect(result.current.validationState.errors.department_id).toBeUndefined();
    });

    it('should handle field blur with immediate validation', () => {
      const { result } = renderHook(() => useRealTimeValidation(mockFormData));

      act(() => {
        result.current.handleFieldBlur('department_id');
      });

      // Should mark field as touched
      expect(result.current.touchedFields.department_id).toBe(true);

      // Should trigger immediate validation
      const fieldValidation = result.current.getFieldValidation('department_id');
      expect(fieldValidation.isTouched).toBe(true);
      expect(fieldValidation.showError).toBe(true);
    });

    it('should provide submission-type-specific validation', () => {
      const { result } = renderHook(() =>
        useRealTimeValidation(mockFormData, { showSubmissionTypeHints: true })
      );

      const fieldValidation = result.current.getFieldValidation('department_id');

      expect(fieldValidation.isValidForSubmission.draft).toBe(true);
      expect(fieldValidation.isValidForSubmission.manual).toBe(false);
      expect(fieldValidation.isValidForSubmission.workflow).toBe(false);

      expect(fieldValidation.submissionTypeErrors.manual).toContain('Department is required');
      expect(fieldValidation.submissionTypeErrors.workflow).toContain('Department is required');
    });
  });

  describe('Submission Validation', () => {
    it('should provide correct submission validation for each type', () => {
      const { result } = renderHook(() => useRealTimeValidation(mockFormData));

      const draftValidation = result.current.getSubmissionValidation('draft');
      const manualValidation = result.current.getSubmissionValidation('manual');
      const workflowValidation = result.current.getSubmissionValidation('workflow');

      expect(draftValidation.canSubmit).toBe(true);
      expect(draftValidation.validationMessage).toBe('');

      expect(manualValidation.canSubmit).toBe(false);
      expect(manualValidation.validationMessage).toContain('Cannot submit for approval');

      expect(workflowValidation.canSubmit).toBe(false);
      expect(workflowValidation.validationMessage).toContain('Cannot create with workflow');
    });

    it('should provide submission type indicators', () => {
      const { result } = renderHook(() => useRealTimeValidation(mockFormData));

      const indicators = result.current.getSubmissionTypeIndicators();

      expect(indicators.draft.available).toBe(true);
      expect(indicators.draft.errors).toHaveLength(0);

      expect(indicators.manual.available).toBe(false);
      expect(indicators.manual.errors.length).toBeGreaterThan(0);

      expect(indicators.workflow.available).toBe(false);
      expect(indicators.workflow.errors.length).toBeGreaterThan(0);
    });
  });

  describe('State Management', () => {
    it('should reset validation state correctly', () => {
      const { result } = renderHook(() => useRealTimeValidation(mockFormData));

      // Touch some fields and add errors
      act(() => {
        result.current.markFieldTouched('department_id');
        result.current.markFieldTouched('title');
      });

      expect(Object.keys(result.current.touchedFields)).toHaveLength(2);

      // Reset validation
      act(() => {
        result.current.resetValidation();
      });

      expect(result.current.touchedFields).toEqual({});
      expect(result.current.validationState.errors).toEqual({});
    });

    it('should validate all fields and mark them as touched', () => {
      const { result } = renderHook(() => useRealTimeValidation(mockFormData));

      expect(Object.keys(result.current.touchedFields)).toHaveLength(0);

      act(() => {
        result.current.validateAll();
      });

      // Should mark all fields with errors as touched
      expect(result.current.touchedFields.department_id).toBe(true);
      expect(result.current.touchedFields.title).toBe(true);
      expect(result.current.touchedFields.justification).toBe(true);
    });
  });

  describe('Configuration Options', () => {
    it('should respect validateOnChange option', () => {
      const { result } = renderHook(() =>
        useRealTimeValidation(mockFormData, { validateOnChange: false })
      );

      act(() => {
        result.current.handleFieldChange('department_id', 'IT Department');
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Should not have triggered validation
      expect(result.current.validationState.errors.department_id).toBeDefined();
    });

    it('should respect validateOnBlur option', () => {
      const { result } = renderHook(() =>
        useRealTimeValidation(mockFormData, { validateOnBlur: false })
      );

      act(() => {
        result.current.handleFieldBlur('department_id');
      });

      // Should mark as touched but not validate
      expect(result.current.touchedFields.department_id).toBe(true);
      // Validation state should remain unchanged
      expect(result.current.validationState.errors.department_id).toBeDefined();
    });

    it('should respect debounce timing', () => {
      const { result } = renderHook(() => useRealTimeValidation(mockFormData, { debounceMs: 500 }));

      act(() => {
        result.current.handleFieldChange('department_id', 'IT Department');
      });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should not have validated yet
      expect(result.current.validationState.errors.department_id).toBeDefined();

      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should have validated now
      expect(result.current.validationState.errors.department_id).toBeUndefined();
    });

    it('should handle showSubmissionTypeHints option', () => {
      const { result: withHints } = renderHook(() =>
        useRealTimeValidation(mockFormData, { showSubmissionTypeHints: true })
      );

      const { result: withoutHints } = renderHook(() =>
        useRealTimeValidation(mockFormData, { showSubmissionTypeHints: false })
      );

      const fieldValidationWithHints = withHints.current.getFieldValidation('department_id');
      const fieldValidationWithoutHints = withoutHints.current.getFieldValidation('department_id');

      expect(fieldValidationWithHints.submissionTypeErrors.manual).toBeTruthy();
      expect(fieldValidationWithoutHints.submissionTypeErrors.manual).toBe('');
    });
  });

  describe('Performance', () => {
    it('should not trigger unnecessary re-validations', () => {
      const validationSpy = jest.fn();

      const { result, rerender } = renderHook(({ formData }) => useRealTimeValidation(formData), {
        initialProps: { formData: mockFormData },
      });

      // Rerender with same data
      rerender({ formData: mockFormData });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Should not have triggered additional validations
      expect(result.current.validationState).toBeDefined();
    });

    it('should clear timeouts on unmount', () => {
      const { result, unmount } = renderHook(() =>
        useRealTimeValidation(mockFormData, { debounceMs: 1000 })
      );

      act(() => {
        result.current.handleFieldChange('department_id', 'IT Department');
      });

      // Unmount before timeout completes
      unmount();

      // Should not throw errors
      act(() => {
        jest.advanceTimersByTime(2000);
      });
    });
  });
});
