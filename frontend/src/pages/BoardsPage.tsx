import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'
import { Board } from '../types'

const BG_OPTIONS = [
  '#6b21a8', '#1e40af', '#065f46', '#92400e', '#9f1239', '#0e7490', '#3730a3',
]

export default function BoardsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [background, setBackground] = useState(BG_OPTIONS[0])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.get('/boards').then((r) => setBoards(r.data)).finally(() => setLoading(false))
  }, [])

  async function createBoard() {
    if (!title.trim()) return
    setCreating(true)
    try {
      const { data } = await api.post('/boards', { title, description, background })
      setBoards((b) => [data, ...b])
      setShowCreate(false)
      setTitle(''); setDescription(''); setBackground(BG_OPTIONS[0])
      navigate(`/boards/${data.id}`)
    } finally {
      setCreating(false)
    }
  }

  function getInitials(name: string) {
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-700 to-fuchsia-600">
      <header className="bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            <span className="text-white font-bold text-lg">KanbanApp</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-white/80">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold text-white">
                {getInitials(user?.name || 'U')}
              </div>
              <span className="text-sm hidden sm:block">{user?.name}</span>
            </div>
            <button onClick={logout} className="text-white/60 hover:text-white text-sm transition-colors">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white text-xl font-semibold">Meus Quadros</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Criar Quadro
          </button>
        </div>

        {loading ? (
          <div className="text-white/60 text-center py-16">Carregando...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {boards.map((board) => (
              <button
                key={board.id}
                onClick={() => navigate(`/boards/${board.id}`)}
                className="group relative h-32 rounded-xl overflow-hidden text-left hover:scale-[1.02] transition-transform shadow-lg"
                style={{ background: board.background }}
              >
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                <div className="relative p-4 h-full flex flex-col justify-between">
                  <div>
                    <h3 className="text-white font-semibold text-base leading-tight">{board.title}</h3>
                    {board.description && (
                      <p className="text-white/70 text-xs mt-1 line-clamp-2">{board.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {board.members.slice(0, 4).map((m) => (
                      <div key={m.id} className="w-6 h-6 rounded-full bg-white/30 flex items-center justify-center text-xs text-white font-medium border border-white/30">
                        {getInitials(m.user.name)}
                      </div>
                    ))}
                    {board.members.length > 4 && (
                      <span className="text-white/60 text-xs">+{board.members.length - 4}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}

            {boards.length === 0 && (
              <div className="col-span-full text-center py-16 text-white/50">
                <p className="text-lg mb-2">Nenhum quadro ainda</p>
                <p className="text-sm">Crie seu primeiro quadro para começar</p>
              </div>
            )}
          </div>
        )}
      </main>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-gray-900 font-semibold text-lg mb-4">Criar Quadro</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">Título *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Nome do quadro"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-1">Descrição</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Descrição opcional"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">Cor de fundo</label>
                <div className="flex gap-2">
                  {BG_OPTIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setBackground(c)}
                      className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${background === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={createBoard}
                disabled={!title.trim() || creating}
                className="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {creating ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
