// Error pages for 403/404 with recovery options
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, Home, RefreshCw, LogOut, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface ErrorPageProps {
  type: '403' | '404';
  title?: string;
  message?: string;
  showRoleInfo?: boolean;
}

export const ErrorPage: React.FC<ErrorPageProps> = ({
  type,
  title,
  message,
  showRoleInfo = true,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, selectedRole, userWithRole } = useAuth();

  const errorConfig = {
    '403': {
      defaultTitle: 'Access Denied',
      defaultMessage: "You don't have permission to access this page.",
      icon: AlertTriangle,
      iconColor: 'text-red-500',
      bgColor: 'bg-red-50',
    },
    '404': {
      defaultTitle: 'Page Not Found',
      defaultMessage: "The page you're looking for doesn't exist.",
      icon: AlertTriangle,
      iconColor: 'text-yellow-500',
      bgColor: 'bg-yellow-50',
    },
  };

  const config = errorConfig[type];
  const Icon = config.icon;

  const handleReload = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    navigate('/dashboard/role-based');
  };

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/dashboard/role-based');
    }
  };

  const handleReLogin = () => {
    logout();
    navigate('/login');
  };

  const fromPath = location.state?.from?.pathname;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Error Icon and Code */}
          <div className="text-center mb-6">
            <div
              className={`mx-auto flex items-center justify-center h-16 w-16 rounded-full ${config.bgColor} mb-4`}
            >
              <Icon className={`h-8 w-8 ${config.iconColor}`} />
            </div>
            <h1 className="text-6xl font-bold text-gray-900 mb-2">{type}</h1>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {title || config.defaultTitle}
            </h2>
            <p className="text-gray-600">{message || config.defaultMessage}</p>
          </div>

          {/* Role Information */}
          {showRoleInfo && selectedRole && userWithRole && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
              <div className="text-sm">
                <p className="text-blue-800 font-medium">Current Session:</p>
                <p className="text-blue-700">
                  <span className="font-medium">User:</span> {userWithRole.first_name}{' '}
                  {userWithRole.last_name} ({userWithRole.email})
                </p>
                <p className="text-blue-700">
                  <span className="font-medium">Role:</span> {selectedRole}
                </p>
                {fromPath && (
                  <p className="text-blue-700">
                    <span className="font-medium">Attempted Path:</span> {fromPath}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Primary Actions */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={handleGoHome}
                className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </button>

              <button
                onClick={handleGoBack}
                className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </button>
            </div>

            {/* Secondary Actions */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={handleReload}
                className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reload Page
              </button>

              <button
                onClick={handleReLogin}
                className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Re-login
              </button>
            </div>
          </div>

          {/* Help Text */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              {type === '403'
                ? 'If you believe you should have access to this page, please contact your system administrator.'
                : 'If you continue to experience issues, please contact support.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Specific error page components
export const ForbiddenPage: React.FC<Omit<ErrorPageProps, 'type'>> = props => (
  <ErrorPage type="403" {...props} />
);

export const NotFoundPage: React.FC<Omit<ErrorPageProps, 'type'>> = props => (
  <ErrorPage type="404" {...props} />
);
