import React from 'react';
import { useToast } from '../../hooks/useToast';

/**
 * Simple test component to verify ToastProvider integration
 * This component can be used to test that the toast system works across all routes
 */
export const ToastIntegrationTest: React.FC = () => {
  const toast = useToast();

  const testToasts = () => {
    toast.success('ToastProvider integration successful!');
    setTimeout(() => toast.info('Toast system is working across all routes'), 1000);
    setTimeout(() => toast.warning('This is a warning toast'), 2000);
    setTimeout(() => toast.error('This error toast requires manual dismissal'), 3000);
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', margin: '20px', borderRadius: '8px' }}>
      <h3>Toast Integration Test</h3>
      <p>Click the button below to test toast notifications:</p>
      <button
        onClick={testToasts}
        style={{
          padding: '10px 20px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        Test Toast System
      </button>
    </div>
  );
};

export default ToastIntegrationTest;
