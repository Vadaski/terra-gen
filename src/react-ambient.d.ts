declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [elementName: string]: any;
  }
}

declare module "react" {
  export type ReactNode = any;

  export interface CSSProperties {
    [property: string]: string | number | undefined;
  }

  export interface MutableRefObject<T> {
    current: T;
  }

  export type RefCallback<T> = (instance: T | null) => void;
  export type Ref<T> = RefCallback<T> | MutableRefObject<T | null> | null;

  export type DependencyList = ReadonlyArray<unknown>;
  export type SetStateAction<S> = S | ((prevState: S) => S);
  export type Dispatch<A> = (value: A) => void;

  export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useRef<T>(initialValue: T): MutableRefObject<T>;
  export function useRef<T>(initialValue: T | null): MutableRefObject<T | null>;
  export function useMemo<T>(factory: () => T, deps: DependencyList): T;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: DependencyList): T;
  export function useEffect(effect: () => void | (() => void), deps?: DependencyList): void;
  export function useImperativeHandle<T, R extends T>(
    ref: Ref<T> | undefined,
    init: () => R,
    deps?: DependencyList
  ): void;

  export interface RefAttributes<T> {
    ref?: Ref<T>;
  }

  export interface ForwardRefExoticComponent<P> {
    (props: P & { children?: ReactNode }): JSX.Element | null;
  }

  export function forwardRef<T, P = {}>(
    render: (props: P, ref: Ref<T>) => JSX.Element | null
  ): ForwardRefExoticComponent<P & RefAttributes<T>>;

  interface StrictModeProps {
    children?: ReactNode;
  }

  const React: {
    StrictMode: (props: StrictModeProps) => JSX.Element | null;
  };

  export default React;
}

declare module "react/jsx-runtime" {
  export function jsx(type: any, props: any, key?: any): JSX.Element;
  export function jsxs(type: any, props: any, key?: any): JSX.Element;
  export const Fragment: any;
}

declare module "react-dom" {
  export function render(node: any, container: Element | DocumentFragment | null): void;

  const ReactDOM: {
    render: typeof render;
  };

  export default ReactDOM;
}
