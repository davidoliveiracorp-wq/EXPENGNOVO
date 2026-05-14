import { useRef, useState, ChangeEvent } from 'react'
import { Board, Card, Checklist, Column, Label, User } from '../types'
import {
  updateCard, deleteCard, addCardMember, removeCardMember,
  addChecklist, deleteChecklist, updateChecklist, addChecklistItem,
  toggleChecklistItem, deleteChecklistItem,
  addAttachment, removeAttachment,
  moveCard, addBoardMember,
} from '../lib/storage'
import { useTheme } from '../contexts/ThemeContext'

interface Props {
  card: Card
  boardId: string
  boardTitle: string
  boardMembers: User[]
  allUsers: User[]
  columns: Column[]
  onClose: () => void
  onBoardUpdate: (board: Board) => void
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const LABEL_COLORS = [
  '#61bd4f', '#f2d600', '#ff9f1a', '#eb5a46', '#c377e0',
  '#0079bf', '#00c2e0', '#51e898', '#ff78cb', '#344563',
]

export default function CardModal({ card, boardId, boardTitle, boardMembers, allUsers, columns, onClose, onBoardUpdate }: Props) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Title
  const [editTitle, setEditTitle] = useState(false)
  const [title, setTitle] = useState(card.title)

  // Description
  const [description, setDescription] = useState(card.description || '')
  const [editDesc, setEditDesc] = useState(false)

  // Due date
  const [dueDate, setDueDate] = useState(card.dueDate || '')
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Labels
  const [showLabels, setShowLabels] = useState(false)
  const [labelText, setLabelText] = useState('')
  const [labelColor, setLabelColor] = useState(LABEL_COLORS[0])

  // Checklist
  const [addingChecklist, setAddingChecklist] = useState(false)
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({})

  // Members
  const [addingMember, setAddingMember] = useState(false)

  // Assignee picker (description | checklist:<id>)
  const [assigneeOpen, setAssigneeOpen] = useState<string | null>(null)

  // Notificação de atribuição (modal pós-ação) — envio manual via
  // Gmail compose / WhatsApp. O auto-send via /api/send-notification
  // está desligado por enquanto (será reativado quando a infra de SMTP
  // estiver configurada).
  type AssignmentNotice = { users: User[]; context: string }
  const [assignmentNotice, setAssignmentNotice] = useState<AssignmentNotice | null>(null)

  // Move
  const [showMove, setShowMove] = useState(false)

  // Cover
  const coverInputRef = useRef<HTMLInputElement>(null)

  // Attachments
  const attachInputRef = useRef<HTMLInputElement>(null)

  function sync(result: { board: Board; card: Card }) {
    onBoardUpdate(result.board)
  }

  // ── Title ──────────────────────────────────────────────────────────────────
  function saveTitle() {
    if (!title.trim()) return
    sync(updateCard(boardId, card.id, { title }))
    setEditTitle(false)
  }

  // ── Description ────────────────────────────────────────────────────────────
  function saveDesc() {
    sync(updateCard(boardId, card.id, { description }))
    setEditDesc(false)
  }

  // ── Due date ───────────────────────────────────────────────────────────────
  function saveDueDate(val: string) {
    setDueDate(val)
    sync(updateCard(boardId, card.id, { dueDate: val || undefined }))
    setShowDatePicker(false)
  }

  function removeDueDate() {
    setDueDate('')
    sync(updateCard(boardId, card.id, { dueDate: undefined }))
    setShowDatePicker(false)
  }

  // ── Description due date ──────────────────────────────────────────────────
  function setDescriptionDueDate(val: string) {
    sync(updateCard(boardId, card.id, { descriptionDueDate: val || undefined }))
  }

  // ── Checklist due date ────────────────────────────────────────────────────
  function setChecklistDueDate(checklistId: string, val: string) {
    sync(updateChecklist(boardId, card.id, checklistId, { dueDate: val || undefined }))
  }

