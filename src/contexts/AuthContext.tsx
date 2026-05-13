import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { authLogin, authLogout, authRegister, authGetCurrentUser, updateUserProfile, ensureSuperAdmin, ensureSeedLoaded, ensureBoardGuests } from '../lib/storage'
import { User } from '../types'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  updateProfile: (data: { phone?: string; name?: string }) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const seed = await ensureSeedLoaded()
        if (seed.loaded) console.log('Seed inicial carregado em navegador zerado')
      } catch (e) { console.error('ensureSeedLoaded failed', e) }
      try { await ensureSuperAdmin() } catch (e) { console.error('ensureSuperAdmin failed', e) }
      try { await ensureBoardGuests() } catch (e) { console.error('ensureBoardGuests failed', e) }
      setUser(authGetCurrentUser())
      setLoading(false)
    })()
  }, [])

  async function login(email: string, password: string) {
    const u = await authLogin(email, password)
    setUser(u)
  }

  async function register(name: string, email: string, password: string) {
    const u = await authRegister(name, email, password)
    // Se o e-mail está em BOARD_GUEST_EMAILS, sincroniza nome/role e adiciona
    // como membro de todos os quadros imediatamente (sem precisar de F5).
    try { await ensureBoardGuests() } catch (e) { console.error('ensureBoardGuests after register failed', e) }
    setUser(authGetCurrentUser() ?? u)
  }

  function updateProfile(data: { phone?: string; name?: string }) {
    if (!user) return
    const updated = updateUserProfile(user.id, data)
    setUser(updated)
  }

  function logout() {
    authLogout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
