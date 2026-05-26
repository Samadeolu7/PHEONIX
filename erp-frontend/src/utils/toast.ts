import { useToast } from '../contexts/ToastContext';

// Simple toast utility function for use outside of React components
// For use in React components, prefer using the useToast hook directly
export const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
  // This is a placeholder - in practice, you should use the useToast hook in components
  // For now, we'll use console logging as a fallback
  console.log(`Toast [${type.toUpperCase()}]: ${message}`);
};

// Export the hook for use in components
export { useToast };
