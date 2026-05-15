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

  // ── Sincronização ao abrir a página (não-bloqueante) ──────────────────────
  // Puxa em background a versão mais recente do servidor para que mudanças
  // de senha vindas de outro navegador (via /api/forgot-password) cheguem
  // aqui. Não bloqueia o login — se o servidor demorar/falhar, o usuário
  // ainda pode entrar com o estado local imediatamente.
  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()
    // Timeout de 4s para não bloquear caso o servidor não responda
    // (Blob não configurado, rede off, etc).
    const timer = setTimeout(() => ctrl.abort(), 4000)

    ;(async () => {
      try {
        const res = await fetch('/api/sync', { method: 'GET', cache: 'no-store', signal: ctrl.signal })
        if (res.ok) {
          const data = await res.json()
          if (data?.payload && !cancelled) {
            _setBootstrapInProgress(true)
            try { importBackup(data.payload, 'merge') } finally { _setBootstrapInProgress(false) }
          }
        }
      } catch { /* abort/sem rede/Blob não configurado — segue local */ }
      finally { clearTimeout(timer) }
      try { await ensurePasswordOverrides() } catch { /* ignore */ }
    })()

    return () => { cancelled = true; clearTimeout(timer); ctrl.abort() }
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
  const [forgotResult, setForgotResult] = useState<
    | { kind: 'ok'; tempPassword: string; name: string | null; message: string }
    | { kind: 'err'; text: string }
    | null
  >(null)
  const [copied, setCopied] = useState(false)

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    setForgotResult(null)
    setForgotBusy(true)
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      })
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) {
        setForgotResult({ kind: 'err', text: (data as { error?: string }).error || `Falha (HTTP ${res.status}).` })
        return
      }
      if ((data as { tempPassword?: string }).tempPassword) {
        setForgotResult({
          kind: 'ok',
          tempPassword: (data as { tempPassword: string }).tempPassword,
          name: ((data as { name?: string | null }).name) ?? null,
          message: (data as { message?: string }).message || 'Nova senha gerada.',
        })
      } else {
        setForgotResult({ kind: 'err', text: (data as { message?: string }).message || 'E-mail não encontrado.' })
      }
    } catch (err) {
      setForgotResult({ kind: 'err', text: err instanceof Error ? err.message : 'Erro de rede.' })
    } finally {
      setForgotBusy(false)
    }
  }

  async function handleCopyPassword(pw: string) {
    try {
      await navigator.clipboard.writeText(pw)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard pode não estar disponível */ }
  }

  function useTempPasswordNow(pw: string) {
    if (forgotEmail) setEmail(forgotEmail)
    setPassword(pw)
    setShowForgot(false)
    setForgotResult(null)
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
                <button type="submit" disabled={loading}
                  className="w-full py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-60">
                  {loading ? 'Entrando...' : 'Entrar'}
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
              {forgotResult?.kind === 'ok' ? (
                <div className="space-y-4">
                  <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                    {forgotResult.name ? `Olá, ${forgotResult.name}!` : 'Pronto!'} Sua nova senha temporária é:
                  </p>
                  <div className={`rounded-xl p-4 text-center ${isDark ? 'bg-black/40 border border-white/20' : 'bg-gray-100 border border-gray-300'}`}>
                    <p className={`font-mono text-xl tracking-wider select-all ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {forgotResult.tempPassword}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyPassword(forgotResult.tempPassword)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                        isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => useTempPasswordNow(forgotResult.tempPassword)}
                      className="flex-1 py-2.5 rounded-xl bg-black hover:bg-gray-800 text-white text-sm font-semibold transition-colors"
                    >
                      Usar e entrar
                    </button>
                  </div>
                  <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    Salve essa senha em local seguro. Você pode trocá-la depois pelo seu próprio dispositivo de confiança.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-4">
                  <p className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                    Informe o e-mail cadastrado. Vamos gerar uma nova senha aqui mesmo na tela —
                    copie e use para entrar.
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

                  {forgotResult?.kind === 'err' && (
                    <div className="p-3 rounded-lg text-sm bg-red-500/20 border border-red-400/40 text-red-400">
                      {forgotResult.text}
                    </div>
                  )}

                  <button type="submit" disabled={forgotBusy}
                    className="w-full py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-60">
                    {forgotBusy ? 'Gerando…' : 'Gerar nova senha'}
                  </button>
                </form>
              )}

              <p className={`text-center text-sm mt-6 ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                <button
                  type="button"
                  onClick={() => { setShowForgot(false); setForgotResult(null); setForgotEmail('') }}
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