  // ── Assignees (descrição e checklist) ─────────────────────────────────────
  function ensureBoardMember(user: User) {
    if (!boardMembers.some((m) => m.id === user.id)) {
      addBoardMember(boardId, user)
    }
  }

  // Abre o modal pós-atribuição para o usuário disparar a notificação
  // manualmente via Gmail compose ou WhatsApp.
  function triggerAssignmentNotice(users: User[], context: string) {
    setAssignmentNotice({ users, context })
  }

  function setDescriptionAssignee(user: User | null) {
    if (user) ensureBoardMember(user)
    sync(updateCard(boardId, card.id, { descriptionAssignee: user ?? undefined }))
    setAssigneeOpen(null)
    if (user) triggerAssignmentNotice([user], 'responsável pela descrição')
  }

  function setChecklistAssignee(checklistId: string, user: User | null) {
    if (user) ensureBoardMember(user)
    sync(updateChecklist(boardId, card.id, checklistId, { assignee: user ?? undefined }))
    setAssigneeOpen(null)
    if (user) {
      const cl = card.checklists.find((c) => c.id === checklistId)
      triggerAssignmentNotice([user], `responsável pela checklist "${cl?.title || ''}"`)
    }
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  function addLabel() {
    if (!labelText.trim()) return
    const newLabel: Label = { id: crypto.randomUUID(), text: labelText.trim(), color: labelColor }
    sync(updateCard(boardId, card.id, { labels: [...card.labels, newLabel] }))
    setLabelText('')
  }

  function removeLabel(labelId: string) {
    sync(updateCard(boardId, card.id, { labels: card.labels.filter((l) => l.id !== labelId) }))
  }

  // ── Cover ──────────────────────────────────────────────────────────────────
  function handleCoverChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = ev.target?.result as string
      sync(updateCard(boardId, card.id, { cover: data }))
    }
    reader.readAsDataURL(file)
  }

  function removeCover() {
    sync(updateCard(boardId, card.id, { cover: undefined }))
  }

  // ── Attachments ────────────────────────────────────────────────────────────
  function handleAttachChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = ev.target?.result as string
      sync(addAttachment(boardId, card.id, file.name, data, isImage))
    }
    reader.readAsDataURL(file)
  }

  function handleRemoveAttachment(attachmentId: string) {
    sync(removeAttachment(boardId, card.id, attachmentId))
  }

  // ── Checklist ──────────────────────────────────────────────────────────────
  function handleAddChecklist() {
    if (!newChecklistTitle.trim()) return
    sync(addChecklist(boardId, card.id, newChecklistTitle))
    setNewChecklistTitle(''); setAddingChecklist(false)
  }

  function handleDeleteChecklist(checklistId: string) {
    sync(deleteChecklist(boardId, card.id, checklistId))
  }

  function handleAddItem(checklistId: string) {
    const text = newItemTexts[checklistId]?.trim()
    if (!text) return
    sync(addChecklistItem(boardId, card.id, checklistId, text))
    setNewItemTexts((p) => ({ ...p, [checklistId]: '' }))
  }

  function handleToggleItem(checklistId: string, itemId: string, completed: boolean) {
    sync(toggleChecklistItem(boardId, card.id, checklistId, itemId, completed))
  }

  function handleDeleteItem(checklistId: string, itemId: string) {
    sync(deleteChecklistItem(boardId, card.id, checklistId, itemId))
  }

  // ── Members ────────────────────────────────────────────────────────────────
  function handleAddMember(user: User) {
    // Se o usuário ainda não é membro do quadro, adiciona — assim ele passa
    // a enxergar o quadro e pode receber a tarefa.
    if (!boardMembers.some((m) => m.id === user.id)) {
      addBoardMember(boardId, user)
    }
    sync(addCardMember(boardId, card.id, user))
    triggerAssignmentNotice([user], 'membro do card')
  }

  function handleRemoveMember(userId: string) {
    sync(removeCardMember(boardId, card.id, userId))
  }

  // ── Move card ──────────────────────────────────────────────────────────────
  function handleMove(destColId: string) {
    const updated = moveCard(boardId, card.id, destColId, 0)
    onBoardUpdate(updated)
    setShowMove(false)
  }

  // ── Delete card ────────────────────────────────────────────────────────────
  function handleDelete() {
    if (!confirm('Excluir este card?')) return
    onBoardUpdate(deleteCard(boardId, card.id))
    onClose()
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getChecklistProgress(cl: Checklist) {
    if (!cl.items.length) return 0
    return Math.round((cl.items.filter((i) => i.completed).length / cl.items.length) * 100)
  }

  function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }

  function formatDate(iso: string) {
    if (!iso) return ''
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('pt-BR')
  }

  function isDueSoon(iso: string) {
    if (!iso) return false
    const due = new Date(iso + 'T00:00:00')
    const now = new Date()
    const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    return diff <= 2 && diff >= 0
  }

  function isDueOverdue(iso: string) {
    if (!iso) return false
    const due = new Date(iso + 'T00:00:00')
    return due < new Date(new Date().toDateString())
  }

  const cardMemberIds = new Set(card.members.map((m) => m.userId))
  // Lista todos os cadastrados (não só membros do quadro) — ao adicionar,
  // o handleAddMember promove a board member automaticamente se necessário.
  const availableMembers = allUsers.filter((u) => !cardMemberIds.has(u.id))

  function renderAssigneePicker(
    pickerKey: string,
    current: User | undefined,
    onSelect: (user: User | null) => void,
  ) {
    const isOpen = assigneeOpen === pickerKey
    return (
      <div className="relative inline-flex items-center">
        {current ? (
          <button
            onClick={() => setAssigneeOpen(isOpen ? null : pickerKey)}
            title={`Responsável: ${current.name}`}
            className={`inline-flex items-center gap-1.5 rounded-full pl-0.5 pr-2 py-0.5 text-[11px] transition-colors ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
          >
            <span className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
              {getInitials(current.name)}
            </span>
            <span className="truncate max-w-[6rem]">{current.name}</span>
          </button>
        ) : (
          <button
            onClick={() => setAssigneeOpen(isOpen ? null : pickerKey)}
            title="Atribuir responsável"
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors border border-dashed ${isDark ? 'border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'border-gray-300 text-gray-500 hover:bg-gray-200 hover:text-gray-700'}`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            atribuir
          </button>
        )}
        {isOpen && (
          <div className={`absolute left-0 top-full mt-1 w-64 p-2 rounded-xl border z-30 shadow-2xl ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between mb-1.5 px-1">
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>Responsável</p>
              <button onClick={() => setAssigneeOpen(null)} className={`text-xs ${muted}`} aria-label="Fechar">✕</button>
            </div>
            {current && (
              <button
                onClick={() => onSelect(null)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 mb-1 ${isDark ? 'hover:bg-gray-600 text-red-300' : 'hover:bg-red-50 text-red-600'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Remover responsável
              </button>
            )}
            <div className="space-y-0.5 max-h-60 overflow-y-auto">
              {allUsers.length === 0 && (
                <p className={`text-xs px-2 py-1 ${muted}`}>Nenhum usuário cadastrado.</p>
              )}
              {allUsers.map((u) => {
                const isBoard = boardMembers.some((m) => m.id === u.id)
                const isCurrent = current?.id === u.id
                return (
                  <button
                    key={u.id}
                    onClick={() => onSelect(u)}
                    disabled={isCurrent}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 ${
                      isCurrent
                        ? isDark ? 'bg-gray-600 text-gray-400 cursor-default' : 'bg-gray-100 text-gray-400 cursor-default'
                        : isDark ? 'hover:bg-gray-600 text-gray-200' : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                      {getInitials(u.name)}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{u.name}</span>
                    {isCurrent && <span className={`text-[9px] ${muted}`}>atual</span>}
                    {!isCurrent && !isBoard && (
                      <span className={`text-[9px] px-1 py-0.5 rounded ${isDark ? 'bg-purple-500/30 text-purple-200' : 'bg-purple-100 text-purple-700'}`}>+ quadro</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }
  const totalItems = card.checklists.reduce((s, cl) => s + cl.items.length, 0)
  const doneItems = card.checklists.reduce((s, cl) => s + cl.items.filter((i) => i.completed).length, 0)

  const modal = isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
  const surface = isDark ? 'bg-gray-700' : 'bg-white'
  const surfaceHover = isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-50'
  const muted = isDark ? 'text-gray-400' : 'text-gray-500'
  const label6 = `text-xs font-semibold uppercase tracking-wide mb-2 ${muted}`
  const btn = `w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 pt-12 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`rounded-2xl w-full max-w-2xl shadow-2xl relative mb-8 overflow-hidden ${modal}`}>

        {/* ── Cover image ──────────────────────────────────────────────────── */}
        {card.cover ? (
          <div className="relative">
            <img src={card.cover} alt="cover" className="w-full h-44 object-cover" />
            <div className="absolute bottom-2 right-2 flex gap-2">
              <button
                onClick={() => coverInputRef.current?.click()}
                className="px-2 py-1 bg-black/50 hover:bg-black/70 text-white text-xs rounded-lg transition-colors"
              >Alterar capa</button>
              <button
                onClick={removeCover}
                className="px-2 py-1 bg-black/50 hover:bg-black/70 text-white text-xs rounded-lg transition-colors"
              >Remover</button>
            </div>
          </div>
        ) : null}

        {/* Hidden inputs */}
        <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
        <input ref={attachInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt" className="hidden" onChange={handleAttachChange} />

        {/* Close button */}
        <button
          onClick={onClose}
          className={`absolute top-3 right-3 z-10 p-1.5 rounded-full transition-colors ${isDark ? 'bg-gray-700/80 text-gray-300 hover:text-white hover:bg-gray-600' : 'bg-white/80 text-gray-500 hover:text-gray-700 hover:bg-white'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-5">
          {/* ── Title ──────────────────────────────────────────────────────── */}
          <div className="mb-4 pr-8">
            {editTitle ? (
              <div className="flex gap-2">
                <input
                  autoFocus value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                  className={`flex-1 text-lg font-bold px-2 py-1 border border-blue-400 rounded focus:outline-none ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
                />
                <button onClick={saveTitle} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Salvar</button>
                <button onClick={() => { setEditTitle(false); setTitle(card.title) }} className={`px-3 py-1 rounded text-sm ${isDark ? 'bg-gray-600 text-gray-200' : 'bg-gray-200 text-gray-700'}`}>✕</button>
              </div>
            ) : (
              <h2
                onClick={() => setEditTitle(true)}
                className={`text-lg font-bold cursor-pointer px-2 py-1 rounded -mx-2 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
              >{card.title}</h2>
            )}
            <p className={`text-xs mt-1 px-2 ${muted}`}>criado por {card.creator.name}</p>
          </div>

          {/* ── Labels row ─────────────────────────────────────────────────── */}
          {card.labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {card.labels.map((lbl) => (
                <span
                  key={lbl.id}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                  style={{ background: lbl.color }}
                >
                  {lbl.text}
                  <button
                    onClick={() => removeLabel(lbl.id)}
                    className="ml-0.5 opacity-70 hover:opacity-100 leading-none"
                  >×</button>
                </span>
              ))}
            </div>
          )}

          {/* ── Due date badge ─────────────────────────────────────────────── */}
          {card.dueDate && (
            <div className="mb-4">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer
                  ${isDueOverdue(card.dueDate)
                    ? 'bg-red-500 text-white'
                    : isDueSoon(card.dueDate)
                      ? 'bg-yellow-400 text-gray-900'
                      : isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'
                  }`}
                onClick={() => setShowDatePicker(!showDatePicker)}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {formatDate(card.dueDate)}
                {isDueOverdue(card.dueDate) && ' · atrasado'}
                {isDueSoon(card.dueDate) && !isDueOverdue(card.dueDate) && ' · em breve'}
              </span>
            </div>
          )}

          <div className="flex gap-4">
            {/* ── Main column ────────────────────────────────────────────── */}
            <div className="flex-1 space-y-5 min-w-0">

              {/* Members strip */}
              {card.members.length > 0 && (
                <div>
                  <p className={label6}>Membros</p>
                  <div className="flex flex-wrap gap-1.5">
                    {card.members.map((m) => (
                      <div key={m.id} className={`flex items-center gap-1.5 rounded-full pl-1 pr-2 py-0.5 text-xs ${isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'}`}>
                        <span className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold">
                          {getInitials(m.user.name)}
                        </span>
                        {m.user.name}
                        <button onClick={() => handleRemoveMember(m.userId)} className={`opacity-60 hover:opacity-100 ml-0.5 leading-none`}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Checklist global progress */}
              {totalItems > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${muted}`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Checklist
                    </div>
                    <span className={`text-xs ${muted}`}>{doneItems}/{totalItems}</span>
                  </div>
                  <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`}>
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${doneItems === totalItems ? 'bg-green-500' : 'bg-blue-500'}`}
                      style={{ width: `${totalItems ? Math.round((doneItems / totalItems) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={label6}>Descrição</p>
                    <input
                      type="date"
                      value={card.descriptionDueDate || ''}
                      onChange={(e) => setDescriptionDueDate(e.target.value)}
                      aria-label="Data da descrição"
                      title="Data atribuída à descrição"
                      className={`text-[11px] px-2 py-0.5 rounded border focus:outline-none focus:border-blue-400 ${
                        card.descriptionDueDate && isDueOverdue(card.descriptionDueDate)
                          ? 'bg-red-500 text-white border-red-600'
                          : card.descriptionDueDate && isDueSoon(card.descriptionDueDate)
                            ? 'bg-yellow-400 text-gray-900 border-yellow-500'
                            : isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-700'
                      }`}
                    />
                    {card.descriptionDueDate && (
                      <button
                        onClick={() => setDescriptionDueDate('')}
                        title="Limpar data"
                        className={`text-xs px-1.5 rounded ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
                      >
                        ✕
                      </button>
                    )}
                    {renderAssigneePicker('description', card.descriptionAssignee, setDescriptionAssignee)}
                  </div>
                  {!editDesc && (
                    <button onClick={() => setEditDesc(true)} className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-600'}`}>
                      Editar
                    </button>
                  )}
                </div>
                {editDesc ? (
                  <div>
                    <textarea
                      autoFocus value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      className={`w-full px-3 py-2 border border-blue-400 rounded-lg focus:outline-none text-sm resize-none ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`}
                    />
                    <div className="flex gap-2 mt-2">
                      <button onClick={saveDesc} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Salvar</button>
                      <button onClick={() => { setEditDesc(false); setDescription(card.description || '') }}
                        className={`px-3 py-1 rounded text-sm ${isDark ? 'bg-gray-600 text-gray-200' : 'bg-gray-200 text-gray-700'}`}>✕</button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => setEditDesc(true)}
                    className={`min-h-[60px] px-3 py-2 rounded-lg cursor-pointer text-sm ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
                  >
                    {description || <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>Adicionar uma descrição mais detalhada...</span>}
                  </div>
                )}
              </div>

              {/* Per-checklist detail */}
              {card.checklists.map((cl) => {
                const pct = getChecklistProgress(cl)
                return (
                  <div key={cl.id}>
                    <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{cl.title}</span>
                        <input
                          type="date"
                          value={cl.dueDate || ''}
                          onChange={(e) => setChecklistDueDate(cl.id, e.target.value)}
                          aria-label={`Data da checklist ${cl.title}`}
                          title="Data atribuída à checklist"
                          className={`text-[11px] px-2 py-0.5 rounded border focus:outline-none focus:border-blue-400 ${
                            cl.dueDate && isDueOverdue(cl.dueDate)
                              ? 'bg-red-500 text-white border-red-600'
                              : cl.dueDate && isDueSoon(cl.dueDate)
                                ? 'bg-yellow-400 text-gray-900 border-yellow-500'
                                : isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-700'
                          }`}
                        />
                        {cl.dueDate && (
                          <button
                            onClick={() => setChecklistDueDate(cl.id, '')}
                            title="Limpar data"
                            className={`text-xs px-1.5 rounded ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
                          >
                            ✕
                          </button>
                        )}
                        {renderAssigneePicker(`checklist:${cl.id}`, cl.assignee, (u) => setChecklistAssignee(cl.id, u))}
                      </div>
                      <button onClick={() => handleDeleteChecklist(cl.id)} className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-400' : 'bg-gray-200 hover:bg-gray-300 text-gray-500'}`}>Excluir</button>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs w-8 text-right ${muted}`}>{pct}%</span>
                      <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`}>
                        <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="space-y-1 mb-2">
                      {cl.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 group">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={(e) => handleToggleItem(cl.id, item.id, e.target.checked)}
                            className="w-4 h-4 accent-blue-600 cursor-pointer flex-shrink-0"
                          />
                          <span className={`flex-1 text-sm ${item.completed ? `line-through ${muted}` : isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                            {item.title}
                          </span>
                          <button
                            onClick={() => handleDeleteItem(cl.id, item.id)}
                            className={`opacity-0 group-hover:opacity-100 transition-opacity ${muted} hover:text-red-500`}
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={newItemTexts[cl.id] || ''}
                        onChange={(e) => setNewItemTexts((p) => ({ ...p, [cl.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddItem(cl.id)}
                        placeholder="Adicionar item..."
                        className={`flex-1 text-sm px-2 py-1 border rounded focus:outline-none focus:border-blue-400 ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'border-gray-300 bg-white'}`}
                      />
                      <button onClick={() => handleAddItem(cl.id)} className={`text-sm px-2 py-1 rounded ${isDark ? 'bg-gray-600 hover:bg-gray-500 text-gray-200' : 'bg-gray-200 hover:bg-gray-300'}`}>+</button>
                    </div>
                  </div>
                )
              })}

              {/* Add checklist form */}
              {addingChecklist && (
                <div className="flex gap-2">
                  <input
                    autoFocus value={newChecklistTitle}
                    onChange={(e) => setNewChecklistTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddChecklist()}
                    placeholder="Título da checklist"
                    className={`flex-1 text-sm px-3 py-2 border border-blue-400 rounded-lg focus:outline-none ${isDark ? 'bg-gray-700 text-white placeholder-gray-500' : 'bg-white'}`}
                  />
                  <button onClick={handleAddChecklist} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">Adicionar</button>
                  <button onClick={() => setAddingChecklist(false)} className={`px-3 py-2 rounded-lg text-sm ${isDark ? 'bg-gray-600 text-gray-200' : 'bg-gray-200'}`}>✕</button>
                </div>
              )}

              {/* ── Attachments ────────────────────────────────────────────── */}
              {card.attachments.length > 0 && (
                <div>
                  <p className={label6}>Anexos</p>
                  <div className="space-y-2">
                    {card.attachments.map((att) => (
                      <div key={att.id} className={`flex items-center gap-3 p-2 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
                        {att.isImage && att.data ? (
                          <img src={att.data} alt={att.filename} className="w-16 h-12 object-cover rounded-md flex-shrink-0" />
                        ) : (
                          <div className={`w-16 h-12 rounded-md flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`}>
                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{att.filename}</p>
                          {att.isImage && att.data && (
                            <a href={att.data} download={att.filename} className="text-xs text-blue-400 hover:text-blue-300">Baixar</a>
                          )}
                        </div>
                        <button onClick={() => handleRemoveAttachment(att.id)} className={`flex-shrink-0 text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-600 hover:bg-gray-500 text-gray-300' : 'bg-gray-300 hover:bg-gray-400 text-gray-600'}`}>
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Sidebar ────────────────────────────────────────────────── */}
            <div className="w-40 space-y-2 flex-shrink-0">
              <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>Adicionar</p>

              {/* Cover */}
              <button onClick={() => coverInputRef.current?.click()} className={btn}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Capa
              </button>

              {/* Labels */}
              <button onClick={() => setShowLabels(!showLabels)} className={btn}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Etiquetas
              </button>

              {/* Date */}
              <button onClick={() => setShowDatePicker(!showDatePicker)} className={btn}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Datas
              </button>

              {/* Checklist */}
              <button onClick={() => setAddingChecklist(true)} className={btn}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Checklist
              </button>

              {/* Attachment */}
              <button onClick={() => attachInputRef.current?.click()} className={btn}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                Anexo
              </button>

              {/* Members */}
              <div className="relative">
                <button onClick={() => setAddingMember(!addingMember)} className={btn}>
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Membros
                </button>
                {addingMember && (
                  <div className={`absolute right-0 top-full mt-1 w-72 p-3 rounded-xl border z-20 shadow-2xl ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-xs font-semibold uppercase ${muted}`}>Adicionar membro</p>
                      <button onClick={() => setAddingMember(false)} className={`text-xs ${muted} hover:opacity-100`} aria-label="Fechar">✕</button>
                    </div>
                    {availableMembers.length > 0 ? (
                      <div className="space-y-1 max-h-72 overflow-y-auto">
                        {availableMembers.map((u) => {
                          const isBoardMember = boardMembers.some((m) => m.id === u.id)
                          return (
                            <button
                              key={u.id}
                              onClick={() => handleAddMember(u)}
                              className={`w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center gap-2 ${isDark ? 'hover:bg-gray-600 text-gray-200' : 'hover:bg-gray-100 text-gray-700'}`}
                            >
                              <span className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {getInitials(u.name)}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block truncate">{u.name}</span>
                                <span className={`block truncate text-[10px] ${muted}`}>{u.email}</span>
                              </span>
                              {!isBoardMember && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-purple-500/30 text-purple-200' : 'bg-purple-100 text-purple-700'}`}>
                                  + quadro
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className={`text-xs ${muted}`}>Todos os usuários cadastrados já estão neste card.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Move */}
              <button onClick={() => { setShowMove(!showMove); setAddingMember(false); setShowLabels(false); setShowDatePicker(false) }} className={btn}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Mover
              </button>

              <div className="pt-1 border-t border-gray-600/30">
                <button onClick={handleDelete}
                  className="w-full text-left px-3 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-sm text-red-400 flex items-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Excluir
                </button>
              </div>
            </div>
          </div>

          {/* ── Popovers (below main layout) ───────────────────────────────── */}

          {/* Labels popover */}
          {showLabels && (
            <div className={`mt-4 p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} shadow-lg`}>
              <p className={`text-xs font-semibold uppercase mb-2 ${muted}`}>Nova etiqueta</p>
              <div className="flex gap-2 flex-wrap mb-2">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setLabelColor(c)}
                    className="w-7 h-7 rounded-md transition-transform hover:scale-110"
                    style={{ background: c, outline: c === labelColor ? '3px solid white' : 'none', outlineOffset: '2px' }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={labelText}
                  onChange={(e) => setLabelText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addLabel()}
                  placeholder="Nome da etiqueta..."
                  className={`flex-1 text-sm px-2 py-1.5 border rounded-lg focus:outline-none focus:border-blue-400 ${isDark ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400' : 'border-gray-300'}`}
                />
                <button onClick={addLabel} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">Criar</button>
              </div>
            </div>
          )}

          {/* Date popover */}
          {showDatePicker && (
            <div className={`mt-4 p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} shadow-lg`}>
              <p className={`text-xs font-semibold uppercase mb-2 ${muted}`}>Data de vencimento</p>
              <div className="flex gap-2 items-center">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={`flex-1 text-sm px-2 py-1.5 border rounded-lg focus:outline-none focus:border-blue-400 ${isDark ? 'bg-gray-600 border-gray-500 text-white' : 'border-gray-300'}`}
                />
                <button onClick={() => saveDueDate(dueDate)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">Salvar</button>
                {card.dueDate && (
                  <button onClick={removeDueDate} className={`px-3 py-1.5 rounded-lg text-sm ${isDark ? 'bg-gray-600 text-gray-200' : 'bg-gray-200 text-gray-700'}`}>Remover</button>
                )}
              </div>
            </div>
          )}

          {/* Move popover */}
          {showMove && (
            <div className={`mt-4 p-3 rounded-xl border ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} shadow-lg`}>
              <p className={`text-xs font-semibold uppercase mb-2 ${muted}`}>Mover para</p>
              <div className="space-y-1">
                {columns.map((col) => {
                  const isCurrent = col.id === card.columnId
                  return (
                    <button
                      key={col.id}
                      onClick={() => !isCurrent && handleMove(col.id)}
                      disabled={isCurrent}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors
                        ${isCurrent
                          ? isDark ? 'bg-gray-600 text-gray-400 cursor-default' : 'bg-gray-100 text-gray-400 cursor-default'
                          : isDark ? 'hover:bg-gray-600 text-gray-200' : 'hover:bg-gray-100 text-gray-700'
                        }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: col.color }} />
                      {col.title}
                      {isCurrent && <span className={`ml-auto text-xs ${muted}`}>atual</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Notificação de atribuição (post-action) ─────────────────────── */}
      {assignmentNotice && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[60] p-4"
          onClick={(e) => e.target === e.currentTarget && setAssignmentNotice(null)}
        >
          <div className="w-full max-w-md bg-gray-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/10">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-purple-600">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm leading-snug">
                    Atribuído: {assignmentNotice.context}
                  </p>
                  <p className="text-white/50 text-xs mt-0.5 truncate">"{card.title}" · {boardTitle}</p>
                </div>
                <button onClick={() => setAssignmentNotice(null)} className="text-white/30 hover:text-white transition-colors flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Assignees list */}
            <div className="px-5 py-3">
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wide mb-3">
                Notificar atribuído{assignmentNotice.users.length > 1 ? 's' : ''}
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {assignmentNotice.users.map((u) => {
                  const boardUrl = `${window.location.origin}/boards/${boardId}`
                  const msgText = `Olá, ${u.name}! 👋\n\nVocê foi atribuído como *${assignmentNotice.context}* no cartão *${card.title}* do quadro *${boardTitle}*.\n\n🔗 Acesse: ${boardUrl}`
                  const emailSubject = encodeURIComponent(`[${boardTitle}] Você foi atribuído: ${card.title}`)
                  const emailBody = encodeURIComponent(`Olá, ${u.name}!\n\nVocê foi atribuído como ${assignmentNotice.context} no cartão "${card.title}" do quadro "${boardTitle}".\n\nAcesse: ${boardUrl}`)
                  const waText = encodeURIComponent(msgText)
                  const initials = u.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()

                  return (
                    <div key={u.id} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">{u.name}</p>
                        <p className="text-white/40 text-[10px] truncate">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          title="Notificar por Email"
                          onClick={() => window.open(
                            `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(u.email)}&su=${emailSubject}&body=${emailBody}`,
                            '_blank'
                          )}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-blue-300 rounded-lg text-[10px] font-medium transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Email
                        </button>
                        {u.phone ? (
                          <button
                            title="Notificar por WhatsApp"
                            onClick={() => window.open(`https://wa.me/${u.phone}?text=${waText}`, '_blank')}
                            className="flex items-center gap-1 px-2 py-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 hover:text-green-300 rounded-lg text-[10px] font-medium transition-colors"
                          >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.089.534 4.05 1.474 5.757L.057 23.882a.5.5 0 00.61.61l6.126-1.416A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.908 0-3.697-.503-5.244-1.382l-.376-.215-3.896.9.915-3.851-.234-.382A9.945 9.945 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                            </svg>
                            WhatsApp
                          </button>
                        ) : (
                          <span className="text-white/20 text-[10px] italic px-1">sem WhatsApp</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-white/10 flex items-center justify-end">
              <button
                onClick={() => setAssignmentNotice(null)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-xl text-xs font-medium transition-colors"
              >
                Pular notificação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
