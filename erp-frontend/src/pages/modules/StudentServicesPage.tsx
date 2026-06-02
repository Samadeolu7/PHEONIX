// src/pages/modules/ClientServicesPage.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermissions';
import { useAuth } from '../../contexts/AuthContext';
import { getFeaturesGroupedByCategory } from '../../config/featureRegistry';
import { Users, ArrowLeft, ChevronRight } from 'lucide-react';
import { BRAND } from '../../constants/brand';

export const StudentServicesPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const { selectedRole } = useAuth();
  // Director / Principal bypass permission checks
  const groupedFeatures = getFeaturesGroupedByCategory(
    'client-services',
    hasPermission,
    selectedRole ?? undefined
  );
  const categories = Object.keys(groupedFeatures).sort();

  if (categories.length === 0) {
    return (
      <div className="min-h-screen" style={{ background: BRAND.colors.offWhite }}>
        <div style={{ background: 'linear-gradient(135deg, #060e30 0%, #0a1857 60%, #162570 100%)' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
            <Link
              to="/dashboard/role-based"
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-5 transition-opacity hover:opacity-75"
              style={{ color: BRAND.colors.goldLight }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-white">Client Services</h1>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: BRAND.colors.border }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(183,151,88,0.1)' }}>
              <Users className="w-7 h-7" style={{ color: BRAND.colors.gold }} />
            </div>
            <h2 className="text-lg font-bold mb-2" style={{ color: BRAND.colors.navyPrimary }}>No Client Services Features Available</h2>
            <p className="text-sm" style={{ color: BRAND.colors.textSecondary }}>
              Your current role doesn't have permissions to access any client services features.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: BRAND.colors.offWhite }}>
      {/* Navy gradient banner */}
      <div style={{ background: 'linear-gradient(135deg, #060e30 0%, #0a1857 60%, #162570 100%)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8">
          <Link
            to="/dashboard/role-based"
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-5 transition-opacity hover:opacity-75"
            style={{ color: BRAND.colors.goldLight }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(183,151,88,0.18)' }}>
                <Users className="w-6 h-6" style={{ color: BRAND.colors.gold }} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">Client Services</h1>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Borrower profiles, KYC, loan applications, and account management
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0 hidden sm:block">
              <div className="text-3xl font-bold tabular-nums" style={{ color: BRAND.colors.gold }}>{Object.values(groupedFeatures).flat().length}</div>
              <div className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>features</div>
            </div>
          </div>
          <div className="h-px mt-6" style={{ background: 'linear-gradient(90deg, rgba(183,151,88,0.6), transparent)' }} />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {categories.map(category => (
          <div key={category} className="mb-10">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: BRAND.colors.gold }} />
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: BRAND.colors.navyPrimary }}>
                {category}
              </h2>
              <div className="flex-1 h-px" style={{ background: '#e0d8cc' }} />
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: 'rgba(10,24,87,0.07)', color: BRAND.colors.textSecondary }}>
                {groupedFeatures[category].length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupedFeatures[category].map(feature => {
                const Icon = feature.icon;
                return (
                  <Link
                    key={feature.id}
                    to={feature.path}
                    className="group relative bg-white rounded-xl border p-5 hover:shadow-lg transition-all duration-200 flex items-start gap-4"
                    style={{ borderColor: '#e8e0d0' }}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(10,24,87,0.07)' }}>
                      <Icon size={18} style={{ color: BRAND.colors.navyPrimary }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <h3 className="text-sm font-semibold truncate" style={{ color: BRAND.colors.navyPrimary }}>
                          {feature.title}
                        </h3>
                        {feature.isNew && (
                          <span className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(183,151,88,0.15)', color: BRAND.colors.goldDark }}>NEW</span>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed line-clamp-2" style={{ color: BRAND.colors.textSecondary }}>
                        {feature.description}
                      </p>
                    </div>
                    <ChevronRight
                      className="flex-shrink-0 w-4 h-4 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: BRAND.colors.gold }}
                    />
                    <div
                      className="absolute inset-x-0 bottom-0 h-0.5 rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: `linear-gradient(90deg, ${BRAND.colors.gold}, transparent)` }}
                    />
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
