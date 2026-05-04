import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'

const router = Router()
router.use(authMiddleware)

const cardInclude = {
  members: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
  checklists: { include: { items: true } },
  attachments: true,
  creator: { select: { id: true, name: true, email: true, avatar: true } },
}

async function userHasColumn(userId: string, columnId: string) {
  const col = await prisma.column.findUnique({
    where: { id: columnId },
    include: {
      board: {
        include: { members: { where: { userId } } },
      },
    },
  })
  if (!col) return false
  return col.board.ownerId === userId || col.board.members.length > 0
}

router.post('/columns/:columnId/cards', async (req: AuthRequest, res: Response) => {
  try {
    const { columnId } = req.params
    const { title, description, dueDate } = req.body
    if (!title) { res.status(400).json({ error: 'Título obrigatório' }); return }
    if (!await userHasColumn(req.userId!, columnId)) {
      res.status(403).json({ error: 'Sem permissão' }); return
    }
    const count = await prisma.card.count({ where: { columnId } })
    const card = await prisma.card.create({
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        order: count,
        columnId,
        creatorId: req.userId!,
      },
      include: cardInclude,
    })
    res.status(201).json(card)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.get('/cards/:id', async (req: AuthRequest, res: Response) => {
  try {
    const card = await prisma.card.findUnique({
      where: { id: req.params.id },
      include: cardInclude,
    })
    if (!card) { res.status(404).json({ error: 'Card não encontrado' }); return }
    res.json(card)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.put('/cards/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, dueDate } = req.body
    const card = await prisma.card.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      },
      include: cardInclude,
    })
    res.json(card)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.patch('/cards/:id/move', async (req: AuthRequest, res: Response) => {
  try {
    const { columnId, order } = req.body
    const card = await prisma.card.update({
      where: { id: req.params.id },
      data: { columnId, order },
      include: cardInclude,
    })
    res.json(card)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.delete('/cards/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.card.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.post('/cards/:id/members', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.body
    const member = await prisma.cardMember.upsert({
      where: { cardId_userId: { cardId: req.params.id, userId } },
      create: { cardId: req.params.id, userId },
      update: {},
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    })
    res.status(201).json(member)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.delete('/cards/:id/members/:userId', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.cardMember.deleteMany({
      where: { cardId: req.params.id, userId: req.params.userId },
    })
    res.status(204).send()
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.post('/cards/:id/checklists', async (req: AuthRequest, res: Response) => {
  try {
    const { title } = req.body
    const checklist = await prisma.checklist.create({
      data: { title, cardId: req.params.id },
      include: { items: true },
    })
    res.status(201).json(checklist)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.delete('/checklists/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.checklist.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.post('/checklists/:id/items', async (req: AuthRequest, res: Response) => {
  try {
    const { title } = req.body
    const item = await prisma.checklistItem.create({
      data: { title, checklistId: req.params.id },
    })
    res.status(201).json(item)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.patch('/checklist-items/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { completed, title } = req.body
    const item = await prisma.checklistItem.update({
      where: { id: req.params.id },
      data: {
        ...(completed !== undefined && { completed }),
        ...(title && { title }),
      },
    })
    res.json(item)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.delete('/checklist-items/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.checklistItem.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

export default router
