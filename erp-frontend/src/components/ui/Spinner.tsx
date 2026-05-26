import styled from '@emotion/styled';

interface SpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
}

const SpinnerStyled = styled.div<SpinnerProps>`
  display: inline-block;
  position: relative;
  width: ${props => {
    switch (props.size) {
      case 'small':
        return '16px';
      case 'large':
        return '32px';
      default:
        return '24px';
    }
  }};
  height: ${props => {
    switch (props.size) {
      case 'small':
        return '16px';
      case 'large':
        return '32px';
      default:
        return '24px';
    }
  }};

  &::after {
    content: '';
    display: block;
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 2px solid ${props => props.color || 'currentColor'};
    border-right-color: transparent;
    animation: spin 0.75s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

export const Spinner = ({ size = 'medium', color }: SpinnerProps) => {
  return <SpinnerStyled size={size} color={color} />;
};
