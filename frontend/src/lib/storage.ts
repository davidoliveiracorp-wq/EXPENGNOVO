import { Attachment, Board, Card, CardMember, Checklist, ChecklistItem, Column, Invite, Label, Song, User } from '../types'

// E-mails que recebem role admin automaticamente
export const ADMIN_EMAILS = ['dasioli@gmail.com']

function uid() { return crypto.randomUUID() }

function get<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
function set<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data))
}

// ── Auth ──────────────────────────────────────────────────────────────────────

type StoredUser = User & { passwordHash: string }

async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

export async function authRegister(name: string, email: string, password: string): Promise<User> {
  const users = get<StoredUser>('kb_users')
  if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) throw new Error('Email já cadastrado')
  const passwordHash = await hashPassword(password)
  const role: 'admin' | 'user' = ADMIN_EMAILS.includes(email.toLowerCase()) ? 'admin' : 'user'
  const user: User = { id: uid(), name, email, role, createdAt: new Date().toISOString() }
  set('kb_users', [...users, { ...user, passwordHash }])
  localStorage.setItem('kb_session', user.id)
  return user
}

export async function authLogin(email: string, password: string): Promise<User> {
  const users = get<StoredUser>('kb_users')
  const stored = users.find((u) => u.email.toLowerCase() === email.toLowerCase())
  if (!stored) throw new Error('Credenciais inválidas')
  const hash = await hashPassword(password)
  if (hash !== stored.passwordHash) throw new Error('Credenciais inválidas')
  // Auto-promove emails admin mesmo que a conta tenha sido criada antes do recurso
  if (ADMIN_EMAILS.includes(stored.email.toLowerCase()) && stored.role !== 'admin') {
    const idx = users.findIndex((u) => u.id === stored.id)
    users[idx] = { ...stored, role: 'admin' }
    set('kb_users', users)
    stored.role = 'admin'
  }
  const { passwordHash: _, ...user } = stored
  localStorage.setItem('kb_session', user.id)
  return user
}

export function authLogout() { localStorage.removeItem('kb_session') }

export function authGetCurrentUser(): User | null {
  const id = localStorage.getItem('kb_session')
  if (!id) return null
  const stored = get<StoredUser>('kb_users').find((u) => u.id === id)
  if (!stored) return null
  // Garante que o admin é promovido mesmo sem novo login
  if (ADMIN_EMAILS.includes(stored.email.toLowerCase()) && stored.role !== 'admin') {
    const users = get<StoredUser>('kb_users')
    const idx = users.findIndex((u) => u.id === stored.id)
    users[idx] = { ...stored, role: 'admin' }
    set('kb_users', users)
    stored.role = 'admin'
  }
  const { passwordHash: _, ...user } = stored
  return user
}

export function updateUserProfile(userId: string, data: { phone?: string; name?: string }): User {
  const users = get<StoredUser>('kb_users')
  const idx = users.findIndex((u) => u.id === userId)
  if (idx < 0) throw new Error('User not found')
  const updated = { ...users[idx], ...data }
  users[idx] = updated
  set('kb_users', users)
  localStorage.setItem('kb_session', updated.id)
  const { passwordHash: _, ...user } = updated
  return user
}

export function findUserByEmail(email: string): User | null {
  const stored = get<StoredUser>('kb_users').find((u) => u.email.toLowerCase() === email.toLowerCase().trim())
  if (!stored) return null
  const { passwordHash: _, ...user } = stored
  return user
}

// ── Boards ────────────────────────────────────────────────────────────────────

function loadBoards(): Board[] { return get<Board>('kb_boards') }
function saveBoards(boards: Board[]) { set('kb_boards', boards) }

function upsertBoard(board: Board) {
  const boards = loadBoards()
  const idx = boards.findIndex((b) => b.id === board.id)
  if (idx >= 0) boards[idx] = board; else boards.push(board)
  saveBoards(boards)
}

export function getBoards(userId: string): Board[] {
  const boards = loadBoards()
  const me = get<StoredUser>('kb_users').find((u) => u.id === userId)
  if (me?.role === 'admin') return boards
  return boards.filter(
    (b) => b.ownerId === userId || b.members.some((m) => m.userId === userId)
  )
}

export function getBoardById(id: string): Board | null {
  return loadBoards().find((b) => b.id === id) ?? null
}

