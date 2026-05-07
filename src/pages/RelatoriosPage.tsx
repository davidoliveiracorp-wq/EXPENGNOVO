import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { getBoards } from '../lib/storage'
import { Board, Card } from '../types'

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

function isOverdue(card: Card) {
  if (!card.dueDate) return false
  return new Date(card.dueDate) < new Date()
}

function getCompletedCount(board: Board) {
  // Cards in last column are considered "done"
  if (!board.columns.length) return 0
  const sorted = [...board.columns].sort((a, b) => b.order - a.order)
  return sorted[0].cards.length
}

function getTotalCards(board: Board) {
  return board.columns.reduce((s, c) => s + c.cards.length, 0)
}

function getOverdueCards(board: Board): Card[] {
  return board.columns.flatMap((col) => col.cards.filter(isOverdue))
}

export default function RelatoriosPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [boards, setBoards] = useState<Board[]>([])

  useEffect(() => {
    if (user) setBoards(getBoards(user.id))
  }, [user])

  // ── Global stats ──────────────────────────────────────────────
  const totalBoards = boards.length
  const totalTasks = boards.reduce((s, b) => s + getTotalCards(b), 0)
  const totalDone = boards.reduce((s, b) => s + getCompletedCount(b), 0)
  const totalOverdue = boards.reduce((s, b) => s + getOverdueCards(b).length, 0)
  const pctDone = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0

  // ── Styles ────────────────────────────────────────────────────
  const bg = isDark ? 'bg-gray-900' : 'bg-gray-50'
  const heading = isDark ? 'text-white' : 'text-gray-900'
  const muted = isDark ? 'text-gray-400' : 'text-gray-500'
  const card = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  const subheading = isDark ? 'text-gray-300' : 'text-gray-700'

  const statCards = [
    {
      label: 'Quadros',
      value: totalBoards,
      color: 'from-purple-600 to-purple-400',
      icon: (
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      ),
    },
    {
      label: 'Total de tarefas',
      value: totalTasks,
      color: 'from-blue-600 to-blue-400',
      icon: (
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      label: 'Concluídas',
      value: totalDone,
      color: 'from-green-600 to-green-400',
      icon: (
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      sub: `${pctDone}% do total`,
    },
    {
      label: 'Atrasadas',
      value: totalOverdue,
      color: totalOverdue > 0 ? 'from-red-600 to-red-400' : 'from-gray-500 to-gray-400',
      icon: (
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ]

  return (
    <div className={`min-h-full ${bg} p-6`}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h2 className={`text-2xl font-bold ${heading}`}>Relatórios</h2>
          <p className={`text-sm mt-1 ${muted}`}>Visão geral do progresso dos seus quadros e tarefas</p>
        </div>

        {/* ── Summary cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((s) => (
            <div key={s.label} className={`rounded-2xl border p-5 shadow-sm ${card}`}>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-3`}>
                {s.icon}
              </div>
              <p className={`text-2xl font-bold ${heading}`}>{s.value}</p>
              <p className={`text-xs mt-0.5 ${muted}`}>{s.label}</p>
              {s.sub && <p className="text-xs text-green-500 mt-1 font-medium">{s.sub}</p>}
            </div>
          ))}
        </div>

        {/* ── Global progress bar ───────────────────────────────── */}
        {totalTasks > 0 && (
          <div className={`rounded-2xl border p-5 mb-8 shadow-sm ${card}`}>
            <div className="flex items-center justify-between mb-3">
              <p className={`text-sm font-semibold ${subheading}`}>Progresso geral</p>
              <span className={`text-sm font-bold ${pctDone >= 80 ? 'text-green-500' : pctDone >= 40 ? 'text-yellow-500' : 'text-red-400'}`}>
                {pctDone}%
              </span>
            </div>
            <div className={`h-3 rounded-full overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <div
                className={`h-full rounded-full transition-all duration-700 ${pctDone >= 80 ? 'bg-green-500' : pctDone >= 40 ? 'bg-yellow-500' : 'bg-red-400'}`}
                style={{ width: `${pctDone}%` }}
              />
            </div>
            <p className={`text-xs mt-2 ${muted}`}>{totalDone} de {totalTasks} tarefas concluídas</p>
          </div>
        )}

        {/* ── Per-board breakdown ───────────────────────────────── */}
        <h3 className={`text-base font-bold mb-4 ${heading}`}>Por quadro</h3>

        {boards.length === 0 && (
          <div className={`text-center py-16 ${muted}`}>
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-lg font-medium">Nenhum quadro encontrado</p>
            <p className="text-sm mt-1">Crie quadros para ver relatórios aqui</p>
          </div>
        )}

        <div className="space-y-4">
          {boards.map((board) => {
            const total = getTotalCards(board)
            const done = getCompletedCount(board)
            const overdue = getOverdueCards(board)
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            const inProgress = total - done

            return (
              <div key={board.id} className={`rounded-2xl border shadow-sm overflow-hidden ${card}`}>
                {/* Board header strip */}
                <div className="flex items-center gap-3 px-5 py-4" style={{ borderLeft: `4px solid ${board.background}` }}>
                  <div>
                    <p className={`font-semibold text-sm ${heading}`}>{board.title}</p>
                    {board.description && <p className={`text-xs mt-0.5 ${muted}`}>{board.description}</p>}
                  </div>
                  <div className="ml-auto flex items-center gap-4">
                    {/* Member avatars */}
                    <div className="flex items-center gap-1">
                      {board.members.slice(0, 4).map((m) => (
                        <div key={m.id}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-white/20"
                          style={{ background: board.background }}
                          title={m.user.name}
                        >
                          {getInitials(m.user.name)}
                        </div>
                      ))}
                      {board.members.length > 4 && (
                        <span className={`text-xs ml-1 ${muted}`}>+{board.members.length - 4}</span>
                      )}
                    </div>
                    {/* Pct badge */}
                    <span className={`text-sm font-bold px-2 py-0.5 rounded-lg ${
                      pct >= 80 ? 'bg-green-500/15 text-green-500' :
                      pct >= 40 ? 'bg-yellow-500/15 text-yellow-500' :
                      isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                    }`}>{pct}%</span>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-3 space-y-4">
                  {/* Progress bar */}
                  <div>
                    <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className={`text-xs ${muted}`}>{done} concluída{done !== 1 ? 's' : ''}</span>
                      <span className={`text-xs ${muted}`}>{inProgress} em andamento</span>
                    </div>
                  </div>

                  {/* Column breakdown */}
                  {board.columns.length > 0 && (
                    <div>
                      <p className={`text-xs font-medium mb-2 ${muted} uppercase tracking-wide`}>Colunas</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {[...board.columns]
                          .sort((a, b) => a.order - b.order)
                          .map((col, idx, arr) => {
                            const isLast = idx === arr.length - 1
                            return (
                              <div key={col.id}
                                className={`rounded-xl px-3 py-2 text-center ${
                                  isLast
                                    ? isDark ? 'bg-green-500/15 border border-green-500/30' : 'bg-green-50 border border-green-200'
                                    : isDark ? 'bg-gray-700/60' : 'bg-gray-50 border border-gray-100'
                                }`}>
                                <p className={`text-lg font-bold ${isLast ? 'text-green-500' : heading}`}>{col.cards.length}</p>
                                <p className={`text-[10px] truncate ${isLast ? 'text-green-500/80' : muted}`}>{col.title}</p>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}

                  {/* Overdue tasks */}
                  {overdue.length > 0 && (
                    <div>
                      <p className={`text-xs font-medium mb-2 text-red-400 uppercase tracking-wide`}>
                        ⚠ {overdue.length} tarefa{overdue.length !== 1 ? 's' : ''} atrasada{overdue.length !== 1 ? 's' : ''}
                      </p>
                      <div className="space-y-1">
                        {overdue.slice(0, 3).map((card) => (
                          <div key={card.id} className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${isDark ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-100'}`}>
                            <svg className="w-3 h-3 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className={`truncate ${isDark ? 'text-red-300' : 'text-red-600'}`}>{card.title}</span>
                            <span className={`ml-auto flex-shrink-0 ${isDark ? 'text-red-400' : 'text-red-400'}`}>
                              {new Date(card.dueDate!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                            </span>
                          </div>
                        ))}
                        {overdue.length > 3 && (
                          <p className={`text-xs ${muted} pl-3`}>+{overdue.length - 3} mais...</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Empty board */}
                  {total === 0 && (
                    <p className={`text-xs ${muted} italic`}>Nenhuma tarefa neste quadro ainda.</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
