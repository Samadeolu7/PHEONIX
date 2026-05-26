import React, { useState } from 'react';
import { ToastProvider } from '../../../contexts/ToastContext';
import { useToast } from '../../../hooks/useToast';

/**
 * Demo component to test toast animations
 * This component demonstrates the smooth enter/exit animations and stack movement
 */
const ToastAnimationDemoContent: React.FC = () => {
  const toast = useToast();
  const [counter, setCounter] = useState(1);

  const addSuccessToast = () => {
    toast.success(`Success message ${counter}`, {
      title: 'Success!',
    });
    setCounter(c => c + 1);
  };

  const addErrorToast = () => {
    toast.error(`Error message ${counter}`, {
      title: 'Error!',
    });
    setCounter(c => c + 1);
  };

  const addInfoToast = () => {
    toast.info(`Info message ${counter}`, {
      title: 'Information',
    });
    setCounter(c => c + 1);
  };

  const addWarningToast = () => {
    toast.warning(`Warning message ${counter}`, {
      title: 'Warning!',
    });
    setCounter(c => c + 1);
  };

  const addMultipleToasts = () => {
    toast.success('First toast');
    setTimeout(() => toast.info('Second toast'), 200);
    setTimeout(() => toast.warning('Third toast'), 400);
    setTimeout(() => toast.error('Fourth toast'), 600);
    setCounter(c => c + 4);
  };

  const clearAllToasts = () => {
    toast.clearAllToasts();
  };

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold mb-6">Toast Animation Demo</h1>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Single Toasts</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={addSuccessToast}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
          >
            Add Success Toast
          </button>
          <button
            onClick={addErrorToast}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            Add Error Toast
          </button>
          <button
            onClick={addInfoToast}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Add Info Toast
          </button>
          <button
            onClick={addWarningToast}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
          >
            Add Warning Toast
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Animation Tests</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={addMultipleToasts}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
          >
            Add Multiple Toasts (Staggered)
          </button>
          <button
            onClick={clearAllToasts}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          >
            Clear All Toasts
          </button>
        </div>
      </div>

      <div className="mt-8 p-4 bg-gray-100 rounded">
        <h3 className="font-semibold mb-2">Animation Features to Test:</h3>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Smooth slide-in animations from the right</li>
          <li>Smooth slide-out animations when dismissed</li>
          <li>Stack movement when toasts are added/removed</li>
          <li>Staggered entry animations for multiple toasts</li>
          <li>Hover effects with scale and shadow changes</li>
          <li>GPU-accelerated transforms for smooth performance</li>
          <li>Auto-dismissal timing (success/info: 4s, warning: 6s, error: manual)</li>
        </ul>
      </div>
    </div>
  );
};

/**
 * Main demo component wrapped with ToastProvider
 */
export const ToastAnimationDemo: React.FC = () => {
  return (
    <ToastProvider>
      <ToastAnimationDemoContent />
    </ToastProvider>
  );
};

export default ToastAnimationDemo;
