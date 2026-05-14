import { useMemo, useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { getUsers } from '../lib/storage'
import { User } from '../types'

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

  const users = useMemo<User[]>(() => getUsers(), [])

  const monthUsers = useMemo(() => {
    type Entry = { user: User; day: number; month: number; year: number; age: number; isToday: boolean }
    const out: Entry[] = []
    for (const u of users) {
      const parsed = parseBirthday(u.birthday || '')
      if (!parsed) continue
      if (parsed.month !== selectedMonth) continue
      const age = computeAge(parsed.year, parsed.month, parsed.day, today)
      const isToday =
        parsed.month === today.getMonth() + 1 && parsed.day === today.getDate()
      out.push({ user: u, day: parsed.day, month: parsed.month, year: parsed.year, age, isToday })
    }
    out.sort((a, b) => a.day - b.day || a.user.name.localeCompare(b.user.name))
    return out
  }, [users, selectedMonth, today])

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

  return (
    <div className={`min-h-full ${bg} p-6`}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className={`text-xl font-bold ${heading}`}>Aniversariantes</h2>
          <p className={`text-sm mt-0.5 ${muted}`}>
            {monthUsers.length} {monthUsers.length === 1 ? 'aniversariante' : 'aniversariantes'} em {MONTHS[selectedMonth - 1]}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {monthUsers.length === 0 ? (
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
          {monthUsers.map((entry) => {
            const u = entry.user
            const waLink = u.phone ? `https://wa.me/${u.phone}` : null
            return (
              <div
                key={u.id}
                className={`rounded-2xl border p-4 flex gap-3 items-start transition-colors ${
                  entry.isToday
                    ? 'bg-pink-500/10 border-pink-500/50'
                    : cardBase
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  entry.isToday ? 'bg-pink-600 text-white' : 'bg-purple-600 text-white'
                }`}>
                  {getInitials(u.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-semibold text-sm truncate ${heading}`}>{u.name}</p>
                    {entry.isToday && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-pink-600 text-white">
                        🎉 hoje
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${muted}`}>{u.email}</p>
                  <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
                    <span className={`flex items-center gap-1 ${heading}`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {String(entry.day).padStart(2, '0')}/{String(entry.month).padStart(2, '0')}
                    </span>
                    {entry.age >= 0 && entry.age < 130 && (
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
              </div>
            )
          })}
        </div>
      )}

      {usersSemAniver > 0 && monthUsers.length > 0 && (
        <p className={`text-xs mt-6 ${muted}`}>
          {usersSemAniver} usuário{usersSemAniver !== 1 ? 's' : ''} ainda não cadastr{usersSemAniver !== 1 ? 'aram' : 'ou'} a data de nascimento.
        </p>
      )}
    </div>
  )
}
