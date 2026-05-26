import React, { createContext, useContext, useReducer, ReactNode } from 'react';

// Types
interface ErrorState {
  id: string;
  error: Error;
  timestamp: Date;
  component?: string;
  retryCount: number;
}

interface LoadingState {
  id: string;
  isLoading: boolean;
  message?: string;
  progress?: number;
  timestamp: Date;
}

interface GlobalState {
  errors: ErrorState[];
  loadingStates: LoadingState[];
  isOnline: boolean;
  globalError: Error | null;
}

// Actions
type Action =
  | { type: 'ADD_ERROR'; payload: Omit<ErrorState, 'timestamp' | 'retryCount'> }
  | { type: 'REMOVE_ERROR'; payload: string }
  | { type: 'RETRY_ERROR'; payload: string }
  | { type: 'CLEAR_ERRORS' }
  | { type: 'SET_LOADING'; payload: Omit<LoadingState, 'timestamp'> }
  | { type: 'REMOVE_LOADING'; payload: string }
  | { type: 'UPDATE_LOADING_PROGRESS'; payload: { id: string; progress: number } }
  | { type: 'SET_ONLINE_STATUS'; payload: boolean }
  | { type: 'SET_GLOBAL_ERROR'; payload: Error | null };

// Initial state
const initialState: GlobalState = {
  errors: [],
  loadingStates: [],
  isOnline: navigator.onLine,
  globalError: null,
};

// Reducer
function errorAndLoadingReducer(state: GlobalState, action: Action): GlobalState {
  switch (action.type) {
    case 'ADD_ERROR':
      return {
        ...state,
        errors: [
          ...state.errors.filter(e => e.id !== action.payload.id),
          {
            ...action.payload,
            timestamp: new Date(),
            retryCount: 0,
          },
        ],
      };

    case 'REMOVE_ERROR':
      return {
        ...state,
        errors: state.errors.filter(e => e.id !== action.payload),
      };

    case 'RETRY_ERROR':
      return {
        ...state,
        errors: state.errors.map(e =>
          e.id === action.payload ? { ...e, retryCount: e.retryCount + 1 } : e
        ),
      };

    case 'CLEAR_ERRORS':
      return {
        ...state,
        errors: [],
      };

    case 'SET_LOADING':
      return {
        ...state,
        loadingStates: [
          ...state.loadingStates.filter(l => l.id !== action.payload.id),
          {
            ...action.payload,
            timestamp: new Date(),
          },
        ],
      };

    case 'REMOVE_LOADING':
      return {
        ...state,
        loadingStates: state.loadingStates.filter(l => l.id !== action.payload),
      };

    case 'UPDATE_LOADING_PROGRESS':
      return {
        ...state,
        loadingStates: state.loadingStates.map(l =>
          l.id === action.payload.id ? { ...l, progress: action.payload.progress } : l
        ),
      };

    case 'SET_ONLINE_STATUS':
      return {
        ...state,
        isOnline: action.payload,
      };

    case 'SET_GLOBAL_ERROR':
      return {
        ...state,
        globalError: action.payload,
      };

    default:
      return state;
  }
}

// Context
interface ErrorAndLoadingContextType {
  state: GlobalState;
  addError: (error: Omit<ErrorState, 'timestamp' | 'retryCount'>) => void;
  removeError: (id: string) => void;
  retryError: (id: string) => void;
  clearErrors: () => void;
  setLoading: (loading: Omit<LoadingState, 'timestamp'>) => void;
  removeLoading: (id: string) => void;
  updateLoadingProgress: (id: string, progress: number) => void;
  setOnlineStatus: (isOnline: boolean) => void;
  setGlobalError: (error: Error | null) => void;

  // Utility functions
  isLoading: (id?: string) => boolean;
  hasError: (id?: string) => boolean;
  getError: (id: string) => ErrorState | undefined;
  getLoadingState: (id: string) => LoadingState | undefined;
}

const ErrorAndLoadingContext = createContext<ErrorAndLoadingContextType | undefined>(undefined);

