import React from 'react';
import { ToastIcon } from '../ToastIcon';
import { ToastType } from '../../../types/toast';

/**
 * Demo component to visually test ToastIcon with all types
 * This can be used for manual testing and visual verification
 */
export const ToastIconDemo: React.FC = () => {
  const toastTypes: ToastType[] = ['success', 'error', 'info', 'warning'];

  return (
    <div className="p-8 space-y-4">
      <h2 className="text-2xl font-bold mb-6">Toast Icon Demo</h2>

      <div className="space-y-3">
        {toastTypes.map(type => (
          <div key={type} className="flex items-center space-x-3 p-3 border rounded-lg">
            <ToastIcon type={type} />
            <span className="capitalize font-medium">{type} Toast Icon</span>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4">Custom Sizing Examples</h3>
        <div className="space-y-3">
          <div className="flex items-center space-x-3 p-3 border rounded-lg">
            <ToastIcon type="success" className="w-4 h-4" />
            <span>Small (w-4 h-4)</span>
          </div>
          <div className="flex items-center space-x-3 p-3 border rounded-lg">
            <ToastIcon type="error" className="w-6 h-6" />
            <span>Large (w-6 h-6)</span>
          </div>
          <div className="flex items-center space-x-3 p-3 border rounded-lg">
            <ToastIcon type="warning" className="w-8 h-8" />
            <span>Extra Large (w-8 h-8)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToastIconDemo;
