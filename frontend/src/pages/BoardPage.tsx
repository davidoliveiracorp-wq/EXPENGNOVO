import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useAuth } from '../contexts/AuthContext'
import { Board, Card, Column, User } from '../types'
import api from '../lib/api'
import CardModal from '../components/CardModal'

export default function BoardPage() {
  const { id } = useParams<{ id: string }>()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [board, setBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)
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
    api.get(`/boards/${id}`)
      .then((r) => setBoard(r.data))
      .catch(() => navigate('/'))
      .finally(() => setLoading(false))
  }, [id, navigate])

  function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }

  async function addCard(columnId: string) {
    if (!newCardTitle.trim()) return
    const { data } = await api.post(`/columns/${columnId}/cards`, { title: newCardTitle })
    setBoard((b) => b ? {
      ...b,
      columns: b.columns.map((col) =>
        col.id === columnId ? { ...col, cards: [...col.cards, data] } : col
      ),
    } : b)
    setNewCardTitle(''); setAddingCardCol(null)
  }

  async function addColumn() {
    if (!newColTitle.trim() || !board) return
    const { data } = await api.post(`/boards/${board.id}/columns`, { title: newColTitle })
    setBoard((b) => b ? { ...b, columns: [...b.columns, { ...data, cards: [] }] } : b)
    setNewColTitle(''); setAddingCol(false)
  }

  async function deleteColumn(colId: string) {
    if (!confirm('Excluir esta coluna e todos os cards?')) return
    await api.delete(`/columns/${colId}`)
    setBoard((b) => b ? { ...b, columns: b.columns.filter((c) => c.id !== colId) } : b)
  }

  async function invite() {
    if (!inviteEmail.trim() || !board) return
    try {
      await api.post(`/boards/${board.id}/members`, { email: inviteEmail })
      setInviteMsg('Membro adicionado com sucesso!')
      setInviteEmail('')
      const { data } = await api.get(`/boards/${board.id}`)
      setBoard(data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setInviteMsg(msg || 'Erro ao convidar')
    }
  }

  async function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination || !board) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const srcCol = board.columns.find((c) => c.id === source.droppableId)!
    const dstCol = board.columns.find((c) => c.id === destination.droppableId)!
    const card = srcCol.cards.find((c) => c.id === draggableId)!

    const newSrcCards = srcCol.cards.filter((c) => c.id !== draggableId)
    const newDstCards = destination.droppableId === source.droppableId
      ? [...newSrcCards] : [...dstCol.cards]
    newDstCards.splice(destination.index, 0, { ...card, columnId: destination.droppableId })

    setBoard((b) => {
      if (!b) return b
      return {
        ...b,
        columns: b.columns.map((col) => {
          if (col.id === source.droppableId && col.id === destination.droppableId)
            return { ...col, cards: newDstCards }
          if (col.id === source.droppableId) return { ...col, cards: newSrcCards }
          if (col.id === destination.droppableId) return { ...col, cards: newDstCards }
          return col
        }),
      }
    })

    await api.patch(`/cards/${draggableId}/move`, {
      columnId: destination.droppableId,
      order: destination.index,
    })
  }

  function handleCardUpdate(updated: Card) {
    setSelectedCard(updated)
    setBoard((b) => b ? {
      ...b,
      columns: b.columns.map((col) => ({
        ...col,
        cards: col.cards.map((c) => c.id === updated.id ? updated : c),
      })),
    } : b)
  }

  function handleCardDelete(cardId: string) {
    setSelectedCard(null)
    setBoard((b) => b ? {
      ...b,
      columns: b.columns.map((col) => ({
        ...col,
        cards: col.cards.filter((c) => c.id !== cardId),
      })),
    } : b)
  }

  function getChecklistSummary(card: Card) {
    const total = card.checklists.reduce((s, cl) => s + cl.items.length, 0)
    const done = card.checklists.reduce((s, cl) => s + cl.items.filter((i) => i.completed).length, 0)
    return total > 0 ? { total, done } : null
  }

  const boardMembers: User[] = board?.members.map((m) => m.user) || []

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-purple-700 to-fuchsia-600">
        <div className="text-white text-lg">Carregando...</div>
      </div>
    )
  }

  if (!board) return null

  return (
    <div className="min-h-screen flex flex-col" style={{ background: `linear-gradient(135deg, #3b0764 0%, ${board.background} 50%, #86198f 100%)` }}>
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-sm border-b border-white/10 flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-white/70 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-white font-bold text-lg">{board.title}</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex -space-x-1">
              {board.members.slice(0, 5).map((m) => (
                <div
                  key={m.id}
                  title={m.user.name}
                  className="w-8 h-8 rounded-full bg-white/30 border-2 border-white/50 flex items-center justify-center text-xs font-semibold text-white"
                >
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
              onClick={() => setShowInvite(!showInvite)}
              className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Convidar
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold text-white">
                {getInitials(user?.name || 'U')}
              </div>
              <button onClick={logout} className="text-white/60 hover:text-white text-sm transition-colors hidden sm:block">Sair</button>
            </div>
          </div>
        </div>

        {showInvite && (
          <div className="px-4 pb-3 flex items-center gap-2">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && invite()}
              placeholder="Email do usuário..."
              className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-1 focus:ring-white/40 w-64"
            />
            <button onClick={invite} className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm">Adicionar</button>
            {inviteMsg && <span className="text-white/70 text-sm">{inviteMsg}</span>}
          </div>
        )}
      </header>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 h-full items-start">
            {board.columns.map((col: Column) => (
              <div key={col.id} className="flex-shrink-0 w-72">
                <div className="rounded-xl overflow-hidden shadow-lg" style={{ background: col.color }}>
                  {/* Column header */}
                  <div className="px-3 py-2.5 flex items-center justify-between">
                    <h3 className="text-white font-semibold text-sm">{col.title}</h3>
                    <div className="flex items-center gap-1">
                      <span className="text-white/60 text-xs">{col.cards.length}</span>
                      <button
                        onClick={() => deleteColumn(col.id)}
                        className="text-white/50 hover:text-white ml-1 transition-colors"
                        title="Excluir coluna"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Cards */}
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`px-2 pb-2 min-h-[8px] transition-colors ${snapshot.isDraggingOver ? 'bg-black/10' : ''}`}
                      >
                        {col.cards.map((card: Card, index: number) => {
                          const checkSummary = getChecklistSummary(card)
                          return (
                            <Draggable key={card.id} draggableId={card.id} index={index}>
                              {(prov, snap) => (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  onClick={() => setSelectedCard(card)}
                                  className={`bg-white rounded-lg p-3 mb-2 cursor-pointer shadow-sm hover:shadow-md transition-shadow ${snap.isDragging ? 'shadow-xl rotate-2 opacity-90' : ''}`}
                                >
                                  <p className="text-gray-800 text-sm font-medium leading-snug">{card.title}</p>
                                  {card.description && (
                                    <p className="text-gray-500 text-xs mt-1 line-clamp-2">{card.description}</p>
                                  )}
                                  <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      {checkSummary && (
                                        <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${checkSummary.done === checkSummary.total ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                          </svg>
                                          {checkSummary.done}/{checkSummary.total}
                                        </span>
                                      )}
                                      {card.attachments.length > 0 && (
                                        <span className="flex items-center gap-1 text-xs text-gray-400">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                          </svg>
                                          {card.attachments.length}
                                        </span>
                                      )}
                                    </div>
                                    {card.members.length > 0 && (
                                      <div className="flex -space-x-1">
                                        {card.members.slice(0, 3).map((m) => (
                                          <div key={m.id} title={m.user.name} className="w-5 h-5 rounded-full bg-purple-600 border border-white flex items-center justify-center text-white text-xs font-medium">
                                            {getInitials(m.user.name)}
                                          </div>
                                        ))}
                                      </div>
                                    )}
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

                  {/* Add card */}
                  <div className="px-2 pb-2">
                    {addingCardCol === col.id ? (
                      <div className="bg-white rounded-lg p-2">
                        <textarea
                          autoFocus
                          value={newCardTitle}
                          onChange={(e) => setNewCardTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCard(col.id) } }}
                          placeholder="Título do card..."
                          rows={2}
                          className="w-full text-sm text-gray-800 resize-none focus:outline-none"
                        />
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => addCard(col.id)} className="px-3 py-1 bg-white/20 text-white text-xs rounded font-medium bg-blue-600 hover:bg-blue-700 transition-colors">Adicionar</button>
                          <button onClick={() => { setAddingCardCol(null); setNewCardTitle('') }} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
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

            {/* Add column */}
            <div className="flex-shrink-0 w-72">
              {addingCol ? (
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20">
                  <input
                    autoFocus
                    value={newColTitle}
                    onChange={(e) => setNewColTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addColumn()}
                    placeholder="Título da coluna..."
                    className="w-full px-2 py-1.5 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/40 text-sm focus:outline-none focus:ring-1 focus:ring-white/40 mb-2"
                  />
                  <div className="flex gap-2">
                    <button onClick={addColumn} className="px-3 py-1.5 bg-white text-gray-800 rounded-lg text-sm font-medium hover:bg-white/90 transition-colors">Adicionar</button>
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

      {selectedCard && (
        <CardModal
          card={selectedCard}
          boardMembers={boardMembers}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleCardUpdate}
          onDelete={handleCardDelete}
        />
      )}
    </div>
  )
}
