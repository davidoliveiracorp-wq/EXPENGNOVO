import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Board, Card, Column, User } from '../types'
import {
  getBoardById, addCard, addColumn, deleteColumn, moveCard,
  addBoardMember, findUserByEmail, removeBoardMember, importBoard,
} from '../lib/storage'
import CardModal from '../components/CardModal'

export default function BoardPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [board, setBoard] = useState<Board | null>(null)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [addingCardCol, setAddingCardCol] = useState<string | null>(null)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [addingCol, setAddingCol] = useState(false)
  const [newColTitle, setNewColTitle] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFound, setInviteFound] = useState<User | null>(null)
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'found' | 'notfound' | 'added' | 'already' | 'error'>('idle')
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null)
  const [inviteJoinLink, setInviteJoinLink] = useState<string | null>(null)
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const inviteRef = useRef<HTMLDivElement>(null)
  const inviteInputRef = useRef<HTMLInputElement>(null)

  // Auto-importa o quadro quando o usuário acessa via link de convite (?boardData=...)
  useEffect(() => {
    if (!id || !user) return
    const boardDataParam = searchParams.get('boardData')
    if (boardDataParam) {
      try {
        const boardObj: Board = JSON.parse(atob(boardDataParam))
        const imported = importBoard(boardObj, user)
        setBoard(imported)
        // Remove o parâmetro da URL sem recarregar
        navigate(`/boards/${id}`, { replace: true })
        return
      } catch { /* ignora erro de decodificação */ }
    }
    const b = getBoardById(id)
    if (!b) navigate('/')
    else setBoard(b)
  }, [id, user, navigate, searchParams])

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

  // fecha o painel ao clicar fora
  useEffect(() => {
    if (!showInvite) return
    function handler(e: MouseEvent) {
      if (inviteRef.current && !inviteRef.current.contains(e.target as Node)) {
        setShowInvite(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showInvite])

  function handleEmailChange(val: string) {
    setInviteEmail(val)
    setInviteStatus('idle')
    setInviteFound(null)
    setInviteSentTo(null)
    setInviteError(null)
    if (!val.trim()) return
    const found = findUserByEmail(val.trim())
    if (found) {
      const alreadyMember = board?.members.some((m) => m.userId === found.id)
      setInviteFound(found)
      setInviteStatus(alreadyMember ? 'already' : 'found')
    } else if (val.trim().includes('@')) {
      setInviteStatus('notfound')
    }
  }

  // Gera link de acesso ao quadro com os dados embutidos (para usuário em outro dispositivo)
  function buildJoinLink(targetBoard: Board) {
    const boardData = btoa(JSON.stringify(targetBoard))
    return `${window.location.origin}/boards/${targetBoard.id}?boardData=${boardData}`
  }

  function handleAddMember() {
    if (!inviteFound || !board) return
    setInviteError(null)
    try {
      const updated = addBoardMember(board.id, inviteFound)
      setBoard(updated)
      setInviteStatus('added')
      setInviteEmail('')
      setInviteFound(null)
      // Gera link para o usuário já cadastrado acessar o quadro no próprio dispositivo
      setInviteJoinLink(buildJoinLink(updated))
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erro ao adicionar membro')
      setInviteStatus('error')
    }
  }

  function handleCopyJoinLink() {
    if (!inviteJoinLink) return
    navigator.clipboard.writeText(inviteJoinLink)
    setInviteLinkCopied(true)
    setTimeout(() => { setInviteLinkCopied(false); setInviteJoinLink(null); setInviteStatus('idle') }, 3000)
  }

  function handleSendEmailInvite() {
    if (!board) return
    const email = inviteEmail.trim()
    // Inclui os dados do quadro na URL para que o convidado veja o quadro após cadastro
    const boardData = btoa(JSON.stringify(board))
    const boardLink = `${window.location.origin}/register?email=${encodeURIComponent(email)}&board=${board.id}&boardData=${boardData}`
    const subject = encodeURIComponent(`Convite para o quadro "${board.title}" — Expansão`)
    const body = encodeURIComponent(
      `Olá!\n\nVocê foi convidado(a) para colaborar no quadro "${board.title}" do Expansão.\n\n` +
      `Clique no link abaixo para criar sua conta e acessar o quadro:\n${boardLink}\n\nAbraços! 🙏`
    )
    window.open(
      `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}&su=${subject}&body=${body}`,
      '_blank'
    )
    setInviteSentTo(email)
    setInviteEmail('')
    setInviteStatus('idle')
  }

  function handleRemoveMember(userId: string) {
    if (!board || userId === user?.id) return
    if (!confirm('Remover este membro do quadro?')) return
    const updated = removeBoardMember(board.id, userId)
    setBoard(updated)
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
            {/* Convidar button + popover */}
            <div className="relative" ref={inviteRef}>
              <button
                onClick={() => {
                  setShowInvite((v) => !v)
                  setInviteEmail(''); setInviteStatus('idle'); setInviteFound(null); setInviteSentTo(null)
                  setTimeout(() => inviteInputRef.current?.focus(), 80)
                }}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-sm transition-colors font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Convidar
              </button>

              {showInvite && (
                <div className="absolute right-0 top-10 w-80 bg-gray-900 border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-white/10">
                    <p className="text-white font-semibold text-sm">Convidar para este quadro</p>
                    <p className="text-white/50 text-xs mt-0.5">Digite o e-mail de quem você quer convidar</p>
                  </div>

                  {/* Input */}
                  <div className="p-3 space-y-2">
                    <div className="relative">
                      <svg className="w-4 h-4 absolute left-3 top-2.5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <input
                        ref={inviteInputRef}
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (inviteStatus === 'found' ? handleAddMember() : inviteStatus === 'notfound' ? handleSendEmailInvite() : undefined)}
                        placeholder="nome@email.com"
                        className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-1 focus:ring-white/40"
                      />
                    </div>

                    {/* Feedback states */}
                    {inviteStatus === 'found' && inviteFound && (
                      <div className="flex items-center justify-between bg-white/8 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                            {inviteFound.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <div>
                            <p className="text-white text-xs font-medium">{inviteFound.name}</p>
                            <p className="text-white/50 text-xs">{inviteFound.email}</p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAddMember() }}
                          className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium transition-colors flex-shrink-0"
                        >
                          Adicionar
                        </button>
                      </div>
                    )}

                    {inviteStatus === 'already' && inviteFound && (
                      <p className="text-xs text-yellow-400 px-1 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {inviteFound.name} já é membro deste quadro
                      </p>
                    )}

                    {inviteStatus === 'notfound' && (
                      <div className="bg-white/8 rounded-xl px-3 py-2.5 space-y-2">
                        <p className="text-white/70 text-xs">Este e-mail ainda não tem cadastro. Envie um convite:</p>
                        <button
                          onClick={handleSendEmailInvite}
                          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg py-1.5 text-xs font-medium transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Enviar convite por e-mail
                        </button>
                        <p className="text-white/40 text-xs text-center">O link de cadastro já vai incluir este quadro</p>
                      </div>
                    )}

                    {inviteStatus === 'added' && (
                      <div className="bg-green-900/30 border border-green-500/30 rounded-xl px-3 py-2.5 space-y-2">
                        <p className="text-xs text-green-400 flex items-center gap-1 font-medium">
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Adicionado! Compartilhe o link abaixo:
                        </p>
                        <p className="text-white/50 text-xs">O usuário precisa abrir este link no próprio dispositivo para ver o quadro.</p>
                        <button
                          onClick={handleCopyJoinLink}
                          className={`w-full flex items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-medium transition-colors ${inviteLinkCopied ? 'bg-green-600 text-white' : 'bg-white/15 hover:bg-white/25 text-white'}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={inviteLinkCopied ? "M5 13l4 4L19 7" : "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"} />
                          </svg>
                          {inviteLinkCopied ? 'Link copiado!' : 'Copiar link de acesso'}
                        </button>
                      </div>
                    )}

                    {inviteStatus === 'error' && inviteError && (
                      <p className="text-xs text-red-400 px-1 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {inviteError}
                      </p>
                    )}

                    {inviteSentTo && (
                      <p className="text-xs text-green-400 px-1 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Convite enviado para {inviteSentTo}
                      </p>
                    )}
                  </div>

                  {/* Members list */}
                  <div className="border-t border-white/10">
                    <p className="px-4 pt-3 pb-1 text-white/40 text-xs font-semibold uppercase tracking-wide">
                      Membros ({board.members.length})
                    </p>
                    <div className="max-h-44 overflow-y-auto pb-2">
                      {board.members.map((m) => (
                        <div key={m.id} className="flex items-center gap-2.5 px-4 py-1.5 hover:bg-white/5 group">
                          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                            {m.user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-medium truncate">{m.user.name}</p>
                            <p className="text-white/40 text-xs truncate">{m.user.email}</p>
                          </div>
                          {m.role === 'owner' ? (
                            <span className="text-xs text-white/30 flex-shrink-0">dono</span>
                          ) : m.userId !== user?.id ? (
                            <button
                              onClick={() => handleRemoveMember(m.userId)}
                              title="Remover membro"
                              className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all flex-shrink-0"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          ) : (
                            <span className="text-xs text-white/30 flex-shrink-0">você</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
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
