import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Board, Card, Column, User } from '../types'
import {
  getBoardById, addCard, addColumn, deleteColumn, moveCard,
  addBoardMember, findUserByEmail,
} from '../lib/storage'
import CardModal from '../components/CardModal'

export default function BoardPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [board, setBoard] = useState<Board | null>(null)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [addingCardCol, setAddingCardCol] = useState<string | null>(null)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [addingCol, setAddingCol] = useState(false)
  const [newColTitle, setNewColTitle] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')

  useEffect(() => {
    if (!id) return
    const b = getBoardById(id)
    if (!b) navigate('/')
    else setBoard(b)
  }, [id, navigate])

  function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }

  function handleAddCard(columnId: string) {
    if (!newCardTitle.trim() || !user || !board) return
    const updated = addCard(board.id, columnId, newCardTitle, user)
    setBoard(updated)
    setNewCardTitle(''); setAddingCardCol(null)
  }

  function handleAddColumn() {
    if (!newColTitle.trim() || !board) return
    const updated = addColumn(board.id, newColTitle)
    setBoard(updated)
    setNewColTitle(''); setAddingCol(false)
  }

  function handleDeleteColumn(colId: string) {
    if (!confirm('Excluir esta coluna e todos os cards?') || !board) return
    setBoard(deleteColumn(board.id, colId))
  }

  function handleInvite() {
    if (!inviteEmail.trim() || !board) return
    const found = findUserByEmail(inviteEmail)
    if (!found) { setInviteMsg('Usuário não encontrado'); return }
    const updated = addBoardMember(board.id, found)
    setBoard(updated)
    setInviteMsg('Membro adicionado!'); setInviteEmail('')
  }

  function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination || !board) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const srcCol = board.columns.find((c) => c.id === source.droppableId)!
    const movedCard = srcCol.cards.find((c) => c.id === draggableId)!

    // Optimistic UI update
    const newSrcCards = srcCol.cards.filter((c) => c.id !== draggableId)
    const dstCol = board.columns.find((c) => c.id === destination.droppableId)!
    const newDstCards = destination.droppableId === source.droppableId
      ? [...newSrcCards] : [...dstCol.cards]
    newDstCards.splice(destination.index, 0, { ...movedCard, columnId: destination.droppableId })

    setBoard((b) => b ? {
      ...b,
      columns: b.columns.map((col) => {
        if (col.id === source.droppableId && col.id === destination.droppableId)
          return { ...col, cards: newDstCards }
        if (col.id === source.droppableId) return { ...col, cards: newSrcCards }
        if (col.id === destination.droppableId) return { ...col, cards: newDstCards }
        return col
      }),
    } : b)

    moveCard(board.id, draggableId, destination.droppableId, destination.index)
  }

  function handleBoardUpdate(updated: Board) {
    setBoard(updated)
    if (selectedCard) {
      const found = updated.columns.flatMap((c) => c.cards).find((c) => c.id === selectedCard.id)
      setSelectedCard(found || null)
    }
  }

  function getChecklistSummary(card: Card) {
    const total = card.checklists.reduce((s, cl) => s + cl.items.length, 0)
    const done = card.checklists.reduce((s, cl) => s + cl.items.filter((i) => i.completed).length, 0)
    return total > 0 ? { total, done } : null
  }

  const boardMembers: User[] = board?.members.map((m) => m.user) || []

  if (!board) return (
    <div className="h-full flex items-center justify-center bg-gray-900">
      <div className="text-white text-lg">Carregando...</div>
    </div>
  )

  const isDark = theme === 'dark'

  return (
    <div className="h-full flex flex-col" style={{ background: isDark ? `linear-gradient(135deg, #111827 0%, ${board.background} 50%, #1f2937 100%)` : `linear-gradient(135deg, #e2e8f0 0%, ${board.background}99 50%, #cbd5e1 100%)` }}>
      <header className="bg-black/30 backdrop-blur-sm border-b border-white/10 flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-white/70 hover:text-white transition-colors" title="Voltar aos quadros">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-white font-bold text-lg">{board.title}</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex -space-x-1">
              {board.members.slice(0, 5).map((m) => (
                <div key={m.id} title={m.user.name}
                  className="w-8 h-8 rounded-full bg-white/30 border-2 border-white/50 flex items-center justify-center text-xs font-semibold text-white">
                  {getInitials(m.user.name)}
                </div>
              ))}
              {board.members.length > 5 && (
                <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/50 flex items-center justify-center text-xs text-white">
                  +{board.members.length - 5}
                </div>
              )}
            </div>
            <button
              onClick={() => { setShowInvite(!showInvite); setInviteMsg('') }}
              className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Convidar
            </button>
          </div>
        </div>

        {showInvite && (
          <div className="px-4 pb-3 flex items-center gap-2">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              placeholder="Email do usuário cadastrado..."
              className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-1 focus:ring-white/40 w-72"
            />
            <button onClick={handleInvite} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm">Adicionar</button>
            {inviteMsg && <span className={`text-sm ${inviteMsg.includes('não') ? 'text-red-300' : 'text-green-300'}`}>{inviteMsg}</span>}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-x-auto overflow-y-auto p-4">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 h-full items-start">
            {board.columns.map((col: Column) => (
              <div key={col.id} className="flex-shrink-0 w-72">
                <div className="rounded-xl overflow-hidden shadow-lg" style={{ background: col.color }}>
                  <div className="px-3 py-2.5 flex items-center justify-between">
                    <h3 className="text-white font-semibold text-sm">{col.title}</h3>
                    <div className="flex items-center gap-1">
                      <span className="text-white/60 text-xs">{col.cards.length}</span>
                      <button
                        onClick={() => handleDeleteColumn(col.id)}
                        className="text-white/50 hover:text-white ml-1 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`px-2 pb-2 min-h-[8px] transition-colors ${snapshot.isDraggingOver ? 'bg-black/10' : ''}`}
                      >
                        {col.cards.map((card: Card, index: number) => {
                          const checkSummary = getChecklistSummary(card)
                          const isOverdue = card.dueDate && new Date(card.dueDate + 'T00:00:00') < new Date(new Date().toDateString())
                          const isDueSoon = card.dueDate && !isOverdue && (new Date(card.dueDate + 'T00:00:00').getTime() - Date.now()) / 86400000 <= 2
                          return (
                            <Draggable key={card.id} draggableId={card.id} index={index}>
                              {(prov, snap) => (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  onClick={() => setSelectedCard(card)}
                                  className={`bg-white rounded-lg mb-2 cursor-pointer shadow-sm hover:shadow-md transition-shadow overflow-hidden ${snap.isDragging ? 'shadow-xl rotate-2 opacity-90' : ''}`}
                                >
                                  {/* Cover image */}
                                  {card.cover && (
                                    <img src={card.cover} alt="" className="w-full h-24 object-cover" />
                                  )}

                                  <div className="p-3">
                                    {/* Labels */}
                                    {card.labels.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mb-2">
                                        {card.labels.map((lbl) => (
                                          <span
                                            key={lbl.id}
                                            className="px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                                            style={{ background: lbl.color }}
                                          >{lbl.text}</span>
                                        ))}
                                      </div>
                                    )}

                                    <p className="text-gray-800 text-sm font-medium leading-snug">{card.title}</p>

                                    {card.description && (
                                      <p className="text-gray-500 text-xs mt-1 line-clamp-2">{card.description}</p>
                                    )}

                                    <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {/* Due date badge */}
                                        {card.dueDate && (
                                          <span className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded font-medium ${isOverdue ? 'bg-red-100 text-red-600' : isDueSoon ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            {new Date(card.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                          </span>
                                        )}
                                        {/* Checklist badge */}
                                        {checkSummary && (
                                          <span className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded ${checkSummary.done === checkSummary.total ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                            </svg>
                                            {checkSummary.done}/{checkSummary.total}
                                          </span>
                                        )}
                                        {/* Attachments badge */}
                                        {card.attachments.length > 0 && (
                                          <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                            </svg>
                                            {card.attachments.length}
                                          </span>
                                        )}
                                      </div>
                                      {card.members.length > 0 && (
                                        <div className="flex -space-x-1 ml-auto">
                                          {card.members.slice(0, 3).map((m) => (
                                            <div key={m.id} title={m.user.name}
                                              className="w-5 h-5 rounded-full bg-purple-600 border border-white flex items-center justify-center text-white text-xs font-medium">
                                              {getInitials(m.user.name)}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          )
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>

                  <div className="px-2 pb-2">
                    {addingCardCol === col.id ? (
                      <div className="bg-white rounded-lg p-2">
                        <textarea
                          autoFocus
                          value={newCardTitle}
                          onChange={(e) => setNewCardTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddCard(col.id) } }}
                          placeholder="Título do card..."
                          rows={2}
                          className="w-full text-sm text-gray-800 resize-none focus:outline-none"
                        />
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => handleAddCard(col.id)} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded font-medium transition-colors">Adicionar</button>
                          <button onClick={() => { setAddingCardCol(null); setNewCardTitle('') }} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingCardCol(col.id)}
                        className="w-full flex items-center gap-1 text-white/70 hover:text-white hover:bg-black/10 px-2 py-1.5 rounded-lg text-sm transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Adicionar um cartão
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex-shrink-0 w-72">
              {addingCol ? (
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                  <input
                    autoFocus
                    value={newColTitle}
                    onChange={(e) => setNewColTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
                    placeholder="Título da coluna..."
                    className="w-full px-2 py-1.5 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/40 text-sm focus:outline-none focus:ring-1 focus:ring-white/40 mb-2"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddColumn} className="px-3 py-1.5 bg-white text-gray-800 rounded-lg text-sm font-medium hover:bg-white/90 transition-colors">Adicionar</button>
                    <button onClick={() => { setAddingCol(false); setNewColTitle('') }} className="text-white/60 hover:text-white text-lg leading-none px-1">✕</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingCol(true)}
                  className="w-full flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-4 py-3 rounded-xl border border-white/20 transition-colors text-sm font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Adicionar outra lista
                </button>
              )}
            </div>
          </div>
        </DragDropContext>
      </div>

      {selectedCard && board && (
        <CardModal
          card={selectedCard}
          boardId={board.id}
          boardMembers={boardMembers}
          columns={board.columns}
          onClose={() => setSelectedCard(null)}
          onBoardUpdate={handleBoardUpdate}
        />
      )}
    </div>
  )
}
