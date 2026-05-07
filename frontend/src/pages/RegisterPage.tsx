import { useState, FormEvent } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { addBoardMember, getBoardById, authGetCurrentUser } from '../lib/storage'
import Logo from '../components/Logo'

export default function RegisterPage() {
  const { register } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Pré-preenche campos se vier de convite
  const [name, setName] = useState(searchParams.get('name') || '')
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('As senhas não coincidem'); return }
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres'); return }
    setLoading(true)
    try {
      await register(name, email, password)
      // Se veio de um convite de quadro, adiciona o usuário ao board
      const boardId = searchParams.get('board')
      if (boardId) {
        const board = getBoardById(boardId)
        const newUser = authGetCurrentUser()
        if (board && newUser) addBoardMember(boardId, newUser)
        navigate(`/boards/${boardId}`)
      } else {
        navigate('/')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  const isDark = theme === 'dark'

  const inputClass = `w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 transition-colors ${
    isDark ? 'bg-white/10 border border-white/20 text-white placeholder-white/40 focus:ring-white/40'
           : 'bg-gray-50 border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-purple-400'
  }`
  const labelClass = `block text-sm font-medium mb-1 ${isDark ? 'text-white/80' : 'text-gray-700'}`

  return (
    <div className={`min-h-screen flex items-center justify-center transition-colors duration-300 ${
      isDark ? 'bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900'
             : 'bg-gradient-to-br from-slate-100 via-purple-50 to-slate-200'
    }`}>
      <button onClick={toggleTheme}
        className={`fixed top-4 right-4 p-2 rounded-full transition-colors ${
          isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/10 hover:bg-black/20 text-gray-700'
        }`}>
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
            {searchParams.get('email') ? (
              <div className="mt-2 px-4 py-2 bg-green-500/20 border border-green-400/40 rounded-xl">
                <p className={`text-sm font-medium ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                  🎉 Você foi convidado! Complete seu cadastro abaixo.
                </p>
              </div>
            ) : (
              <p className={`mt-2 text-sm ${isDark ? 'text-white/60' : 'text-gray-500'}`}>Crie sua conta</p>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-400/40 rounded-lg text-red-500 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Nome</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className={inputClass} placeholder="Seu nome" required />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className={inputClass} placeholder="seu@email.com" required />
            </div>
            <div>
              <label className={labelClass}>Senha</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className={inputClass} placeholder="••••••••" required />
            </div>
            <div>
              <label className={labelClass}>Confirmar Senha</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className={inputClass} placeholder="••••••••" required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-60">
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>

          <p className={`text-center text-sm mt-6 ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
            Já tem conta?{' '}
            <Link to="/login" className={`font-medium hover:underline ${isDark ? 'text-white' : 'text-purple-700'}`}>
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
