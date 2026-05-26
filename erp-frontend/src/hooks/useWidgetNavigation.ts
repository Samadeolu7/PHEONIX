// src/hooks/useWidgetNavigation.ts
/**
 * Hook to handle widget navigation to module pages
 * Supports navigate, modal, and quick actions
 */

import { useNavigate } from 'react-router-dom';
import { useState, useCallback } from 'react';

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
      const action = widget.click_action_resolved || widget.click_action;

      if (!action) return;

      const { type, url, target } = action;

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
              size: action.size || 'medium',
            });
          }
          break;

        case 'trigger_workflow':
          // Handle workflow trigger
          handleWorkflowTrigger(action.workflow_id, action.params);
          break;

        case 'quick_action':
          // Handle quick action
          handleQuickAction(action.quick_action_code);
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

export default useWidgetNavigation;
