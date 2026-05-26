import styled from '@emotion/styled';
import { useLocation, Link } from 'react-router-dom';

const Nav = styled.nav`
  background-color: var(--color-primary);
  padding: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const NavList = styled.ul`
  list-style: none;
  display: flex;
  gap: 2rem;
  margin: 0;
  padding: 0;
`;

const NavItem = styled.li<{ active?: boolean }>`
  a {
    color: ${props => (props.active ? '#ffffff' : 'rgba(255, 255, 255, 0.8)')};
    text-decoration: none;
    font-weight: ${props => (props.active ? '600' : '400')};
    transition: color 0.2s ease;

    &:hover {
      color: #ffffff;
    }
  }
`;

const Navigation = () => {
  const location = useLocation();

  const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/transactions', label: 'Transactions' },
    { href: '/accounts', label: 'Accounts' },
    { href: '/reports', label: 'Reports' },
    { href: '/settings', label: 'Settings' },
  ];

  return (
    <Nav>
      <NavList>
        {links.map(({ href, label }) => (
          <NavItem
            key={href}
            active={location.pathname === href || location.pathname.startsWith(href + '/')}
          >
            <Link to={href}>{label}</Link>
          </NavItem>
        ))}
      </NavList>
    </Nav>
  );
};

export default Navigation;
