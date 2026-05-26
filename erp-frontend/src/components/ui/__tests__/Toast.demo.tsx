import React, { useState } from 'react';
import { Toast } from '../Toast';
import { Toast as ToastType, ToastType as ToastTypeEnum } from '../../../types/toast';

/**
 * Demo component to showcase Toast component functionality
 * This is for development and testing purposes
 */
export const ToastDemo: React.FC = () => {
  const [toasts, setToasts] = useState<ToastType[]>([]);

  const handleDismiss = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const addToast = (type: ToastTypeEnum, message: string, title?: string) => {
    const newToast: ToastType = {
      id: `demo-toast-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      type,
      message,
      title,
      dismissible: true,
    };
    setToasts(prev => [...prev, newToast]);
  };

  const clearAllToasts = () => {
    setToasts([]);
  };

  return (
    <div className="p-8 bg-gray-100 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">Toast Component Demo</h1>

        {/* Control Panel */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <h2 className="text-xl font-semibold mb-4">Add Toast Notifications</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <button
              onClick={() => addToast('success', 'Operation completed successfully!')}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Success Toast
            </button>
            <button
              onClick={() => addToast('error', 'An error occurred while processing your request.')}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Error Toast
            </button>
            <button
              onClick={() => addToast('info', 'Here is some helpful information for you.')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Info Toast
            </button>
            <button
              onClick={() => addToast('warning', 'Please review your settings before continuing.')}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
            >
              Warning Toast
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <button
              onClick={() =>
                addToast(
                  'success',
                  'Account created successfully! You can now start using all the features.',
                  'Welcome!'
                )
              }
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
            >
              Success with Title
            </button>
            <button
              onClick={() =>
                addToast(
                  'error',
                  'Failed to connect to the server. Please check your internet connection and try again.',
                  'Connection Error'
                )
              }
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
            >
              Error with Title
            </button>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() =>
                addToast(
                  'info',
                  'This is a very long message that demonstrates how the toast component handles text wrapping and maintains proper layout even with extensive content that might span multiple lines.'
                )
              }
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Long Message
            </button>
            <button
              onClick={clearAllToasts}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Toast Display Area */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Toast Display ({toasts.length} active)</h2>

          {toasts.length === 0 ? (
            <p className="text-gray-500 italic">
              No toasts to display. Click the buttons above to add some!
            </p>
          ) : (
            <div className="space-y-4">
              {toasts.map(toast => (
                <Toast key={toast.id} toast={toast} onDismiss={handleDismiss} />
              ))}
            </div>
          )}
        </div>

        {/* Usage Instructions */}
        <div className="bg-white p-6 rounded-lg shadow-md mt-8">
          <h2 className="text-xl font-semibold mb-4">Usage Instructions</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li>Click any toast notification to dismiss it</li>
            <li>Use the X button in the top-right corner to close individual toasts</li>
            <li>Notice the different color schemes for each toast type</li>
            <li>Observe how long messages wrap properly</li>
            <li>Test keyboard navigation by tabbing to the close buttons</li>
            <li>Check accessibility with screen readers (proper ARIA attributes)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ToastDemo;