// Provider component
interface ErrorAndLoadingProviderProps {
  children: ReactNode;
}

export const ErrorAndLoadingProvider: React.FC<ErrorAndLoadingProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(errorAndLoadingReducer, initialState);

  // Action creators
  const addError = (error: Omit<ErrorState, 'timestamp' | 'retryCount'>) => {
    dispatch({ type: 'ADD_ERROR', payload: error });
  };

  const removeError = (id: string) => {
    dispatch({ type: 'REMOVE_ERROR', payload: id });
  };

  const retryError = (id: string) => {
    dispatch({ type: 'RETRY_ERROR', payload: id });
  };

  const clearErrors = () => {
    dispatch({ type: 'CLEAR_ERRORS' });
  };

  const setLoading = (loading: Omit<LoadingState, 'timestamp'>) => {
    dispatch({ type: 'SET_LOADING', payload: loading });
  };

  const removeLoading = (id: string) => {
    dispatch({ type: 'REMOVE_LOADING', payload: id });
  };

  const updateLoadingProgress = (id: string, progress: number) => {
    dispatch({ type: 'UPDATE_LOADING_PROGRESS', payload: { id, progress } });
  };

  const setOnlineStatus = (isOnline: boolean) => {
    dispatch({ type: 'SET_ONLINE_STATUS', payload: isOnline });
  };

  const setGlobalError = (error: Error | null) => {
    dispatch({ type: 'SET_GLOBAL_ERROR', payload: error });
  };

  // Utility functions
  const isLoading = (id?: string) => {
    if (id) {
      return state.loadingStates.some(l => l.id === id && l.isLoading);
    }
    return state.loadingStates.some(l => l.isLoading);
  };

  const hasError = (id?: string) => {
    if (id) {
      return state.errors.some(e => e.id === id);
    }
    return state.errors.length > 0;
  };

  const getError = (id: string) => {
    return state.errors.find(e => e.id === id);
  };

  const getLoadingState = (id: string) => {
    return state.loadingStates.find(l => l.id === id);
  };

  // Listen to online/offline events
  React.useEffect(() => {
    const handleOnline = () => setOnlineStatus(true);
    const handleOffline = () => setOnlineStatus(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const value: ErrorAndLoadingContextType = {
    state,
    addError,
    removeError,
    retryError,
    clearErrors,
    setLoading,
    removeLoading,
    updateLoadingProgress,
    setOnlineStatus,
    setGlobalError,
    isLoading,
    hasError,
    getError,
    getLoadingState,
  };

  return (
    <ErrorAndLoadingContext.Provider value={value}>{children}</ErrorAndLoadingContext.Provider>
  );
};

// Hook to use the context
export const useErrorAndLoading = () => {
  const context = useContext(ErrorAndLoadingContext);
  if (context === undefined) {
    throw new Error('useErrorAndLoading must be used within an ErrorAndLoadingProvider');
  }
  return context;
};

// Specialized hooks
export const useGlobalLoading = () => {
  const { state, setLoading, removeLoading, updateLoadingProgress } = useErrorAndLoading();

  const startLoading = (id: string, message?: string) => {
    setLoading({ id, isLoading: true, message });
  };

  const stopLoading = (id: string) => {
    removeLoading(id);
  };

  const updateProgress = (id: string, progress: number) => {
    updateLoadingProgress(id, progress);
  };

  return {
    isAnyLoading: state.loadingStates.some(l => l.isLoading),
    loadingStates: state.loadingStates,
    startLoading,
    stopLoading,
    updateProgress,
  };
};

export const useGlobalError = () => {
  const { state, addError, removeError, clearErrors, retryError } = useErrorAndLoading();

  const reportError = (id: string, error: Error, component?: string) => {
    addError({ id, error, component });
  };

  const dismissError = (id: string) => {
    removeError(id);
  };

  const retryErrorAction = (id: string) => {
    retryError(id);
  };

  return {
    errors: state.errors,
    globalError: state.globalError,
    hasErrors: state.errors.length > 0,
    reportError,
    dismissError,
    clearErrors,
    retryErrorAction,
  };
};
