import { useState } from 'react'
import { Board, Card, Checklist, User } from '../types'
import {
  updateCard, deleteCard, addCardMember, removeCardMember,
  addChecklist, deleteChecklist, addChecklistItem,
  toggleChecklistItem, deleteChecklistItem,
} from '../lib/storage'

interface Props {
  card: Card
  boardId: string
  boardMembers: User[]
  onClose: () => void
  onBoardUpdate: (board: Board) => void
}

export default function CardModal({ card, boardId, boardMembers, onClose, onBoardUpdate }: Props) {
  const [editTitle, setEditTitle] = useState(false)
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description || '')
  const [editDesc, setEditDesc] = useState(false)
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [addingChecklist, setAddingChecklist] = useState(false)
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({})
  const [addingMember, setAddingMember] = useState(false)

  function sync(result: { board: Board; card: Card }) {
    onBoardUpdate(result.board)
  }

  function saveTitle() {
    if (!title.trim()) return
    sync(updateCard(boardId, card.id, { title }))
    setEditTitle(false)
  }

  function saveDesc() {
    sync(updateCard(boardId, card.id, { description }))
    setEditDesc(false)
  }

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

  function handleAddMember(user: User) {
    sync(addCardMember(boardId, card.id, user))
  }

  function handleRemoveMember(userId: string) {
    sync(removeCardMember(boardId, card.id, userId))
  }

  function handleDelete() {
    if (!confirm('Excluir este card?')) return
    const board = deleteCard(boardId, card.id)
    onBoardUpdate(board)
    onClose()
  }

  function getChecklistProgress(cl: Checklist) {
    if (!cl.items.length) return 0
    return Math.round((cl.items.filter((i) => i.completed).length / cl.items.length) * 100)
  }

  function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }

  const cardMemberIds = new Set(card.members.map((m) => m.userId))
  const availableMembers = boardMembers.filter((u) => !cardMemberIds.has(u.id))
  const totalItems = card.checklists.reduce((s, cl) => s + cl.items.length, 0)
  const doneItems = card.checklists.reduce((s, cl) => s + cl.items.filter((i) => i.completed).length, 0)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-16 overflow-y-auto">
      <div className="bg-gray-100 rounded-2xl w-full max-w-2xl shadow-2xl relative mb-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 z-10"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-6">
          {/* Title */}
          <div className="mb-4">
            {editTitle ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
                  className="flex-1 text-xl font-semibold px-2 py-1 border border-blue-400 rounded focus:outline-none"
                />
                <button onClick={saveTitle} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Salvar</button>
                <button onClick={() => { setEditTitle(false); setTitle(card.title) }} className="px-3 py-1 bg-gray-200 rounded text-sm">✕</button>
              </div>
            ) : (
              <h2
                className="text-xl font-semibold text-gray-900 cursor-pointer hover:bg-gray-200 px-2 py-1 rounded -mx-2"
                onClick={() => setEditTitle(true)}
              >
                {card.title}
              </h2>
            )}
            <p className="text-gray-500 text-sm mt-1 px-2">por {card.creator.name}</p>
          </div>

          <div className="flex gap-6">
            <div className="flex-1 space-y-5 min-w-0">
              {/* Members strip */}
              {card.members.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Membros</p>
                  <div className="flex flex-wrap gap-1">
                    {card.members.map((m) => (
                      <div key={m.id} className="flex items-center gap-1 bg-gray-200 rounded-full px-2 py-1 text-xs text-gray-700">
                        <span className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-medium">
                          {getInitials(m.user.name)}
                        </span>
                        {m.user.name}
                        <button onClick={() => handleRemoveMember(m.userId)} className="text-gray-400 hover:text-gray-600 ml-1">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Checklist summary */}
              {totalItems > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <span>{doneItems}/{totalItems}</span>
                </div>
              )}

              {/* Description */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Descrição</p>
                {editDesc ? (
                  <div>
                    <textarea
                      autoFocus
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-blue-400 rounded-lg focus:outline-none text-sm resize-none"
                    />
                    <div className="flex gap-2 mt-2">
                      <button onClick={saveDesc} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Salvar</button>
                      <button onClick={() => { setEditDesc(false); setDescription(card.description || '') }} className="px-3 py-1 bg-gray-200 rounded text-sm">✕</button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => setEditDesc(true)}
                    className="min-h-[60px] px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg cursor-pointer text-sm text-gray-700"
                  >
                    {description || <span className="text-gray-400">Adicionar descrição...</span>}
                  </div>
                )}
              </div>

              {/* Checklists */}
              {card.checklists.map((cl) => {
                const pct = getChecklistProgress(cl)
                return (
                  <div key={cl.id}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        <span className="font-semibold text-sm text-gray-700">{cl.title}</span>
                      </div>
                      <button onClick={() => handleDeleteChecklist(cl.id)} className="text-xs text-gray-400 hover:text-red-500 bg-gray-200 px-2 py-1 rounded">Excluir</button>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-gray-500 w-8">{pct}%</span>
                      <div className="flex-1 h-2 bg-gray-300 rounded-full overflow-hidden">
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
                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                          />
                          <span className={`flex-1 text-sm ${item.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                            {item.title}
                          </span>
                          <button
                            onClick={() => handleDeleteItem(cl.id, item.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
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
                        className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-400"
                      />
                      <button onClick={() => handleAddItem(cl.id)} className="text-sm px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded">+</button>
                    </div>
                  </div>
                )
              })}

              {/* Add checklist form */}
              {addingChecklist && (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newChecklistTitle}
                    onChange={(e) => setNewChecklistTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddChecklist()}
                    placeholder="Título da checklist"
                    className="flex-1 text-sm px-3 py-2 border border-blue-400 rounded-lg focus:outline-none"
                  />
                  <button onClick={handleAddChecklist} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">Adicionar</button>
                  <button onClick={() => setAddingChecklist(false)} className="px-3 py-2 bg-gray-200 rounded-lg text-sm">✕</button>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="w-36 space-y-2 flex-shrink-0">
              <p className="text-xs font-semibold text-gray-500 uppercase">Ações</p>
              <button
                onClick={() => setAddingChecklist(true)}
                className="w-full text-left px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm text-gray-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Checklist
              </button>

              <button
                onClick={() => setAddingMember(!addingMember)}
                className="w-full text-left px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm text-gray-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Membros
              </button>

              {addingMember && availableMembers.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 space-y-1">
                  {availableMembers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleAddMember(u)}
                      className="w-full text-left px-2 py-1 hover:bg-gray-100 rounded text-sm text-gray-700 flex items-center gap-2"
                    >
                      <span className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs">
                        {getInitials(u.name)}
                      </span>
                      {u.name}
                    </button>
                  ))}
                </div>
              )}

              {addingMember && availableMembers.length === 0 && (
                <p className="text-xs text-gray-400 px-1">Todos os membros do quadro já estão neste card.</p>
              )}

              <button
                onClick={handleDelete}
                className="w-full text-left px-3 py-2 bg-red-100 hover:bg-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Excluir
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
