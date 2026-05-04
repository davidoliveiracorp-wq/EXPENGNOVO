import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'

const router = Router()
router.use(authMiddleware)

const boardInclude = {
  owner: { select: { id: true, name: true, email: true, avatar: true } },
  members: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
  columns: {
    orderBy: { order: 'asc' as const },
    include: {
      cards: {
        orderBy: { order: 'asc' as const },
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
          checklists: { include: { items: true } },
          attachments: true,
          creator: { select: { id: true, name: true, email: true, avatar: true } },
        },
      },
    },
  },
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const boards = await prisma.board.findMany({
      where: {
        OR: [
          { ownerId: req.userId! },
          { members: { some: { userId: req.userId! } } },
        ],
      },
      include: {
        owner: { select: { id: true, name: true, email: true, avatar: true } },
        members: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
        _count: { select: { columns: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(boards)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, background } = req.body
    if (!title) { res.status(400).json({ error: 'Título obrigatório' }); return }
    const board = await prisma.board.create({
      data: {
        title,
        description,
        background: background || '#6b46c1',
        ownerId: req.userId!,
        members: { create: { userId: req.userId!, role: 'owner' } },
        columns: {
          create: [
            { title: 'Eventos', color: '#7c6d2e', order: 0 },
            { title: 'Em preparação', color: '#7c6d2e', order: 1 },
            { title: 'Em execução', color: '#1a6b4a', order: 2 },
            { title: 'Concluído', color: '#7c2020', order: 3 },
          ],
        },
      },
      include: boardInclude,
    })
    res.status(201).json(board)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const board = await prisma.board.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { ownerId: req.userId! },
          { members: { some: { userId: req.userId! } } },
        ],
      },
      include: boardInclude,
    })
    if (!board) { res.status(404).json({ error: 'Quadro não encontrado' }); return }
    res.json(board)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, background } = req.body
    const board = await prisma.board.findFirst({
      where: { id: req.params.id, ownerId: req.userId! },
    })
    if (!board) { res.status(403).json({ error: 'Sem permissão' }); return }
    const updated = await prisma.board.update({
      where: { id: req.params.id },
      data: { title, description, background },
      include: boardInclude,
    })
    res.json(updated)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const board = await prisma.board.findFirst({
      where: { id: req.params.id, ownerId: req.userId! },
    })
    if (!board) { res.status(403).json({ error: 'Sem permissão' }); return }
    await prisma.board.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.post('/:id/members', async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body
    const board = await prisma.board.findFirst({
      where: { id: req.params.id, ownerId: req.userId! },
    })
    if (!board) { res.status(403).json({ error: 'Sem permissão' }); return }
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return }
    const member = await prisma.boardMember.upsert({
      where: { boardId_userId: { boardId: req.params.id, userId: user.id } },
      create: { boardId: req.params.id, userId: user.id, role: 'member' },
      update: {},
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    })
    res.status(201).json(member)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.delete('/:id/members/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const board = await prisma.board.findFirst({
      where: { id: req.params.id, ownerId: req.userId! },
    })
    if (!board) { res.status(403).json({ error: 'Sem permissão' }); return }
    await prisma.boardMember.deleteMany({
      where: { boardId: req.params.id, userId: req.params.userId },
    })
    res.status(204).send()
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

export default router
