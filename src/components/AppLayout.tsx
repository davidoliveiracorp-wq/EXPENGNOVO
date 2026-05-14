import { useRef, useState, useEffect, useCallback } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { exportBackup, importBackup, _setBootstrapInProgress } from '../lib/storage'
import Logo from './Logo'

const LAST_PULLED_KEY = 'kb_last_pulled_at'
const LAST_PUSHED_VERSION_KEY = 'kb_last_pushed_version'
const LOCAL_VERSION_KEY = 'kb_local_version'
const DISMISSED_KEY = 'kb_dismissed_server_update'
const POLL_INTERVAL_MS = 30000   // pull a cada 30s quando aba visível
const PUSH_DEBOUNCE_MS = 2000    // espera 2s após última mudança para enviar

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

function formatPhone(raw: string) {
  // remove tudo que não é dígito
  return raw.replace(/\D/g, '')
}

export default function AppLayout() {
  const { user, loading, logout, updateProfile } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneSaved, setPhoneSaved] = useState(false)
  const [birthdayInput, setBirthdayInput] = useState('')
  const [birthdaySaved, setBirthdaySaved] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  // ── Auto-sync (push debounced + pull periódico) ──────────────────────────
  type SyncStatus = 'idle' | 'pushing' | 'pulling' | 'offline' | 'conflict'
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(
    () => localStorage.getItem(LAST_PULLED_KEY)
  )
  type ServerUpdate = { updatedAt: string; updatedBy: string | null; payload: unknown }
  const [serverUpdate, setServerUpdate] = useState<ServerUpdate | null>(null)
  const [applyingUpdate, setApplyingUpdate] = useState(false)
  const pushTimerRef = useRef<number | null>(null)
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])

  // Push interno: roda do "schedulePush" automático e só envia se houver
  // mudanças desde o último push (localVer > lastPushed).
  const pushNow = useCallback(async (force = false) => {
    const localVer = Number(localStorage.getItem(LOCAL_VERSION_KEY) || '0')
    const lastPushed = Number(localStorage.getItem(LAST_PUSHED_VERSION_KEY) || '0')
    if (!force && localVer <= lastPushed) return
    setSyncStatus('pushing')
    try {
      const payload = exportBackup()
      const u = userRef.current
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, updatedBy: u?.name || u?.email || 'usuário' }),
      })
      if (!res.ok) { setSyncStatus('offline'); return }
      const data = await res.json().catch(() => ({}))
      const newVer = force ? Math.max(localVer, 1) : localVer
      if (force && newVer !== localVer) localStorage.setItem(LOCAL_VERSION_KEY, String(newVer))
      localStorage.setItem(LAST_PUSHED_VERSION_KEY, String(newVer))
      if (data.updatedAt) {
        localStorage.setItem(LAST_PULLED_KEY, data.updatedAt)
        setLastSyncAt(data.updatedAt)
      }
      setSyncStatus('idle')
    } catch {
      setSyncStatus('offline')
    }
  }, [])

  // Força o envio do estado local atual, mesmo que o sistema não tenha
  // detectado mudanças (útil para dados pré-deploy ou primeiro sync).
  const forcePush = useCallback(() => { pushNow(true) }, [pushNow])

  const schedulePush = useCallback(() => {
    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current)
    pushTimerRef.current = window.setTimeout(() => { pushNow() }, PUSH_DEBOUNCE_MS)
  }, [pushNow])

  const pullNow = useCallback(async () => {
    try {
      setSyncStatus((s) => (s === 'pushing' ? s : 'pulling'))
      const res = await fetch('/api/sync', { method: 'GET', cache: 'no-store' })
      if (!res.ok) { setSyncStatus('offline'); return }
      const data = await res.json()
      if (!data?.payload || !data?.updatedAt) { setSyncStatus('idle'); return }
      const lastPulled = localStorage.getItem(LAST_PULLED_KEY)
      const isNewer = !lastPulled || new Date(data.updatedAt).getTime() > new Date(lastPulled).getTime()
      if (!isNewer) { setSyncStatus('idle'); return }
      // Há versão nova no servidor. Se temos mudanças locais ainda não
      // enviadas, mostra banner para o usuário decidir; caso contrário,
      // aplica silenciosamente.
      const localVer = Number(localStorage.getItem(LOCAL_VERSION_KEY) || '0')
      const lastPushed = Number(localStorage.getItem(LAST_PUSHED_VERSION_KEY) || '0')
      if (localVer > lastPushed) {
        setServerUpdate({ updatedAt: data.updatedAt, updatedBy: data.updatedBy, payload: data.payload })
        setSyncStatus('conflict')
        return
      }
      // Aplica silenciosamente (sem reload se nada estiver em edição)
      _setBootstrapInProgress(true)
      try {
        importBackup(data.payload, 'merge')
      } finally {
        _setBootstrapInProgress(false)
      }
      localStorage.setItem(LAST_PULLED_KEY, data.updatedAt)
      setLastSyncAt(data.updatedAt)
      setSyncStatus('idle')
      // Recarrega para refletir as mudanças (a UI lê do localStorage)
      // sem perder o que o usuário não estava editando ativamente.
      const activeTag = (document.activeElement?.tagName || '').toLowerCase()
      const isTyping = activeTag === 'input' || activeTag === 'textarea'
      if (!isTyping) window.location.reload()
      else setServerUpdate({ updatedAt: data.updatedAt, updatedBy: data.updatedBy, payload: data.payload })
    } catch {
      setSyncStatus('offline')
    }
  }, [])

  // Listener: dispara push debounced sempre que storage avisa de mudança local
  useEffect(() => {
    const onChange = () => schedulePush()
    window.addEventListener('kb-storage-change', onChange)
    return () => window.removeEventListener('kb-storage-change', onChange)
  }, [schedulePush])

  // Primeiro launch pós-deploy: se o usuário tem dados locais mas ainda não
  // tem controle de versão (kb_local_version), envia para o servidor se ele
  // estiver vazio. Garante que mudanças pré-deploy de qualquer usuário
  // (mesmo não-admin) cheguem aos demais sem precisar de ação manual.
  useEffect(() => {
    if (loading) return
    const hasVersion = localStorage.getItem(LOCAL_VERSION_KEY) !== null
    if (hasVersion) return
    let hasData = false
    try {
      hasData =
        JSON.parse(localStorage.getItem('kb_boards') || '[]').length > 0 ||
        JSON.parse(localStorage.getItem('kb_songs') || '[]').length > 0
    } catch { /* ignore */ }
    if (!hasData) {
      // Sem dados, só marca inicializado para não disparar isso de novo
      localStorage.setItem(LOCAL_VERSION_KEY, '0')
      localStorage.setItem(LAST_PUSHED_VERSION_KEY, '0')
      return
    }
    // Checa se o servidor já tem dados antes de auto-pushar
    fetch('/api/sync', { method: 'GET', cache: 'no-store' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.payload) {
          // Servidor já tem dados — não sobrescreve; deixa o auto-pull aplicar
          localStorage.setItem(LOCAL_VERSION_KEY, '0')
          localStorage.setItem(LAST_PUSHED_VERSION_KEY, '0')
          return
        }
        // Servidor vazio → envia o estado local automaticamente
        forcePush()
      })
      .catch(() => { /* Blob não configurado, silencioso */ })
  }, [loading, forcePush])

  // Pull no boot e a cada POLL_INTERVAL_MS quando a aba está visível.
  // Também faz pull ao focar a aba (volta de outra janela / outra aba).
  useEffect(() => {
    let interval: number | null = null
    function start() {
      pullNow()
      if (interval == null) {
        interval = window.setInterval(() => {
          if (document.visibilityState === 'visible') pullNow()
        }, POLL_INTERVAL_MS)
      }
    }
    function stop() {
      if (interval != null) { window.clearInterval(interval); interval = null }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') { pullNow(); start() } else stop()
    }
    function onFocus() { pullNow() }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [pullNow])

  async function handleApplyServerUpdate() {
    if (!serverUpdate) return
    setApplyingUpdate(true)
    try {
      _setBootstrapInProgress(true)
      try {
        importBackup(serverUpdate.payload, 'merge')
      } finally {
        _setBootstrapInProgress(false)
      }
      localStorage.setItem(LAST_PULLED_KEY, serverUpdate.updatedAt)
      window.location.reload()
    } catch (e) {
      console.error('Falha ao aplicar atualização do servidor', e)
      setApplyingUpdate(false)
    }
  }

  function handleDismissServerUpdate() {
    if (!serverUpdate) return
    localStorage.setItem(DISMISSED_KEY, serverUpdate.updatedAt)
    setServerUpdate(null)
    setSyncStatus('idle')
  }

  function formatRelativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'agora há pouco'
    if (min < 60) return `há ${min} min`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `há ${hr} h`
    const days = Math.floor(hr / 24)
    return `há ${days} dia${days !== 1 ? 's' : ''}`
  }

  useEffect(() => {
    if (showProfile) {
      setPhoneInput(user?.phone || '')
      setBirthdayInput(user?.birthday || '')
    }
  }, [showProfile, user?.phone, user?.birthday])

  useEffect(() => {
    if (!showProfile) return
    function handler(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showProfile])

  function handleSavePhone() {
    const cleaned = formatPhone(phoneInput)
    updateProfile({ phone: cleaned || undefined })
    setPhoneSaved(true)
    setTimeout(() => setPhoneSaved(false), 2000)
  }

  function handleSaveBirthday() {
    updateProfile({ birthday: birthdayInput || undefined })
    setBirthdaySaved(true)
    setTimeout(() => setBirthdaySaved(false), 2000)
  }

  const navItems = [
    {
      to: '/',
      end: true,
      label: 'Quadros',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      ),
    },
    {
      to: '/louvores',
      end: false,
      label: 'Louvores',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      ),
    },
    {
      to: '/relatorios',
      end: false,
      label: 'Relatórios',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      to: '/aniversariantes',
      end: false,
      label: 'Aniversariantes',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8c1-2 3-2 3 0s-3 3-3 3-3-1-3-3 2-2 3 0zM4 14h16v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6zM4 14a2 2 0 012-2h12a2 2 0 012 2M8 14V9m8 5V9" />
        </svg>
      ),
    },
    ...(user?.role === 'admin' ? [{
      to: '/admin',
      end: false,
      label: 'Administração',
      icon: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    }] : []),
  ]

  const Sidebar = (
    <div className="flex flex-col h-full w-60 bg-black flex-shrink-0 select-none">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <Logo size="sm" />
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
              ${isActive
                ? 'bg-white/15 text-white'
                : 'text-white/50 hover:text-white hover:bg-white/8'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-white/10 space-y-0.5">
        {/* Sync status + força push (visível para todos os usuários, não só admin) */}
        <div className="px-3 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] text-white/40 min-w-0">
              {syncStatus === 'idle' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="truncate">Sincronizado{lastSyncAt ? ` · ${formatRelativeTime(lastSyncAt)}` : ''}</span>
                </>
              )}
              {syncStatus === 'pushing' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                  <span className="truncate">Enviando alterações…</span>
                </>
              )}
              {syncStatus === 'pulling' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                  <span className="truncate">Buscando atualizações…</span>
                </>
              )}
              {syncStatus === 'offline' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0" />
                  <span className="truncate" title="Servidor de sincronização indisponível">Offline / sem sync</span>
                </>
              )}
              {syncStatus === 'conflict' && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />
                  <span className="truncate">Conflito — ver banner acima</span>
                </>
              )}
            </div>
            <button
              onClick={forcePush}
              disabled={syncStatus === 'pushing' || syncStatus === 'pulling'}
              title="Enviar minhas mudanças para o servidor agora"
              className="text-white/40 hover:text-white transition-colors disabled:opacity-40 flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M17 8l-5-5m0 0L7 8m5-5v12" />
              </svg>
            </button>
          </div>
        </div>
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/50 hover:text-white hover:bg-white/8 w-full transition-all"
        >
          {isDark ? (
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
          {isDark ? 'Modo claro' : 'Modo escuro'}
        </button>

        {/* User row + Profile popover */}
        <div className="relative" ref={profileRef}>
          {/* Profile popover */}
          {showProfile && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-gray-900 border border-white/15 rounded-2xl shadow-2xl p-4 z-50">
              <p className="text-white font-semibold text-sm mb-0.5">{user?.name}</p>
              <p className="text-white/40 text-xs mb-3 truncate">{user?.email}</p>

              {/* WhatsApp */}
              <div className="space-y-1.5">
                <label className="text-white/50 text-xs font-medium flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.089.534 4.05 1.474 5.757L.057 23.882a.5.5 0 00.61.61l6.126-1.416A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.908 0-3.697-.503-5.244-1.382l-.376-.215-3.896.9.915-3.851-.234-.382A9.945 9.945 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                  </svg>
                  WhatsApp (com DDI, ex: 5511999999999)
                </label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePhone()}
                    placeholder="5511999999999"
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 text-xs focus:outline-none focus:ring-1 focus:ring-green-400/50"
                  />
                  <button
                    onClick={handleSavePhone}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${phoneSaved ? 'bg-green-600 text-white' : 'bg-white/15 hover:bg-white/25 text-white'}`}
                  >
                    {phoneSaved ? '✓' : 'Salvar'}
                  </button>
                </div>
                {user?.phone && (
                  <p className="text-green-400 text-xs flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Cadastrado: +{user.phone}
                  </p>
                )}
              </div>

              {/* Aniversário */}
              <div className="space-y-1.5 mt-3">
                <label className="text-white/50 text-xs font-medium flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c1-2 3-2 3 0s-3 3-3 3-3-1-3-3 2-2 3 0zM6 14h12v6a2 2 0 01-2 2H8a2 2 0 01-2-2v-6z" />
                  </svg>
                  Data de nascimento
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={birthdayInput}
                    onChange={(e) => setBirthdayInput(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 text-xs focus:outline-none focus:ring-1 focus:ring-pink-400/50"
                  />
                  <button
                    onClick={handleSaveBirthday}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${birthdaySaved ? 'bg-pink-600 text-white' : 'bg-white/15 hover:bg-white/25 text-white'}`}
                  >
                    {birthdaySaved ? '✓' : 'Salvar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
            onClick={() => setShowProfile((v) => !v)}
            title="Perfil / WhatsApp"
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 transition-colors ${user?.phone ? 'bg-green-600' : 'bg-white/20'}`}>
              {getInitials(user?.name || 'U')}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-white/70 text-sm truncate block">{user?.name}</span>
              {user?.phone && <span className="text-green-400/70 text-[10px]">WhatsApp ativo</span>}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); logout() }}
              className="text-white/30 hover:text-white/80 transition-colors flex-shrink-0"
              title="Sair"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className={`flex h-screen overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}>
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full">
        {Sidebar}
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed left-0 top-0 bottom-0 z-50 flex md:hidden">
            {Sidebar}
          </div>
        </>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-black flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-white/70 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Logo size="sm" />
        </div>

        {/* Banner de "nova versão no servidor" */}
        {serverUpdate && (
          <div className="bg-blue-600/95 text-white text-sm flex items-center gap-3 px-4 py-2 border-b border-blue-700 flex-shrink-0">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="flex-1">
              Nova versão disponível no servidor
              {serverUpdate.updatedBy ? <> por <strong>{serverUpdate.updatedBy}</strong></> : null}
              {' '}({formatRelativeTime(serverUpdate.updatedAt)}).
            </span>
            <button
              onClick={handleApplyServerUpdate}
              disabled={applyingUpdate}
              className="px-3 py-1 rounded-lg bg-white text-blue-700 hover:bg-blue-50 text-xs font-semibold transition-colors disabled:opacity-60"
            >
              {applyingUpdate ? 'Atualizando…' : 'Atualizar agora'}
            </button>
            <button
              onClick={handleDismissServerUpdate}
              className="px-2 py-1 rounded-lg text-white/80 hover:bg-white/10 text-xs transition-colors"
            >
              Ignorar
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