export function createBoard(title: string, description: string | undefined, background: string, owner: User): Board {
  const boardId = uid()
  const board: Board = {
    id: boardId, title, description, background,
    ownerId: owner.id, createdAt: new Date().toISOString(),
    owner,
    members: [{ id: uid(), boardId, userId: owner.id, role: 'owner', user: owner }],
    columns: [
      { id: uid(), title: 'Eventos', color: '#7c6d2e', order: 0, boardId, cards: [] },
      { id: uid(), title: 'Em preparação', color: '#7c6d2e', order: 1, boardId, cards: [] },
      { id: uid(), title: 'Em execução', color: '#1a6b4a', order: 2, boardId, cards: [] },
      { id: uid(), title: 'Concluído', color: '#7c2020', order: 3, boardId, cards: [] },
    ],
  }
  upsertBoard(board)
  return board
}

export function updateBoard(id: string, data: Partial<Pick<Board, 'title' | 'description' | 'background'>>): Board {
  const board = getBoardById(id)!
  const updated = { ...board, ...data }
  upsertBoard(updated)
  return updated
}

export function deleteBoard(id: string) {
  saveBoards(loadBoards().filter((b) => b.id !== id))
}

export function addBoardMember(boardId: string, user: User): Board {
  const board = getBoardById(boardId)
  if (!board) throw new Error(`Board ${boardId} não encontrado`)
  if (board.members.some((m) => m.userId === user.id)) return board
  const updated = { ...board, members: [...board.members, { id: uid(), boardId, userId: user.id, role: 'member', user }] }
  upsertBoard(updated)
  return updated
}

// Importa um quadro de outro dispositivo/usuário (via link de convite com boardData)
export function importBoard(board: Board, user: User): Board {
  const boards = loadBoards()
  const existing = boards.findIndex((b) => b.id === board.id)
  if (existing >= 0) {
    // Quadro já existe: adiciona como membro se ainda não for
    const b = boards[existing]
    if (b.members.some((m) => m.userId === user.id)) return b
    const updated = { ...b, members: [...b.members, { id: uid(), boardId: b.id, userId: user.id, role: 'member' as const, user }] }
    boards[existing] = updated
    saveBoards(boards)
    return updated
  }
  // Importa o quadro completo, garantindo que o usuário é membro
  const isMember = board.members.some((m) => m.userId === user.id)
  const boardToSave: Board = isMember ? board : {
    ...board,
    members: [...board.members, { id: uid(), boardId: board.id, userId: user.id, role: 'member' as const, user }],
  }
  boards.push(boardToSave)
  saveBoards(boards)
  return boardToSave
}

export function removeBoardMember(boardId: string, userId: string): Board {
  const board = getBoardById(boardId)!
  const updated = { ...board, members: board.members.filter((m) => m.userId !== userId) }
  upsertBoard(updated)
  return updated
}

// ── Columns ───────────────────────────────────────────────────────────────────

export function addColumn(boardId: string, title: string): Board {
  const board = getBoardById(boardId)!
  const col: Column = { id: uid(), title, color: '#7c6d2e', order: board.columns.length, boardId, cards: [] }
  const updated = { ...board, columns: [...board.columns, col] }
  upsertBoard(updated)
  return updated
}

