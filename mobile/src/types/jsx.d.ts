/**
 * React 19's types moved the ambient `JSX` namespace to `React.JSX` and no
 * longer declare a global one. This codebase's screens/components widely
 * use the bare `: JSX.Element` return-type convention (predating the
 * React 19 bump) — this shim re-exposes that global namespace as an alias
 * for `React.JSX`, so existing and future files don't all need to switch
 * to fully-qualified `React.JSX.Element` one by one.
 */
import type React from 'react';

declare global {
  namespace JSX {
    type Element = React.JSX.Element;
    type ElementType = React.JSX.ElementType;
    type ElementClass = React.JSX.ElementClass;
    interface ElementAttributesProperty extends React.JSX.ElementAttributesProperty {}
    interface ElementChildrenAttribute extends React.JSX.ElementChildrenAttribute {}
    type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>;
    interface IntrinsicAttributes extends React.JSX.IntrinsicAttributes {}
    interface IntrinsicClassAttributes<T> extends React.JSX.IntrinsicClassAttributes<T> {}
    interface IntrinsicElements extends React.JSX.IntrinsicElements {}
  }
}

export {};
