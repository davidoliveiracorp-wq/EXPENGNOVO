import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { importBackup, ensurePasswordOverrides, _setBootstrapInProgress } from '../lib/storage'
import Logo from '../components/Logo'

export default function LoginPage() {
  const { login } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // ── Sincronização ao abrir a página ────────────────────────────────────────
  // Puxa a versão mais recente do servidor antes de qualquer tentativa de
  // login. Garante que mudanças de senha feitas em outro navegador (via
  // /api/forgot-password) cheguem aqui antes de o usuário tentar entrar.
  const [pulling, setPulling] = useState(true)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/sync', { method: 'GET', cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (data?.payload && !cancelled) {
            _setBootstrapInProgress(true)
            try { importBackup(data.payload, 'merge') } finally { _setBootstrapInProgress(false) }
          }
        }
      } catch { /* sem rede ou Blob não configurado — segue local */ }
      // Reaplica os PASSWORD_OVERRIDES (admin pode ter forçado uma senha)
      try { await ensurePasswordOverrides() } catch { /* ignore */ }
      if (!cancelled) setPulling(false)
    })()
    return () => { cancelled = true }
  }, [])

  // ── Login ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  // ── Esqueci a senha ────────────────────────────────────────────────────────
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotBusy, setForgotBusy] = useState(false)
  const [forgotMsg, setForgotMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string; tempPassword?: string } | null>(null)

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    setForgotMsg(null)
    setForgotBusy(true)
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      })
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) {
        const msg = (data as { error?: string }).error || `HTTP ${res.status}`
        setForgotMsg({ kind: 'err', text: msg })
      } else if ((data as { tempPassword?: string }).tempPassword) {
        setForgotMsg({
          kind: 'info',
          text: (data as { message?: string }).message || 'Senha temporária gerada.',
          tempPassword: (data as { tempPassword?: string }).tempPassword,
        })
      } else {
        setForgotMsg({
          kind: 'ok',
          text: (data as { message?: string }).message || 'Nova senha enviada para o e-mail cadastrado.',
        })
      }
    } catch (err) {
      setForgotMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Erro de rede.' })
    } finally {
      setForgotBusy(false)
    }
  }

  const isDark = theme === 'dark'

  return (
    <div className={`min-h-screen flex items-center justify-center transition-colors duration-300 ${
      isDark
        ? 'bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900'
        : 'bg-gradient-to-br from-slate-100 via-purple-50 to-slate-200'
    }`}>
      <button
        onClick={toggleTheme}
        className={`fixed top-4 right-4 p-2 rounded-full transition-colors ${
          isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/10 hover:bg-black/20 text-gray-700'
        }`}
      >
        {isDark ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      <div className="w-full max-w-md px-4">
        <div className={`rounded-2xl p-8 shadow-2xl border transition-colors duration-300 ${
          isDark ? 'bg-white/10 backdrop-blur-md border-white/20' : 'bg-white border-gray-200'
        }`}>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center px-4 py-2 bg-black rounded-2xl mb-4">
              <Logo size="md" />
            </div>
            <p className={`mt-2 text-sm ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
              {showForgot ? 'Recuperar senha' : 'Entre na sua conta'}
            </p>
            {pulling && !showForgot && (
              <p className={`mt-1 text-[10px] ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                Buscando atualizações do servidor…
              </p>
            )}
          </div>

          {!showForgot ? (
            <>
              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-400/40 rounded-lg text-red-500 text-sm">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>Email</label>
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 transition-colors ${
                      isDark ? 'bg-white/10 border border-white/20 text-white placeholder-white/40 focus:ring-white/40'
                             : 'bg-gray-50 border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-purple-400'
                    }`}
                    placeholder="seu@email.com" required
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>Senha</label>
                  <input
                    type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 transition-colors ${
                      isDark ? 'bg-white/10 border border-white/20 text-white placeholder-white/40 focus:ring-white/40'
                             : 'bg-gray-50 border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-purple-400'
                    }`}
                    placeholder="••••••••" required
                  />
                </div>
                <button type="submit" disabled={loading || pulling}
                  className="w-full py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-60">
                  {loading ? 'Entrando...' : pulling ? 'Aguarde…' : 'Entrar'}
                </button>
              </form>

              <p className={`text-center text-sm mt-6 ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                <button
                  type="button"
                  onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotMsg(null); setError('') }}
                  className={`font-medium hover:underline ${isDark ? 'text-white' : 'text-purple-700'}`}
                >
                  Esqueci a senha
                </button>
              </p>
            </>
          ) : (
            <>
              <form onSubmit={handleForgot} className="space-y-4">
                <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                  Informe o e-mail cadastrado. Enviaremos uma nova senha para você.
                </p>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-white/80' : 'text-gray-700'}`}>Email cadastrado</label>
                  <input
                    type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 transition-colors ${
                      isDark ? 'bg-white/10 border border-white/20 text-white placeholder-white/40 focus:ring-white/40'
                             : 'bg-gray-50 border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-purple-400'
                    }`}
                    placeholder="seu@email.com" required autoFocus
                  />
                </div>

                {forgotMsg && (
                  <div className={`p-3 rounded-lg text-sm ${
                    forgotMsg.kind === 'ok' ? 'bg-green-500/20 border border-green-400/40 text-green-300'
                    : forgotMsg.kind === 'err' ? 'bg-red-500/20 border border-red-400/40 text-red-400'
                    : 'bg-blue-500/20 border border-blue-400/40 text-blue-300'
                  }`}>
                    <p>{forgotMsg.text}</p>
                    {forgotMsg.tempPassword && (
                      <p className="mt-2 font-mono text-base bg-black/30 px-2 py-1 rounded inline-block">
                        {forgotMsg.tempPassword}
                      </p>
                    )}
                  </div>
                )}

                <button type="submit" disabled={forgotBusy}
                  className="w-full py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-60">
                  {forgotBusy ? 'Enviando…' : 'Enviar nova senha'}
                </button>
              </form>

              <p className={`text-center text-sm mt-6 ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                <button
                  type="button"
                  onClick={() => { setShowForgot(false); setForgotMsg(null); setForgotEmail('') }}
                  className={`font-medium hover:underline ${isDark ? 'text-white' : 'text-purple-700'}`}
                >
                  ← Voltar ao login
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
