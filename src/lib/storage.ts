import { Attachment, Birthday, Board, Card, CardMember, Checklist, ChecklistItem, Column, Invite, Label, Song, User } from '../types'

// E-mails que recebem role admin automaticamente.
// Mantemos apenas o super-admin aqui: a promoção dos demais é decisão do
// dasioli@gmail.com via /admin (setUserRole).
export const ADMIN_EMAILS = [
  'dasioli@gmail.com',
]

// E-mails que ganham acesso (como membro) a todos os quadros existentes,
// mantendo role 'user' (não viram super-admin). A conta NÃO é criada
// automaticamente — o usuário define a própria senha via /register pelo
// link de convite. Assim que registra (ou no próximo boot), o nome é
// sincronizado, role é forçada a 'user' e ele é adicionado como membro
// de todos os quadros do navegador.
export const BOARD_GUEST_EMAILS: Array<{ email: string; name: string }> = [
  { email: 'contato.ntnathan@gmail.com', name: 'Nathan' },
  { email: 'contatoemilly2108@gmail.com', name: 'Emilly Vitoria' },
  { email: 'gerlucinha@gmail.com', name: 'Gerlucia Oliveira' },
  { email: 'david.oliveira.corp@gmail.com', name: 'David Corp' },
  { email: 'emilyassuncao24@gmail.com', name: 'Emilly Assunção' },
  { email: 'jozadaquepereira06@gmail.com', name: 'Jozadaque Pereira' },
  { email: 'vanessamoura886@gmail.com', name: 'Vanessa Moura' },
  { email: 'dafinisousafreitas@gmail.com', name: 'Dafini Sousa' },
  { email: 'ericfarias998@gmail.com', name: 'Eric Farias' },
]

// Senha padrão do super-admin auto-criado em localStorage vazio.
// Pode ser sobrescrita via env VITE_SUPER_ADMIN_PASSWORD na Vercel.
const SUPER_ADMIN_DEFAULT_PASSWORD =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPER_ADMIN_PASSWORD) || 'Admin@2026'
const SUPER_ADMIN_DEFAULT_NAME = 'David Oliveira'

function uid() { return crypto.randomUUID() }

function get<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
function set<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data))
  notifyLocalChange(key)
}

// ── Sync tracking ─────────────────────────────────────────────────────────────
//
// Sinaliza para o auto-sync (em AppLayout) que houve uma mudança local em
// chaves "de dados". Sentinelas de sessão/sync (kb_session, kb_local_*) e
// preferências locais (kb_theme, kb_wa_contact) NÃO são consideradas "dados"
// e por isso não geram push automático.

const SYNC_SENTINEL_KEYS = new Set<string>([
  'kb_session',
  'kb_theme',
  'kb_wa_contact',
  'kb_local_version',
  'kb_last_change_at',
  'kb_last_pushed_version',
  'kb_last_pulled_at',
  'kb_dismissed_server_update',
])

// Quando true (durante boot/importBackup), mudanças NÃO bumpam a versão
// local — para não disparar push automático com estado de bootstrap.
let _bootstrapInProgress = false
export function _setBootstrapInProgress(on: boolean): void {
  _bootstrapInProgress = on
}

