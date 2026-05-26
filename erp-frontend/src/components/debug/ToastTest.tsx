import React from 'react';
import { useToast } from '../../hooks/useToast';

export const ToastTest: React.FC = () => {
  const toast = useToast();

  const testToasts = () => {
    toast.success('Success toast test!');
    toast.error('Error toast test!');
    toast.info('Info toast test!');
    toast.warning('Warning toast test!');
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Toast System Test</h2>
      <button
        onClick={testToasts}
        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
      >
        Test All Toasts
      </button>
    </div>
  );
};

export default ToastTest;
