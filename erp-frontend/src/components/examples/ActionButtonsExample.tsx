import React, { useState } from 'react';
import { ActionButtonsSection } from '../procurement/ActionButtonsSection';

export const ActionButtonsExample: React.FC = () => {
  const [formValid, setFormValid] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [submissionType, setSubmissionType] = useState<'draft' | 'manual' | 'workflow' | null>(
    null
  );

  const handleSaveAsDraft = async () => {
    setProcessing(true);
    setSubmissionType('draft');

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Saved as draft');
    setProcessing(false);
    setSubmissionType(null);
  };

  const handleSubmitForApproval = async () => {
    setProcessing(true);
    setSubmissionType('manual');

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Submitted for manual approval');
    setProcessing(false);
    setSubmissionType(null);
  };

  const handleCreateWithWorkflow = async () => {
    setProcessing(true);
    setSubmissionType('workflow');

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Created with workflow');
    setProcessing(false);
    setSubmissionType(null);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '400px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '24px', textAlign: 'center' }}>Action Buttons Example</h2>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <input
            type="checkbox"
            checked={formValid}
            onChange={e => setFormValid(e.target.checked)}
          />
          Form is valid
        </label>

        <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
          Toggle this to see how buttons are disabled when form is invalid
        </p>
      </div>

      <ActionButtonsSection
        formValid={formValid}
        processing={processing}
        submissionType={submissionType}
        onSaveAsDraft={handleSaveAsDraft}
        onSubmitForApproval={handleSubmitForApproval}
        onCreateWithWorkflow={handleCreateWithWorkflow}
      />

      {processing && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            background: '#f0f9ff',
            borderRadius: '6px',
            textAlign: 'center',
            fontSize: '14px',
            color: '#0369a1',
          }}
        >
          Processing {submissionType} submission...
        </div>
      )}
    </div>
  );
};

export default ActionButtonsExample;
