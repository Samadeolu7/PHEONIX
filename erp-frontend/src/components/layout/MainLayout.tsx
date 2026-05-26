import React from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { BRAND } from '../../constants/brand';

const LayoutContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
`;

const NavBar = styled.nav`
  background-color: var(--primary-color, #0a1857);
  color: white;
  padding: 0.75rem 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  border-bottom: 3px solid ${BRAND.colors.gold};
`;

const NavContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Logo = styled(Link)`
  color: white;
  text-decoration: none;
  font-size: 1.5rem;
  font-weight: bold;
`;

const NavLinks = styled.div`
  display: flex;
  gap: 2rem;
`;

const NavLink = styled(Link)<{ active?: boolean }>`
  color: white;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: background-color 0.2s;
  background-color: ${props => (props.active ? 'rgba(255,255,255,0.1)' : 'transparent')};

  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
`;

const MainContent = styled.main`
  flex: 1;
  padding: 2rem;
  background-color: var(--content-bg-color, #f8fafc);
`;

const MainLayout: React.FC = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <LayoutContainer>
      <NavBar>
        <NavContent>
          <Logo to="/">
            <img
              src={BRAND.logoUrl}
              alt={BRAND.shortName}
              style={{
                height: '32px',
                width: '32px',
                borderRadius: '50%',
                border: `2px solid ${BRAND.colors.gold}`,
                objectFit: 'contain',
                marginRight: '0.5rem',
                verticalAlign: 'middle',
              }}
            />
            <span style={{ verticalAlign: 'middle', letterSpacing: '0.04em' }}>
              {BRAND.shortName} ERP
            </span>
          </Logo>
          <NavLinks>
            <NavLink to="/" active={isActive('/')}>
              Home
            </NavLink>
            <NavLink to="/dashboard" active={isActive('/dashboard')}>
              Dashboard
            </NavLink>
            <NavLink to="/forms" active={isActive('/forms')}>
              Forms
            </NavLink>
            <NavLink to="/dashboard/setup" active={isActive('/dashboard/setup')}>
              Setup
            </NavLink>
          </NavLinks>
        </NavContent>
      </NavBar>
      <MainContent>
        <Outlet />
      </MainContent>
    </LayoutContainer>
  );
};

export default MainLayout;
