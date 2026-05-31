import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null)   // null = not logged in
  const [publicView, setPublicView] = useState(false)
  const [loading, setLoading]     = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await fetch('/api/auth/me')
      if (me.ok) {
        setUser(await me.json())
        setLoading(false)
        return
      }
    } catch (_) {}

    // Not logged in — check if public view allows browsing
    try {
      const cfg = await fetch('/api/auth/config')
      if (cfg.ok) {
        const { publicView: pv } = await cfg.json()
        setPublicView(pv)
      }
    } catch (_) {}

    setUser(null)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const login = async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) throw new Error((await res.json()).error || 'Login failed')
    setUser(await res.json())
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    // Re-check public view after logout
    const cfg = await fetch('/api/auth/config')
    if (cfg.ok) setPublicView((await cfg.json()).publicView)
  }

  return (
    <AuthContext.Provider value={{ user, publicView, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
