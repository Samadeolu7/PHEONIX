// src/hooks/useWidgetNavigation.tsx
/**
 * Hook to handle widget navigation to module pages
 * Supports navigate, modal, and quick actions
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { X } from 'lucide-react';

interface NavigationAction {
  type: 'navigate' | 'modal' | 'quick_action' | 'trigger_workflow';
  url?: string;
  target?: '_self' | '_blank' | 'modal';
  size?: 'small' | 'medium' | 'large';
  module_code?: string;
  page_code?: string;
  params?: Record<string, any>;
  workflow_id?: number;
  quick_action_code?: string;
}

interface WidgetClickAction {
  click_action?: NavigationAction;
  click_action_resolved?: {
    type: string;
    url: string;
    target?: string;
    size?: string;
  };
}

interface UseWidgetNavigationReturn {
  handleWidgetClick: (widget: WidgetClickAction, rowData?: any) => void;
  handleLinkClick: (link: any) => void;
  modalConfig: {
    isOpen: boolean;
    url: string;
    size: string;
  } | null;
  closeModal: () => void;
}

export const useWidgetNavigation = (): UseWidgetNavigationReturn => {
  const navigate = useNavigate();
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    url: string;
    size: string;
  } | null>(null);

  const handleWidgetClick = useCallback(
    (widget: WidgetClickAction, rowData?: any) => {
      // Use resolved action if available (from backend)
      const action = (widget as any).click_action_resolved || (widget as any).click_action;

      if (!action) return;

      const { type, url, target } = action as NavigationAction;

      switch (type) {
        case 'navigate':
          if (url) {
            if (target === '_blank') {
              window.open(url, '_blank');
            } else {
              // Replace {params} in URL with rowData values
              const resolvedUrl = resolveUrlParams(url, rowData);
              navigate(resolvedUrl);
            }
          }
          break;

        case 'modal':
          if (url) {
            setModalConfig({
              isOpen: true,
              url: resolveUrlParams(url, rowData),
              size: (action as NavigationAction).size || 'medium',
            });
          }
          break;

        case 'trigger_workflow':
          // Handle workflow trigger
          handleWorkflowTrigger(
            (action as NavigationAction).workflow_id,
            (action as NavigationAction).params
          );
          break;

        case 'quick_action':
          // Handle quick action
          handleQuickAction((action as NavigationAction).quick_action_code);
          break;
      }
    },
    [navigate]
  );

  const handleLinkClick = useCallback(
    (link: any) => {
      const { url, target = '_self' } = link;

      if (target === '_blank') {
        window.open(url, '_blank');
      } else {
        navigate(url);
      }
    },
    [navigate]
  );

  const closeModal = useCallback(() => {
    setModalConfig(null);
  }, []);

  const resolveUrlParams = (url: string, data?: any): string => {
    if (!data) return url;

    // Replace {param} placeholders with actual values
    return url.replace(/\{(\w+(?:\.\w+)*)\}/g, (match, path) => {
      const value = getNestedValue(data, path);
      return value !== undefined ? String(value) : match;
    });
  };

  const getNestedValue = (obj: any, path: string): any => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  const handleWorkflowTrigger = async (workflowId?: number, params?: any) => {
    if (!workflowId) return;

    // TODO: Implement workflow trigger API call
    console.log('Triggering workflow:', workflowId, params);
  };

  const handleQuickAction = (quickActionCode?: string) => {
    if (!quickActionCode) return;

    // TODO: Implement quick action lookup and execution
    console.log('Executing quick action:', quickActionCode);
  };

  return {
    handleWidgetClick,
    handleLinkClick,
    modalConfig,
    closeModal,
  };
};

// ============================================================================
// MODAL COMPONENT FOR MODULE PAGES
// ============================================================================

interface ModulePageModalProps {
  isOpen: boolean;
  url: string;
  size: 'small' | 'medium' | 'large';
  onClose: () => void;
}

export const ModulePageModal: React.FC<ModulePageModalProps> = ({ isOpen, url, size, onClose }) => {
  if (!isOpen) return null;

  const sizeClasses: Record<string, string> = {
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

export default useWidgetNavigation;
