// src/pages/DashboardSettingsPage.tsx
// Allows users to view their dashboards and set/clear their default dashboard.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Star,
  StarOff,
  ArrowLeft,
  List,
  ExternalLink,
  Check,
  Loader2,
} from 'lucide-react';
import { api } from '../services/api';

interface Dashboard {
  id: number;
  name: string;
  slug: string;
  description?: string;
  is_default: boolean;
  is_public: boolean;
}

const DashboardSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboards();
  }, []);

  const fetchDashboards = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/dashboards/');
      const list: Dashboard[] =
        res.data?.results ?? res.data?.data ?? res.data ?? res.results ?? [];
      setDashboards(Array.isArray(list) ? list : []);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? err.message ?? 'Failed to load dashboards.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (dashboard: Dashboard) => {
    if (dashboard.is_default) return; // already default
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api.post(`/dashboards/${dashboard.id}/set_default/`);
      setDashboards(prev =>
        prev.map(d => ({ ...d, is_default: d.id === dashboard.id }))
      );
      setSuccessMsg(`"${dashboard.name}" is now your default dashboard.`);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? err.message ?? 'Failed to set default.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearDefault = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api.post('/dashboards/clear_default/');
      setDashboards(prev => prev.map(d => ({ ...d, is_default: false })));
      setSuccessMsg('Default dashboard cleared. The logo will now go to the role-based dashboard.');
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? err.message ?? 'Failed to clear default.');
    } finally {
      setSaving(false);
    }
  };

  const currentDefault = dashboards.find(d => d.is_default);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5 text-indigo-600" />
                Dashboard Settings
              </h1>
              <p className="text-sm text-gray-500">Choose which dashboard the logo navigates to</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/dashboard/select')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            <List className="w-4 h-4" />
            View All Dashboards
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Status messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            {successMsg}
          </div>
        )}

        {/* Current default card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Current Default
          </h2>
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : currentDefault ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{currentDefault.name}</p>
                {currentDefault.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{currentDefault.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/dashboard/${currentDefault.id}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Open this dashboard"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open
                </button>
                <button
                  onClick={handleClearDefault}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Clear default — logo will go to role-based dashboard"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <StarOff className="w-3.5 h-3.5" />
                  )}
                  Clear Default
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 italic">
                No default set — logo navigates to the role-based dashboard.
              </p>
              <button
                onClick={() => navigate('/dashboard/role-based')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Go to Role Dashboard
              </button>
            </div>
          )}
        </div>

        {/* Dashboard list */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Available Dashboards
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading dashboards…</span>
            </div>
          ) : dashboards.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              No dashboards available. Contact an administrator.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {dashboards.map(db => (
                <li key={db.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    {db.is_default ? (
                      <Star className="w-4 h-4 text-amber-400 flex-shrink-0 fill-amber-400" />
                    ) : (
                      <Star className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {db.name}
                        {db.is_default && (
                          <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            Default
                          </span>
                        )}
                      </p>
                      {db.description && (
                        <p className="text-sm text-gray-500 truncate">{db.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <button
                      onClick={() => navigate(`/dashboard/${db.id}`)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title={`Open ${db.name}`}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    {!db.is_default && (
                      <button
                        onClick={() => handleSetDefault(db)}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Set as my default dashboard"
                      >
                        {saving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Star className="w-3.5 h-3.5" />
                        )}
                        Set Default
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick links */}
        <div className="flex items-center gap-4 text-sm">
          <button
            onClick={() => navigate('/dashboard/role-based')}
            className="text-indigo-600 hover:underline"
          >
            Go to Role-Based Dashboard
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={() => navigate('/dashboard/select')}
            className="text-indigo-600 hover:underline"
          >
            View All Dashboards
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardSettingsPage;
