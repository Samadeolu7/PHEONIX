import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  Plus,
  Search,
  TrendingUp,
  AlertTriangle,
  MapPin,
  Tag,
  BarChart3,
  ArrowUpDown,
  FileText,
  Settings,
} from 'lucide-react';

const InventoryIndexPage: React.FC = () => {
  const navigate = useNavigate();

  const quickActions = [
    {
      title: 'Add New Item',
      description: 'Create a new inventory item',
      icon: Plus,
      color: 'bg-blue-500',
      path: '/inventory/items/create',
    },
    {
      title: 'View All Items',
      description: 'Browse inventory catalog',
      icon: Package,
      color: 'bg-green-500',
      path: '/inventory/items',
    },
    {
      title: 'Stock Movements',
      description: 'View movement history',
      icon: ArrowUpDown,
      color: 'bg-purple-500',
      path: '/inventory/movements',
    },
    {
      title: 'Manage Categories',
      description: 'Organize item categories',
      icon: Tag,
      color: 'bg-orange-500',
      path: '/inventory/categories',
    },
    {
      title: 'Manage Locations',
      description: 'Configure storage locations',
      icon: MapPin,
      color: 'bg-indigo-500',
      path: '/inventory/locations',
    },
    {
      title: 'Allocations',
      description: 'Manage allocations & redemptions',
      icon: FileText,
      color: 'bg-teal-500',
      path: '/inventory/allocations',
    },
  ];

  const stats = [
    {
      title: 'Total Items',
      value: '1,234',
      change: '+12%',
      changeType: 'positive' as const,
      icon: Package,
    },
    {
      title: 'Low Stock Items',
      value: '23',
      change: '-5%',
      changeType: 'negative' as const,
      icon: AlertTriangle,
    },
    {
      title: 'Total Value',
      value: '$456,789',
      change: '+8%',
      changeType: 'positive' as const,
      icon: TrendingUp,
    },
    {
      title: 'Locations',
      value: '12',
      change: '+2',
      changeType: 'neutral' as const,
      icon: MapPin,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-600">Manage your inventory items, stock levels, and movements</p>
        </div>
        <button
          onClick={() => navigate('/inventory/items/create')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-full">
                <stat.icon className="w-6 h-6 text-gray-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center">
              <span
                className={`text-sm font-medium ${
                  stat.changeType === 'positive'
                    ? 'text-green-600'
                    : stat.changeType === 'negative'
                      ? 'text-red-600'
                      : 'text-gray-600'
                }`}
              >
                {stat.change}
              </span>
              <span className="text-sm text-gray-500 ml-2">from last month</span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {quickActions.map((action, index) => (
            <div
              key={index}
              onClick={() => navigate(action.path)}
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className={`p-3 ${action.color} rounded-lg`}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{action.title}</h3>
                  <p className="text-sm text-gray-600">{action.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            <button
              onClick={() => navigate('/inventory/movements')}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              View All
            </button>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {[
              {
                type: 'Stock In',
                item: 'Office Chair - Model X',
                quantity: '+50',
                location: 'Main Warehouse',
                time: '2 hours ago',
                color: 'text-green-600',
              },
              {
                type: 'Stock Out',
                item: 'Laptop - Dell Inspiron',
                quantity: '-5',
                location: 'Store A',
                time: '4 hours ago',
                color: 'text-red-600',
              },
              {
                type: 'Transfer',
                item: 'Printer Paper A4',
                quantity: '100',
                location: 'Warehouse → Store B',
                time: '6 hours ago',
                color: 'text-blue-600',
              },
            ].map((activity, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div>
                    <p className="font-medium text-gray-900">{activity.item}</p>
                    <p className="text-sm text-gray-600">{activity.location}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-medium ${activity.color}`}>{activity.quantity}</p>
                  <p className="text-sm text-gray-500">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InventoryIndexPage;
