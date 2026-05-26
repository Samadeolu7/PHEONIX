import React from 'react';
import styled from 'styled-components';
import { NavigationWidgetConfig } from '../../types/dashboard.types';
import { Link } from 'react-router-dom';

interface NavigationWidgetProps {
  config: NavigationWidgetConfig;
}

const NavContainer = styled.nav<{ orientation: 'horizontal' | 'vertical' }>`
  display: flex;
  flex-direction: ${props => (props.orientation === 'vertical' ? 'column' : 'row')};
  gap: 1rem;
  padding: 1rem;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const NavItem = styled(Link)<{ variant: NavigationWidgetConfig['variant'] }>`
  text-decoration: none;
  color: var(--text-primary-color);
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: all 0.2s;

  ${props => {
    switch (props.variant) {
      case 'tabs':
        return `
          border-bottom: 2px solid transparent;
          &.active {
            border-bottom-color: var(--primary-color);
          }
        `;
      case 'pills':
        return `
          &.active {
            background-color: var(--primary-color);
            color: white;
          }
        `;
      case 'buttons':
        return `
          border: 1px solid var(--border-color);
          &:hover {
            background-color: var(--primary-color);
            color: white;
          }
        `;
      default:
        return '';
    }
  }}

  &:hover {
    opacity: 0.8;
  }
`;

const Icon = styled.i`
  margin-right: 0.5rem;
`;

const NavigationWidget: React.FC<NavigationWidgetProps> = ({ config }) => {
  const { items, orientation = 'horizontal', variant = 'tabs' } = config;

  return (
    <NavContainer orientation={orientation}>
      {items.map((item, index) => (
        <NavItem
          key={index}
          to={item.url}
          variant={variant}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          {item.icon && <Icon className={item.icon} />}
          {item.label}
        </NavItem>
      ))}
    </NavContainer>
  );
};

export default NavigationWidget;
