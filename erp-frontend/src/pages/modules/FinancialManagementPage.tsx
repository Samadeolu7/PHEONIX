// src/pages/financial/FinancialManagementPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { usePermission } from '../../hooks/usePermissions';
import { useAuth } from '../../contexts/AuthContext';
import { getFeaturesGroupedByCategory } from '../../config/featureRegistry';

export const FinancialManagementPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const { selectedRole } = useAuth();

  // Use the helper function directly - it already filters by moduleId AND permissions
  // Director / Principal bypass permission checks
  const groupedFeatures = getFeaturesGroupedByCategory(
    'financial',
    hasPermission,
    selectedRole ?? undefined
  );

  // Calculate total accessible features
  const totalFeatures = Object.values(groupedFeatures).reduce(
    (acc, features) => acc + features.length,
    0
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Financial Management</h1>
              <p className="mt-2 text-lg text-gray-600">
                Comprehensive financial operations including receivables, invoicing, and financial
                reporting
              </p>
            </div>
            <div className="text-sm text-gray-500">{totalFeatures} available features</div>
          </div>
        </div>

        {/* No access message */}
        {totalFeatures === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No Financial Features Available
            </h2>
            <p className="text-gray-600">
              Your current role doesn&apos;t have permissions to access any financial features.
            </p>
          </div>
        )}

        {/* Categories */}
        {Object.entries(groupedFeatures).map(([category, features]) => (
          <div key={category} className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6 border-b border-gray-200 pb-2">
              {category}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map(feature => {
                const Icon = feature.icon;
                return (
                  <Link
                    key={feature.id}
                    to={feature.path}
                    className="group bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-300 transition-all duration-200"
                  >
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 group-hover:bg-blue-200 transition-colors">
                          <Icon size={20} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="text-lg font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                            {feature.title}
                          </h3>
                          {feature.isNew && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              NEW
                            </span>
                          )}
                          {feature.isEnhanced && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              ENHANCED
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Debug section - remove in production */}
        {/* {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 p-4 bg-gray-100 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Debug Info</h3>
            <p>Total Features: {totalFeatures}</p>
            <p>Categories: {Object.keys(groupedFeatures).join(', ')}</p>
            <button 
              onClick={() => {
                console.log('All Financial Features:', FEATURE_REGISTRY.filter(f => f.moduleId === 'financial'));
                console.log('Grouped Features:', groupedFeatures);
                console.log('Has accounts-view permission:', hasPermission('accounts-view'));
              }}
              className="mt-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Log to Console
            </button>
          </div>
        )} */}
      </div>
    </div>
  );
};
