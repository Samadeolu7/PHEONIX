/// <reference types="react" />

declare module 'react' {
  interface StyleHTMLAttributes<T> extends React.HTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}

declare module 'styled-jsx/css' {
  export default function css(chunks: TemplateStringsArray, ...args: any[]): string;
  export function resolve(
    chunks: TemplateStringsArray,
    ...args: any[]
  ): {
    className: string;
    styles: string;
  };
}
