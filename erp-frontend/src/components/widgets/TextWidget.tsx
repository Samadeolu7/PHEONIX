import React from 'react';

type TextWidgetProps = {
  config: {
    title?: string;
    content: string;
    format?: 'plain' | 'markdown';
    textAlign?: 'left' | 'center' | 'right';
  };
};

const TextWidget: React.FC<TextWidgetProps> = ({ config }) => {
  return (
    <div className="text-widget">
      {config.title && <h3 className="text-widget-title">{config.title}</h3>}
      <div className="text-widget-content" style={{ textAlign: config.textAlign || 'left' }}>
        {config.content}
      </div>
    </div>
  );
};

export { TextWidget };
