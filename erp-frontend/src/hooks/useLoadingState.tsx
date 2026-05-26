// src/hooks/useLoadingState.ts
import { useState, useEffect } from 'react';
import { LoadingStateManager, ButtonStateManager } from '../utils/errorHandler';

/**
 * Hook for tracking global loading states
 */
export const useLoadingState = (operationId?: string) => {
  const [loadingOperations, setLoadingOperations] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = LoadingStateManager.subscribe(setLoadingOperations);
    return unsubscribe;
  }, []);

  return {
    isLoading: operationId ? loadingOperations.has(operationId) : loadingOperations.size > 0,
    isAnyLoading: loadingOperations.size > 0,
    loadingOperations: Array.from(loadingOperations),
    isOperationLoading: (id: string) => loadingOperations.has(id),
  };
};

/**
 * Hook for tracking button disabled states
 */
export const useButtonState = (buttonId?: string) => {
  const [disabledButtons, setDisabledButtons] = useState<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    const unsubscribe = ButtonStateManager.subscribe(setDisabledButtons);
    return unsubscribe;
  }, []);

  const isDisabled = buttonId ? ButtonStateManager.isButtonDisabled(buttonId) : false;
  const allDisabledButtons = ButtonStateManager.getDisabledButtons();

  return {
    isDisabled,
    allDisabledButtons,
    isButtonDisabled: (id: string) => ButtonStateManager.isButtonDisabled(id),
  };
};

/**
 * Hook for enhanced button with loading and disabled states
 */
export const useEnhancedButton = (
  buttonId: string,
  options: {
    showSpinner?: boolean;
    disabledText?: string;
    loadingText?: string;
  } = {}
) => {
  const { isDisabled } = useButtonState(buttonId);
  const { isLoading } = useLoadingState();
  const { showSpinner = true, disabledText, loadingText } = options;

  const getButtonProps = (baseProps: any = {}) => ({
    ...baseProps,
    disabled: baseProps.disabled || isDisabled || isLoading,
    'data-button-id': buttonId,
    style: {
      ...baseProps.style,
      cursor: isDisabled || isLoading ? 'not-allowed' : 'pointer',
      opacity: isDisabled || isLoading ? 0.6 : 1,
    },
  });

  const getButtonText = (originalText: string) => {
    if (isDisabled && disabledText) return disabledText;
    if (isLoading && loadingText) return loadingText;
    return originalText;
  };

  const getSpinnerElement = () => {
    if (!showSpinner || !isLoading) return null;

    return (
      <div
        style={{
          display: 'inline-block',
          width: '16px',
          height: '16px',
          border: '2px solid transparent',
          borderTop: '2px solid currentColor',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginRight: '8px',
        }}
      />
    );
  };

  return {
    isDisabled,
    isLoading,
    getButtonProps,
    getButtonText,
    getSpinnerElement,
  };
};

/**
 * Hook for managing operation-specific loading indicators
 */
export const useOperationIndicator = (
  operationId: string,
  options: {
    showGlobalSpinner?: boolean;
    showOperationSpinner?: boolean;
    spinnerSize?: number;
    spinnerColor?: string;
  } = {}
) => {
  const { isOperationLoading } = useLoadingState(operationId);
  const { isAnyLoading } = useLoadingState();

  const {
    showGlobalSpinner = false,
    showOperationSpinner = true,
    spinnerSize = 16,
    spinnerColor = 'currentColor',
  } = options;

  const shouldShowSpinner = showOperationSpinner
    ? isOperationLoading
    : showGlobalSpinner
      ? isAnyLoading
      : false;

  const getSpinnerElement = (customSize?: number, customColor?: string) => {
    if (!shouldShowSpinner) return null;

    const size = customSize || spinnerSize;
    const color = customColor || spinnerColor;

    return (
      <div
        style={{
          display: 'inline-block',
          width: `${size}px`,
          height: `${size}px`,
          border: `2px solid transparent`,
          borderTop: `2px solid ${color}`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
    );
  };

  const getOverlayElement = (content?: React.ReactNode) => {
    if (!shouldShowSpinner) return null;

    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 1000,
        }}
      >
        {getSpinnerElement(24)}
        {content && <div style={{ fontSize: '14px', color: '#6b7280' }}>{content}</div>}
      </div>
    );
  };

  return {
    isLoading: isOperationLoading,
    isAnyLoading,
    shouldShowSpinner,
    getSpinnerElement,
    getOverlayElement,
  };
};
