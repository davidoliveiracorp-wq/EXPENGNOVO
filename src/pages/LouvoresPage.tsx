import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Song } from '../types'
import { getSongs, createSong, updateSong, deleteSong } from '../lib/storage'

const MUSICAL_KEYS = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si']
const CATEGORIES = ['Louvor', 'Adoração', 'Contemplação', 'Evangelismo', 'Comunhão', 'Outro']

const EMPTY_FORM = {
  title: '', artist: '', key: '', category: '',
  lyrics: '', cifra: '', youtubeUrl: '', bpm: '',
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/)
  return m ? m[1] : null
}

// ── Inline YouTube link saver inside the WA modal (for songs without a link) ─
interface WaYouTubeInlineProps {
  song: Song
  isDark: boolean
  muted: string
  inputCls: string
  onSave: (url: string) => void
}
function WaYouTubeInline({ song, isDark, muted, inputCls, onSave }: WaYouTubeInlineProps) {
  const [url, setUrl] = useState('')
  const [saved, setSaved] = useState(false)

  function searchYT() {
    const q = encodeURIComponent(`${song.title} ${song.artist}`.trim())
    window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank')
  }

  function save() {
    if (!url.trim()) return
    onSave(url.trim())
    setSaved(true)
  }

  if (saved) return null

  return (
    <div className={`px-4 pb-3 pt-1 flex items-center gap-2 ${isDark ? 'bg-green-900/20' : 'bg-green-50'}`}>
      <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder="Cole o link do YouTube aqui..."
        className={`flex-1 px-2 py-1 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-red-400 ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'border-gray-300 bg-white text-gray-900'}`}
      />
      <button
        onClick={searchYT}
        title="Buscar no YouTube"
        className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
      >Buscar</button>
      <button
        onClick={save}
        disabled={!url.trim()}
        className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
      >Salvar</button>
    </div>
  )
}

