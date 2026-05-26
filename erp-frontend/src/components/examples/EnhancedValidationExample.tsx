import React, { useState } from 'react';
import { useEnhancedFormValidation } from '../../hooks/useEnhancedFormValidation';
import { RequisitionFormData, SubmissionType } from '../../utils/EnhancedFormValidator';

/**
 * Example component demonstrating the Enhanced Form Validation system
 * for dual requisition workflow support
 */
const EnhancedValidationExample: React.FC = () => {
  const [formData, setFormData] = useState<RequisitionFormData>({
    department_id: '',
    title: '',
    justification: '',
    budget_code: '',
    expected_delivery_date: '',
    priority: 'medium',
    notes: '',
    items: [
      {
        item_id: '',
        quantity: 1,
        estimated_cost: 0,
        specification: '',
        urgency: 'medium',
        justification: '',
        budget_code: '',
        notes: '',
      },
    ],
  });

  const [currentSubmissionType, setCurrentSubmissionType] = useState<SubmissionType>('manual');

  // Use the enhanced validation hook
  const validation = useEnhancedFormValidation(formData, {
    validateOnChange: true,
    validateOnBlur: true,
    debounceMs: 300,
  });

  const handleInputChange = (field: keyof RequisitionFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    validation.handleFieldChange(field);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));
  };

  const handleSubmit = (submissionType: SubmissionType) => {
    const result = validation.validateForSubmission(submissionType);

    if (result.isValid) {
      alert(`Form is valid for ${submissionType} submission!`);
      console.log('Form data:', formData);
    } else {
      alert(`Validation failed: ${result.errors.join(', ')}`);
    }
  };

  const getFieldValidation = (fieldName: string) => {
    return validation.getFieldValidation(fieldName, currentSubmissionType);
  };

  const getSubmissionButtonState = (submissionType: SubmissionType) => {
    return validation.getSubmissionButtonState(submissionType);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Enhanced Form Validation Example</h1>
      <p>This example demonstrates the dual requisition workflow validation system.</p>

      {/* Submission Type Selector */}
      <div
        style={{
          marginBottom: '24px',
          padding: '16px',
          background: '#f3f4f6',
          borderRadius: '8px',
        }}
      >
        <h3>Current Validation Mode:</h3>
        <div style={{ display: 'flex', gap: '12px' }}>
          {(['draft', 'manual', 'workflow'] as SubmissionType[]).map(type => (
            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="radio"
                name="submissionType"
                value={type}
                checked={currentSubmissionType === type}
                onChange={e => setCurrentSubmissionType(e.target.value as SubmissionType)}
              />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </label>
          ))}
        </div>
      </div>

      {/* Form Fields */}
      <div style={{ display: 'grid', gap: '16px', marginBottom: '24px' }}>
        {/* Department */}
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
            Department *
          </label>
          <input
            type="text"
            value={formData.department_id}
            onChange={e => handleInputChange('department_id', e.target.value)}
            onBlur={() => validation.handleFieldBlur('department_id')}
            placeholder="Enter department name"
            style={{
              width: '100%',
              padding: '8px',
              border: `2px solid ${getFieldValidation('department_id').showError ? '#ef4444' : '#d1d5db'}`,
              borderRadius: '4px',
            }}
          />
          {getFieldValidation('department_id').showError && (
            <p style={{ margin: '4px 0 0 0', color: '#ef4444', fontSize: '14px' }}>
              {getFieldValidation('department_id').errorMessage}
            </p>
          )}
        </div>

        {/* Title */}
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
            Title *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={e => handleInputChange('title', e.target.value)}
            onBlur={() => validation.handleFieldBlur('title')}
            placeholder="Enter requisition title"
            style={{
              width: '100%',
              padding: '8px',
              border: `2px solid ${getFieldValidation('title').showError ? '#ef4444' : '#d1d5db'}`,
              borderRadius: '4px',
            }}
          />
          {getFieldValidation('title').showError && (
            <p style={{ margin: '4px 0 0 0', color: '#ef4444', fontSize: '14px' }}>
              {getFieldValidation('title').errorMessage}
            </p>
          )}
        </div>

        {/* Justification */}
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
            Justification *
          </label>
          <textarea
            value={formData.justification}
            onChange={e => handleInputChange('justification', e.target.value)}
            onBlur={() => validation.handleFieldBlur('justification')}
            placeholder="Enter detailed justification (workflow requires 20+ characters)"
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              border: `2px solid ${getFieldValidation('justification').showError ? '#ef4444' : '#d1d5db'}`,
              borderRadius: '4px',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            {getFieldValidation('justification').showError && (
              <p style={{ margin: 0, color: '#ef4444', fontSize: '14px' }}>
                {getFieldValidation('justification').errorMessage}
              </p>
            )}
            <p style={{ margin: 0, color: '#6b7280', fontSize: '12px' }}>
              {formData.justification.length} characters
            </p>
          </div>
        </div>

        {/* Expected Delivery Date */}
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
            Expected Delivery Date {currentSubmissionType === 'workflow' && '*'}
          </label>
          <input
            type="date"
            value={formData.expected_delivery_date}
            onChange={e => handleInputChange('expected_delivery_date', e.target.value)}
            onBlur={() => validation.handleFieldBlur('expected_delivery_date')}
            style={{
              width: '100%',
              padding: '8px',
              border: `2px solid ${getFieldValidation('expected_delivery_date').showError ? '#ef4444' : '#d1d5db'}`,
              borderRadius: '4px',
            }}
          />
          {getFieldValidation('expected_delivery_date').showError && (
            <p style={{ margin: '4px 0 0 0', color: '#ef4444', fontSize: '14px' }}>
              {getFieldValidation('expected_delivery_date').errorMessage}
            </p>
          )}
        </div>

        {/* Item */}
        <div>
          <h3>Item 1 *</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Item ID *
              </label>
              <input
                type="text"
                value={formData.items[0]?.item_id || ''}
                onChange={e => handleItemChange(0, 'item_id', e.target.value)}
                placeholder="Enter item ID"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '2px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Quantity *
              </label>
              <input
                type="number"
                value={formData.items[0]?.quantity || 0}
                onChange={e => handleItemChange(0, 'quantity', parseInt(e.target.value) || 0)}
                min="1"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '2px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Estimated Cost *
              </label>
              <input
                type="number"
                value={formData.items[0]?.estimated_cost || 0}
                onChange={e =>
                  handleItemChange(0, 'estimated_cost', parseFloat(e.target.value) || 0)
                }
                min="0"
                step="0.01"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '2px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Specification *
              </label>
              <input
                type="text"
                value={formData.items[0]?.specification || ''}
                onChange={e => handleItemChange(0, 'specification', e.target.value)}
                placeholder="Enter item specification"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '2px solid #d1d5db',
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Item Justification *
            </label>
            <input
              type="text"
              value={formData.items[0]?.justification || ''}
              onChange={e => handleItemChange(0, 'justification', e.target.value)}
              placeholder="Enter item justification"
              style={{
                width: '100%',
                padding: '8px',
                border: '2px solid #d1d5db',
                borderRadius: '4px',
              }}
            />
          </div>
        </div>
      </div>

      {/* Validation Status */}
      <div
        style={{
          marginBottom: '24px',
          padding: '16px',
          background: '#f9fafb',
          borderRadius: '8px',
        }}
      >
        <h3>Validation Status</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {(['draft', 'manual', 'workflow'] as SubmissionType[]).map(type => {
            const state = getSubmissionButtonState(type);
            return (
              <div
                key={type}
                style={{
                  padding: '12px',
                  background: state.canSubmit ? '#dcfce7' : '#fef2f2',
                  border: `2px solid ${state.canSubmit ? '#16a34a' : '#dc2626'}`,
                  borderRadius: '6px',
                }}
              >
                <h4 style={{ margin: '0 0 8px 0', textTransform: 'capitalize' }}>{type}</h4>
                <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
                  Status: {state.canSubmit ? '✅ Valid' : '❌ Invalid'}
                </p>
                {state.validationMessage && (
                  <p style={{ margin: 0, fontSize: '12px', color: '#dc2626' }}>
                    {state.validationMessage}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        {(['draft', 'manual', 'workflow'] as SubmissionType[]).map(type => {
          const state = getSubmissionButtonState(type);
          return (
            <button
              key={type}
              onClick={() => handleSubmit(type)}
              disabled={state.disabled}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderRadius: '6px',
                background: state.disabled
                  ? '#9ca3af'
                  : type === 'draft'
                    ? '#6b7280'
                    : type === 'manual'
                      ? '#3b82f6'
                      : '#10b981',
                color: 'white',
                cursor: state.disabled ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                textTransform: 'capitalize',
              }}
            >
              {type === 'draft'
                ? 'Save as Draft'
                : type === 'manual'
                  ? 'Submit for Approval'
                  : 'Create with Workflow'}
            </button>
          );
        })}
      </div>

      {/* Debug Information */}
      <details style={{ marginTop: '24px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Debug Information</summary>
        <pre
          style={{ background: '#f3f4f6', padding: '16px', borderRadius: '8px', overflow: 'auto' }}
        >
          {JSON.stringify(
            {
              validationState: validation.validationState,
              touchedFields: validation.touchedFields,
              formData,
            },
            null,
            2
          )}
        </pre>
      </details>
    </div>
  );
};

export default EnhancedValidationExample;
