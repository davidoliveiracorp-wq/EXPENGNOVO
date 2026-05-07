import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { getBoards } from '../lib/storage'
import { Board, Card, Column, User } from '../types'

/* ─── helpers ─────────────────────────────────────────────── */
function ini(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

function isOverdue(card: Card) {
  if (!card.dueDate) return false
  return new Date(card.dueDate + 'T00:00:00') < new Date(new Date().toDateString())
}

function isDueSoon(card: Card) {
  if (!card.dueDate || isOverdue(card)) return false
  return (new Date(card.dueDate + 'T00:00:00').getTime() - Date.now()) / 86400000 <= 3
}

function lastCol(board: Board): Column | null {
  if (!board.columns.length) return null
  return [...board.columns].sort((a, b) => b.order - a.order)[0]
}

function doneCards(board: Board): Card[] {
  const lc = lastCol(board)
  return lc ? lc.cards : []
}

function totalCards(board: Board) {
  return board.columns.reduce((s, c) => s + c.cards.length, 0)
}

function overdueCards(board: Board): Card[] {
  return board.columns.flatMap((c) => c.cards.filter(isOverdue))
}

function dueSoonCards(board: Board): Card[] {
  return board.columns.flatMap((c) => c.cards.filter(isDueSoon))
}

function checklistSummary(card: Card) {
  const total = card.checklists.reduce((s, cl) => s + cl.items.length, 0)
  const done = card.checklists.reduce((s, cl) => s + cl.items.filter((i) => i.completed).length, 0)
  return total > 0 ? { total, done } : null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ─── member activity ─────────────────────────────────────── */
function getMemberActivity(boards: Board[]): { user: User; boardCount: number; cardCount: number; overdueCount: number }[] {
  const map = new Map<string, { user: User; boardCount: number; cardCount: number; overdueCount: number }>()
  boards.forEach((board) => {
    const memberIds = new Set<string>()
    board.members.forEach((m) => {
      if (!map.has(m.userId)) map.set(m.userId, { user: m.user, boardCount: 0, cardCount: 0, overdueCount: 0 })
      if (!memberIds.has(m.userId)) {
        map.get(m.userId)!.boardCount++
        memberIds.add(m.userId)
      }
    })
    board.columns.forEach((col) => {
      col.cards.forEach((card) => {
        card.members.forEach((cm) => {
          if (!map.has(cm.userId)) map.set(cm.userId, { user: cm.user, boardCount: 0, cardCount: 0, overdueCount: 0 })
          map.get(cm.userId)!.cardCount++
          if (isOverdue(card)) map.get(cm.userId)!.overdueCount++
        })
      })
    })
  })
  return [...map.values()].sort((a, b) => b.cardCount - a.cardCount)
}

/* ─── export helpers ──────────────────────────────────────── */
function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob(['﻿' + content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function exportCSV(boards: Board[]) {
  const rows: string[][] = [
    ['Quadro', 'Descrição do Quadro', 'Coluna', 'Cartão', 'Descrição', 'Data Vencimento', 'Status',
      'Membros do Cartão', 'Checklists (feito/total)', 'Anexos', 'Criado em'],
  ]
  boards.forEach((board) => {
    const lc = lastCol(board)
    board.columns.forEach((col) => {
      if (col.cards.length === 0) {
        rows.push([board.title, board.description || '', col.title, '(sem cartões)', '', '', '', '', '', '', ''])
      }
      col.cards.forEach((card) => {
        const status = isOverdue(card) ? 'Atrasado' : col.id === lc?.id ? 'Concluído' : isDueSoon(card) ? 'Vence em breve' : 'Em andamento'
        const cl = checklistSummary(card)
        rows.push([
          board.title,
          board.description || '',
          col.title,
          card.title,
          card.description || '',
          card.dueDate ? new Date(card.dueDate + 'T00:00:00').toLocaleDateString('pt-BR') : '',
          status,
          card.members.map((m) => m.user.name).join(' | '),
          cl ? `${cl.done}/${cl.total}` : '',
          String(card.attachments.length),
          fmtDate(card.createdAt),
        ])
      })
    })
  })
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  triggerDownload(csv, `relatorio-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8')
}

function exportXLS(boards: Board[], memberActivity: ReturnType<typeof getMemberActivity>) {
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  const tStyle = 'style="border:1px solid #ccc;padding:6px 10px;font-size:12px;"'
  const thStyle = 'style="border:1px solid #999;padding:7px 10px;background:#1a1a2e;color:#fff;font-size:12px;font-weight:bold;"'
  const shStyle = 'style="border:1px solid #aaa;padding:7px 10px;background:#e8e4f3;color:#333;font-size:12px;font-weight:bold;"'

  function tableRow(cells: string[], header = false): string {
    const tag = header ? 'th' : 'td'
    const s = header ? thStyle : tStyle
    return `<tr>${cells.map((c) => `<${tag} ${s}>${c}</${tag}>`).join('')}</tr>`
  }

  // ── Resumo geral ──
  const totalT = boards.reduce((s, b) => s + totalCards(b), 0)
  const totalD = boards.reduce((s, b) => s + doneCards(b).length, 0)
  const totalO = boards.reduce((s, b) => s + overdueCards(b).length, 0)
  const pct = totalT > 0 ? Math.round((totalD / totalT) * 100) : 0

  let html = `
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="UTF-8"><style>
    body{font-family:Calibri,Arial,sans-serif}
    .section-title{font-size:16px;font-weight:bold;color:#1a1a2e;padding:10px 0 4px}
    .sub-title{font-size:13px;color:#555;padding:6px 0 2px}
    table{border-collapse:collapse;width:100%;margin-bottom:20px}
  </style></head><body>
  <h1 style="font-size:20px;color:#1a1a2e;margin-bottom:4px">📊 Relatório de Progresso</h1>
  <p style="color:#666;font-size:12px;margin:0 0 20px">Gerado em ${today}</p>

  <div class="section-title">Resumo Geral</div>
  <table>
    ${tableRow(['Quadros', 'Total de Tarefas', 'Concluídas', '% Concluído', 'Atrasadas', 'Em andamento'], true)}
    ${tableRow([String(boards.length), String(totalT), String(totalD), `${pct}%`, String(totalO), String(totalT - totalD)])}
  </table>`

  // ── Atividade por membro ──
  html += `<div class="section-title">Atividade por Membro</div>
  <table>
    ${tableRow(['Nome', 'E-mail', 'Quadros', 'Cartões atribuídos', 'Cartões atrasados'], true)}`
  memberActivity.forEach((ma) => {
    html += tableRow([ma.user.name, ma.user.email, String(ma.boardCount), String(ma.cardCount), ma.overdueCount > 0 ? `⚠ ${ma.overdueCount}` : '0'])
  })
  html += '</table>'

  // ── Por quadro ──
  html += `<div class="section-title">Detalhamento por Quadro</div>`
  boards.forEach((board) => {
    const tot = totalCards(board)
    const don = doneCards(board).length
    const ov = overdueCards(board).length
    const pctB = tot > 0 ? Math.round((don / tot) * 100) : 0
    const lc = lastCol(board)

    html += `<div class="sub-title" style="color:#1a1a2e;font-size:14px;font-weight:bold;border-left:4px solid ${board.background};padding-left:8px;margin-top:16px">
      ${board.title}${board.description ? ` — ${board.description}` : ''}
      <span style="font-size:11px;color:#666;font-weight:normal;margin-left:10px">${don}/${tot} concluídas (${pctB}%) | ${ov > 0 ? `⚠ ${ov} atrasadas` : 'Sem atrasos'}</span>
    </div>
    <table>
      ${tableRow(['Coluna', 'Cartão', 'Descrição', 'Vencimento', 'Status', 'Membros', 'Checklist', 'Anexos'], true)}`

    board.columns.forEach((col) => {
      const isLastC = col.id === lc?.id
      if (col.cards.length === 0) {
        html += `<tr><td ${shStyle}>${col.title}</td><td colspan="7" ${tStyle} style="color:#aaa;font-style:italic">Sem cartões</td></tr>`
      } else {
        col.cards.forEach((card, i) => {
          const ov2 = isOverdue(card)
          const ds = isDueSoon(card)
          const status = ov2 ? '🔴 Atrasado' : isLastC ? '✅ Concluído' : ds ? '🟡 Vence em breve' : '🔵 Em andamento'
          const cl = checklistSummary(card)
          const bgCard = ov2 ? '#fff5f5' : isLastC ? '#f0fff4' : '#fff'
          html += `<tr style="background:${bgCard}">
            ${i === 0 ? `<td rowspan="${col.cards.length}" ${shStyle}>${col.title}</td>` : ''}
            <td ${tStyle}>${card.title}</td>
            <td ${tStyle}>${card.description || ''}</td>
            <td ${tStyle}>${card.dueDate ? new Date(card.dueDate + 'T00:00:00').toLocaleDateString('pt-BR') : ''}</td>
            <td ${tStyle}>${status}</td>
            <td ${tStyle}>${card.members.map((m) => m.user.name).join(', ')}</td>
            <td ${tStyle}>${cl ? `${cl.done}/${cl.total}` : '—'}</td>
            <td ${tStyle}>${card.attachments.length || '—'}</td>
          </tr>`
        })
      }
    })
    html += '</table>'
  })

  html += '</body></html>'
  triggerDownload(html, `relatorio-${new Date().toISOString().slice(0, 10)}.xls`, 'application/vnd.ms-excel')
}

/* ─── component ───────────────────────────────────────────── */
export default function RelatoriosPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [boards, setBoards] = useState<Board[]>([])
  const [expandedBoards, setExpandedBoards] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (user) setBoards(getBoards(user.id))
  }, [user])

  function toggleExpand(id: string) {
    setExpandedBoards((s) => {
      const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
    })
  }

  // ── global stats ──────────────────────────────────────────
  const totalT   = boards.reduce((s, b) => s + totalCards(b), 0)
  const totalD   = boards.reduce((s, b) => s + doneCards(b).length, 0)
  const totalO   = boards.reduce((s, b) => s + overdueCards(b).length, 0)
  const totalDS  = boards.reduce((s, b) => s + dueSoonCards(b).length, 0)
  const totalM   = new Set(boards.flatMap((b) => b.members.map((m) => m.userId))).size
  const pctGlobal = totalT > 0 ? Math.round((totalD / totalT) * 100) : 0
  const memberActivity = getMemberActivity(boards)

  // ── styles ────────────────────────────────────────────────
  const bg      = isDark ? 'bg-gray-900' : 'bg-gray-50'
  const hdg     = isDark ? 'text-white' : 'text-gray-900'
  const muted   = isDark ? 'text-gray-400' : 'text-gray-500'
  const card    = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  const tbl     = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  const tblTh   = isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-50 text-gray-600'
  const tblTd   = isDark ? 'border-gray-700 text-gray-300' : 'border-gray-100 text-gray-700'

  return (
    <>
      {/* ── Print-only global styles ────────────────────────────── */}
      <style>{`
        @media print {
          @page { margin: 15mm; size: A4; }
          body { background: white !important; color: black !important; }
          .print-hide { display: none !important; }
          .print-card { break-inside: avoid; page-break-inside: avoid; background: white !important; border: 1px solid #ddd !important; }
          .print-board { page-break-before: auto; }
          .print-table td, .print-table th { border: 1px solid #ccc !important; padding: 4px 8px !important; color: black !important; background: white !important; }
          .print-table th { background: #f0f0f0 !important; font-weight: bold !important; }
          .print-tag { border: 1px solid #aaa !important; color: #333 !important; background: white !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className={`min-h-full ${bg} p-6 print:bg-white print:p-0`}>
        <div className="max-w-5xl mx-auto">

          {/* ── Header ─────────────────────────────────────────── */}
          <div className="flex items-start justify-between mb-8 print-hide">
            <div>
              <h2 className={`text-2xl font-bold ${hdg}`}>Relatórios</h2>
              <p className={`text-sm mt-1 ${muted}`}>
                Gerado em {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportCSV(boards)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                CSV
              </button>
              <button
                onClick={() => exportXLS(boards, memberActivity)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Planilha XLS
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-black hover:bg-gray-800 text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Imprimir PDF
              </button>
            </div>
          </div>

          {/* Print header (only visible on print) */}
          <div className="hidden print:block mb-6 border-b border-gray-300 pb-4">
            <h1 className="text-2xl font-bold text-gray-900">📊 Relatório de Progresso</h1>
            <p className="text-sm text-gray-500 mt-1">Gerado em {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>

          {/* ── Summary stat cards ─────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            {[
              { label: 'Quadros',       value: boards.length, color: 'bg-purple-500',  icon: '📋' },
              { label: 'Tarefas',       value: totalT,        color: 'bg-blue-500',    icon: '📝' },
              { label: 'Concluídas',    value: totalD,        color: 'bg-green-500',   icon: '✅', sub: `${pctGlobal}%` },
              { label: 'Atrasadas',     value: totalO,        color: totalO > 0 ? 'bg-red-500' : 'bg-gray-400', icon: '🔴' },
              { label: 'Vence em 3d',   value: totalDS,       color: totalDS > 0 ? 'bg-yellow-500' : 'bg-gray-400', icon: '🟡' },
              { label: 'Membros',       value: totalM,        color: 'bg-indigo-500',  icon: '👥' },
            ].map((s) => (
              <div key={s.label} className={`print-card rounded-2xl border p-4 shadow-sm text-center ${card}`}>
                <div className={`w-9 h-9 ${s.color} rounded-xl flex items-center justify-center mx-auto mb-2 text-lg`}>{s.icon}</div>
                <p className={`text-2xl font-bold ${hdg}`}>{s.value}</p>
                {s.sub && <p className="text-xs font-semibold text-green-500">{s.sub}</p>}
                <p className={`text-[11px] mt-0.5 ${muted}`}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── Global progress ────────────────────────────────── */}
          {totalT > 0 && (
            <div className={`print-card rounded-2xl border p-5 mb-8 shadow-sm ${card}`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-sm font-semibold ${hdg}`}>Progresso geral</p>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-green-500 font-bold">{totalD} concluídas</span>
                  {totalO > 0 && <span className="text-red-400 font-bold">{totalO} atrasadas</span>}
                  {totalDS > 0 && <span className="text-yellow-500 font-bold">{totalDS} vencem em breve</span>}
                  <span className={`font-bold text-base ${pctGlobal >= 80 ? 'text-green-500' : pctGlobal >= 40 ? 'text-yellow-500' : 'text-red-400'}`}>
                    {pctGlobal}%
                  </span>
                </div>
              </div>
              {/* Stacked progress bar */}
              <div className={`h-4 rounded-full overflow-hidden flex ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <div className="bg-green-500 h-full transition-all duration-700" style={{ width: `${totalT > 0 ? (totalD / totalT) * 100 : 0}%` }} title={`Concluídas: ${totalD}`} />
                <div className="bg-yellow-400 h-full transition-all duration-700" style={{ width: `${totalT > 0 ? (totalDS / totalT) * 100 : 0}%` }} title={`Vencem em breve: ${totalDS}`} />
                <div className="bg-red-400 h-full transition-all duration-700" style={{ width: `${totalT > 0 ? (totalO / totalT) * 100 : 0}%` }} title={`Atrasadas: ${totalO}`} />
              </div>
              <div className="flex items-center gap-4 mt-2 text-[11px]">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Concluído</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />Vence em breve</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Atrasado</span>
                <span className={`flex items-center gap-1 ${muted}`}><span className={`w-2.5 h-2.5 rounded-full inline-block ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`} />Em andamento</span>
              </div>
            </div>
          )}

          {/* ── Member activity table ──────────────────────────── */}
          {memberActivity.length > 0 && (
            <div className={`print-card rounded-2xl border shadow-sm mb-8 overflow-hidden ${tbl}`}>
              <div className={`px-5 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} flex items-center gap-2`}>
                <span className="text-lg">👥</span>
                <p className={`font-semibold text-sm ${hdg}`}>Atividade por Membro</p>
              </div>
              <div className="overflow-x-auto">
                <table className={`w-full text-sm print-table`}>
                  <thead>
                    <tr className={tblTh}>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold">Membro</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold">Quadros</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold">Cartões atribuídos</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold">Atrasados</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold">E-mail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberActivity.map((ma) => (
                      <tr key={ma.user.id} className={`border-t ${tblTd}`}>
                        <td className={`px-4 py-2.5 border-r ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                              {ini(ma.user.name)}
                            </div>
                            <span className={`font-medium text-xs ${hdg}`}>{ma.user.name}</span>
                          </div>
                        </td>
                        <td className={`px-4 py-2.5 text-center text-xs border-r ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>{ma.boardCount}</td>
                        <td className={`px-4 py-2.5 text-center text-xs border-r ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                          <span className={`font-semibold ${ma.cardCount > 0 ? 'text-blue-400' : muted}`}>{ma.cardCount}</span>
                        </td>
                        <td className={`px-4 py-2.5 text-center text-xs border-r ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                          {ma.overdueCount > 0
                            ? <span className="text-red-400 font-semibold">⚠ {ma.overdueCount}</span>
                            : <span className="text-green-500">✓</span>}
                        </td>
                        <td className={`px-4 py-2.5 text-xs ${muted}`}>{ma.user.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Per-board detailed section ─────────────────────── */}
          <div className="flex items-center justify-between mb-4">
            <p className={`text-base font-bold ${hdg}`}>Detalhamento por Quadro</p>
            <button
              onClick={() => setExpandedBoards(expandedBoards.size === boards.length ? new Set() : new Set(boards.map((b) => b.id)))}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors print-hide ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
            >
              {expandedBoards.size === boards.length ? 'Recolher todos' : 'Expandir todos'}
            </button>
          </div>

          {boards.length === 0 && (
            <div className={`text-center py-16 ${muted}`}>
              <p className="text-lg font-medium">Nenhum quadro encontrado</p>
              <p className="text-sm mt-1">Crie quadros para ver relatórios aqui</p>
            </div>
          )}

          <div className="space-y-4">
            {boards.map((board) => {
              const tot   = totalCards(board)
              const don   = doneCards(board).length
              const ov    = overdueCards(board)
              const ds    = dueSoonCards(board)
              const pct   = tot > 0 ? Math.round((don / tot) * 100) : 0
              const lc    = lastCol(board)
              const isExp = expandedBoards.has(board.id)

              return (
                <div key={board.id} className={`print-card print-board rounded-2xl border shadow-sm overflow-hidden ${card}`}>
                  {/* Board header */}
                  <button
                    className="w-full text-left print-hide"
                    onClick={() => toggleExpand(board.id)}
                  >
                    <div className="flex items-center gap-3 px-5 py-4" style={{ borderLeft: `4px solid ${board.background}` }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold text-sm ${hdg}`}>{board.title}</p>
                          {ov.length > 0 && <span className="text-xs bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full font-medium">⚠ {ov.length} atrasada{ov.length !== 1 ? 's' : ''}</span>}
                          {ds.length > 0 && <span className="text-xs bg-yellow-500/15 text-yellow-500 px-2 py-0.5 rounded-full font-medium">🕐 {ds.length} vencem em breve</span>}
                        </div>
                        {board.description && <p className={`text-xs mt-0.5 ${muted}`}>{board.description}</p>}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="flex -space-x-1">
                          {board.members.slice(0, 4).map((m) => (
                            <div key={m.id} className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white border border-white/20" style={{ background: board.background }} title={m.user.name}>
                              {ini(m.user.name)}
                            </div>
                          ))}
                          {board.members.length > 4 && <span className={`text-xs ml-1 ${muted}`}>+{board.members.length - 4}</span>}
                        </div>
                        <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${pct >= 80 ? 'bg-green-500/15 text-green-500' : pct >= 40 ? 'bg-yellow-500/15 text-yellow-500' : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                          {pct}%
                        </span>
                        <svg className={`w-4 h-4 transition-transform ${muted} ${isExp ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {/* Print-only board header (always visible on print) */}
                  <div className="hidden print:block px-5 py-3" style={{ borderLeft: `4px solid ${board.background}` }}>
                    <p className="font-bold text-gray-900">{board.title}</p>
                    {board.description && <p className="text-xs text-gray-500">{board.description}</p>}
                    <p className="text-xs text-gray-600 mt-1">{don}/{tot} concluídas ({pct}%) | Membros: {board.members.map((m) => m.user.name).join(', ')}</p>
                  </div>

                  {/* Progress bar (always shown) */}
                  <div className="px-5 pt-2 pb-1">
                    <div className={`h-2 rounded-full overflow-hidden flex ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <div className="bg-green-500 h-full" style={{ width: `${tot > 0 ? (don / tot) * 100 : 0}%` }} />
                      <div className="bg-yellow-400 h-full" style={{ width: `${tot > 0 ? (ds.length / tot) * 100 : 0}%` }} />
                      <div className="bg-red-400 h-full" style={{ width: `${tot > 0 ? (ov.length / tot) * 100 : 0}%` }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px]">
                      <span className={muted}>{don} concluída{don !== 1 ? 's' : ''} · {tot - don} pendente{tot - don !== 1 ? 's' : ''}</span>
                      <span className={muted}>{tot} total</span>
                    </div>
                  </div>

                  {/* Expanded / print content */}
                  {(isExp || true) && (
                    <div className={`${isExp ? 'block' : 'hidden'} print:block`}>
                      {/* Column summary row */}
                      <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[...board.columns].sort((a, b) => a.order - b.order).map((col) => {
                          const isLast = col.id === lc?.id
                          return (
                            <div key={col.id} className={`rounded-xl px-3 py-2 text-center ${isLast ? isDark ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200' : isDark ? 'bg-gray-700/50' : 'bg-gray-50 border border-gray-100'}`}>
                              <p className={`text-xl font-bold ${isLast ? 'text-green-500' : hdg}`}>{col.cards.length}</p>
                              <p className={`text-[10px] truncate ${isLast ? 'text-green-500/70' : muted}`}>{col.title}</p>
                            </div>
                          )
                        })}
                      </div>

                      {/* Card table per column */}
                      {board.columns.length > 0 && (
                        <div className="px-5 pb-5">
                          <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <table className="w-full text-xs print-table">
                              <thead>
                                <tr className={tblTh}>
                                  <th className="px-3 py-2 text-left w-28">Coluna</th>
                                  <th className="px-3 py-2 text-left">Cartão</th>
                                  <th className="px-3 py-2 text-left hidden sm:table-cell">Descrição</th>
                                  <th className="px-3 py-2 text-center">Vencimento</th>
                                  <th className="px-3 py-2 text-center">Status</th>
                                  <th className="px-3 py-2 text-center hidden md:table-cell">Membros</th>
                                  <th className="px-3 py-2 text-center hidden md:table-cell">Checklist</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...board.columns].sort((a, b) => a.order - b.order).map((col) => {
                                  const isLastC = col.id === lc?.id
                                  if (col.cards.length === 0) {
                                    return (
                                      <tr key={col.id} className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                                        <td className={`px-3 py-2 font-medium ${hdg}`} style={{ borderLeft: `3px solid ${col.color}` }}>{col.title}</td>
                                        <td colSpan={6} className={`px-3 py-2 italic ${muted}`}>Sem cartões</td>
                                      </tr>
                                    )
                                  }
                                  return col.cards.map((c, i) => {
                                    const ov2 = isOverdue(c)
                                    const ds2 = isDueSoon(c)
                                    const cl  = checklistSummary(c)
                                    const rowBg = ov2
                                      ? isDark ? 'bg-red-900/20' : 'bg-red-50'
                                      : isLastC
                                        ? isDark ? 'bg-green-900/20' : 'bg-green-50'
                                        : ds2
                                          ? isDark ? 'bg-yellow-900/20' : 'bg-yellow-50'
                                          : ''
                                    return (
                                      <tr key={c.id} className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-100'} ${rowBg}`}>
                                        {i === 0 && (
                                          <td
                                            rowSpan={col.cards.length}
                                            className={`px-3 py-2 font-medium align-top ${hdg}`}
                                            style={{ borderLeft: `3px solid ${col.color}`, borderRight: `1px solid ${isDark ? '#374151' : '#f3f4f6'}` }}
                                          >
                                            {col.title}
                                            <span className={`ml-1 text-[10px] ${muted}`}>({col.cards.length})</span>
                                          </td>
                                        )}
                                        <td className={`px-3 py-2 font-medium ${hdg} max-w-[160px]`}>
                                          {c.labels.length > 0 && (
                                            <div className="flex flex-wrap gap-0.5 mb-1">
                                              {c.labels.map((l) => (
                                                <span key={l.id} className="print-tag px-1 py-0 rounded text-[9px] font-bold text-white" style={{ background: l.color }}>{l.text}</span>
                                              ))}
                                            </div>
                                          )}
                                          <span className="truncate block">{c.title}</span>
                                        </td>
                                        <td className={`px-3 py-2 hidden sm:table-cell ${muted} max-w-[200px]`}>
                                          <span className="line-clamp-2">{c.description || '—'}</span>
                                        </td>
                                        <td className="px-3 py-2 text-center whitespace-nowrap">
                                          {c.dueDate ? (
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ov2 ? 'bg-red-500/15 text-red-400' : ds2 ? 'bg-yellow-500/15 text-yellow-500' : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                                              {new Date(c.dueDate + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                            </span>
                                          ) : <span className={muted}>—</span>}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                            ov2 ? 'bg-red-500/15 text-red-400' :
                                            isLastC ? 'bg-green-500/15 text-green-500' :
                                            ds2 ? 'bg-yellow-500/15 text-yellow-500' :
                                            isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                                          }`}>
                                            {ov2 ? '🔴 Atrasado' : isLastC ? '✅ Concluído' : ds2 ? '🟡 Em breve' : '🔵 Andamento'}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-center hidden md:table-cell">
                                          {c.members.length > 0 ? (
                                            <div className="flex justify-center -space-x-1">
                                              {c.members.slice(0, 3).map((m) => (
                                                <div key={m.id} title={m.user.name} className="w-5 h-5 rounded-full bg-purple-600 border border-white/20 flex items-center justify-center text-[8px] font-bold text-white">
                                                  {ini(m.user.name)}
                                                </div>
                                              ))}
                                              {c.members.length > 3 && <span className={`text-[10px] ml-1 ${muted}`}>+{c.members.length - 3}</span>}
                                            </div>
                                          ) : <span className={muted}>—</span>}
                                        </td>
                                        <td className="px-3 py-2 text-center hidden md:table-cell">
                                          {cl ? (
                                            <span className={`text-[10px] font-medium ${cl.done === cl.total ? 'text-green-500' : muted}`}>
                                              {cl.done}/{cl.total}
                                            </span>
                                          ) : <span className={muted}>—</span>}
                                        </td>
                                      </tr>
                                    )
                                  })
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {tot === 0 && (
                        <p className={`px-5 pb-5 text-xs italic ${muted}`}>Nenhuma tarefa neste quadro ainda.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
