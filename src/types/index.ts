export interface User {
  id: string
  name: string
  email: string
  avatar?: string
  createdAt: string
}

export interface BoardMember {
  id: string
  userId: string
  boardId: string
  role: string
  user: User
}

export interface ChecklistItem {
  id: string
  title: string
  completed: boolean
  checklistId: string
}

export interface Checklist {
  id: string
  title: string
  cardId: string
  items: ChecklistItem[]
}

export interface Label {
  id: string
  text: string
  color: string
}

export interface Attachment {
  id: string
  filename: string
  url: string
  data?: string   // base64 para imagens
  isImage?: boolean
  cardId: string
  createdAt: string
}

export interface CardMember {
  id: string
  cardId: string
  userId: string
  user: User
}

export interface Card {
  id: string
  title: string
  description?: string
  cover?: string       // base64 da imagem de capa
  labels: Label[]
  order: number
  columnId: string
  creatorId: string
  dueDate?: string
  createdAt: string
  members: CardMember[]
  checklists: Checklist[]
  attachments: Attachment[]
  creator: User
}

export interface Column {
  id: string
  title: string
  color: string
  order: number
  boardId: string
  cards: Card[]
}

export interface Board {
  id: string
  title: string
  description?: string
  background: string
  ownerId: string
  createdAt: string
  owner: User
  members: BoardMember[]
  columns: Column[]
}

export interface Song {
  id: string
  title: string
  artist: string
  key?: string        // Tom: Dó, Ré, Mi, Fá, Sol, Lá, Si (+#/b)
  category?: string   // louvor, adoração, contemplação, evangelismo
  lyrics?: string
  cifra?: string      // cifra em texto
  bpm?: number
  createdAt: string
  createdBy: string
}
