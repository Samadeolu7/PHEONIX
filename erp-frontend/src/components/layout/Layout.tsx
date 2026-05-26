import styled from '@emotion/styled';
import Navigation from './Navigation';

const LayoutContainer = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const Main = styled.main`
  flex: 1;
  padding: 2rem;
  background-color: var(--color-background);
`;

interface LayoutProps {
  children: any; // TODO: Improve type definition
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <LayoutContainer>
      <Navigation />
      <Main>{children}</Main>
    </LayoutContainer>
  );
};

export default Layout;
