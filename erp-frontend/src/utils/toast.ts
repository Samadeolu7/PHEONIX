import { toast } from 'sonner';
import { useToast } from '../contexts/ToastContext';

/**
 * Imperative toast helper — works outside React components.
 * Uses sonner which requires <Toaster /> mounted in App.tsx.
 * For React components, prefer the useToast hook directly.
 */
export const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
  switch (type) {
    case 'success':
      toast.success(message);
      break;
    case 'error':
      toast.error(message);
      break;
    case 'warning':
      toast.warning(message);
      break;
    case 'info':
    default:
      toast.info(message);
      break;
  }
};

// Export the hook for use in components
export { useToast };