function notifyLocalChange(key: string): void {
  if (_bootstrapInProgress) return
  if (!key.startsWith('kb_') || SYNC_SENTINEL_KEYS.has(key)) return
  const v = Number(localStorage.getItem('kb_local_version') || '0') + 1
  localStorage.setItem('kb_local_version', String(v))
  localStorage.setItem('kb_last_change_at', String(Date.now()))
  try { window.dispatchEvent(new Event('kb-storage-change')) } catch { /* no-op SSR */ }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

type StoredUser = User & { passwordHash: string }

async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

export async function authRegister(name: string, email: string, password: string): Promise<User> {
  const users = get<StoredUser>('kb_users')
  const lower = email.toLowerCase()
  const existingIdx = users.findIndex((u) => u.email.toLowerCase() === lower)

  // Bloqueia qualquer tentativa de re-registro para e-mails já cadastrados —
  // mesmo board guests com senha padrão precisam usar "Esqueci a senha" para
  // definir a senha pessoal. Isso evita que alguém sobrescreva a conta
  // (acidental ou intencionalmente) registrando com o mesmo e-mail.
  if (existingIdx >= 0) {
    throw new Error('Email já cadastrado. Use "Esqueci a senha" para recuperar o acesso.')
  }

  const passwordHash = await hashPassword(password)
  const role: 'admin' | 'user' = ADMIN_EMAILS.includes(lower) ? 'admin' : 'user'
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

export function updateUserProfile(userId: string, data: { phone?: string; name?: string; birthday?: string }): User {
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

// Troca a própria senha. Requer informar a senha atual. Auto-sync propaga
// o novo hash para os outros dispositivos.
export async function changeMyPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('A nova senha precisa ter ao menos 6 caracteres.')
  }
  const users = get<StoredUser>('kb_users')
  const idx = users.findIndex((u) => u.id === userId)
  if (idx < 0) throw new Error('Usuário não encontrado neste navegador.')
  const currentHash = await hashPassword(currentPassword)
  if (users[idx].passwordHash !== currentHash) {
    throw new Error('Senha atual incorreta.')
  }
  const newHash = await hashPassword(newPassword)
  if (newHash === currentHash) {
    throw new Error('A nova senha precisa ser diferente da atual.')
  }
  users[idx] = { ...users[idx], passwordHash: newHash }
  set('kb_users', users)
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

export function updateCard(boardId: string, cardId: string, data: Partial<Pick<Card, 'title' | 'description' | 'descriptionDueDate' | 'descriptionAssignee' | 'dueDate' | 'cover' | 'labels'>>): { board: Board; card: Card } {
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

export function updateChecklist(
  boardId: string,
  cardId: string,
  checklistId: string,
  data: Partial<Pick<Checklist, 'title' | 'dueDate' | 'assignee'>>
): { board: Board; card: Card } {
  const board = getBoardById(boardId)!
  const old = findCard(board, cardId)!
  const card = {
    ...old,
    checklists: old.checklists.map((cl) =>
      cl.id === checklistId ? { ...cl, ...data } : cl
    ),
  }
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

// Admin reseta a senha de outro usuário gerando uma nova senha aleatória.
// Retorna a senha em texto plano para o admin exibir/copiar e repassar ao
// usuário. Auto-sync propaga o novo hash para todos os dispositivos.
export async function adminResetUserPassword(userId: string): Promise<string> {
  const users = get<StoredUser>('kb_users')
  const idx = users.findIndex((u) => u.id === userId)
  if (idx < 0) throw new Error('Usuário não encontrado.')
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const arr = new Uint32Array(10)
  crypto.getRandomValues(arr)
  let newPassword = ''
  for (let i = 0; i < arr.length; i++) newPassword += chars[arr[i] % chars.length]
  const newHash = await hashPassword(newPassword)
  users[idx] = { ...users[idx], passwordHash: newHash }
  set('kb_users', users)
  return newPassword
}

// ── Birthdays (registros standalone — não-usuários) ──────────────────────────

export function getBirthdays(): Birthday[] { return get<Birthday>('kb_birthdays') }

export function createBirthday(data: Omit<Birthday, 'id' | 'createdAt'>): Birthday {
  const b: Birthday = { ...data, id: uid(), createdAt: new Date().toISOString() }
  set('kb_birthdays', [...getBirthdays(), b])
  return b
}

export function updateBirthday(id: string, data: Partial<Omit<Birthday, 'id' | 'createdAt'>>): Birthday {
  const list = getBirthdays()
  const idx = list.findIndex((b) => b.id === id)
  if (idx < 0) throw new Error('Birthday not found')
  const updated = { ...list[idx], ...data }
  list[idx] = updated
  set('kb_birthdays', list)
  return updated
}

export function deleteBirthday(id: string): void {
  set('kb_birthdays', getBirthdays().filter((b) => b.id !== id))
}

// Lista pré-carregada no boot (idempotente — não duplica).
export const SEED_BIRTHDAYS: Array<{ name: string; month: number; day: number }> = [
  { name: 'Emily Giovana', month: 10, day: 24 },
  { name: 'Beatriz G.', month: 7, day: 1 },
  { name: 'Dafiny', month: 6, day: 30 },
  { name: 'Lara', month: 6, day: 19 },
  { name: 'Emilly O.', month: 11, day: 11 },
  { name: 'Isabella', month: 7, day: 18 },
  { name: 'Érick', month: 5, day: 7 },
  { name: 'Thomaz', month: 5, day: 7 },
  { name: 'Maicon', month: 10, day: 19 },
  { name: 'Lucas', month: 12, day: 8 },
  { name: 'Ryan', month: 7, day: 5 },
  { name: 'Jonas', month: 6, day: 23 },
]

// Garante que cada item de SEED_BIRTHDAYS exista em kb_birthdays. Match por
// nome (case-insensitive) + mês + dia, para evitar duplicação após reboots.
export async function ensureBirthdays(): Promise<void> {
  const existing = getBirthdays()
  const key = (n: string, m: number, d: number) => `${n.toLowerCase().trim()}|${m}|${d}`
  const existingSet = new Set(existing.map((b) => key(b.name, b.month, b.day)))
  let changed = false
  for (const sb of SEED_BIRTHDAYS) {
    if (existingSet.has(key(sb.name, sb.month, sb.day))) continue
    existing.push({
      id: uid(),
      name: sb.name,
      month: sb.month,
      day: sb.day,
      createdAt: new Date().toISOString(),
    })
    changed = true
  }
  if (changed) set('kb_birthdays', existing)
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

// Backup "lite" usado pelo auto-sync. Anexos (PDFs/imagens em base64)
// frequentemente passam de 4.5MB no agregado e causam 413 FUNCTION_PAYLOAD_TOO_LARGE
// na Vercel. Aqui removemos o campo `data` dos attachments antes de
// serializar — apenas metadados (id, filename, isImage) seguem.
// Anexos seguem armazenados localmente; só não são propagados entre
// usuários via sync.
export function exportBackupForSync(): BackupPayload {
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith('kb_')) continue
    const value = localStorage.getItem(key)
    if (value === null) continue
    if (key === 'kb_boards') {
      try {
        const boards = JSON.parse(value) as Board[]
        const stripped = boards.map((b) => ({
          ...b,
          columns: b.columns.map((c) => ({
            ...c,
            cards: c.cards.map((card) => ({
              ...card,
              attachments: (card.attachments || []).map((a) => ({ ...a, data: '' })),
            })),
          })),
        }))
        data[key] = JSON.stringify(stripped)
      } catch {
        data[key] = value
      }
      continue
    }
    data[key] = value
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    data,
  }
}

export function importBackup(payload: unknown, mode: 'merge' | 'replace' = 'merge', options: { preserveLocalAttachments?: boolean } = {}): { restored: number; keys: string[] } {
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

  // Preservar attachments locais ao importar de sync: o payload de sync
  // sempre vem sem `data` nos attachments (lite). Antes de gravar, mescla
  // os attachments locais existentes pelo id do card.
  const finalEntries = entries.map(([k, v]) => {
    if (!options.preserveLocalAttachments || k !== 'kb_boards') return [k, v] as const
    try {
      const localRaw = localStorage.getItem('kb_boards')
      if (!localRaw) return [k, v] as const
      const localBoards = JSON.parse(localRaw) as Board[]
      const localAttachmentsByCard = new Map<string, Attachment[]>()
      for (const b of localBoards) {
        for (const c of b.columns) {
          for (const card of c.cards) {
            if (card.attachments?.length) localAttachmentsByCard.set(card.id, card.attachments)
          }
        }
      }
      if (localAttachmentsByCard.size === 0) return [k, v] as const
      const incoming = JSON.parse(v as string) as Board[]
      const merged = incoming.map((b) => ({
        ...b,
        columns: b.columns.map((c) => ({
          ...c,
          cards: c.cards.map((card) => {
            const localAtt = localAttachmentsByCard.get(card.id)
            if (!localAtt?.length) return card
            // Para cada attachment incoming sem data, se temos versão local com data, usar local.
            const localById = new Map(localAtt.map((a) => [a.id, a]))
            const mergedAttachments = (card.attachments || []).map((a) => {
              if (a.data) return a
              const local = localById.get(a.id)
              return local?.data ? local : a
            })
            return { ...card, attachments: mergedAttachments }
          }),
        })),
      }))
      return [k, JSON.stringify(merged)] as const
    } catch {
      return [k, v] as const
    }
  })

  if (mode === 'replace') {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('kb_')) toRemove.push(key)
    }
    toRemove.forEach((k) => localStorage.removeItem(k))
  }

  for (const [k, v] of finalEntries) localStorage.setItem(k, v as string)
  return { restored: finalEntries.length, keys: finalEntries.map(([k]) => k) }
}

// ── Seed bootstrap (carrega /seed.json em navegadores zerados) ────────────────

function parseArraySafe<T = unknown>(raw: string | null): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch { return [] }
}

