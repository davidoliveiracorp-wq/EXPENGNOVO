import { useMemo, useState, FormEvent } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { getUsers, getBirthdays, createBirthday, updateBirthday, deleteBirthday } from '../lib/storage'
import { User, Birthday } from '../types'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

// Parse YYYY-MM-DD evitando timezone: Date(iso) interpreta como UTC.
function parseBirthday(iso: string): { year: number; month: number; day: number } | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2]) // 1-12
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

function computeAge(year: number, month: number, day: number, refDate: Date): number {
  let age = refDate.getFullYear() - year
  const mNow = refDate.getMonth() + 1
  const dNow = refDate.getDate()
  if (mNow < month || (mNow === month && dNow < day)) age -= 1
  return age
}

export default function AniversariantesPage() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const today = new Date()
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth() + 1)
  const [viewMode, setViewMode] = useState<'mes' | 'todos'>('mes')
  const [listLayout, setListLayout] = useState<'cards' | 'lista'>('cards')
  const [refreshKey, setRefreshKey] = useState(0)

  // ── Formulário de novo / edição ──────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formDay, setFormDay] = useState<string>('')
  const [formMonth, setFormMonth] = useState<number>(today.getMonth() + 1)
  const [formYear, setFormYear] = useState<string>('')
  const [formError, setFormError] = useState('')

  function resetForm() {
    setEditingId(null)
    setFormName('')
    setFormDay('')
    setFormMonth(today.getMonth() + 1)
    setFormYear('')
    setFormError('')
  }

  function openCreateForm() {
    resetForm()
    setFormMonth(selectedMonth)
    setShowForm(true)
  }

  function openEditForm(b: Birthday) {
    setEditingId(b.id)
    setFormName(b.name)
    setFormDay(String(b.day))
    setFormMonth(b.month)
    setFormYear(b.year ? String(b.year) : '')
    setFormError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    resetForm()
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const name = formName.trim()
    const day = Number(formDay)
    const month = formMonth
    const yearNum = formYear.trim() ? Number(formYear) : undefined

    if (!name) { setFormError('Informe o nome.'); return }
    if (!Number.isInteger(day) || day < 1 || day > 31) { setFormError('Dia inválido (1–31).'); return }
    if (!Number.isInteger(month) || month < 1 || month > 12) { setFormError('Mês inválido.'); return }
    if (yearNum !== undefined && (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > today.getFullYear())) {
      setFormError(`Ano inválido (1900–${today.getFullYear()}).`); return
    }

    try {
      if (editingId) {
        updateBirthday(editingId, { name, day, month, year: yearNum })
      } else {
        createBirthday({ name, day, month, year: yearNum })
      }
      setSelectedMonth(month)
      setRefreshKey((k) => k + 1)
      closeForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar.')
    }
  }

  function handleDeleteStandalone(b: Birthday) {
    if (!confirm(`Remover "${b.name}" da lista de aniversariantes?`)) return
    deleteBirthday(b.id)
    setRefreshKey((k) => k + 1)
  }

  const users = useMemo<User[]>(() => getUsers(), [refreshKey])
  const standalone = useMemo<Birthday[]>(() => getBirthdays(), [refreshKey])
  const standaloneById = useMemo(() => {
    const map = new Map<string, Birthday>()
    for (const b of standalone) map.set(b.id, b)
    return map
  }, [standalone])

  type Entry = {
    id: string
    name: string
    email?: string
    phone?: string
    day: number
    month: number
    year?: number
    age?: number
    isToday: boolean
    kind: 'user' | 'standalone'
  }

  const allEntries = useMemo<Entry[]>(() => {
    const out: Entry[] = []
    const todayMonth = today.getMonth() + 1
    const todayDay = today.getDate()

    for (const u of users) {
      const parsed = parseBirthday(u.birthday || '')
      if (!parsed) continue
      const age = computeAge(parsed.year, parsed.month, parsed.day, today)
      out.push({
        id: `u:${u.id}`,
        name: u.name,
        email: u.email,
        phone: u.phone,
        day: parsed.day,
        month: parsed.month,
        year: parsed.year,
        age,
        isToday: parsed.month === todayMonth && parsed.day === todayDay,
        kind: 'user',
      })
    }

    for (const b of standalone) {
      // Evita duplicar quando o standalone tem o mesmo nome de um usuário já listado.
      const dupe = out.some(
        (e) => e.kind === 'user' && e.name.toLowerCase().trim() === b.name.toLowerCase().trim()
      )
      if (dupe) continue
      const age = b.year ? computeAge(b.year, b.month, b.day, today) : undefined
      out.push({
        id: `b:${b.id}`,
        name: b.name,
        day: b.day,
        month: b.month,
        year: b.year,
        age,
        isToday: b.month === todayMonth && b.day === todayDay,
        kind: 'standalone',
      })
    }

    out.sort((a, b) => a.month - b.month || a.day - b.day || a.name.localeCompare(b.name))
    return out
  }, [users, standalone, today])

  const monthEntries = useMemo<Entry[]>(
    () => allEntries.filter((e) => e.month === selectedMonth),
    [allEntries, selectedMonth]
  )

  const entriesByMonth = useMemo<Record<number, Entry[]>>(() => {
    const map: Record<number, Entry[]> = {}
    for (const e of allEntries) {
      if (!map[e.month]) map[e.month] = []
      map[e.month].push(e)
    }
    return map
  }, [allEntries])

  const usersSemAniver = useMemo(
    () => users.filter((u) => !parseBirthday(u.birthday || '')).length,
    [users]
  )

  const bg = isDark ? 'bg-gray-900' : 'bg-gray-50'
  const heading = isDark ? 'text-white' : 'text-gray-900'
  const muted = isDark ? 'text-gray-400' : 'text-gray-500'
  const panel = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  const cardBase = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  const isCurrentMonth = selectedMonth === today.getMonth() + 1

  function renderEntryRow(entry: Entry) {
    const waLink = entry.phone ? `https://wa.me/${entry.phone}` : null
    return (
      <tr
        key={entry.id}
        className={`border-b transition-colors ${
          entry.isToday
            ? 'bg-pink-500/10 border-pink-500/40'
            : isDark ? 'border-gray-700 hover:bg-gray-700/30' : 'border-gray-200 hover:bg-gray-50'
        }`}
      >
        <td className="py-2 px-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
              entry.isToday ? 'bg-pink-600 text-white' : entry.kind === 'standalone' ? 'bg-amber-600 text-white' : 'bg-purple-600 text-white'
            }`}>
              {getInitials(entry.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-medium truncate ${heading}`}>{entry.name}</span>
                {entry.isToday && (
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-pink-600 text-white">hoje</span>
                )}
                {entry.kind === 'standalone' && (
                  <span className={`text-[9px] uppercase px-1 py-0.5 rounded ${isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>contato</span>
                )}
              </div>
            </div>
          </div>
        </td>
        <td className={`py-2 px-3 text-xs ${muted} hidden md:table-cell`}>
          <span className="truncate inline-block max-w-[200px] align-middle">{entry.email || '—'}</span>
        </td>
        <td className={`py-2 px-3 text-sm whitespace-nowrap ${heading}`}>
          {String(entry.day).padStart(2, '0')}/{String(entry.month).padStart(2, '0')}
          {entry.year ? <span className={`text-[10px] ${muted}`}>/{entry.year}</span> : null}
        </td>
        <td className={`py-2 px-3 text-xs whitespace-nowrap ${muted} hidden sm:table-cell`}>
          {entry.age !== undefined && entry.age >= 0 && entry.age < 130
            ? `${entry.age} ano${entry.age !== 1 ? 's' : ''}`
            : '—'}
        </td>
        <td className="py-2 px-3 text-right">
          <div className="inline-flex items-center gap-1">
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                title="WhatsApp"
                className="p-1.5 rounded-lg text-green-400 hover:text-green-300 hover:bg-green-500/10"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.089.534 4.05 1.474 5.757L.057 23.882a.5.5 0 00.61.61l6.126-1.416A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.908 0-3.697-.503-5.244-1.382l-.376-.215-3.896.9.915-3.851-.234-.382A9.945 9.945 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
              </a>
            )}
            {entry.kind === 'standalone' && (
              <>
                <button
                  onClick={() => {
                    const b = standaloneById.get(entry.id.replace(/^b:/, ''))
                    if (b) openEditForm(b)
                  }}
                  title="Editar"
                  className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    const b = standaloneById.get(entry.id.replace(/^b:/, ''))
                    if (b) handleDeleteStandalone(b)
                  }}
                  title="Excluir"
                  className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-red-500/20 text-gray-400 hover:text-red-400' : 'hover:bg-red-50 text-gray-500 hover:text-red-600'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    )
  }

  function renderEntryCard(entry: Entry) {
    const waLink = entry.phone ? `https://wa.me/${entry.phone}` : null
    return (
      <div
        key={entry.id}
        className={`rounded-2xl border p-4 flex gap-3 items-start transition-colors ${
          entry.isToday ? 'bg-pink-500/10 border-pink-500/50' : cardBase
        }`}
      >
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
          entry.isToday ? 'bg-pink-600 text-white' : entry.kind === 'standalone' ? 'bg-amber-600 text-white' : 'bg-purple-600 text-white'
        }`}>
          {getInitials(entry.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-semibold text-sm truncate ${heading}`}>{entry.name}</p>
            {entry.isToday && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-pink-600 text-white">
                🎉 hoje
              </span>
            )}
            {entry.kind === 'standalone' && (
              <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                contato
              </span>
            )}
          </div>
          {entry.email && <p className={`text-xs truncate ${muted}`}>{entry.email}</p>}
          <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
            <span className={`flex items-center gap-1 ${heading}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {String(entry.day).padStart(2, '0')}/{String(entry.month).padStart(2, '0')}
            </span>
            {entry.age !== undefined && entry.age >= 0 && entry.age < 130 && (
              <span className={muted}>
                {entry.isToday ? `faz ${entry.age + (entry.age === 0 ? 1 : 0)} ano${entry.age === 0 ? '' : 's'} hoje` : `${entry.age} ano${entry.age !== 1 ? 's' : ''}`}
              </span>
            )}
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-green-400 hover:text-green-300"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.089.534 4.05 1.474 5.757L.057 23.882a.5.5 0 00.61.61l6.126-1.416A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.908 0-3.697-.503-5.244-1.382l-.376-.215-3.896.9.915-3.851-.234-.382A9.945 9.945 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
                WhatsApp
              </a>
            )}
          </div>
        </div>
        {entry.kind === 'standalone' && (
          <div className="flex flex-col gap-1 flex-shrink-0">
            <button
              onClick={() => {
                const b = standaloneById.get(entry.id.replace(/^b:/, ''))
                if (b) openEditForm(b)
              }}
              title="Editar"
              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => {
                const b = standaloneById.get(entry.id.replace(/^b:/, ''))
                if (b) handleDeleteStandalone(b)
              }}
              title="Excluir"
              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-red-500/20 text-gray-400 hover:text-red-400' : 'hover:bg-red-50 text-gray-500 hover:text-red-600'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`min-h-full ${bg} p-6`}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className={`text-xl font-bold ${heading}`}>Aniversariantes</h2>
          <p className={`text-sm mt-0.5 ${muted}`}>
            {viewMode === 'mes'
              ? `${monthEntries.length} ${monthEntries.length === 1 ? 'aniversariante' : 'aniversariantes'} em ${MONTHS[selectedMonth - 1]}`
              : `${allEntries.length} ${allEntries.length === 1 ? 'aniversariante' : 'aniversariantes'} no total`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle Mês / Todos */}
          <div className={`flex rounded-lg overflow-hidden border ${isDark ? 'border-gray-700' : 'border-gray-300'}`}>
            <button
              onClick={() => setViewMode('mes')}
              className={`px-3 py-2 text-sm transition-colors ${
                viewMode === 'mes'
                  ? 'bg-pink-600 text-white'
                  : isDark ? 'bg-gray-800 text-gray-300 hover:text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Mês
            </button>
            <button
              onClick={() => setViewMode('todos')}
              className={`px-3 py-2 text-sm transition-colors ${
                viewMode === 'todos'
                  ? 'bg-pink-600 text-white'
                  : isDark ? 'bg-gray-800 text-gray-300 hover:text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Todos
            </button>
          </div>

          {/* Sub-toggle Cards / Lista — só aparece em "Todos" */}
          {viewMode === 'todos' && (
            <div className={`flex rounded-lg overflow-hidden border ${isDark ? 'border-gray-700' : 'border-gray-300'}`}>
              <button
                onClick={() => setListLayout('cards')}
                title="Visualizar em cards"
                className={`p-2 transition-colors ${
                  listLayout === 'cards'
                    ? 'bg-black text-white'
                    : isDark ? 'bg-gray-800 text-gray-400 hover:text-white' : 'bg-white text-gray-500 hover:text-gray-900'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setListLayout('lista')}
                title="Visualizar em lista"
                className={`p-2 transition-colors ${
                  listLayout === 'lista'
                    ? 'bg-black text-white'
                    : isDark ? 'bg-gray-800 text-gray-400 hover:text-white' : 'bg-white text-gray-500 hover:text-gray-900'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          )}
          {viewMode === 'mes' && (
            <>
              <label className={`text-xs ${muted}`}>Mês:</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className={`px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 ${isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}{i + 1 === today.getMonth() + 1 ? ' (atual)' : ''}</option>
                ))}
              </select>
            </>
          )}
          <button
            onClick={showForm ? closeForm : openCreateForm}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              showForm
                ? isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'bg-pink-600 text-white hover:bg-pink-700'
            }`}
          >
            {showForm ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Fechar
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Novo
              </>
            )}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className={`mb-6 rounded-2xl border p-4 ${panel}`}
        >
          <p className={`text-sm font-semibold mb-3 ${heading}`}>
            {editingId ? 'Editar aniversariante' : 'Novo aniversariante'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5">
              <label className={`block text-xs mb-1 ${muted}`}>Nome *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nome completo"
                autoFocus
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={`block text-xs mb-1 ${muted}`}>Dia *</label>
              <input
                type="number"
                min={1}
                max={31}
                value={formDay}
                onChange={(e) => setFormDay(e.target.value)}
                placeholder="DD"
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
              />
            </div>
            <div className="sm:col-span-3">
              <label className={`block text-xs mb-1 ${muted}`}>Mês *</label>
              <select
                value={formMonth}
                onChange={(e) => setFormMonth(Number(e.target.value))}
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={`block text-xs mb-1 ${muted}`}>Ano</label>
              <input
                type="number"
                min={1900}
                max={today.getFullYear()}
                value={formYear}
                onChange={(e) => setFormYear(e.target.value)}
                placeholder="opc."
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
              />
            </div>
          </div>
          {formError && (
            <p className="text-xs text-red-400 mt-2">{formError}</p>
          )}
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-sm font-medium transition-colors"
            >
              {editingId ? 'Salvar alterações' : 'Cadastrar'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {viewMode === 'todos' ? (
        allEntries.length === 0 ? (
          <div className={`rounded-2xl border p-8 text-center ${panel}`}>
            <svg className={`w-12 h-12 mx-auto mb-3 ${muted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 14h16v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6zM4 14a2 2 0 012-2h12a2 2 0 012 2M8 14V9m8 5V9M12 8c1-2 3-2 3 0s-3 3-3 3-3-1-3-3 2-2 3 0z" />
            </svg>
            <p className={`text-sm ${heading}`}>
              Nenhum aniversariante cadastrado.
            </p>
            <p className={`text-xs mt-2 ${muted}`}>
              Use o botão "Novo" para começar a lista.
            </p>
          </div>
        ) : listLayout === 'lista' ? (
          <div className={`rounded-2xl border overflow-hidden ${panel}`}>
            <table className="w-full">
              <thead>
                <tr className={`text-left text-[10px] uppercase tracking-wide ${muted} ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
                  <th className="py-2 px-3 font-semibold">Nome</th>
                  <th className="py-2 px-3 font-semibold hidden md:table-cell">E-mail</th>
                  <th className="py-2 px-3 font-semibold">Data</th>
                  <th className="py-2 px-3 font-semibold hidden sm:table-cell">Idade</th>
                  <th className="py-2 px-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              {MONTHS.map((monthName, idx) => {
                const m = idx + 1
                const entries = entriesByMonth[m] || []
                if (entries.length === 0) return null
                const isMesAtual = m === today.getMonth() + 1
                return (
                  <tbody key={m}>
                    <tr className={isDark ? 'bg-gray-900/40' : 'bg-gray-100/60'}>
                      <td colSpan={5} className={`py-1.5 px-3 text-xs font-semibold uppercase tracking-wide ${heading}`}>
                        {monthName}
                        {isMesAtual && (
                          <span className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-pink-600 text-white normal-case tracking-normal">
                            mês atual
                          </span>
                        )}
                        <span className={`ml-2 text-[10px] font-normal normal-case tracking-normal ${muted}`}>
                          · {entries.length} {entries.length === 1 ? 'pessoa' : 'pessoas'}
                        </span>
                      </td>
                    </tr>
                    {entries.map(renderEntryRow)}
                  </tbody>
                )
              })}
            </table>
          </div>
        ) : (
          <div className="space-y-6">
            {MONTHS.map((monthName, idx) => {
              const m = idx + 1
              const entries = entriesByMonth[m] || []
              if (entries.length === 0) return null
              const isMesAtual = m === today.getMonth() + 1
              return (
                <div key={m}>
                  <h3 className={`text-sm font-semibold uppercase tracking-wide mb-3 flex items-center gap-2 ${heading}`}>
                    {monthName}
                    {isMesAtual && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-pink-600 text-white normal-case tracking-normal">
                        mês atual
                      </span>
                    )}
                    <span className={`text-xs font-normal normal-case tracking-normal ${muted}`}>
                      · {entries.length} {entries.length === 1 ? 'pessoa' : 'pessoas'}
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {entries.map(renderEntryCard)}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : monthEntries.length === 0 ? (
        <div className={`rounded-2xl border p-8 text-center ${panel}`}>
          <svg className={`w-12 h-12 mx-auto mb-3 ${muted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 14h16v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6zM4 14a2 2 0 012-2h12a2 2 0 012 2M8 14V9m8 5V9M12 8c1-2 3-2 3 0s-3 3-3 3-3-1-3-3 2-2 3 0z" />
          </svg>
          <p className={`text-sm ${heading}`}>
            Nenhum aniversariante em {MONTHS[selectedMonth - 1]}{isCurrentMonth ? ' por enquanto' : ''}.
          </p>
          {usersSemAniver > 0 && (
            <p className={`text-xs mt-2 ${muted}`}>
              {usersSemAniver} usuário{usersSemAniver !== 1 ? 's' : ''} ainda não cadastr{usersSemAniver !== 1 ? 'aram' : 'ou'} a data de nascimento no perfil.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {monthEntries.map(renderEntryCard)}
        </div>
      )}

      {usersSemAniver > 0 && (viewMode === 'todos' ? allEntries.length > 0 : monthEntries.length > 0) && (
        <p className={`text-xs mt-6 ${muted}`}>
          {usersSemAniver} usuário{usersSemAniver !== 1 ? 's' : ''} ainda não cadastr{usersSemAniver !== 1 ? 'aram' : 'ou'} a data de nascimento.
        </p>
      )}
    </div>
  )
}
