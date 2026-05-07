import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { getBoards, createBoard, deleteBoard } from '../lib/storage'
import { Board } from '../types'

const BG_OPTIONS = ['#6b21a8','#1e40af','#065f46','#92400e','#9f1239','#0e7490','#3730a3','#b45309']

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

export default function BoardsPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const isDark = theme === 'dark'

  const [boards, setBoards] = useState<Board[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [background, setBackground] = useState(BG_OPTIONS[0])

  useEffect(() => { if (user) setBoards(getBoards(user.id)) }, [user])

  function handleCreate() {
    if (!title.trim() || !user) return
    const board = createBoard(title, description || undefined, background, user)
    setBoards((b) => [board, ...b])
    setShowCreate(false); setTitle(''); setDescription(''); setBackground(BG_OPTIONS[0])
    navigate(`/boards/${board.id}`)
  }

  function handleDelete(e: React.MouseEvent, boardId: string) {
    e.stopPropagation()
    if (!confirm('Excluir este quadro?')) return
    deleteBoard(boardId)
    setBoards((b) => b.filter((x) => x.id !== boardId))
  }

  const bg = isDark ? 'bg-gray-900' : 'bg-gray-50'
  const heading = isDark ? 'text-white' : 'text-gray-900'
  const muted = isDark ? 'text-gray-400' : 'text-gray-500'
  const modal = isDark ? 'bg-gray-800' : 'bg-white'
  const inputCls = `w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-300 text-gray-900'}`

  return (
    <div className={`min-h-full ${bg} p-6`}>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className={`text-xl font-bold ${heading}`}>Meus Quadros</h2>
          <p className={`text-sm mt-0.5 ${muted}`}>{boards.length} quadro{boards.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-xl transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Criar Quadro
        </button>
      </div>

      {/* Boards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {boards.map((board) => (
          <button
            key={board.id}
            onClick={() => navigate(`/boards/${board.id}`)}
            className="group relative h-32 rounded-2xl overflow-hidden text-left hover:scale-[1.02] transition-transform shadow-lg"
            style={{ background: board.background }}
          >
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
            <div className="relative p-4 h-full flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-white font-semibold text-base leading-tight">{board.title}</h3>
                  {board.description && <p className="text-white/70 text-xs mt-1 line-clamp-2">{board.description}</p>}
                </div>
                {board.ownerId === user?.id && (
                  <button
                    onClick={(e) => handleDelete(e, board.id)}
                    className="opacity-0 group-hover:opacity-100 text-white/60 hover:text-white transition-all ml-2 flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                {board.members.slice(0, 4).map((m) => (
                  <div key={m.id} className="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center text-xs text-white font-medium border border-white/30">
                    {getInitials(m.user.name)}
                  </div>
                ))}
                {board.members.length > 4 && <span className="text-white/60 text-xs ml-1">+{board.members.length - 4}</span>}
              </div>
            </div>
          </button>
        ))}

        {/* Empty state */}
        {boards.length === 0 && (
          <div className={`col-span-full text-center py-20 ${muted}`}>
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            <p className="text-lg font-medium mb-1">Nenhum quadro ainda</p>
            <p className="text-sm">Crie seu primeiro quadro para começar</p>
          </div>
        )}
      </div>

      {/* Create board modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-2xl p-6 w-full max-w-md shadow-2xl ${modal}`}>
            <h3 className={`font-semibold text-lg mb-4 ${heading}`}>Criar Quadro</h3>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${muted}`}>Título *</label>
                <input
                  autoFocus type="text" value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="Nome do quadro"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${muted}`}>Descrição</label>
                <input
                  type="text" value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição opcional"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${muted}`}>Cor de fundo</label>
                <div className="flex gap-2 flex-wrap">
                  {BG_OPTIONS.map((c) => (
                    <button
                      key={c} onClick={() => setBackground(c)}
                      className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${background === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            {/* Preview */}
            <div className="mt-4 h-16 rounded-xl overflow-hidden" style={{ background }}>
              <div className="h-full bg-black/20 flex items-center px-4">
                <span className="text-white font-semibold text-sm">{title || 'Nome do quadro'}</span>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowCreate(false)}
                className={`flex-1 py-2 border rounded-xl transition-colors text-sm ${isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >Cancelar</button>
              <button
                onClick={handleCreate}
                disabled={!title.trim()}
                className="flex-1 py-2 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 text-sm font-medium"
              >Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
