import React from 'react';
import styled from 'styled-components';
import { CompositeWidgetConfig } from '../../types/dashboard.types';
import WidgetRenderer from './WidgetRenderer';

interface CompositeWidgetProps {
  config: CompositeWidgetConfig;
}

const Container = styled.div<{ layout: CompositeWidgetConfig['layout'] }>`
  display: ${props => (props.layout === 'flex' ? 'flex' : 'grid')};
  gap: ${props => (props.layout === 'tabs' ? 0 : '1rem')};
  ${props =>
    props.layout === 'grid' &&
    `
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  `}
  width: 100%;
  height: 100%;
`;

const TabContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const TabList = styled.div`
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid var(--border-color);
  padding: 0.5rem;
`;

const Tab = styled.button<{ active: boolean }>`
  padding: 0.5rem 1rem;
  border: none;
  background: ${props => (props.active ? 'var(--primary-color)' : 'transparent')};
  color: ${props => (props.active ? 'white' : 'inherit')};
  cursor: pointer;
  border-radius: 4px 4px 0 0;

  &:hover {
    background: ${props => (props.active ? 'var(--primary-color)' : 'rgba(0,0,0,0.05)')};
  }
`;

const TabPanel = styled.div`
  flex: 1;
  padding: 1rem;
  overflow: auto;
`;

const CompositeWidget: React.FC<CompositeWidgetProps> = ({ config }) => {
  const [activeTab, setActiveTab] = React.useState(0);
  const { widgets, layout = 'grid', spacing = 1 } = config;

  if (layout === 'tabs') {
    return (
      <TabContainer>
        <TabList>
          {widgets.map((widget, index) => (
            <Tab key={index} active={activeTab === index} onClick={() => setActiveTab(index)}>
              {widget.config.title}
            </Tab>
          ))}
        </TabList>
        <TabPanel>
          <WidgetRenderer widget={widgets[activeTab]} />
        </TabPanel>
      </TabContainer>
    );
  }

  return (
    <Container layout={layout} style={{ gap: `${spacing}rem` }}>
      {widgets.map((widget, index) => (
        <div
          key={index}
          style={
            widget.layout
              ? {
                  gridColumn: `span ${widget.layout.w}`,
                  gridRow: `span ${widget.layout.h}`,
                }
              : undefined
          }
        >
          <WidgetRenderer widget={widget} />
        </div>
      ))}
    </Container>
  );
};

export default CompositeWidget;
