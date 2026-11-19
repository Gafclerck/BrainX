import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';

export interface TocItem {
  id: string;
  text: string;
  level: number; // 2 for h2, 3 for h3
}

export interface TocContextValue {
  toc: ReactNode | null;
  setToc: (toc: ReactNode | null) => void;
}

const TocContext = createContext<TocContextValue | undefined>(undefined);

export function TocProvider({ children }: { children: ReactNode }) {
  const [toc, setToc] = useState<ReactNode | null>(null);

  const value = useMemo(
    () => ({
      toc,
      setToc,
    }),
    [toc]
  );

  return <TocContext.Provider value={value}>{children}</TocContext.Provider>;
}

export function useToc(): TocContextValue {
  const context = useContext(TocContext);
  if (!context) {
    return {
      toc: null,
      setToc: () => {},
    };
  }
  return context;
}
