import React, { useState, useRef, useEffect } from 'react';
import {
  HelpCircle,
  X,
  Search,
  Book,
  Video,
  MessageCircle,
  ExternalLink,
  ChevronRight,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  Info,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { AnimatedContainer } from '../ui/Animations';

interface HelpArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  type: 'article' | 'video' | 'faq';
  url?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  trigger?: 'hover' | 'click';
  className?: string;
  maxWidth?: string;
}

interface ContextualHelpProps {
  topic: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

interface HelpSystemProps {
  isOpen: boolean;
  onClose: () => void;
  initialTopic?: string;
  className?: string;
}

const helpArticles: HelpArticle[] = [
  {
    id: 'dashboard-overview',
    title: 'Dashboard Overview',
    content: 'Learn about the main dashboard components and how to navigate them effectively.',
    category: 'Getting Started',
    tags: ['dashboard', 'navigation', 'overview'],
    type: 'article',
    difficulty: 'beginner',
  },
  {
    id: 'role-permissions',
    title: 'Understanding Role Permissions',
    content: 'Comprehensive guide to role-based access control and permission management.',
    category: 'User Management',
    tags: ['roles', 'permissions', 'security'],
    type: 'article',
    difficulty: 'intermediate',
  },
  {
    id: 'dashboard-builder',
    title: 'Using Dashboard Builder',
    content: 'Step-by-step guide to creating and customizing dashboards.',
    category: 'Customization',
    tags: ['builder', 'customization', 'widgets'],
    type: 'video',
    url: '/help/videos/dashboard-builder',
    difficulty: 'advanced',
  },
  {
    id: 'stats-cards',
    title: 'Working with Stats Cards',
    content: 'How to configure and interpret statistics cards on your dashboard.',
    category: 'Dashboard',
    tags: ['stats', 'metrics', 'cards'],
    type: 'article',
    difficulty: 'beginner',
  },
  {
    id: 'troubleshooting',
    title: 'Common Issues & Solutions',
    content: 'Frequently asked questions and troubleshooting guide.',
    category: 'Support',
    tags: ['troubleshooting', 'faq', 'issues'],
    type: 'faq',
    difficulty: 'beginner',
  },
];

const categories = Array.from(new Set(helpArticles.map(article => article.category)));

// Tooltip Component
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  trigger = 'hover',
  className = '',
  maxWidth = '200px',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [actualPosition, setActualPosition] = useState(position);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && tooltipRef.current && triggerRef.current) {
      const tooltip = tooltipRef.current;
      const trigger = triggerRef.current;
      const rect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      // Check if tooltip would go off screen and adjust position
      let newPosition = position;

      if (position === 'top' && rect.top - tooltipRect.height < 10) {
        newPosition = 'bottom';
      } else if (
        position === 'bottom' &&
        rect.bottom + tooltipRect.height > window.innerHeight - 10
      ) {
        newPosition = 'top';
      } else if (position === 'left' && rect.left - tooltipRect.width < 10) {
        newPosition = 'right';
      } else if (position === 'right' && rect.right + tooltipRect.width > window.innerWidth - 10) {
        newPosition = 'left';
      }

      setActualPosition(newPosition);
    }
  }, [isVisible, position]);

  const handleMouseEnter = () => {
    if (trigger === 'hover') {
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    if (trigger === 'hover') {
      setIsVisible(false);
    }
  };

  const handleClick = () => {
    if (trigger === 'click') {
      setIsVisible(!isVisible);
    }
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-gray-900',
    bottom:
      'bottom-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-gray-900',
    left: 'left-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-gray-900',
    right:
      'right-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-gray-900',
  };

  return (
    <div
      ref={triggerRef}
      className={cn('relative inline-block', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {children}
      {isVisible && (
        <AnimatedContainer animation="scaleIn">
          <div
            ref={tooltipRef}
            className={cn(
              'absolute z-50 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg',
              positionClasses[actualPosition]
            )}
            style={{ maxWidth }}
          >
            {content}
            <div className={cn('absolute w-0 h-0 border-4', arrowClasses[actualPosition])} />
          </div>
        </AnimatedContainer>
      )}
    </div>
  );
};

// Contextual Help Component
export const ContextualHelp: React.FC<ContextualHelpProps> = ({
  topic,
  position = 'right',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const helpContent = helpArticles.find(
    article =>
      article.tags.includes(topic.toLowerCase()) ||
      article.title.toLowerCase().includes(topic.toLowerCase())
  );

  if (!helpContent) {
    return null;
  }

  return (
    <Tooltip
      content={
        <div className="space-y-2">
          <h4 className="font-medium text-white">{helpContent.title}</h4>
          <p className="text-gray-200 text-xs">{helpContent.content}</p>
          <button
            onClick={() => setIsOpen(true)}
            className="text-blue-300 hover:text-blue-200 text-xs flex items-center"
          >
            Learn more <ExternalLink className="h-3 w-3 ml-1" />
          </button>
        </div>
      }
      position={position}
      maxWidth="250px"
      className={className}
    >
      <button className="text-gray-400 hover:text-gray-600 transition-colors">
        <HelpCircle className="h-4 w-4" />
      </button>
    </Tooltip>
  );
};

// Main Help System Component
export const HelpSystem: React.FC<HelpSystemProps> = ({
  isOpen,
  onClose,
  initialTopic,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);

  useEffect(() => {
    if (initialTopic && isOpen) {
      const article = helpArticles.find(
        a =>
          a.tags.includes(initialTopic.toLowerCase()) ||
          a.title.toLowerCase().includes(initialTopic.toLowerCase())
      );
      if (article) {
        setSelectedArticle(article);
      }
    }
  }, [initialTopic, isOpen]);

  const filteredArticles = helpArticles.filter(article => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleArticleClick = (article: HelpArticle) => {
    if (article.url) {
      window.open(article.url, '_blank');
    } else {
      setSelectedArticle(article);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return Video;
      case 'faq':
        return MessageCircle;
      default:
        return Book;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'text-green-600 bg-green-100';
      case 'intermediate':
        return 'text-yellow-600 bg-yellow-100';
      case 'advanced':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  if (!isOpen) return null;

  return (
    <div className={cn('fixed inset-0 z-50 bg-black bg-opacity-50', className)}>
      <AnimatedContainer animation="slideInFromRight">
        <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl overflow-hidden">
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="bg-blue-600 text-white p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center">
                  <HelpCircle className="h-6 w-6 mr-2" />
                  Help Center
                </h2>
                <button
                  onClick={onClose}
                  className="text-white hover:text-gray-200 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search help articles..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white bg-opacity-20 border border-white border-opacity-30 rounded-lg text-white placeholder-gray-200 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50"
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {selectedArticle ? (
                // Article View
                <div className="h-full overflow-y-auto p-6">
                  <button
                    onClick={() => setSelectedArticle(null)}
                    className="flex items-center text-blue-600 hover:text-blue-700 mb-4 text-sm"
                  >
                    ← Back to articles
                  </button>

                  <div className="space-y-4">
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900 mb-2">
                        {selectedArticle.title}
                      </h1>
                      <div className="flex items-center space-x-3 text-sm text-gray-500">
                        <span className="flex items-center">
                          {React.createElement(getTypeIcon(selectedArticle.type), {
                            className: 'h-4 w-4 mr-1',
                          })}
                          {selectedArticle.type}
                        </span>
                        <span
                          className={cn(
                            'px-2 py-1 rounded-full text-xs font-medium',
                            getDifficultyColor(selectedArticle.difficulty)
                          )}
                        >
                          {selectedArticle.difficulty}
                        </span>
                        <span>{selectedArticle.category}</span>
                      </div>
                    </div>

                    <div className="prose max-w-none">
                      <p className="text-gray-700 leading-relaxed">{selectedArticle.content}</p>

                      {/* Placeholder for more detailed content */}
                      <div className="mt-6 space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Detailed Instructions
                        </h3>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-start space-x-3">
                            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-blue-900">Getting Started</h4>
                              <p className="text-blue-800 text-sm mt-1">
                                This feature helps you understand and navigate the dashboard system
                                effectively.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-start space-x-3">
                            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-green-900">Best Practices</h4>
                              <ul className="text-green-800 text-sm mt-1 space-y-1">
                                <li>• Follow the step-by-step instructions</li>
                                <li>• Take your time to understand each concept</li>
                                <li>• Practice with sample data first</li>
                              </ul>
                            </div>
                          </div>
                        </div>

                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <div className="flex items-start space-x-3">
                            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-yellow-900">Important Notes</h4>
                              <p className="text-yellow-800 text-sm mt-1">
                                Make sure you have the appropriate permissions before attempting
                                these actions.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="pt-4 border-t border-gray-200">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Related Topics</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedArticle.tags.map(tag => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // Article List View
                <div className="h-full flex">
                  {/* Sidebar */}
                  <div className="w-64 bg-gray-50 border-r border-gray-200 p-4">
                    <h3 className="font-medium text-gray-900 mb-3">Categories</h3>
                    <div className="space-y-1">
                      <button
                        onClick={() => setSelectedCategory('all')}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                          selectedCategory === 'all'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:bg-gray-100'
                        )}
                      >
                        All Articles
                      </button>
                      {categories.map(category => (
                        <button
                          key={category}
                          onClick={() => setSelectedCategory(category)}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                            selectedCategory === category
                              ? 'bg-blue-100 text-blue-700'
                              : 'text-gray-600 hover:bg-gray-100'
                          )}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Articles */}
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="space-y-4">
                      {filteredArticles.length === 0 ? (
                        <div className="text-center py-12">
                          <HelpCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                          <h3 className="text-lg font-medium text-gray-900 mb-2">
                            No articles found
                          </h3>
                          <p className="text-gray-500">
                            Try adjusting your search or browse different categories.
                          </p>
                        </div>
                      ) : (
                        filteredArticles.map(article => {
                          const TypeIcon = getTypeIcon(article.type);

                          return (
                            <button
                              key={article.id}
                              onClick={() => handleArticleClick(article)}
                              className="w-full text-left p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-2">
                                    <TypeIcon className="h-4 w-4 text-gray-500" />
                                    <h3 className="font-medium text-gray-900">{article.title}</h3>
                                    {article.url && (
                                      <ExternalLink className="h-3 w-3 text-gray-400" />
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-600 mb-2">{article.content}</p>
                                  <div className="flex items-center space-x-2">
                                    <span className="text-xs text-gray-500">
                                      {article.category}
                                    </span>
                                    <span
                                      className={cn(
                                        'px-2 py-1 rounded-full text-xs font-medium',
                                        getDifficultyColor(article.difficulty)
                                      )}
                                    >
                                      {article.difficulty}
                                    </span>
                                  </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-gray-400 ml-2" />
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 border-t border-gray-200 p-4">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Need more help?</span>
                <div className="flex space-x-3">
                  <button className="text-blue-600 hover:text-blue-700 transition-colors">
                    Contact Support
                  </button>
                  <button className="text-blue-600 hover:text-blue-700 transition-colors">
                    Community Forum
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimatedContainer>
    </div>
  );
};

// Hook for managing help system state
export const useHelpSystem = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentTopic, setCurrentTopic] = useState<string>('');

  const openHelp = (topic?: string) => {
    if (topic) {
      setCurrentTopic(topic);
    }
    setIsOpen(true);
  };

  const closeHelp = () => {
    setIsOpen(false);
    setCurrentTopic('');
  };

  return {
    isOpen,
    currentTopic,
    openHelp,
    closeHelp,
  };
};

export default HelpSystem;
