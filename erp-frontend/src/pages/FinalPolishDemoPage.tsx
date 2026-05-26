import React, { useState } from 'react';
import {
  Sparkles,
  BookOpen,
  Users,
  HelpCircle,
  Play,
  Settings,
  BarChart3,
  Zap,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  AnimatedContainer,
  StaggeredAnimation,
  HoverAnimation,
  LoadingAnimation,
} from '../components/ui/Animations';
import { AdminTrainingGuide } from '../components/documentation/AdminTrainingGuide';
import { UserOnboarding } from '../components/onboarding/UserOnboarding';
import { HelpSystem, Tooltip, ContextualHelp, useHelpSystem } from '../components/help/HelpSystem';
import { StatsCard } from '../components/dashboard/StatsCard';

const FinalPolishDemoPage: React.FC = () => {
  const [showTraining, setShowTraining] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedRole, setSelectedRole] = useState('Director');
  const [isLoading, setIsLoading] = useState(false);

  const { isOpen: isHelpOpen, openHelp, closeHelp } = useHelpSystem();

  const roles = ['Director', 'Principal', 'Administrator', 'Registrar', 'Officer'];

  const demoFeatures = [
    {
      id: 'animations',
      title: 'Smooth Animations',
      description: 'Enhanced user experience with fluid transitions and micro-interactions',
      icon: Zap,
      color: 'blue',
      demo: () => {
        setIsLoading(true);
        setTimeout(() => setIsLoading(false), 2000);
      },
    },
    {
      id: 'training',
      title: 'Admin Training',
      description: 'Comprehensive training materials for system administrators',
      icon: BookOpen,
      color: 'green',
      demo: () => setShowTraining(true),
    },
    {
      id: 'onboarding',
      title: 'User Onboarding',
      description: 'Role-based guided tours for new users',
      icon: Users,
      color: 'purple',
      demo: () => setShowOnboarding(true),
    },
    {
      id: 'help',
      title: 'Help System',
      description: 'Contextual help and comprehensive documentation',
      icon: HelpCircle,
      color: 'orange',
      demo: () => openHelp('dashboard'),
    },
  ];

  const statsData = [
    {
      id: 'revenue',
      title: 'Total Revenue',
      value: 2450000,
      change: { value: 12.5, type: 'increase' as const, period: 'last month' },
      icon: BarChart3,
      color: 'blue' as const,
      format: 'currency' as const,
    },
    {
      id: 'students',
      title: 'Active Students',
      value: 1245,
      change: { value: 3.1, type: 'increase' as const, period: 'this term' },
      icon: Users,
      color: 'green' as const,
    },
    {
      id: 'completion',
      title: 'Task Completion',
      value: 87,
      change: { value: 5.2, type: 'increase' as const, period: 'this week' },
      icon: Settings,
      color: 'purple' as const,
      format: 'percentage' as const,
      suffix: '%',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <AnimatedContainer animation="fadeIn">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-4xl font-bold text-gray-900">Final Polish & Documentation</h1>
            </div>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Experience the enhanced dashboard system with smooth animations, comprehensive
              training materials, guided onboarding, and contextual help system.
            </p>
          </div>
        </AnimatedContainer>

        {/* Feature Showcase */}
        <AnimatedContainer animation="slideInFromBottom" delay={0.2}>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center">
              <Play className="h-6 w-6 text-blue-600 mr-2" />
              Interactive Demo Features
            </h2>

            <StaggeredAnimation staggerDelay={0.1}>
              {demoFeatures.map(feature => {
                const Icon = feature.icon;
                return (
                  <HoverAnimation key={feature.id} scale={1.02} lift={true}>
                    <div className="bg-gray-50 rounded-lg p-6 mb-4 border border-gray-200">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4">
                          <div
                            className={cn(
                              'p-3 rounded-lg',
                              feature.color === 'blue' && 'bg-blue-100',
                              feature.color === 'green' && 'bg-green-100',
                              feature.color === 'purple' && 'bg-purple-100',
                              feature.color === 'orange' && 'bg-orange-100'
                            )}
                          >
                            <Icon
                              className={cn(
                                'h-6 w-6',
                                feature.color === 'blue' && 'text-blue-600',
                                feature.color === 'green' && 'text-green-600',
                                feature.color === 'purple' && 'text-purple-600',
                                feature.color === 'orange' && 'text-orange-600'
                              )}
                            />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                              {feature.title}
                            </h3>
                            <p className="text-gray-600 mb-3">{feature.description}</p>
                          </div>
                        </div>
                        <Tooltip content={`Try the ${feature.title.toLowerCase()} feature`}>
                          <button
                            onClick={feature.demo}
                            className={cn(
                              'px-4 py-2 rounded-lg text-white font-medium transition-colors interactive-element',
                              feature.color === 'blue' && 'bg-blue-600 hover:bg-blue-700',
                              feature.color === 'green' && 'bg-green-600 hover:bg-green-700',
                              feature.color === 'purple' && 'bg-purple-600 hover:bg-purple-700',
                              feature.color === 'orange' && 'bg-orange-600 hover:bg-orange-700'
                            )}
                          >
                            Try It
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  </HoverAnimation>
                );
              })}
            </StaggeredAnimation>
          </div>
        </AnimatedContainer>

        {/* Animated Stats Cards Demo */}
        <AnimatedContainer animation="slideInFromLeft" delay={0.4}>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
                <BarChart3 className="h-6 w-6 text-blue-600 mr-2" />
                Enhanced Stats Cards
                <ContextualHelp topic="stats" className="ml-2" />
              </h2>
              {isLoading && (
                <div className="flex items-center space-x-2 text-blue-600">
                  <LoadingAnimation type="spinner" size="sm" />
                  <span className="text-sm">Loading animations...</span>
                </div>
              )}
            </div>

            <StaggeredAnimation staggerDelay={0.15}>
              {statsData.map(stat => (
                <div key={stat.id} className="mb-4">
                  <StatsCard
                    {...stat}
                    className="dashboard-card-hover"
                    onClick={() => console.log(`Clicked ${stat.title}`)}
                  />
                </div>
              ))}
            </StaggeredAnimation>
          </div>
        </AnimatedContainer>

        {/* Role-based Onboarding Demo */}
        <AnimatedContainer animation="slideInFromRight" delay={0.6}>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center">
              <Users className="h-6 w-6 text-blue-600 mr-2" />
              Role-based Onboarding
              <ContextualHelp topic="onboarding" className="ml-2" />
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Role for Demo:
                </label>
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}
                  className="block w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {roles.map(role => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowOnboarding(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors interactive-element"
                >
                  Start {selectedRole} Onboarding
                </button>
                <Tooltip content="Experience the guided tour tailored for each role">
                  <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                    Preview Mode
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        </AnimatedContainer>

        {/* Help System Integration */}
        <AnimatedContainer animation="fadeIn" delay={0.8}>
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-8 border border-blue-200">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center">
              <HelpCircle className="h-6 w-6 text-blue-600 mr-2" />
              Contextual Help Examples
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Tooltips in Action</h3>
                <div className="flex flex-wrap gap-3">
                  <Tooltip content="This is a helpful tooltip with additional information">
                    <button className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                      Hover for Tooltip
                    </button>
                  </Tooltip>

                  <Tooltip
                    content={
                      <div>
                        <h4 className="font-medium mb-1">Rich Tooltip</h4>
                        <p className="text-sm">
                          Tooltips can contain rich content including formatted text and multiple
                          lines.
                        </p>
                      </div>
                    }
                    position="bottom"
                    maxWidth="200px"
                  >
                    <button className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                      Rich Content
                    </button>
                  </Tooltip>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Contextual Help Icons</h3>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-700">Dashboard Navigation</span>
                    <ContextualHelp topic="navigation" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-700">Role Management</span>
                    <ContextualHelp topic="roles" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-700">Widget Configuration</span>
                    <ContextualHelp topic="widgets" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </AnimatedContainer>

        {/* Footer */}
        <AnimatedContainer animation="fadeIn" delay={1.0}>
          <div className="text-center mt-12 py-8 border-t border-gray-200">
            <p className="text-gray-600 mb-4">
              All features are now integrated with smooth animations, comprehensive documentation,
              and contextual help.
            </p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => openHelp()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors interactive-element"
              >
                Open Help Center
              </button>
              <button
                onClick={() => setShowTraining(true)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                View Training Materials
              </button>
            </div>
          </div>
        </AnimatedContainer>
      </div>

      {/* Modals and Overlays */}
      {showTraining && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 overflow-y-auto">
          <div className="min-h-screen py-6">
            <AdminTrainingGuide />
            <button
              onClick={() => setShowTraining(false)}
              className="fixed top-6 right-6 px-4 py-2 bg-white text-gray-700 rounded-lg shadow-lg hover:bg-gray-50 transition-colors"
            >
              Close Training
            </button>
          </div>
        </div>
      )}

      {showOnboarding && (
        <UserOnboarding
          userRole={selectedRole}
          isFirstLogin={true}
          onComplete={() => setShowOnboarding(false)}
          onSkip={() => setShowOnboarding(false)}
        />
      )}

      <HelpSystem isOpen={isHelpOpen} onClose={closeHelp} initialTopic="dashboard" />
    </div>
  );
};

export default FinalPolishDemoPage;
