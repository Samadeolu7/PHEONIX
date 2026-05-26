import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  User,
  Shield,
  BarChart3,
  Settings,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { AnimatedContainer, StaggeredAnimation } from '../ui/Animations';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  content: React.ReactNode;
  targetElement?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  action?: {
    type: 'click' | 'hover' | 'scroll';
    element: string;
    description: string;
  };
  skippable?: boolean;
}

interface UserOnboardingProps {
  userRole: string;
  isFirstLogin: boolean;
  onComplete: () => void;
  onSkip: () => void;
  className?: string;
}

const roleBasedSteps: Record<string, OnboardingStep[]> = {
  Director: [
    {
      id: 'welcome-director',
      title: 'Welcome, Director!',
      description: "Let's explore your comprehensive dashboard with full system access.",
      content: (
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Full Access</h3>
              <p className="text-sm text-gray-600">
                You have access to all system modules and administrative functions.
              </p>
            </div>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-800">
              As a Director, you can manage users, configure dashboards, and access all financial
              and operational data.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'dashboard-overview-director',
      title: 'Your Dashboard Overview',
      description: 'Your dashboard shows key metrics across all departments.',
      targetElement: '.dashboard-metrics',
      position: 'bottom',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Your dashboard includes:</p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              Financial performance metrics
            </li>
            <li className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              Client enrollment statistics
            </li>
            <li className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              Operational efficiency indicators
            </li>
            <li className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              System-wide alerts and notifications
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'role-management-director',
      title: 'Role Management',
      description: 'Manage user roles and permissions from the admin panel.',
      targetElement: '.admin-module',
      position: 'left',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Click on the Administration module to:</p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>• Assign roles to users</li>
            <li>• Configure permissions</li>
            <li>• Manage dashboard assignments</li>
            <li>• Monitor system usage</li>
          </ul>
        </div>
      ),
      action: {
        type: 'click',
        element: '.admin-module',
        description: 'Click on the Administration module',
      },
    },
  ],
  Principal: [
    {
      id: 'welcome-principal',
      title: 'Welcome, Principal!',
      description: 'Your dashboard focuses on client services and administrative oversight.',
      content: (
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <User className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Client Leadership</h3>
              <p className="text-sm text-gray-600">
                Focus on Client Services, loan portfolio management, and branch operations.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'client-services-principal',
      title: 'Client Services Hub',
      description: 'Access client management and loan tools.',
      targetElement: '.client-services-module',
      position: 'bottom',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Your primary tools include:</p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>• Client registration and records</li>
            <li>• Loan management and repayment schedules</li>
            <li>• Savings and deposits tracking</li>
            <li>• Client communication tools</li>
          </ul>
        </div>
      ),
    },
  ],
  Administrator: [
    {
      id: 'welcome-administrator',
      title: 'Welcome, Administrator!',
      description: 'Your dashboard emphasizes operational efficiency and system management.',
      content: (
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Settings className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">System Operations</h3>
              <p className="text-sm text-gray-600">
                Manage daily operations, workflows, and system configurations.
              </p>
            </div>
          </div>
        </div>
      ),
    },
  ],
  Registrar: [
    {
      id: 'welcome-registrar',
      title: 'Welcome, Registrar!',
      description: 'Your dashboard is optimized for client records and loan administration.',
      content: (
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <BarChart3 className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Client Records</h3>
              <p className="text-sm text-gray-600">
                Focus on client registration, records management, and loan reporting.
              </p>
            </div>
          </div>
        </div>
      ),
    },
  ],
  Officer: [
    {
      id: 'welcome-officer',
      title: 'Welcome, Officer!',
      description: 'Your dashboard provides access to specific operational functions.',
      content: (
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-teal-100 rounded-lg">
              <User className="h-6 w-6 text-teal-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Operational Support</h3>
              <p className="text-sm text-gray-600">
                Access to specific modules based on your assigned responsibilities.
              </p>
            </div>
          </div>
        </div>
      ),
    },
  ],
};

const commonSteps: OnboardingStep[] = [
  {
    id: 'navigation-basics',
    title: 'Navigation Basics',
    description: 'Learn how to navigate between different modules.',
    targetElement: '.main-navigation',
    position: 'right',
    content: (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Use the navigation menu to access different modules:
        </p>
        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-sm">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span>Click on module cards to enter</span>
          </div>
          <div className="flex items-center space-x-2 text-sm">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span>Use breadcrumbs to navigate back</span>
          </div>
          <div className="flex items-center space-x-2 text-sm">
            <div className="w-3 h-3 bg-purple-500 rounded"></div>
            <span>Search for specific items</span>
          </div>
        </div>
      </div>
    ),
    action: {
      type: 'hover',
      element: '.module-card',
      description: 'Hover over a module card to see its contents',
    },
  },
  {
    id: 'quick-actions',
    title: 'Quick Actions',
    description: 'Access frequently used functions quickly.',
    targetElement: '.quick-actions',
    position: 'top',
    content: (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Quick action buttons provide one-click access to common tasks:
        </p>
        <ul className="space-y-1 text-sm text-gray-600">
          <li>• Create new records</li>
          <li>• Generate reports</li>
          <li>• Process payments</li>
          <li>• View notifications</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'help-support',
    title: 'Getting Help',
    description: 'Know where to find help when you need it.',
    content: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-blue-50 rounded-lg">
            <HelpCircle className="h-5 w-5 text-blue-600 mb-2" />
            <h4 className="font-medium text-sm text-gray-900">Help Center</h4>
            <p className="text-xs text-gray-600">Access documentation and guides</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <Lightbulb className="h-5 w-5 text-green-600 mb-2" />
            <h4 className="font-medium text-sm text-gray-900">Tooltips</h4>
            <p className="text-xs text-gray-600">Hover over elements for quick help</p>
          </div>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-xs text-gray-600">
            Look for the <HelpCircle className="h-3 w-3 inline mx-1" /> icon throughout the system
            for contextual help.
          </p>
        </div>
      </div>
    ),
  },
];

