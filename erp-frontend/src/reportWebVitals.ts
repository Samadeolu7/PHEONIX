import { onCLS, onINP, onFCP, onLCP, onTTFB } from 'web-vitals';

type WebVitalsParams = {
  value: number;
  id: string;
  name: string;
  delta: number;
};

const reportWebVitals = (onPerfEntry?: (params: WebVitalsParams) => void) => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    onCLS(onPerfEntry);
    onINP(onPerfEntry);
    onFCP(onPerfEntry);
    onLCP(onPerfEntry);
    onTTFB(onPerfEntry);
  }
};

export default reportWebVitals;
