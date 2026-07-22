// src/components/dashboard/SystemLinkSelector.tsx
import React, { useState, useEffect } from 'react';
import { Search, Link2, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { api } from '../../services/api';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';

const SelectorContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 500px;
  max-height: 70vh;
`;

const SearchBox = styled.div`
  padding: 1rem;
  border-bottom: 1px solid #e2e8f0;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 0.5rem 0.75rem 0.5rem 2.5rem;
  border: 1px solid #cbd5e0;
  border-radius: 0.375rem;
  font-size: 0.875rem;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const SearchIcon = styled(Search)`
  position: absolute;
  left: 1.75rem;
  top: 1.625rem;
  width: 1rem;
  height: 1rem;
  color: #9ca3af;
`;

const ContentArea = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
`;

const CategorySection = styled.div`
  margin-bottom: 1rem;
`;

const CategoryHeader = styled.div<{ $color?: string }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background-color: ${props => props.$color || '#f3f4f6'};
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    opacity: 0.9;
  }
`;

const CategoryIcon = styled.div<{ $color?: string }>`
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${props => props.$color || '#3b82f6'};
  color: white;
  border-radius: 0.375rem;
  font-size: 0.875rem;
`;

const CategoryTitle = styled.div`
  flex: 1;
  font-weight: 600;
  color: #1f2937;
`;

const CategoryBadge = styled.span`
  padding: 0.125rem 0.5rem;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 9999px;
  font-size: 0.75rem;
  color: #1f2937;
`;

const LinksList = styled.div`
  margin-top: 0.5rem;
  padding-left: 2.5rem;
`;

const LinkItem = styled.div<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.375rem;
  cursor: pointer;
  border: 2px solid ${props => (props.$selected ? '#3b82f6' : 'transparent')};
  background-color: ${props => (props.$selected ? '#eff6ff' : 'white')};
  transition: all 0.2s;

  &:hover {
    background-color: ${props => (props.$selected ? '#dbeafe' : '#f9fafb')};
  }
`;

const LinkIconWrapper = styled.div`
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
`;

const LinkContent = styled.div`
  flex: 1;
`;

const LinkTitle = styled.div`
  font-weight: 500;
  color: #1f2937;
  font-size: 0.875rem;
`;

const LinkDescription = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.125rem;
`;

const LinkPath = styled.div`
  font-size: 0.75rem;
  color: #9ca3af;
  font-family: monospace;
  margin-top: 0.125rem;
`;

const CheckIcon = styled(Check)`
  width: 1.25rem;
  height: 1.25rem;
  color: #3b82f6;
`;

const EmptyState = styled.div`
  padding: 3rem;
  text-align: center;
  color: #9ca3af;
`;

interface SystemLinkSelectorProps {
  onSelect: (link: any) => void;
  selectedLinks?: string[];
  multiSelect?: boolean;
}

const SystemLinkSelector: React.FC<SystemLinkSelectorProps> = ({
  onSelect,
  selectedLinks = [],
  multiSelect: _multiSelect = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const { data: groupedLinks = {}, isLoading: loading } = useQuery({
    queryKey: ['systemLinks'],
    queryFn: async () => {
      const response = await api.get('/pages/system-links/?grouped=true');
      return response.data?.data || response.data;
    },
  });

  // Expand first category by default
  useEffect(() => {
    if (!loading && Object.keys(groupedLinks).length > 0 && expandedCategories.size === 0) {
      const firstCategory = Object.keys(groupedLinks)[0];
      if (firstCategory) {
        setExpandedCategories(new Set([firstCategory]));
      }
    }
  }, [loading, groupedLinks, expandedCategories.size]);

  const { data: searchResults = [], isLoading: searching } = useQuery({
    queryKey: ['systemLinks', 'search', searchQuery],
    queryFn: async () => {
      const response = await api.get(
        `/pages/system-links/search/?q=${encodeURIComponent(searchQuery)}`
      );
      const data = response.data?.data || response.data;
      return data.results || [];
    },
    enabled: searchQuery.length >= 2,
  });

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const handleLinkClick = (link: any) => {
    onSelect(link);
  };

  const isSelected = (linkCode: string) => {
    return selectedLinks.includes(linkCode);
  };

  const renderLink = (link: any) => (
    <LinkItem
      key={link.code}
      $selected={isSelected(link.code)}
      onClick={() => handleLinkClick(link)}
    >
      <LinkIconWrapper>
        <Link2 size={16} />
      </LinkIconWrapper>
      <LinkContent>
        <LinkTitle>{link.title}</LinkTitle>
        <LinkDescription>{link.description}</LinkDescription>
        <LinkPath>{link.url_path}</LinkPath>
      </LinkContent>
      {isSelected(link.code) && <CheckIcon />}
    </LinkItem>
  );

  if (loading) {
    return (
      <SelectorContainer>
        <EmptyState>Loading links...</EmptyState>
      </SelectorContainer>
    );
  }

  return (
    <SelectorContainer>
      <SearchBox>
        <div style={{ position: 'relative' }}>
          <SearchIcon />
          <SearchInput
            type="text"
            placeholder="Search links..."
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e.target.value)}
          />
        </div>
      </SearchBox>

      <ContentArea>
        {searching ? (
          <EmptyState>Searching...</EmptyState>
        ) : searchQuery.length >= 2 ? (
          <>
            {searchResults.length === 0 ? (
              <EmptyState>No links found for "{searchQuery}"</EmptyState>
            ) : (
              <div>
                <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  Found {searchResults.length} link{searchResults.length !== 1 ? 's' : ''}
                </div>
                {searchResults.map(renderLink)}
              </div>
            )}
          </>
        ) : (
          <>
            {Object.entries(groupedLinks).map(([category, data]: [string, any]) => {
              const isExpanded = expandedCategories.has(category);
              const metadata = data.metadata || {};
              const links = data.links || [];

              return (
                <CategorySection key={category}>
                  <CategoryHeader
                    $color={metadata.color ? `${metadata.color}15` : undefined}
                    onClick={() => toggleCategory(category)}
                  >
                    <CategoryIcon $color={metadata.color}>
                      {metadata.icon ? metadata.icon.substring(0, 2).toUpperCase() : '📁'}
                    </CategoryIcon>
                    <CategoryTitle>{metadata.label || category}</CategoryTitle>
                    <CategoryBadge>{links.length}</CategoryBadge>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </CategoryHeader>

                  {isExpanded && <LinksList>{links.map(renderLink)}</LinksList>}
                </CategorySection>
              );
            })}
          </>
        )}
      </ContentArea>
    </SelectorContainer>
  );
};

export default SystemLinkSelector;
