import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { APP_NAV, type NavItem } from '@/components/layout/shell';

/**
 * Which workspace the current route belongs to.
 *
 * The same page component is mounted under `/app` (staff) and `/admin`
 * (administrator) so nothing is implemented twice; the scope decides the
 * sidebar it renders and the prefix its links use.
 */
export interface NavScopeValue {
  nav: NavItem[];
  base: string;
  /** Builds a path inside the current workspace, e.g. link('/mothers'). */
  link: (suffix: string) => string;
  tone: 'staff' | 'mother';
}

const NavScopeContext = createContext<NavScopeValue>({
  nav: APP_NAV,
  base: '/app',
  link: (suffix: string) => `/app${suffix}`,
  tone: 'staff',
});

export function NavScope({ nav, base, tone = 'staff', children }: { nav: NavItem[]; base: string; tone?: 'staff' | 'mother'; children: ReactNode }) {
  const link = useCallback((suffix: string) => (suffix === '' ? base : `${base}${suffix.startsWith('/') ? suffix : `/${suffix}`}`), [base]);
  return <NavScopeContext.Provider value={{ nav, base, link, tone }}>{children}</NavScopeContext.Provider>;
}

export function useNavScope(): NavScopeValue {
  return useContext(NavScopeContext);
}
