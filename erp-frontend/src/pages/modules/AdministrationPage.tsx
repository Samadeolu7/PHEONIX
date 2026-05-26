// src/pages/administration/AdministrationPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermissions';
import { useAuth } from '../../contexts/AuthContext';
import { getFeaturesGroupedByCategory } from '../../config/featureRegistry';
import { Users, ArrowLeft } from 'lucide-react';

export const AdministrationPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const { selectedRole } = useAuth();

  // Get all administration features grouped by category
  // Director / Principal bypass permission checks
  const groupedFeatures = getFeaturesGroupedByCategory(
    'administration',
    hasPermission,
    selectedRole ?? undefined
  );

  // Get all categories
  const categories = Object.keys(groupedFeatures).sort();

  // If no features, show message
  if (categories.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <Link
              to="/dashboard/role-based"
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Administration</h1>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
            <Users className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No Administration Features Available
            </h2>
            <p className="text-gray-600">
              Your current role doesn't have permissions to access any administration features.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/dashboard/role-based"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Administration</h1>
              <p className="mt-2 text-lg text-gray-600">
                HR, payroll, branch management, and system administration
              </p>
            </div>
            <div className="text-sm text-gray-500">
              {Object.values(groupedFeatures).flat().length} available features
            </div>
          </div>
        </div>

        {/* Categories */}
        {categories.map(category => (
          <div key={category} className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6 border-b border-gray-200 pb-2">
              {category}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedFeatures[category].map(feature => {
                const Icon = feature.icon;
                return (
                  <Link
                    key={feature.id}
                    to={feature.path}
                    className="group bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-orange-300 transition-all duration-200"
                  >
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 group-hover:bg-orange-200 transition-colors">
                          <Icon size={20} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="text-lg font-medium text-gray-900 group-hover:text-orange-600 transition-colors">
                            {feature.title}
                          </h3>
                          {/* {feature.isNew && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              New
                            </span>
                          )}
                          {feature.isEnhanced && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Enhanced
                            </span>
                          )} */}
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
      </div>
    </div>
  );
};