export function deleteColumn(boardId: string, columnId: string): Board {
  const board = getBoardById(boardId)!
  const updated = { ...board, columns: board.columns.filter((c) => c.id !== columnId) }
  upsertBoard(updated)
  return updated
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function findCard(board: Board, cardId: string): Card | null {
  for (const col of board.columns) {
    const c = col.cards.find((c) => c.id === cardId)
    if (c) return c
  }
  return null
}

function replaceCard(board: Board, cardId: string, newCard: Card): Board {
  return {
    ...board,
    columns: board.columns.map((col) => ({
      ...col, cards: col.cards.map((c) => c.id === cardId ? newCard : c),
    })),
  }
}

export function addCard(boardId: string, columnId: string, title: string, creator: User): Board {
  const board = getBoardById(boardId)!
  const card: Card = {
    id: uid(), title, order: 0, columnId, creatorId: creator.id,
    createdAt: new Date().toISOString(), members: [], checklists: [], attachments: [], labels: [], creator,
  }
  const updated = {
    ...board,
    columns: board.columns.map((col) =>
      col.id === columnId ? { ...col, cards: [...col.cards, card] } : col
    ),
  }
  upsertBoard(updated)
  return updated
}

export function updateCard(boardId: string, cardId: string, data: Partial<Pick<Card, 'title' | 'description' | 'dueDate' | 'cover' | 'labels'>>): { board: Board; card: Card } {
  const board = getBoardById(boardId)!
  const old = findCard(board, cardId)!
  const card = { ...old, ...data }
  const updated = replaceCard(board, cardId, card)
  upsertBoard(updated)
  return { board: updated, card }
}

export function addAttachment(boardId: string, cardId: string, filename: string, data: string, isImage: boolean): { board: Board; card: Card } {
  const board = getBoardById(boardId)!
  const old = findCard(board, cardId)!
  const attachment: Attachment = {
    id: uid(), filename, url: '', data, isImage, cardId, createdAt: new Date().toISOString(),
  }
  const card = { ...old, attachments: [...old.attachments, attachment] }
  const updated = replaceCard(board, cardId, card)
  upsertBoard(updated)
  return { board: updated, card }
}

export function removeAttachment(boardId: string, cardId: string, attachmentId: string): { board: Board; card: Card } {
  const board = getBoardById(boardId)!
  const old = findCard(board, cardId)!
  const card = { ...old, attachments: old.attachments.filter((a) => a.id !== attachmentId) }
  const updated = replaceCard(board, cardId, card)
  upsertBoard(updated)
  return { board: updated, card }
}

export function deleteCard(boardId: string, cardId: string): Board {
  const board = getBoardById(boardId)!
  const updated = {
    ...board,
    columns: board.columns.map((col) => ({ ...col, cards: col.cards.filter((c) => c.id !== cardId) })),
  }
  upsertBoard(updated)
  return updated
}

export function moveCard(boardId: string, cardId: string, destColId: string, destIndex: number): Board {
  const board = getBoardById(boardId)!
  let moved!: Card
  const without = {
    ...board,
    columns: board.columns.map((col) => ({
      ...col,
      cards: col.cards.filter((c) => {
        if (c.id === cardId) { moved = { ...c, columnId: destColId }; return false }
        return true
      }),
    })),
  }
  const updated = {
    ...without,
    columns: without.columns.map((col) => {
      if (col.id !== destColId) return col
      const cards = [...col.cards]
      cards.splice(destIndex, 0, moved)
      return { ...col, cards }
    }),
  }
  upsertBoard(updated)
  return updated
}

// ── Card Members ──────────────────────────────────────────────────────────────

export function addCardMember(boardId: string, cardId: string, user: User): { board: Board; card: Card } {
  const board = getBoardById(boardId)!
  const old = findCard(board, cardId)!
  if (old.members.some((m) => m.userId === user.id)) return { board, card: old }
  const member: CardMember = { id: uid(), cardId, userId: user.id, user }
  const card = { ...old, members: [...old.members, member] }
  const updated = replaceCard(board, cardId, card)
  upsertBoard(updated)
  return { board: updated, card }
}

export function removeCardMember(boardId: string, cardId: string, userId: string): { board: Board; card: Card } {
  const board = getBoardById(boardId)!
  const old = findCard(board, cardId)!
  const card = { ...old, members: old.members.filter((m) => m.userId !== userId) }
  const updated = replaceCard(board, cardId, card)
  upsertBoard(updated)
  return { board: updated, card }
}

// ── Checklists ────────────────────────────────────────────────────────────────

export function addChecklist(boardId: string, cardId: string, title: string): { board: Board; card: Card } {
  const board = getBoardById(boardId)!
  const old = findCard(board, cardId)!
  const cl: Checklist = { id: uid(), title, cardId, items: [] }
  const card = { ...old, checklists: [...old.checklists, cl] }
  const updated = replaceCard(board, cardId, card)
  upsertBoard(updated)
  return { board: updated, card }
}

export function deleteChecklist(boardId: string, cardId: string, checklistId: string): { board: Board; card: Card } {
  const board = getBoardById(boardId)!
  const old = findCard(board, cardId)!
  const card = { ...old, checklists: old.checklists.filter((cl) => cl.id !== checklistId) }
  const updated = replaceCard(board, cardId, card)
  upsertBoard(updated)
  return { board: updated, card }
}

export function addChecklistItem(boardId: string, cardId: string, checklistId: string, title: string): { board: Board; card: Card } {
  const board = getBoardById(boardId)!
  const old = findCard(board, cardId)!
  const item: ChecklistItem = { id: uid(), title, completed: false, checklistId }
  const card = {
    ...old,
    checklists: old.checklists.map((cl) =>
      cl.id === checklistId ? { ...cl, items: [...cl.items, item] } : cl
    ),
  }
  const updated = replaceCard(board, cardId, card)
  upsertBoard(updated)
  return { board: updated, card }
}

export function toggleChecklistItem(boardId: string, cardId: string, checklistId: string, itemId: string, completed: boolean): { board: Board; card: Card } {
  const board = getBoardById(boardId)!
  const old = findCard(board, cardId)!
  const card = {
    ...old,
    checklists: old.checklists.map((cl) =>
      cl.id === checklistId
        ? { ...cl, items: cl.items.map((i) => i.id === itemId ? { ...i, completed } : i) }
        : cl
    ),
  }
  const updated = replaceCard(board, cardId, card)
  upsertBoard(updated)
  return { board: updated, card }
}

export function deleteChecklistItem(boardId: string, cardId: string, checklistId: string, itemId: string): { board: Board; card: Card } {
  const board = getBoardById(boardId)!
  const old = findCard(board, cardId)!
  const card = {
    ...old,
    checklists: old.checklists.map((cl) =>
      cl.id === checklistId ? { ...cl, items: cl.items.filter((i) => i.id !== itemId) } : cl
    ),
  }
  const updated = replaceCard(board, cardId, card)
  upsertBoard(updated)
  return { board: updated, card }
}

// ── Songs ─────────────────────────────────────────────────────────────────────

export function getSongs(): Song[] { return get<Song>('kb_songs') }

export function createSong(data: Omit<Song, 'id' | 'createdAt'>): Song {
  const song: Song = { ...data, id: uid(), createdAt: new Date().toISOString() }
  set('kb_songs', [...getSongs(), song])
  return song
}

export function updateSong(id: string, data: Partial<Omit<Song, 'id' | 'createdAt' | 'createdBy'>>): Song {
  const songs = getSongs()
  const idx = songs.findIndex((s) => s.id === id)
  if (idx < 0) throw new Error('Song not found')
  const updated = { ...songs[idx], ...data }
  songs[idx] = updated
  set('kb_songs', songs)
  return updated
}

export function deleteSong(id: string): void {
  set('kb_songs', getSongs().filter((s) => s.id !== id))
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export function getUsers(): User[] {
  return get<StoredUser>('kb_users').map(({ passwordHash: _, ...u }) => u)
}

export function setUserRole(userId: string, role: 'admin' | 'user'): void {
  const users = get<StoredUser>('kb_users')
  const idx = users.findIndex((u) => u.id === userId)
  if (idx < 0) return
  users[idx] = { ...users[idx], role }
  set('kb_users', users)
}

export function adminDeleteUser(userId: string): void {
  set('kb_users', get<StoredUser>('kb_users').filter((u) => u.id !== userId))
}

// ── Invites ───────────────────────────────────────────────────────────────────

export function getInvites(): Invite[] { return get<Invite>('kb_invites') }

export function createInvite(email: string, name: string, createdBy: string): Invite {
  const invite: Invite = { id: uid(), email, name, createdAt: new Date().toISOString(), createdBy }
  set('kb_invites', [...getInvites(), invite])
  return invite
}

export function deleteInvite(id: string): void {
  set('kb_invites', getInvites().filter((i) => i.id !== id))
}

// ── Backup / Restore ──────────────────────────────────────────────────────────

export type BackupPayload = {
  version: 1
  exportedAt: string
  origin: string
  data: Record<string, string>
}

export function exportBackup(): BackupPayload {
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith('kb_')) continue
    const value = localStorage.getItem(key)
    if (value !== null) data[key] = value
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    data,
  }
}

export function importBackup(payload: unknown, mode: 'merge' | 'replace' = 'merge'): { restored: number; keys: string[] } {
  if (!payload || typeof payload !== 'object') throw new Error('Backup inválido: payload não é um objeto')
  const p = payload as Partial<BackupPayload>
  if (p.version !== 1) throw new Error(`Backup inválido: versão ${p.version} não suportada`)
  if (!p.data || typeof p.data !== 'object') throw new Error('Backup inválido: campo "data" ausente')

  const entries = Object.entries(p.data).filter(([k, v]) => k.startsWith('kb_') && typeof v === 'string')
  if (entries.length === 0) throw new Error('Backup inválido: nenhum dado kb_* encontrado')

  // Valida que cada valor é JSON válido antes de gravar (defesa contra arquivos corrompidos)
  for (const [k, v] of entries) {
    try { JSON.parse(v as string) } catch { throw new Error(`Backup inválido: chave "${k}" não é JSON válido`) }
  }

  if (mode === 'replace') {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('kb_')) toRemove.push(key)
    }
    toRemove.forEach((k) => localStorage.removeItem(k))
  }

  for (const [k, v] of entries) localStorage.setItem(k, v as string)
  return { restored: entries.length, keys: entries.map(([k]) => k) }
}
