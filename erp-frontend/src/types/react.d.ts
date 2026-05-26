/// <reference types="react" />

declare module 'react' {
  export type ReactElement = React.ReactElement;
  export type ReactNode = React.ReactNode;
  export type FC<P = {}> = React.FC<P>;
  export type ChangeEvent<T> = React.ChangeEvent<T>;
  export type FormEvent<T> = React.FormEvent<T>;
  export const useState: typeof React.useState;
  export const useEffect: typeof React.useEffect;
  export const useCallback: typeof React.useCallback;
  export const useMemo: typeof React.useMemo;
  export const createContext: typeof React.createContext;
  export const useContext: typeof React.useContext;
  export const Fragment: typeof React.Fragment;
  export const StrictMode: typeof React.StrictMode;
  export const forwardRef: typeof React.forwardRef;
}