// Carrega o snapshot de dados em /seed.json sempre que faltar conteúdo
// substantivo no navegador atual. Mescla `kb_users` para nunca perder contas
// já criadas localmente, e só sobrescreve `kb_boards`/`kb_songs`/`kb_invites`
// quando estiverem vazios. Isso garante que usuários novos (que já criaram
// conta em navegadores não zerados) também recebam os quadros/louvores do
// snapshot na próxima abertura do app.
export async function ensureSeedLoaded(): Promise<{ loaded: boolean; reason?: string }> {
  const existingBoards = parseArraySafe<Board>(localStorage.getItem('kb_boards'))
  const existingSongs = parseArraySafe<Song>(localStorage.getItem('kb_songs'))
  const existingInvites = parseArraySafe<Invite>(localStorage.getItem('kb_invites'))

  // Se já tem quadros E louvores, não precisa do seed.
  if (existingBoards.length > 0 && existingSongs.length > 0) {
    return { loaded: false, reason: 'already has boards and songs' }
  }

  try {
    const res = await fetch('/seed.json', { cache: 'no-cache' })
    if (!res.ok) return { loaded: false, reason: `fetch ${res.status}` }
    const payload = await res.json()
    if (payload?.version !== 1 || !payload?.data) return { loaded: false, reason: 'invalid seed' }
    const data = payload.data as Record<string, string>

    // kb_users: smart-merge (preserva quem já se cadastrou neste navegador).
    if (typeof data.kb_users === 'string') {
      try {
        const seedUsers = JSON.parse(data.kb_users) as StoredUser[]
        if (Array.isArray(seedUsers)) {
          const existingUsers = parseArraySafe<StoredUser>(localStorage.getItem('kb_users'))
          const existingEmails = new Set(
            existingUsers.map((u) => (u.email || '').toLowerCase())
          )
          const merged = [
            ...existingUsers,
            ...seedUsers.filter((u) => !existingEmails.has((u.email || '').toLowerCase())),
          ]
          localStorage.setItem('kb_users', JSON.stringify(merged))
        }
      } catch { /* seed kb_users inválido, ignora */ }
    }

    // kb_boards / kb_songs / kb_invites: só carrega se estiver vazio aqui.
    const fillIfEmpty = (key: 'kb_boards' | 'kb_songs' | 'kb_invites', isEmpty: boolean) => {
      if (!isEmpty) return
      const v = data[key]
      if (typeof v !== 'string') return
      try { JSON.parse(v) } catch { return }
      localStorage.setItem(key, v)
    }
    fillIfEmpty('kb_boards', existingBoards.length === 0)
    fillIfEmpty('kb_songs', existingSongs.length === 0)
    fillIfEmpty('kb_invites', existingInvites.length === 0)

    // Demais chaves auxiliares (kb_theme, kb_wa_contact, etc.): só seta se
    // ainda não existir, para não sobrescrever escolhas locais.
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith('kb_') || typeof v !== 'string') continue
      if (k === 'kb_users' || k === 'kb_boards' || k === 'kb_songs' || k === 'kb_invites') continue
      if (k === 'kb_session') continue // sessão é por navegador, nunca importar
      if (localStorage.getItem(k) !== null) continue
      try { JSON.parse(v) } catch { continue }
      localStorage.setItem(k, v)
    }

    return { loaded: true }
  } catch (e) {
    return { loaded: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

// ── Super-admin bootstrap ─────────────────────────────────────────────────────

// Garante que cada e-mail em ADMIN_EMAILS exista como conta admin neste
// navegador. Se a conta não existir, cria com SUPER_ADMIN_DEFAULT_PASSWORD.
// Se existir mas não for admin, promove. Chamada no boot do app.
export async function ensureSuperAdmin(): Promise<void> {
  const users = get<StoredUser>('kb_users')
  let changed = false
  for (const email of ADMIN_EMAILS) {
    const lower = email.toLowerCase()
    const idx = users.findIndex((u) => u.email.toLowerCase() === lower)
    if (idx < 0) {
      const passwordHash = await hashPassword(SUPER_ADMIN_DEFAULT_PASSWORD)
      const user: StoredUser = {
        id: uid(),
        name: SUPER_ADMIN_DEFAULT_NAME,
        email,
        role: 'admin',
        createdAt: new Date().toISOString(),
        passwordHash,
      }
      users.push(user)
      changed = true
    } else if (users[idx].role !== 'admin') {
      users[idx] = { ...users[idx], role: 'admin' }
      changed = true
    }
  }
  if (changed) set('kb_users', users)
}

// ── Board guests bootstrap ────────────────────────────────────────────────────

// Para cada e-mail de BOARD_GUEST_EMAILS: garante que exista uma conta
// (auto-cria com a senha padrão SUPER_ADMIN_DEFAULT_PASSWORD se ainda não
// existir), sincroniza o nome esperado, força role 'user' (rebaixa se
// estava admin de versão anterior) e adiciona como membro de todos os
// quadros. Chamada no boot do app e logo após o registro.
//
// A conta auto-criada é "sombra": funciona como placeholder com senha
// padrão. Quando o dono real do e-mail acessar /register pelo link de
// convite e definir a senha pessoal, authRegister reconhece o e-mail
// pré-autorizado e faz "claim" da conta sombra (atualiza senha e nome).
export async function ensureBoardGuests(): Promise<void> {
  const users = get<StoredUser>('kb_users')
  let usersChanged = false
  const ensured: User[] = []

  for (const { email, name } of BOARD_GUEST_EMAILS) {
    const lower = email.toLowerCase()
    let idx = users.findIndex((u) => u.email.toLowerCase() === lower)
    if (idx < 0) {
      const passwordHash = await hashPassword(SUPER_ADMIN_DEFAULT_PASSWORD)
      const user: StoredUser = {
        id: uid(),
        name,
        email,
        role: 'user',
        createdAt: new Date().toISOString(),
        passwordHash,
      }
      users.push(user)
      idx = users.length - 1
      usersChanged = true
    } else {
      const u = users[idx]
      const next = { ...u }
      let touched = false
      if (u.name !== name) { next.name = name; touched = true }
      if (u.role !== 'user') { next.role = 'user'; touched = true }
      if (touched) { users[idx] = next; usersChanged = true }
    }
    const { passwordHash: _ph, ...pub } = users[idx]
    ensured.push(pub)
  }
  if (usersChanged) set('kb_users', users)
  if (ensured.length === 0) return

  const boards = loadBoards()
  let boardsChanged = false
  const nextBoards = boards.map((b) => {
    const toAdd = ensured.filter((u) => !b.members.some((m) => m.userId === u.id))
    if (toAdd.length === 0) return b
    boardsChanged = true
    return {
      ...b,
      members: [
        ...b.members,
        ...toAdd.map((u) => ({
          id: uid(),
          boardId: b.id,
          userId: u.id,
          role: 'member' as const,
          user: u,
        })),
      ],
    }
  })
  if (boardsChanged) saveBoards(nextBoards)
}

// ── Password overrides ────────────────────────────────────────────────────────

// Senhas que devem ser forçadas para um usuário, independente do que esteja
// gravado em kb_users. Útil quando um usuário esqueceu a senha e o admin
// quer fixar uma senha temporária no código (a sincronização propaga o hash
// para todos os navegadores).
//
// Para remover uma entrada (e permitir que o usuário troque a senha
// livremente), apague a linha aqui e dê deploy. Para forçar reset de novo
// depois de o usuário trocar, mude a `version`.
export const PASSWORD_OVERRIDES: Array<{ email: string; password: string; version: string }> = [
  { email: 'contato.ntnathan@gmail.com', password: '020516lnr', version: '2026-05-15' },
]

// Aplica os overrides em kb_users. Estratégia "convergente": sempre que o
// hash atual diferir do alvo, atualiza. Isso garante que, mesmo após um
// pull do servidor com hash antigo, o override seja re-aplicado.
export async function ensurePasswordOverrides(): Promise<void> {
  const users = get<StoredUser>('kb_users')
  let changed = false
  for (const ovr of PASSWORD_OVERRIDES) {
    const lower = ovr.email.toLowerCase()
    const idx = users.findIndex((u) => u.email.toLowerCase() === lower)
    if (idx < 0) continue
    const targetHash = await hashPassword(ovr.password)
    if (users[idx].passwordHash === targetHash) continue
    users[idx] = { ...users[idx], passwordHash: targetHash }
    changed = true
  }
  if (changed) set('kb_users', users)
}
