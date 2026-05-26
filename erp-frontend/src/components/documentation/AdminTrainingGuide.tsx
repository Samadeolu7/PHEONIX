import React, { useState } from 'react';
import {
  BookOpen,
  Play,
  CheckCircle,
  Clock,
  Users,
  Settings,
  BarChart3,
  Shield,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Download,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { AnimatedContainer, StaggeredAnimation } from '../ui/Animations';

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  duration: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  icon: React.ComponentType<{ className?: string }>;
  lessons: TrainingLesson[];
  completed?: boolean;
}

interface TrainingLesson {
  id: string;
  title: string;
  type: 'video' | 'interactive' | 'reading' | 'quiz';
  duration: string;
  completed?: boolean;
  url?: string;
}

const trainingModules: TrainingModule[] = [
  {
    id: 'dashboard-basics',
    title: 'Dashboard Basics',
    description: 'Learn the fundamentals of the role-based dashboard system',
    duration: '45 min',
    difficulty: 'beginner',
    icon: BarChart3,
    lessons: [
      {
        id: 'dashboard-overview',
        title: 'Dashboard Overview',
        type: 'video',
        duration: '10 min',
        url: '/training/dashboard-overview',
      },
      {
        id: 'navigation-basics',
        title: 'Navigation Basics',
        type: 'interactive',
        duration: '15 min',
        url: '/training/navigation-basics',
      },
      {
        id: 'understanding-metrics',
        title: 'Understanding Key Metrics',
        type: 'reading',
        duration: '10 min',
        url: '/training/understanding-metrics',
      },
      {
        id: 'dashboard-quiz',
        title: 'Dashboard Knowledge Check',
        type: 'quiz',
        duration: '10 min',
        url: '/training/dashboard-quiz',
      },
    ],
  },
  {
    id: 'role-management',
    title: 'Role-Based Access Control',
    description: 'Master user roles and permissions management',
    duration: '60 min',
    difficulty: 'intermediate',
    icon: Shield,
    lessons: [
      {
        id: 'roles-overview',
        title: 'Understanding User Roles',
        type: 'video',
        duration: '15 min',
        url: '/training/roles-overview',
      },
      {
        id: 'permission-matrix',
        title: 'Working with Permission Matrix',
        type: 'interactive',
        duration: '20 min',
        url: '/training/permission-matrix',
      },
      {
        id: 'role-assignment',
        title: 'Assigning Roles to Users',
        type: 'video',
        duration: '15 min',
        url: '/training/role-assignment',
      },
      {
        id: 'security-best-practices',
        title: 'Security Best Practices',
        type: 'reading',
        duration: '10 min',
        url: '/training/security-best-practices',
      },
    ],
  },
  {
    id: 'dashboard-builder',
    title: 'Dashboard Builder',
    description: 'Create and customize dashboards for different user roles',
    duration: '90 min',
    difficulty: 'advanced',
    icon: Settings,
    lessons: [
      {
        id: 'builder-interface',
        title: 'Builder Interface Tour',
        type: 'video',
        duration: '20 min',
        url: '/training/builder-interface',
      },
      {
        id: 'widget-library',
        title: 'Using the Widget Library',
        type: 'interactive',
        duration: '25 min',
        url: '/training/widget-library',
      },
      {
        id: 'layout-design',
        title: 'Layout Design Principles',
        type: 'reading',
        duration: '15 min',
        url: '/training/layout-design',
      },
      {
        id: 'dashboard-assignment',
        title: 'Assigning Dashboards to Roles',
        type: 'video',
        duration: '20 min',
        url: '/training/dashboard-assignment',
      },
      {
        id: 'builder-quiz',
        title: 'Builder Mastery Test',
        type: 'quiz',
        duration: '10 min',
        url: '/training/builder-quiz',
      },
    ],
  },
  {
    id: 'user-management',
    title: 'User Management',
    description: 'Manage users, preferences, and system settings',
    duration: '75 min',
    difficulty: 'intermediate',
    icon: Users,
    lessons: [
      {
        id: 'user-onboarding',
        title: 'User Onboarding Process',
        type: 'video',
        duration: '20 min',
        url: '/training/user-onboarding',
      },
      {
        id: 'preference-management',
        title: 'Managing User Preferences',
        type: 'interactive',
        duration: '25 min',
        url: '/training/preference-management',
      },
      {
        id: 'troubleshooting',
        title: 'Common Issues & Solutions',
        type: 'reading',
        duration: '20 min',
        url: '/training/troubleshooting',
      },
      {
        id: 'user-support',
        title: 'Providing User Support',
        type: 'video',
        duration: '10 min',
        url: '/training/user-support',
      },
    ],
  },
];