// ── Inline YouTube link editor (used inside the YouTube tab) ─────────────────
interface YouTubeFieldProps {
  song: Song
  isDark: boolean
  muted: string
  inputCls: string
  onSave: (url: string) => void
}
function YouTubeField({ song, isDark, muted, inputCls, onSave }: YouTubeFieldProps) {
  const [url, setUrl] = useState(song.youtubeUrl || '')
  const [saved, setSaved] = useState(false)

  function save() {
    onSave(url.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function searchYT() {
    const q = encodeURIComponent(`${song.title} ${song.artist}`.trim())
    window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="https://www.youtube.com/watch?v=..."
          className={`${inputCls} flex-1`}
        />
        <button
          onClick={searchYT}
          title="Buscar no YouTube"
          className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          Buscar
        </button>
        <button
          onClick={save}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
            saved
              ? 'bg-green-600 text-white'
              : isDark ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-gray-300 hover:bg-gray-400 text-gray-800'
          }`}
        >
          {saved ? '✓ Salvo' : 'Salvar'}
        </button>
      </div>
      <p className={`text-xs ${muted}`}>Clique em "Buscar" para abrir o YouTube, copie o link do vídeo e cole acima</p>
    </div>
  )
}

export default function LouvoresPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Songs
  const [songs, setSongs] = useState<Song[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'letra' | 'cifra' | 'youtube'>('letra')
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<string>('Todas')

  // Form (add / edit)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  // WhatsApp share modal
  const [showWA, setShowWA] = useState(false)
  const [waDate, setWaDate] = useState(new Date().toISOString().split('T')[0])
  const [waSelected, setWaSelected] = useState<Set<string>>(new Set())
  const [waPhone, setWaPhone] = useState(() => localStorage.getItem('kb_wa_contact') || '')
  const [waCopied, setWaCopied] = useState(false)
  const [waCustomMsg, setWaCustomMsg] = useState('')
  const [waIncludeLinks, setWaIncludeLinks] = useState(true)

  const searchRef = useRef<HTMLInputElement>(null)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => { setSongs(getSongs()) }, [])

  const selectedSong = songs.find((s) => s.id === selectedId) || null

  const filtered = songs.filter((s) => {
    const q = search.toLowerCase()
    const matchSearch = !q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || (s.key || '').toLowerCase().includes(q)
    const matchCat = filterCat === 'Todas' || s.category === filterCat
    return matchSearch && matchCat
  })

  // ── Form helpers ──────────────────────────────────────────────────────────
  function openNew() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
  }

  function openEdit(song: Song) {
    setEditingId(song.id)
    setForm({
      title: song.title,
      artist: song.artist,
      key: song.key || '',
      category: song.category || '',
      lyrics: song.lyrics || '',
      cifra: song.cifra || '',
      youtubeUrl: song.youtubeUrl || '',
      bpm: song.bpm ? String(song.bpm) : '',
    })
    setShowForm(true)
  }

  function searchYouTube() {
    const q = encodeURIComponent(`${form.title} ${form.artist}`.trim())
    window.open(`https://www.youtube.com/results?search_query=${q}`, '_blank')
  }

  function saveForm() {
    if (!form.title.trim() || !form.artist.trim() || !user) return
    const data = {
      title: form.title.trim(),
      artist: form.artist.trim(),
      key: form.key || undefined,
      category: form.category || undefined,
      lyrics: form.lyrics || undefined,
      cifra: form.cifra || undefined,
      youtubeUrl: form.youtubeUrl.trim() || undefined,
      bpm: form.bpm ? Number(form.bpm) : undefined,
      createdBy: user.id,
    }
    if (editingId) {
      const updated = updateSong(editingId, data)
      setSongs((prev) => prev.map((s) => s.id === editingId ? updated : s))
    } else {
      const created = createSong(data)
      setSongs((prev) => [...prev, created])
      setSelectedId(created.id)
    }
    setShowForm(false)
  }

  function handleDelete(songId: string) {
    if (!confirm('Excluir esta música?')) return
    deleteSong(songId)
    setSongs((prev) => prev.filter((s) => s.id !== songId))
    if (selectedId === songId) setSelectedId(null)
  }

  // ── WhatsApp helpers ──────────────────────────────────────────────────────
  function toggleWaSelection(id: string) {
    setWaSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function buildWaMessage() {
    const selected = songs.filter((s) => waSelected.has(s.id))
    const d = new Date(waDate + 'T12:00:00')
    const dateStr = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    const cap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1)

    const lines = [
      `🙏 *Escala de Louvores*`,
      `📅 *${cap}*`,
      ``,
      ...selected.map((s, i) => {
        const key = s.key ? ` *(Tom: ${s.key})*` : ''
        const ytLine = waIncludeLinks && s.youtubeUrl ? `\n   ▶️ ${s.youtubeUrl}` : ''
        return `${i + 1}. 🎵 *${s.title}*${key}\n   _${s.artist}_${ytLine}`
      }),
    ]
    if (waCustomMsg.trim()) {
      lines.push(``, waCustomMsg.trim())
    } else {
      lines.push(``, `_Que Deus abençoe nosso louvor!_ 🎶`)
    }
    return lines.join('\n')
  }

  async function copyWa() {
    await navigator.clipboard.writeText(buildWaMessage())
    setWaCopied(true)
    setTimeout(() => setWaCopied(false), 2500)
  }

  function openWhatsApp() {
    localStorage.setItem('kb_wa_contact', waPhone)
    const msg = encodeURIComponent(buildWaMessage())
    const phone = waPhone.replace(/\D/g, '')
    if (phone) {
      window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
    } else {
      window.open(`https://wa.me/?text=${msg}`, '_blank')
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const bg = isDark ? 'bg-gray-900' : 'bg-gray-50'
  const panel = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  const muted = isDark ? 'text-gray-400' : 'text-gray-500'
  const heading = isDark ? 'text-white' : 'text-gray-900'
  const inputCls = `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'border-gray-300 bg-white text-gray-900'}`
  const btnPrimary = 'flex items-center gap-2 bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors'
  const btnSecondary = `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`

  return (
    <div className={`h-full flex flex-col ${bg}`}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between px-6 py-4 border-b flex-shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <h1 className={`text-xl font-bold ${heading}`}>Louvores</h1>
          <span className={`text-sm ${muted}`}>{songs.length} músicas</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowWA(true)} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
            </svg>
            Compartilhar
          </button>
          <button onClick={openNew} className={btnPrimary}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nova Música
          </button>
        </div>
      </div>

      {/* ── Main area ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── Song list (left panel) ──────────────────────────────────── */}
        <div className={`w-72 flex-shrink-0 flex flex-col border-r overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          {/* Search + filter */}
          <div className={`p-3 space-y-2 border-b flex-shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="relative">
              <svg className={`w-4 h-4 absolute left-2.5 top-2.5 ${muted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className={`w-full pl-8 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'border-gray-300 bg-white text-gray-900'}`}
              />
            </div>
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className={`w-full px-2 py-1.5 border rounded-lg text-sm focus:outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'border-gray-300 bg-white text-gray-700'}`}
            >
              <option>Todas</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className={`flex flex-col items-center justify-center py-16 ${muted}`}>
                <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <p className="text-sm">Nenhuma música</p>
                {!search && <button onClick={openNew} className="mt-2 text-xs text-orange-400 hover:text-orange-300">+ Adicionar</button>}
              </div>
            )}
            {filtered.map((song) => (
              <button
                key={song.id}
                onClick={() => setSelectedId(song.id)}
                className={`w-full text-left px-4 py-3 border-b transition-colors ${isDark ? 'border-gray-700/50' : 'border-gray-100'}
                  ${selectedId === song.id
                    ? isDark ? 'bg-gray-700' : 'bg-orange-50'
                    : isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
                  }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${heading}`}>{song.title}</p>
                    <p className={`text-xs truncate ${muted}`}>{song.artist}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {song.key && (
                      <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded font-mono font-bold">
                        {song.key}
                      </span>
                    )}
                    <div className="flex items-center gap-1">
                      {song.youtubeUrl && (
                        <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                      )}
                      {song.category && (
                        <span className={`text-xs ${muted}`}>{song.category}</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Song detail (right panel) ───────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedSong ? (
            <>
              {/* Detail header */}
              <div className={`px-6 py-4 border-b flex items-start justify-between gap-4 flex-shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="min-w-0">
                  <h2 className={`text-xl font-bold leading-tight ${heading}`}>{selectedSong.title}</h2>
                  <p className={`text-sm mt-0.5 ${muted}`}>{selectedSong.artist}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {selectedSong.key && (
                      <span className="px-2.5 py-0.5 bg-orange-500/20 text-orange-400 text-sm rounded-lg font-mono font-bold">
                        Tom: {selectedSong.key}
                      </span>
                    )}
                    {selectedSong.category && (
                      <span className={`px-2.5 py-0.5 text-sm rounded-lg ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>
                        {selectedSong.category}
                      </span>
                    )}
                    {selectedSong.bpm && (
                      <span className={`px-2.5 py-0.5 text-sm rounded-lg ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>
                        {selectedSong.bpm} BPM
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(selectedSong)} className={btnSecondary}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Editar
                  </button>
                  <button onClick={() => handleDelete(selectedSong.id)}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Excluir
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className={`flex border-b flex-shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                {([
                  { id: 'letra', label: 'Letra' },
                  { id: 'cifra', label: 'Cifra' },
                  { id: 'youtube', label: 'YouTube' },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                      activeTab === tab.id
                        ? tab.id === 'youtube' ? 'border-red-500 text-red-500' : 'border-orange-400 text-orange-400'
                        : `border-transparent ${muted} hover:text-current`
                    }`}
                  >
                    {tab.id === 'youtube' && (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                    )}
                    {tab.label}
                    {tab.id === 'youtube' && selectedSong.youtubeUrl && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-0.5" />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'letra' && (
                  selectedSong.lyrics ? (
                    <pre className={`text-sm leading-relaxed whitespace-pre-wrap font-sans ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                      {selectedSong.lyrics}
                    </pre>
                  ) : (
                    <div className={`text-center py-12 ${muted}`}>
                      <p className="text-sm mb-2">Nenhuma letra cadastrada</p>
                      <button onClick={() => openEdit(selectedSong)} className="text-xs text-orange-400 hover:text-orange-300">Adicionar letra</button>
                    </div>
                  )
                )}

                {activeTab === 'cifra' && (
                  selectedSong.cifra ? (
                    <pre className={`text-sm leading-relaxed whitespace-pre-wrap font-mono ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                      {selectedSong.cifra}
                    </pre>
                  ) : (
                    <div className={`text-center py-12 ${muted}`}>
                      <p className="text-sm mb-2">Nenhuma cifra cadastrada</p>
                      <button onClick={() => openEdit(selectedSong)} className="text-xs text-orange-400 hover:text-orange-300">Adicionar cifra</button>
                    </div>
                  )
                )}

                {activeTab === 'youtube' && (
                  <div className="space-y-4">
                    {/* Embedded player */}
                    {selectedSong.youtubeUrl && extractYouTubeId(selectedSong.youtubeUrl) ? (
                      <div className="rounded-2xl overflow-hidden shadow-lg">
                        <iframe
                          src={`https://www.youtube.com/embed/${extractYouTubeId(selectedSong.youtubeUrl)}`}
                          className="w-full aspect-video"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          title={selectedSong.title}
                        />
                      </div>
                    ) : selectedSong.youtubeUrl ? (
                      <a
                        href={selectedSong.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-red-500 hover:text-red-400 text-sm font-medium"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                        Abrir no YouTube
                      </a>
                    ) : null}

                    {/* Quick search field */}
                    <div className={`rounded-xl p-4 border ${isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-100 border-gray-200'}`}>
                      <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${muted}`}>
                        {selectedSong.youtubeUrl ? 'Alterar link do YouTube' : 'Adicionar link do YouTube'}
                      </p>
                      <YouTubeField
                        song={selectedSong}
                        isDark={isDark}
                        muted={muted}
                        inputCls={inputCls}
                        onSave={(url) => {
                          const updated = updateSong(selectedSong.id, { youtubeUrl: url || undefined })
                          setSongs((prev) => prev.map((s) => s.id === selectedSong.id ? updated : s))
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={`flex-1 flex flex-col items-center justify-center gap-3 ${muted}`}>
              <svg className="w-16 h-16 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <p className="text-sm">Selecione uma música na lista</p>
              <button onClick={openNew} className={btnPrimary}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Adicionar primeira música
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Add/Edit Song Modal ───────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto">
          <div className={`rounded-2xl w-full max-w-2xl shadow-2xl mb-8 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <h3 className={`font-semibold text-lg ${heading}`}>
                {editingId ? 'Editar Música' : 'Nova Música'}
              </h3>
              <button onClick={() => setShowForm(false)} className={`${muted} hover:${heading}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Row 1: Title + Artist */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Título *</label>
                  <input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Nome da música" className={inputCls} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Artista / Ministério *</label>
                  <input value={form.artist} onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))}
                    placeholder="Nome do artista" className={inputCls} />
                </div>
              </div>

              {/* Row 2: Key + Category + BPM */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Tom</label>
                  <select value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                    className={inputCls}>
                    <option value="">Selecione</option>
                    {MUSICAL_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Categoria</label>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className={inputCls}>
                    <option value="">Selecione</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>BPM</label>
                  <input type="number" value={form.bpm} onChange={(e) => setForm((f) => ({ ...f, bpm: e.target.value }))}
                    placeholder="Ex: 120" className={inputCls} min={40} max={240} />
                </div>
              </div>

              {/* YouTube */}
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Link do YouTube</label>
                <div className="flex gap-2">
                  <input
                    value={form.youtubeUrl}
                    onChange={(e) => setForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={searchYouTube}
                    disabled={!form.title.trim()}
                    title="Buscar no YouTube"
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    Buscar
                  </button>
                </div>
                <p className={`text-xs mt-1 ${muted}`}>Clique em "Buscar" para abrir o YouTube com o nome da música, depois cole o link aqui</p>
              </div>

              {/* Letra */}
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Letra</label>
                <textarea
                  value={form.lyrics}
                  onChange={(e) => setForm((f) => ({ ...f, lyrics: e.target.value }))}
                  rows={6}
                  placeholder="Cole ou digite a letra da música..."
                  className={`${inputCls} resize-y font-sans`}
                />
              </div>

              {/* Cifra */}
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Cifra</label>
                <textarea
                  value={form.cifra}
                  onChange={(e) => setForm((f) => ({ ...f, cifra: e.target.value }))}
                  rows={8}
                  placeholder={`G           Em\nAlegrai-vos no Senhor...\nC           D\nSempre alegrai-vos`}
                  className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
                />
                <p className={`text-xs mt-1 ${muted}`}>Use espaços para alinhar os acordes acima das palavras</p>
              </div>
            </div>

            <div className={`px-6 py-4 border-t flex justify-end gap-3 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <button onClick={() => setShowForm(false)} className={btnSecondary}>Cancelar</button>
              <button
                onClick={saveForm}
                disabled={!form.title.trim() || !form.artist.trim()}
                className="px-5 py-2 bg-black hover:bg-gray-800 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
              >
                {editingId ? 'Salvar alterações' : 'Adicionar música'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WhatsApp Share Modal ──────────────────────────────────────────── */}
      {showWA && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto">
          <div className={`rounded-2xl w-full max-w-lg shadow-2xl mb-8 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            {/* Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
                </svg>
                <h3 className={`font-semibold text-lg ${heading}`}>Compartilhar via WhatsApp</h3>
              </div>
              <button onClick={() => setShowWA(false)} className={muted}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Date */}
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Data do culto</label>
                <input type="date" value={waDate} onChange={(e) => setWaDate(e.target.value)} className={inputCls} />
              </div>

              {/* Song selection */}
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wide mb-2 ${muted}`}>Selecionar músicas</label>
                <div className={`rounded-xl border overflow-hidden divide-y ${isDark ? 'border-gray-700 divide-gray-700' : 'border-gray-200 divide-gray-100'}`}>
                  {songs.length === 0 && (
                    <p className={`text-sm text-center py-4 ${muted}`}>Nenhuma música cadastrada</p>
                  )}
                  {songs.map((song) => (
                    <div key={song.id}>
                      <label
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                          waSelected.has(song.id)
                            ? isDark ? 'bg-green-900/30' : 'bg-green-50'
                            : isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={waSelected.has(song.id)}
                          onChange={() => toggleWaSelection(song.id)}
                          className="accent-green-500 w-4 h-4 flex-shrink-0"
                        />
                        <span className={`flex-1 text-sm font-medium ${heading}`}>{song.title}</span>
                        <span className={`text-xs ${muted}`}>{song.artist}</span>
                        {song.key && (
                          <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded font-mono font-bold">
                            {song.key}
                          </span>
                        )}
                        {/* YouTube status indicator */}
                        {song.youtubeUrl ? (
                          <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" title="Link do YouTube salvo">
                            <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                          </svg>
                        ) : waSelected.has(song.id) ? (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${isDark ? 'bg-gray-600 text-gray-400' : 'bg-gray-200 text-gray-400'}`} title="Sem link do YouTube">
                            sem link
                          </span>
                        ) : null}
                      </label>
                      {/* Inline YouTube link saver — shows only when selected & no link yet */}
                      {waSelected.has(song.id) && !song.youtubeUrl && (
                        <WaYouTubeInline
                          song={song}
                          isDark={isDark}
                          muted={muted}
                          inputCls={inputCls}
                          onSave={(url) => {
                            const updated = updateSong(song.id, { youtubeUrl: url || undefined })
                            setSongs((prev) => prev.map((s) => s.id === song.id ? updated : s))
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Include YouTube links toggle */}
              {songs.some((s) => waSelected.has(s.id) && s.youtubeUrl) && (
                <label className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer ${isDark ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
                  <input
                    type="checkbox"
                    checked={waIncludeLinks}
                    onChange={(e) => setWaIncludeLinks(e.target.checked)}
                    className="accent-red-500 w-4 h-4"
                  />
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  <span className={`text-sm ${heading}`}>Incluir links do YouTube na mensagem</span>
                </label>
              )}

              {/* Custom message */}
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Mensagem final (opcional)</label>
                <input
                  value={waCustomMsg}
                  onChange={(e) => setWaCustomMsg(e.target.value)}
                  placeholder="Ex: Nos encontramos às 19h. Que Deus abençoe!"
                  className={inputCls}
                />
              </div>

              {/* WhatsApp contact */}
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>
                  Número / grupo (opcional)
                </label>
                <input
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  placeholder="55119xxxxxxxx  (com código do país, sem espaços)"
                  className={inputCls}
                />
                <p className={`text-xs mt-1 ${muted}`}>
                  Deixe em branco para escolher o destino no WhatsApp
                </p>
              </div>

              {/* Preview */}
              {waSelected.size > 0 && (
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${muted}`}>Pré-visualização da mensagem</label>
                  <pre className={`text-xs leading-relaxed whitespace-pre-wrap p-3 rounded-xl font-sans ${isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                    {buildWaMessage()}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={`px-6 py-4 border-t flex items-center gap-3 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={copyWa}
                disabled={waSelected.size === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
              >
                {waCopied ? (
                  <>
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copiado!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copiar mensagem
                  </>
                )}
              </button>
              <button
                onClick={openWhatsApp}
                disabled={waSelected.size === 0}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
                </svg>
                Abrir WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
