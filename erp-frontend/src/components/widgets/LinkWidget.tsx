import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { LinkWidgetConfig } from '../../types/dashboard.types';

interface LinkWidgetProps {
  config: LinkWidgetConfig;
}

const StyledLink = styled(Link)<{ $customStyle?: LinkWidgetConfig['style'] }>`
  display: block;
  text-decoration: none;
  color: ${props => props.$customStyle?.color || 'inherit'};
  background-color: ${props => props.$customStyle?.backgroundColor || 'transparent'};
  border-radius: ${props => props.$customStyle?.borderRadius || '4px'};
  padding: 1rem;
  transition: all 0.2s;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &.button {
    background-color: var(--primary-color);
    color: white;
    text-align: center;
    font-weight: 500;
  }

  &.card {
    background-color: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--border-color);
  }
`;

const Icon = styled.i`
  margin-right: 0.5rem;
`;

const LinkWidget: React.FC<LinkWidgetProps> = ({ config }) => {
  const { title, url, icon, variant = 'link', style, target } = config;

  return (
    <StyledLink to={url} className={variant} $customStyle={style} target={target}>
      {icon && <Icon className={icon} />}
      {title}
    </StyledLink>
  );
};

export default LinkWidget;
