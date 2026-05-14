import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useNavigate } from 'react-router-dom'
import {
  getUsers, setUserRole, adminDeleteUser,
  getInvites, createInvite, deleteInvite,
  ADMIN_EMAILS,
  exportBackup, importBackup,
} from '../lib/storage'
import { User, Invite } from '../types'

type Tab = 'usuarios' | 'convidar' | 'backup'

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AdminPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const isDark = theme === 'dark'

  // Redireciona se não for admin
  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/')
  }, [user, navigate])

  const [tab, setTab] = useState<Tab>('usuarios')
  const [users, setUsers] = useState<User[]>([])
  const [invites, setInvites] = useState<Invite[]>([])

  // Form de convite
  const [invName, setInvName] = useState('')
  const [invEmail, setInvEmail] = useState('')
  const [invSent, setInvSent] = useState<string | null>(null)

  useEffect(() => {
    setUsers(getUsers())
    setInvites(getInvites())
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleToggleRole(u: User) {
    if (ADMIN_EMAILS.includes(u.email.toLowerCase())) return // não tira o super-admin
    const newRole = u.role === 'admin' ? 'user' : 'admin'
    setUserRole(u.id, newRole)
    setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role: newRole } : x))
  }

  function handleDeleteUser(u: User) {
    if (u.id === user?.id) return // não pode deletar a si mesmo
    if (!confirm(`Excluir o usuário "${u.name}"? Esta ação não pode ser desfeita.`)) return
    adminDeleteUser(u.id)
    setUsers((prev) => prev.filter((x) => x.id !== u.id))
  }

  function buildInviteLink(email: string, name: string) {
    const base = window.location.origin
    return `${base}/register?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`
  }

  function sendInvite() {
    if (!invEmail.trim() || !invName.trim() || !user) return
    const invite = createInvite(invEmail.trim(), invName.trim(), user.id)
    setInvites((prev) => [...prev, invite])

    const link = buildInviteLink(invite.email, invite.name)
    const subject = encodeURIComponent('Convite para o Expansão')
    const body = encodeURIComponent(
      `Olá, ${invite.name}!\n\n` +
      `Você foi convidado(a) para acessar o Expansão — plataforma de quadros e louvores da nossa equipe.\n\n` +
      `Clique no link abaixo para criar sua conta:\n${link}\n\n` +
      `Qualquer dúvida, entre em contato.\n\nAbraços! 🙏`
    )
    window.open(
      `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(invite.email)}&su=${subject}&body=${body}`,
      '_blank'
    )
    setInvSent(invite.email)
    setInvName('')
    setInvEmail('')
    setTimeout(() => setInvSent(null), 4000)
  }

  function copyLink(email: string, name: string) {
    navigator.clipboard.writeText(buildInviteLink(email, name))
  }

  function handleDeleteInvite(id: string) {
    deleteInvite(id)
    setInvites((prev) => prev.filter((i) => i.id !== id))
  }

  // ── Backup / Restore ──────────────────────────────────────────────────────
  const [backupMsg, setBackupMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')

  function handleExport() {
    try {
      const payload = exportBackup()
      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `expengnovo-backup-${date}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      const keys = Object.keys(payload.data).length
      setBackupMsg({ kind: 'ok', text: `Backup exportado com ${keys} chave(s).` })
    } catch (e) {
      setBackupMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Falha ao exportar' })
    }
  }

  function handleImportFile(file: File) {
    const reader = new FileReader()
    reader.onerror = () => setBackupMsg({ kind: 'err', text: 'Não foi possível ler o arquivo' })
    reader.onload = () => {
      try {
        const text = String(reader.result || '')
        const payload = JSON.parse(text)
        if (importMode === 'replace' && !confirm(
          'Modo SUBSTITUIR vai apagar todos os dados atuais (usuários, quadros, louvores, convites) deste navegador antes de importar. Continuar?'
        )) return
        const { restored } = importBackup(payload, importMode)
        setBackupMsg({ kind: 'ok', text: `Importação concluída: ${restored} chave(s) restaurada(s). Recarregando…` })
        setTimeout(() => window.location.reload(), 1200)
      } catch (e) {
        setBackupMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Falha ao importar' })
      }
    }
    reader.readAsText(file)
  }

  // ── Sincronização remota (Vercel Blob) ───────────────────────────────────
  const [syncMsg, setSyncMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null)
  const [syncBusy, setSyncBusy] = useState<'idle' | 'pushing' | 'pulling'>('idle')
  const [serverInfo, setServerInfo] = useState<{ updatedAt: string | null; updatedBy: string | null } | null>(null)

  async function fetchServerInfo() {
    try {
      const res = await fetch('/api/sync', { method: 'GET', cache: 'no-store' })
      if (!res.ok) {
        if (res.status === 503) {
          setServerInfo(null)
          setSyncMsg({ kind: 'info', text: 'Sincronização remota indisponível: Vercel Blob não configurado.' })
        }
        return
      }
      const data = await res.json()
      setServerInfo({ updatedAt: data.updatedAt, updatedBy: data.updatedBy })
    } catch {
      /* silencioso na carga inicial */
    }
  }

  useEffect(() => { fetchServerInfo() }, [])

  async function handlePushToServer() {
    if (!confirm(
      'Enviar a versão deste navegador como a versão oficial para todos os usuários?\n\n' +
      'Quem clicar em "Receber versão mais recente" depois disso vai sobrescrever os dados locais com esta versão.'
    )) return
    setSyncBusy('pushing'); setSyncMsg(null)
    try {
      const payload = exportBackup()
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, updatedBy: user?.name || user?.email || 'usuário' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSyncMsg({ kind: 'err', text: data?.error || `Falha ao enviar (HTTP ${res.status}).` })
      } else {
        setSyncMsg({ kind: 'ok', text: 'Versão enviada para o servidor. Outros usuários já podem receber.' })
        // Após push, esta versão é a "última pulled" para evitar o banner aparecer no autor.
        if (data?.updatedAt) localStorage.setItem('kb_last_pulled_at', data.updatedAt)
        await fetchServerInfo()
      }
    } catch (e) {
      setSyncMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Erro de rede.' })
    } finally {
      setSyncBusy('idle')
    }
  }

  async function handlePullFromServer() {
    if (!confirm(
      'Receber a versão mais recente do servidor?\n\n' +
      'Os dados deste navegador serão mesclados (quadros e louvores do servidor sobrescrevem os locais; ' +
      'contas de usuário são preservadas).'
    )) return
    setSyncBusy('pulling'); setSyncMsg(null)
    try {
      const res = await fetch('/api/sync', { method: 'GET', cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSyncMsg({ kind: 'err', text: data?.error || `Falha ao receber (HTTP ${res.status}).` })
        return
      }
      if (!data.payload) {
        setSyncMsg({ kind: 'info', text: 'Nenhuma versão foi enviada para o servidor ainda.' })
        return
      }
      const { restored } = importBackup(data.payload, 'merge')
      if (data.updatedAt) localStorage.setItem('kb_last_pulled_at', data.updatedAt)
      setSyncMsg({ kind: 'ok', text: `Versão recebida do servidor: ${restored} chave(s) restaurada(s). Recarregando…` })
      setServerInfo({ updatedAt: data.updatedAt, updatedBy: data.updatedBy })
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      setSyncMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Erro de rede.' })
    } finally {
      setSyncBusy('idle')
    }
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

  // ── Styles ────────────────────────────────────────────────────────────────
  const bg = isDark ? 'bg-gray-900' : 'bg-gray-50'
  const panel = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  const heading = isDark ? 'text-white' : 'text-gray-900'
  const muted = isDark ? 'text-gray-400' : 'text-gray-500'
  const inputCls = `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${
    isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'border-gray-300 bg-white text-gray-900'
  }`
  const tabActive = isDark
    ? 'border-purple-400 text-purple-400'
    : 'border-purple-600 text-purple-700'
  const tabInactive = `border-transparent ${muted} hover:text-current`

  if (user?.role !== 'admin') return null

  return (
    <div className={`min-h-full ${bg} p-6`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h1 className={`text-xl font-bold ${heading}`}>Administração</h1>
        </div>
        <p className={`text-sm ${muted}`}>Gerencie usuários e envie convites</p>
      </div>

      {/* Tabs */}
      <div className={`flex border-b mb-6 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        {([
          { id: 'usuarios', label: `Usuários (${users.length})` },
          { id: 'convidar', label: `Convites enviados (${invites.length})` },
          { id: 'backup', label: 'Backup' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? tabActive : tabInactive
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Usuários ──────────────────────────────────────────────────── */}
      {tab === 'usuarios' && (
        <div className="space-y-3 max-w-2xl">
          {users.length === 0 && (
            <p className={`text-sm ${muted}`}>Nenhum usuário cadastrado ainda.</p>
          )}
          {users.map((u) => {
            const isSelf = u.id === user?.id
            const isSuperAdmin = ADMIN_EMAILS.includes(u.email.toLowerCase())
            return (
              <div
                key={u.id}
                className={`flex items-center gap-4 p-4 rounded-2xl border ${panel}`}
              >
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  u.role === 'admin'
                    ? 'bg-purple-600 text-white'
                    : isDark ? 'bg-gray-600 text-gray-200' : 'bg-gray-200 text-gray-700'
                }`}>
                  {getInitials(u.name)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-semibold text-sm ${heading}`}>{u.name}</span>
                    {isSelf && (
                      <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">você</span>
                    )}
                    {isSuperAdmin && (
                      <span className="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">super admin</span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${muted}`}>{u.email}</p>
                  <p className={`text-xs ${muted}`}>Desde {formatDate(u.createdAt)}</p>
                </div>

                {/* Role badge */}
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${
                  u.role === 'admin'
                    ? 'bg-purple-500/20 text-purple-400'
                    : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                }`}>
                  {u.role === 'admin' ? 'Administrador' : 'Usuário'}
                </span>

                {/* Actions */}
                {!isSuperAdmin && !isSelf && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleToggleRole(u)}
                      title={u.role === 'admin' ? 'Remover admin' : 'Tornar admin'}
                      className={`p-1.5 rounded-lg transition-colors text-xs font-medium ${
                        u.role === 'admin'
                          ? 'text-purple-400 hover:bg-purple-500/20'
                          : `${muted} hover:text-purple-400 hover:bg-purple-500/10`
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u)}
                      title="Excluir usuário"
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tab: Convidar ──────────────────────────────────────────────────── */}
      {tab === 'convidar' && (
        <div className="max-w-2xl space-y-6">
          {/* Form de convite */}
          <div className={`p-6 rounded-2xl border ${panel}`}>
            <h2 className={`font-semibold text-base mb-4 ${heading}`}>Enviar convite por e-mail</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>
                    Nome do convidado *
                  </label>
                  <input
                    value={invName}
                    onChange={(e) => setInvName(e.target.value)}
                    placeholder="Ex: João Silva"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>
                    E-mail *
                  </label>
                  <input
                    type="email"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
                    placeholder="joao@email.com"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Preview do link */}
              {invEmail.trim() && invName.trim() && (
                <div className={`p-3 rounded-xl text-xs font-mono break-all ${
                  isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                }`}>
                  {buildInviteLink(invEmail.trim(), invName.trim())}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={sendInvite}
                  disabled={!invEmail.trim() || !invName.trim()}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Enviar convite por e-mail
                </button>
                <button
                  onClick={() => invEmail.trim() && invName.trim() && copyLink(invEmail.trim(), invName.trim())}
                  disabled={!invEmail.trim() || !invName.trim()}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
                    isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copiar link
                </button>
              </div>

              {invSent && (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Convite enviado para {invSent}! Verifique seu cliente de e-mail.
                </div>
              )}
            </div>
          </div>

          {/* Convites pendentes */}
          <div>
            <h3 className={`font-semibold text-sm uppercase tracking-wide mb-3 ${muted}`}>
              Convites registrados ({invites.length})
            </h3>
            {invites.length === 0 && (
              <p className={`text-sm ${muted}`}>Nenhum convite enviado ainda.</p>
            )}
            <div className="space-y-2">
              {invites.map((inv) => {
                const isRegistered = users.some((u) => u.email.toLowerCase() === inv.email.toLowerCase())
                return (
                  <div
                    key={inv.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${panel}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      isRegistered
                        ? 'bg-green-600/20 text-green-400'
                        : isDark ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {inv.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${heading}`}>{inv.name}</span>
                        {isRegistered ? (
                          <span className="px-1.5 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">
                            ✓ cadastrado
                          </span>
                        ) : (
                          <span className={`px-1.5 py-0.5 text-xs rounded ${
                            isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                          }`}>
                            pendente
                          </span>
                        )}
                      </div>
                      <p className={`text-xs truncate ${muted}`}>{inv.email}</p>
                      <p className={`text-xs ${muted}`}>Enviado em {formatDate(inv.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => copyLink(inv.email, inv.name)}
                        title="Copiar link de convite"
                        className={`p-1.5 rounded-lg transition-colors ${muted} hover:text-current`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          const link = buildInviteLink(inv.email, inv.name)
                          const subject = encodeURIComponent('Convite para o Expansão')
                          const body = encodeURIComponent(
                            `Olá, ${inv.name}!\n\nAcesse o link para criar sua conta:\n${link}\n\nAbraços! 🙏`
                          )
                          window.open(
                            `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(inv.email)}&su=${subject}&body=${body}`,
                            '_blank'
                          )
                        }}
                        title="Reenviar e-mail"
                        className={`p-1.5 rounded-lg transition-colors ${muted} hover:text-green-400`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteInvite(inv.id)}
                        title="Remover convite"
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Backup ────────────────────────────────────────────────────── */}
      {tab === 'backup' && (
        <div className="max-w-2xl space-y-6">
          <div className={`p-4 rounded-2xl border ${
            isDark ? 'bg-yellow-900/20 border-yellow-700/40' : 'bg-yellow-50 border-yellow-200'
          }`}>
            <p className={`text-sm ${isDark ? 'text-yellow-200' : 'text-yellow-800'}`}>
              <strong>Importante:</strong> os dados deste sistema ficam salvos apenas no navegador
              (localStorage). Limpar o navegador, trocar de dispositivo ou mudar a URL de deploy
              faz os dados sumirem. <strong>Exporte um backup periodicamente.</strong>
            </p>
          </div>

          {/* Sincronização entre usuários */}
          <div className={`p-6 rounded-2xl border ${panel}`}>
            <h2 className={`font-semibold text-base mb-2 ${heading}`}>Sincronização entre usuários</h2>
            <p className={`text-sm mb-4 ${muted}`}>
              Envie sua versão para o servidor para que <strong>todos os usuários vejam as
              mesmas alterações</strong>. Quem clicar em "Receber versão mais recente" baixa o que
              você enviou.
            </p>
            {serverInfo?.updatedAt && (
              <p className={`text-xs mb-4 ${muted}`}>
                Última versão no servidor: <strong>{formatRelativeTime(serverInfo.updatedAt)}</strong>
                {serverInfo.updatedBy && <> · por <strong>{serverInfo.updatedBy}</strong></>}
                <> · <span className="font-mono">{new Date(serverInfo.updatedAt).toLocaleString('pt-BR')}</span></>
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handlePushToServer}
                disabled={syncBusy !== 'idle'}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M17 8l-5-5m0 0L7 8m5-5v12" />
                </svg>
                {syncBusy === 'pushing' ? 'Enviando…' : 'Salvar para todos no servidor'}
              </button>
              <button
                onClick={handlePullFromServer}
                disabled={syncBusy !== 'idle'}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                </svg>
                {syncBusy === 'pulling' ? 'Recebendo…' : 'Receber versão mais recente'}
              </button>
            </div>
            {syncMsg && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${
                syncMsg.kind === 'ok'
                  ? isDark ? 'bg-green-900/30 text-green-300 border border-green-700/40' : 'bg-green-50 text-green-800 border border-green-200'
                  : syncMsg.kind === 'err'
                    ? isDark ? 'bg-red-900/30 text-red-300 border border-red-700/40' : 'bg-red-50 text-red-800 border border-red-200'
                    : isDark ? 'bg-blue-900/30 text-blue-300 border border-blue-700/40' : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}>
                {syncMsg.text}
              </div>
            )}
          </div>

          {/* Exportar */}
          <div className={`p-6 rounded-2xl border ${panel}`}>
            <h2 className={`font-semibold text-base mb-2 ${heading}`}>Exportar backup</h2>
            <p className={`text-sm mb-4 ${muted}`}>
              Baixa um arquivo JSON com todos os dados deste navegador: usuários, quadros,
              cards, louvores e convites. Guarde em local seguro.
            </p>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
              </svg>
              Baixar backup (.json)
            </button>
          </div>

          {/* Importar */}
          <div className={`p-6 rounded-2xl border ${panel}`}>
            <h2 className={`font-semibold text-base mb-2 ${heading}`}>Importar backup</h2>
            <p className={`text-sm mb-4 ${muted}`}>
              Restaura dados a partir de um arquivo JSON exportado anteriormente.
            </p>

            <div className="mb-4 space-y-2">
              <label className={`flex items-start gap-2 cursor-pointer text-sm ${heading}`}>
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                  className="mt-0.5"
                />
                <span>
                  <strong>Mesclar</strong>
                  <span className={`block text-xs ${muted}`}>
                    Cada categoria presente no backup substitui a atual; categorias ausentes no
                    backup permanecem como estão.
                  </span>
                </span>
              </label>
              <label className={`flex items-start gap-2 cursor-pointer text-sm ${heading}`}>
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="mt-0.5"
                />
                <span>
                  <strong>Substituir tudo</strong>
                  <span className={`block text-xs ${muted}`}>
                    Apaga todos os dados atuais e restaura só o que está no backup.
                  </span>
                </span>
              </label>
            </div>

            <label className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M17 8l-5-5m0 0L7 8m5-5v12" />
              </svg>
              Selecionar arquivo .json
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleImportFile(f)
                  e.target.value = ''
                }}
              />
            </label>
          </div>

          {backupMsg && (
            <div className={`p-3 rounded-xl text-sm ${
              backupMsg.kind === 'ok'
                ? (isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-800')
                : (isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-800')
            }`}>
              {backupMsg.text}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
