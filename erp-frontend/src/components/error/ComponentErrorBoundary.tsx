import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showRetry?: boolean;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

class ComponentErrorBoundary extends Component<Props, State> {
  private maxRetries = 2;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `Component Error Boundary (${this.props.componentName || 'Unknown'}) caught an error:`,
      error,
      errorInfo
    );

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        retryCount: prevState.retryCount + 1,
      }));
    }
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, retryCount } = this.state;
      const canRetry = this.props.showRetry !== false && retryCount < this.maxRetries;

      return (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-800">
                {this.props.componentName ? `${this.props.componentName} Error` : 'Component Error'}
              </h3>
              <p className="text-sm text-red-700 mt-1">
                This component encountered an error and couldn't load properly.
              </p>

              {process.env.NODE_ENV === 'development' && error && (
                <details className="mt-2">
                  <summary className="text-xs text-red-600 cursor-pointer">
                    Show error details
                  </summary>
                  <pre className="text-xs text-red-600 mt-1 whitespace-pre-wrap break-all">
                    {error.message}
                  </pre>
                </details>
              )}

              {canRetry && (
                <button
                  onClick={this.handleRetry}
                  className="mt-3 inline-flex items-center px-3 py-1 text-xs font-medium text-red-800 bg-red-100 border border-red-300 rounded hover:bg-red-200 transition-colors"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Try Again {retryCount > 0 && `(${retryCount}/${this.maxRetries})`}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ComponentErrorBoundary;
