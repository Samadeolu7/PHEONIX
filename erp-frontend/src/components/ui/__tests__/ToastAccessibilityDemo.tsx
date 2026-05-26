import React from 'react';
import { useToast } from '../../../hooks/useToast';

/**
 * Demo component to test toast accessibility features
 * This component can be used for manual testing of accessibility features
 */
export const ToastAccessibilityDemo: React.FC = () => {
  const toast = useToast();

  const showSuccessToast = () => {
    toast.success('Operation completed successfully!', {
      title: 'Success',
    });
  };

  const showErrorToast = () => {
    toast.error('Something went wrong. Please try again.', {
      title: 'Error',
    });
  };

  const showInfoToast = () => {
    toast.info('Here is some important information for you.', {
      title: 'Information',
    });
  };

  const showWarningToast = () => {
    toast.warning('Please be careful with this action.', {
      title: 'Warning',
    });
  };

  const showMultipleToasts = () => {
    toast.success('First success message');
    setTimeout(() => toast.error('An error occurred'), 500);
    setTimeout(() => toast.info('Some information'), 1000);
    setTimeout(() => toast.warning('A warning message'), 1500);
  };

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold mb-6">Toast Accessibility Demo</h1>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Individual Toast Types</h2>
        <p className="text-sm text-gray-600 mb-4">
          Test keyboard navigation (Tab to focus, Enter/Space/Escape to dismiss) and screen reader
          announcements.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={showSuccessToast}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            Show Success Toast
          </button>

          <button
            onClick={showErrorToast}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Show Error Toast
          </button>

          <button
            onClick={showInfoToast}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Show Info Toast
          </button>

          <button
            onClick={showWarningToast}
            className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            Show Warning Toast
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Multiple Toasts</h2>
        <p className="text-sm text-gray-600 mb-4">
          Test ARIA live region announcements with multiple toasts of different urgency levels.
        </p>

        <button
          onClick={showMultipleToasts}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          Show Multiple Toasts
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Clear All</h2>
        <button
          onClick={() => toast.clearAllToasts()}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          Clear All Toasts
        </button>
      </div>

      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold mb-2">Accessibility Features Implemented:</h3>
        <ul className="text-sm space-y-1 list-disc list-inside">
          <li>ARIA live regions (polite for success/info, assertive for error/warning)</li>
          <li>Proper ARIA labels and descriptions</li>
          <li>Keyboard navigation support (Tab, Enter, Space, Escape)</li>
          <li>Minimum 44px touch targets for close buttons</li>
          <li>High contrast colors for WCAG compliance</li>
          <li>Screen reader announcements</li>
          <li>Focus management and visible focus indicators</li>
          <li>Semantic HTML structure with proper roles</li>
        </ul>
      </div>
    </div>
  );
};

export default ToastAccessibilityDemo;
