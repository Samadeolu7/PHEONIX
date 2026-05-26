declare module 'styled-jsx' {
  export interface StyleRegistry {
    styles(options: { nonce?: string }): JSX.Element[];
    flush(): void;
  }

  export function useStyleRegistry(): StyleRegistry;

  export default function style(template: TemplateStringsArray, ...args: any[]): JSX.Element;
}

declare module 'styled-jsx/css' {
  export default function css(template: TemplateStringsArray, ...args: any[]): string;
}