const difficultyColors = {
  beginner: 'bg-green-100 text-green-800 border-green-200',
  intermediate: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  advanced: 'bg-red-100 text-red-800 border-red-200',
};

const lessonTypeIcons = {
  video: Play,
  interactive: Settings,
  reading: BookOpen,
  quiz: CheckCircle,
};

interface AdminTrainingGuideProps {
  className?: string;
}

export const AdminTrainingGuide: React.FC<AdminTrainingGuideProps> = ({ className = '' }) => {
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());

  const toggleModule = (moduleId: string) => {
    setExpandedModule(expandedModule === moduleId ? null : moduleId);
  };

  const markLessonComplete = (lessonId: string) => {
    setCompletedLessons(prev => new Set([...prev, lessonId]));
  };

  const getModuleProgress = (module: TrainingModule) => {
    const completedCount = module.lessons.filter(lesson => completedLessons.has(lesson.id)).length;
    return Math.round((completedCount / module.lessons.length) * 100);
  };

  const totalProgress = Math.round(
    (completedLessons.size /
      trainingModules.reduce((acc, module) => acc + module.lessons.length, 0)) *
      100
  );

  return (
    <div className={cn('max-w-4xl mx-auto p-6', className)}>
      <AnimatedContainer animation="fadeIn">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Admin Training Guide</h1>
          <p className="text-lg text-gray-600 mb-6">
            Master the Phoenix ERP dashboard system with our comprehensive training modules.
          </p>

          {/* Progress Overview */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Your Progress</h2>
              <span className="text-2xl font-bold text-blue-600">{totalProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${totalProgress}%` }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-600">
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                {completedLessons.size} lessons completed
              </div>
              <div className="flex items-center">
                <Clock className="h-4 w-4 text-blue-500 mr-2" />
                {trainingModules.reduce((acc, module) => acc + module.lessons.length, 0) -
                  completedLessons.size}{' '}
                remaining
              </div>
              <div className="flex items-center">
                <BookOpen className="h-4 w-4 text-purple-500 mr-2" />
                {trainingModules.length} modules total
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-3 mb-8">
            <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Download className="h-4 w-4" />
              <span>Download PDF Guide</span>
            </button>
            <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              <ExternalLink className="h-4 w-4" />
              <span>Video Library</span>
            </button>
            <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              <Users className="h-4 w-4" />
              <span>Join Community</span>
            </button>
          </div>
        </div>

        {/* Training Modules */}
        <StaggeredAnimation staggerDelay={0.1}>
          {trainingModules.map(module => {
            const Icon = module.icon;
            const isExpanded = expandedModule === module.id;
            const progress = getModuleProgress(module);

            return (
              <div
                key={module.id}
                className="bg-white rounded-lg border border-gray-200 mb-4 overflow-hidden"
              >
                {/* Module Header */}
                <button
                  onClick={() => toggleModule(module.id)}
                  className="w-full p-6 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-blue-100 rounded-lg">
                        <Icon className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">{module.title}</h3>
                        <p className="text-gray-600 mb-2">{module.description}</p>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            {module.duration}
                          </span>
                          <span
                            className={cn(
                              'px-2 py-1 rounded-full text-xs font-medium border',
                              difficultyColors[module.difficulty]
                            )}
                          >
                            {module.difficulty}
                          </span>
                          <span>{progress}% complete</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 relative">
                        <svg className="w-12 h-12 transform -rotate-90">
                          <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="transparent"
                            className="text-gray-200"
                          />
                          <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="transparent"
                            strokeDasharray={`${2 * Math.PI * 20}`}
                            strokeDashoffset={`${2 * Math.PI * 20 * (1 - progress / 100)}`}
                            className="text-blue-600 transition-all duration-500"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs font-medium text-gray-900">{progress}%</span>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Module Content */}
                {isExpanded && (
                  <AnimatedContainer
                    animation="slideInFromTop"
                    className="border-t border-gray-200"
                  >
                    <div className="p-6 space-y-3">
                      {module.lessons.map(lesson => {
                        const LessonIcon = lessonTypeIcons[lesson.type];
                        const isCompleted = completedLessons.has(lesson.id);

                        return (
                          <div
                            key={lesson.id}
                            className={cn(
                              'flex items-center justify-between p-4 rounded-lg border transition-all',
                              isCompleted
                                ? 'bg-green-50 border-green-200'
                                : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                            )}
                          >
                            <div className="flex items-center space-x-3">
                              <div
                                className={cn(
                                  'p-2 rounded-lg',
                                  isCompleted ? 'bg-green-100' : 'bg-white'
                                )}
                              >
                                <LessonIcon
                                  className={cn(
                                    'h-4 w-4',
                                    isCompleted ? 'text-green-600' : 'text-gray-600'
                                  )}
                                />
                              </div>
                              <div>
                                <h4
                                  className={cn(
                                    'font-medium',
                                    isCompleted ? 'text-green-900' : 'text-gray-900'
                                  )}
                                >
                                  {lesson.title}
                                </h4>
                                <div className="flex items-center space-x-2 text-sm text-gray-500">
                                  <span className="capitalize">{lesson.type}</span>
                                  <span>•</span>
                                  <span>{lesson.duration}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              {isCompleted && <CheckCircle className="h-5 w-5 text-green-500" />}
                              <button
                                onClick={() => {
                                  if (lesson.url) {
                                    window.open(lesson.url, '_blank');
                                  }
                                  if (!isCompleted) {
                                    markLessonComplete(lesson.id);
                                  }
                                }}
                                className={cn(
                                  'px-3 py-1 rounded-md text-sm font-medium transition-colors',
                                  isCompleted
                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                )}
                              >
                                {isCompleted ? 'Review' : 'Start'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </AnimatedContainer>
                )}
              </div>
            );
          })}
        </StaggeredAnimation>

        {/* Additional Resources */}
        <AnimatedContainer animation="fadeIn" delay={0.5}>
          <div className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Additional Resources</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900">Documentation</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>
                    <a href="#" className="flex items-center hover:text-blue-600 transition-colors">
                      <ExternalLink className="h-3 w-3 mr-2" />
                      API Reference Guide
                    </a>
                  </li>
                  <li>
                    <a href="#" className="flex items-center hover:text-blue-600 transition-colors">
                      <ExternalLink className="h-3 w-3 mr-2" />
                      System Architecture
                    </a>
                  </li>
                  <li>
                    <a href="#" className="flex items-center hover:text-blue-600 transition-colors">
                      <ExternalLink className="h-3 w-3 mr-2" />
                      Troubleshooting Guide
                    </a>
                  </li>
                </ul>
              </div>
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900">Support</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li>
                    <a href="#" className="flex items-center hover:text-blue-600 transition-colors">
                      <ExternalLink className="h-3 w-3 mr-2" />
                      Community Forum
                    </a>
                  </li>
                  <li>
                    <a href="#" className="flex items-center hover:text-blue-600 transition-colors">
                      <ExternalLink className="h-3 w-3 mr-2" />
                      Contact Support
                    </a>
                  </li>
                  <li>
                    <a href="#" className="flex items-center hover:text-blue-600 transition-colors">
                      <ExternalLink className="h-3 w-3 mr-2" />
                      Feature Requests
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </AnimatedContainer>
      </AnimatedContainer>
    </div>
  );
};

export default AdminTrainingGuide;