export const UserOnboarding: React.FC<UserOnboardingProps> = ({
  userRole,
  isFirstLogin,
  onComplete,
  onSkip,
  className = '',
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(isFirstLogin);

  const roleSteps = roleBasedSteps[userRole] || [];
  const allSteps = [...roleSteps, ...commonSteps];

  useEffect(() => {
    // Auto-play onboarding if it's the first login
    if (isFirstLogin) {
      setIsPlaying(true);
    }
  }, [isFirstLogin]);

  const nextStep = () => {
    if (currentStep < allSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const goToStep = (stepIndex: number) => {
    setCurrentStep(stepIndex);
  };

  const handleComplete = () => {
    setShowOnboarding(false);
    onComplete();
  };

  const handleSkip = () => {
    setShowOnboarding(false);
    onSkip();
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const restart = () => {
    setCurrentStep(0);
    setIsPlaying(true);
  };

  // Auto-advance when playing
  useEffect(() => {
    if (isPlaying && currentStep < allSteps.length - 1) {
      const timer = setTimeout(() => {
        nextStep();
      }, 5000); // 5 seconds per step

      return () => clearTimeout(timer);
    } else if (isPlaying && currentStep === allSteps.length - 1) {
      setIsPlaying(false);
    }
  }, [isPlaying, currentStep, allSteps.length]);

  if (!showOnboarding || allSteps.length === 0) {
    return null;
  }

  const currentStepData = allSteps[currentStep];
  const progress = ((currentStep + 1) / allSteps.length) * 100;

  return (
    <div className={cn('fixed inset-0 z-50 bg-black bg-opacity-50', className)}>
      <AnimatedContainer animation="fadeIn">
        {/* Onboarding Modal */}
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-md mx-4">
          <div className="bg-white rounded-lg shadow-xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Getting Started</h2>
                <button
                  onClick={handleSkip}
                  className="text-white hover:text-gray-200 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-white bg-opacity-20 rounded-full h-2 mb-2">
                <div
                  className="bg-white h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-sm text-white text-opacity-90">
                <span>
                  Step {currentStep + 1} of {allSteps.length}
                </span>
                <span>{Math.round(progress)}% complete</span>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <AnimatedContainer
                key={currentStep}
                animation="slideInFromRight"
                className="space-y-4"
              >
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {currentStepData.title}
                  </h3>
                  <p className="text-gray-600 mb-4">{currentStepData.description}</p>
                </div>

                {/* Step Content */}
                <div className="min-h-[120px]">{currentStepData.content}</div>

                {/* Action Instruction */}
                {currentStepData.action && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <Lightbulb className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm font-medium text-yellow-800">Try it now:</span>
                    </div>
                    <p className="text-sm text-yellow-700 mt-1">
                      {currentStepData.action.description}
                    </p>
                  </div>
                )}
              </AnimatedContainer>
            </div>

            {/* Controls */}
            <div className="bg-gray-50 px-6 py-4">
              <div className="flex items-center justify-between">
                {/* Playback Controls */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={togglePlayPause}
                    className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={restart}
                    className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    title="Restart"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>

                {/* Navigation */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={prevStep}
                    disabled={currentStep === 0}
                    className={cn(
                      'flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      currentStep === 0
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back</span>
                  </button>

                  {currentStep === allSteps.length - 1 ? (
                    <button
                      onClick={handleComplete}
                      className="flex items-center space-x-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                    >
                      <Check className="h-4 w-4" />
                      <span>Finish</span>
                    </button>
                  ) : (
                    <button
                      onClick={nextStep}
                      className="flex items-center space-x-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      <span>Next</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Step Indicators */}
              <div className="flex justify-center mt-4 space-x-2">
                {allSteps.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToStep(index)}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all',
                      index === currentStep
                        ? 'bg-blue-600 w-6'
                        : index < currentStep
                          ? 'bg-green-500'
                          : 'bg-gray-300'
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Skip Button */}
        <button
          onClick={handleSkip}
          className="fixed bottom-6 right-6 px-4 py-2 bg-white text-gray-700 rounded-lg shadow-lg hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          Skip Tour
        </button>
      </AnimatedContainer>
    </div>
  );
};

export default UserOnboarding;
