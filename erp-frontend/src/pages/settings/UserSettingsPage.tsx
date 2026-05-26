import { User, Settings, Bell, Palette, Globe, List } from 'lucide-react';
import { Link } from 'react-router-dom';
import { UserPreferencesSettings } from '../../components/settings/UserPreferencesSettings';
import { ThemeToggle } from '../../components/ui/ThemeToggle';

const UserSettingsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Settings</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Manage your account preferences and application settings
              </p>
            </div>
            <ThemeToggle showLabel size="md" />
          </div>
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Settings Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Settings Categories
              </h2>
              <nav className="space-y-2">
                <a
                  href="#preferences"
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md"
                >
                  <Settings className="w-4 h-4" />
                  User Preferences
                </a>
                <a
                  href="#appearance"
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                  <Palette className="w-4 h-4" />
                  Appearance
                </a>
                <a
                  href="#language"
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                  <Globe className="w-4 h-4" />
                  Language & Region
                </a>
                <a
                  href="#notifications"
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                  <Bell className="w-4 h-4" />
                  Notifications
                </a>
                <a
                  href="#account"
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                  <User className="w-4 h-4" />
                  Account
                </a>
                <Link
                  to="/settings/pages-actions"
                  className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                  <List className="w-4 h-4" />
                  Pages & Actions
                </Link>
              </nav>
            </div>

            {/* Quick Actions */}
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                Quick Actions
              </h3>
              <div className="space-y-2">
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                  Export Settings
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                  Import Settings
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md">
                  Reset All Settings
                </button>
              </div>
            </div>
          </div>

          {/* Settings Content */}
          <div className="lg:col-span-2">
            <UserPreferencesSettings />
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserSettingsPage;
