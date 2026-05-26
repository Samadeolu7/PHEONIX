import React from 'react';
import { ToastIcon } from '../ToastIcon';

/**
 * Usage examples for ToastIcon component
 * This demonstrates how the component should be used in the toast system
 */

// Example 1: Basic usage in a toast component
export const BasicToastExample = () => (
  <div className="flex items-center space-x-3 p-4 bg-white rounded-lg shadow-md">
    <ToastIcon type="success" />
    <span>Account created successfully!</span>
  </div>
);

// Example 2: Error toast with custom styling
export const ErrorToastExample = () => (
  <div className="flex items-center space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
    <ToastIcon type="error" />
    <div>
      <div className="font-medium text-red-800">Error</div>
      <div className="text-red-600">Failed to save changes</div>
    </div>
  </div>
);

// Example 3: Info toast with larger icon
export const InfoToastExample = () => (
  <div className="flex items-center space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
    <ToastIcon type="info" className="w-6 h-6" />
    <span className="text-blue-800">New feature available!</span>
  </div>
);

// Example 4: Warning toast
export const WarningToastExample = () => (
  <div className="flex items-center space-x-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
    <ToastIcon type="warning" />
    <span className="text-orange-800">Please review your settings</span>
  </div>
);

// Example 5: All toast types showcase
export const AllToastTypesExample = () => (
  <div className="space-y-3 p-4">
    <h3 className="text-lg font-semibold mb-4">Toast Icon Examples</h3>

    <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
      <ToastIcon type="success" />
      <span>Success message</span>
    </div>

    <div className="flex items-center space-x-3 p-3 bg-red-50 rounded-lg">
      <ToastIcon type="error" />
      <span>Error message</span>
    </div>

    <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
      <ToastIcon type="info" />
      <span>Info message</span>
    </div>

    <div className="flex items-center space-x-3 p-3 bg-orange-50 rounded-lg">
      <ToastIcon type="warning" />
      <span>Warning message</span>
    </div>
  </div>
);

export default {
  BasicToastExample,
  ErrorToastExample,
  InfoToastExample,
  WarningToastExample,
  AllToastTypesExample,
};
