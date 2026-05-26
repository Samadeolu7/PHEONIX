// src/components/ModulePageModal.tsx
import React from 'react';
import { X } from 'lucide-react';

interface ModulePageModalProps {
  isOpen: boolean;
  url: string;
  size: 'small' | 'medium' | 'large';
  onClose: () => void;
}

export const ModulePageModal: React.FC<ModulePageModalProps> = ({ isOpen, url, size, onClose }) => {
  if (!isOpen) return null;

  const sizeClasses = {
    small: 'max-w-md',
    medium: 'max-w-2xl',
    large: 'max-w-6xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={`relative bg-white rounded-lg shadow-xl ${sizeClasses[size]} w-full max-h-[90vh] flex flex-col`}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              {/* Title can be dynamically loaded from the page */}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content - Load the module page in iframe or render directly */}
          <div className="flex-1 overflow-y-auto p-6">
            <iframe
              src={url}
              className="w-full h-full min-h-[500px] border-0"
              title="Module Page"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModulePageModal;
