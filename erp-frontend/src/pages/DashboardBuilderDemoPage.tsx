import React, { useState } from 'react';
import { ArrowLeft, Layout, Users, BarChart3, Settings } from 'lucide-react';
import { DashboardBuilderPage } from './admin/DashboardBuilderPage';
import { cn } from '../lib/utils';

interface DashboardBuilderDemoPageProps {
  className?: string;
}

export const DashboardBuilderDemoPage: React.FC<DashboardBuilderDemoPageProps> = ({
  className = '',
}) => {
  const [showDemo, setShowDemo] = useState(false);

  if (showDemo) {
    return <DashboardBuilderPage />;
  }

  return (
    <div className={cn('min-h-screen bg-gray-50', className)}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => window.history.back()}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <div className="h-6 w-px bg-gray-300" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Dashboard Builder Demo</h1>
                <p className="text-sm text-gray-600">Interactive dashboard creation interface</p>
              </div>
            </div>

            <button
              onClick={() => setShowDemo(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Layout className="h-4 w-4" />
              <span>Launch Builder</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-6">
            <Layout className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Admin Dashboard Builder</h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Create and customize dashboard layouts with drag-and-drop widgets, responsive
            breakpoints, and real-time preview functionality.
          </p>
          <button
            onClick={() => setShowDemo(true)}
            className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white text-lg rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Layout className="h-5 w-5" />
            <span>Try the Builder</span>
          </button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-lg mb-4">
              <Layout className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Drag & Drop</h3>
            <p className="text-gray-600">
              Intuitive drag-and-drop interface for arranging widgets on your dashboard
            </p>
          </div>

          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-100 rounded-lg mb-4">
              <BarChart3 className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Widget Library</h3>
            <p className="text-gray-600">
              Comprehensive library of pre-built widgets for stats, charts, and activities
            </p>
          </div>

          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-yellow-100 rounded-lg mb-4">
              <Users className="h-6 w-6 text-yellow-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Responsive Design</h3>
            <p className="text-gray-600">
              Built-in responsive breakpoints for desktop, tablet, and mobile layouts
            </p>
          </div>

          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-lg mb-4">
              <Settings className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Live Preview</h3>
            <p className="text-gray-600">
              Real-time preview functionality to see how dashboards will look to users
            </p>
          </div>
        </div>

        {/* Feature Details */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Key Features</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Dashboard Builder Interface
              </h3>
              <ul className="space-y-3 text-gray-600">
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Drag-and-drop widget placement with grid snapping</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Responsive breakpoint management (desktop, tablet, mobile)</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Undo/redo functionality for design changes</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Real-time layout updates and widget resizing</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Widget Library & Configuration
              </h3>
              <ul className="space-y-3 text-gray-600">
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Pre-built widgets for stats, charts, lists, and activities</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Comprehensive widget configuration panel</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Color themes, formatting options, and data sources</span>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Permission-based widget visibility controls</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Widget Types */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl p-8 mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Available Widget Types</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Statistics Cards</h3>
              <p className="text-sm text-gray-600">
                Display key metrics with trend indicators, custom formatting, and color themes
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="h-5 w-5 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Charts & Analytics</h3>
              <p className="text-sm text-gray-600">
                Line charts, bar charts, pie charts with configurable data sources and time ranges
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Activity Feeds</h3>
              <p className="text-sm text-gray-600">
                Real-time activity streams, recent events, and system notifications
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                <Layout className="h-5 w-5 text-yellow-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Content Lists</h3>
              <p className="text-sm text-gray-600">
                Ranked lists, top performers, overdue items with sorting and filtering
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <Settings className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">System Alerts</h3>
              <p className="text-sm text-gray-600">
                Important notifications, warnings, and system status indicators
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="h-5 w-5 text-indigo-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Custom Widgets</h3>
              <p className="text-sm text-gray-600">
                Extensible widget system for creating custom dashboard components
              </p>
            </div>
          </div>
        </div>

        {/* Technical Implementation */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Technical Implementation</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Technologies Used</h3>
              <ul className="space-y-2 text-gray-600">
                <li>
                  • <strong>React Grid Layout:</strong> Responsive grid system with drag-and-drop
                </li>
                <li>
                  • <strong>@dnd-kit:</strong> Modern drag-and-drop functionality
                </li>
                <li>
                  • <strong>Lucide React:</strong> Comprehensive icon library
                </li>
                <li>
                  • <strong>Tailwind CSS:</strong> Utility-first styling framework
                </li>
                <li>
                  • <strong>TypeScript:</strong> Type-safe development experience
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Features</h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Responsive breakpoint management</li>
                <li>• Widget configuration panels</li>
                <li>• Real-time preview functionality</li>
                <li>• Template inheritance system</li>
                <li>• Permission-based access control</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardBuilderDemoPage;
