import { createContext, useContext } from 'react'
import type { SiteConfig, User } from './graphql/operations'

/** The logged-in user, or null (public visitors, when public viewing is on). */
export const MeContext = createContext<User | null>(null)

export function useMe(): User | null {
  return useContext(MeContext)
}

/** The logged-in user. Only inside routes that require a login. */
export function useUser(): User {
  const me = useContext(MeContext)
  if (!me) throw new Error('useUser() used outside a logged-in route')
  return me
}

export const SiteConfigContext = createContext<SiteConfig | null>(null)

export function useSiteConfig(): SiteConfig | null {
  return useContext(SiteConfigContext)
}

/** Approved and allowed to add drinks. */
export function canAdd(me: User | null): boolean {
  return !!me && me.isApproved && me.canAddDrinks
}
