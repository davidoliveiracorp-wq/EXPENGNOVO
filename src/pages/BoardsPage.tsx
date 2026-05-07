import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { getBoards, createBoard, deleteBoard } from '../lib/storage'
import { Board } from '../types'
import Logo from '../components/Logo'

const BG_OPTIONS = ['#6b21a8','#1e40af','#065f46','#92400e','#9f1239','#0e7490','#3730a3']

export default function BoardsPage() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [boards, setBoards] = useState<Board[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [background, setBackground] = useState(BG_OPTIONS[0])
  const isDark = theme === 'dark'

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

  function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark ? 'bg-gray-900' : 'bg-gray-100'
    }`}>
      {/* Header */}
      <header className={`border-b transition-colors duration-300 ${
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      }`}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="px-3 py-1 bg-black rounded-xl">
            <Logo size="sm" />
          </div>

          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <button onClick={toggleTheme}
              className={`p-2 rounded-full transition-colors ${
                isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}>
              {isDark ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            <div className={`flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-sm font-semibold text-white">
                {getInitials(user?.name || 'U')}
              </div>
              <span className="text-sm hidden sm:block">{user?.name}</span>
            </div>
            <button onClick={logout}
              className={`text-sm transition-colors ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>Meus Quadros</h2>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Criar Quadro
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {boards.map((board) => (
            <button key={board.id} onClick={() => navigate(`/boards/${board.id}`)}
              className="group relative h-32 rounded-xl overflow-hidden text-left hover:scale-[1.02] transition-transform shadow-lg"
              style={{ background: board.background }}>
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
              <div className="relative p-4 h-full flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-white font-semibold text-base leading-tight">{board.title}</h3>
                    {board.description && <p className="text-white/70 text-xs mt-1 line-clamp-2">{board.description}</p>}
                  </div>
                  {board.ownerId === user?.id && (
                    <button onClick={(e) => handleDelete(e, board.id)}
                      className="opacity-0 group-hover:opacity-100 text-white/60 hover:text-white transition-all ml-2">
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
                  {board.members.length > 4 && <span className="text-white/60 text-xs">+{board.members.length - 4}</span>}
                </div>
              </div>
            </button>
          ))}

          {boards.length === 0 && (
            <div className={`col-span-full text-center py-16 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              <p className="text-lg mb-2">Nenhum quadro ainda</p>
              <p className="text-sm">Crie seu primeiro quadro para começar</p>
            </div>
          )}
        </div>
      </main>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-2xl p-6 w-full max-w-md shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <h3 className={`font-semibold text-lg mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Criar Quadro</h3>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Título *</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                    isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-300 text-gray-900'
                  }`}
                  placeholder="Nome do quadro" autoFocus />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Descrição</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                    isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-300 text-gray-900'
                  }`}
                  placeholder="Descrição opcional" />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Cor de fundo</label>
                <div className="flex gap-2">
                  {BG_OPTIONS.map((c) => (
                    <button key={c} onClick={() => setBackground(c)}
                      className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${background === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)}
                className={`flex-1 py-2 border rounded-lg transition-colors ${isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={!title.trim()}
                className="flex-1 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
                Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
