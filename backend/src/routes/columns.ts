import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'

const router = Router()
router.use(authMiddleware)

async function userHasBoard(userId: string, boardId: string) {
  const board = await prisma.board.findFirst({
    where: {
      id: boardId,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
  })
  return !!board
}

router.post('/boards/:boardId/columns', async (req: AuthRequest, res: Response) => {
  try {
    const { boardId } = req.params
    const { title, color } = req.body
    if (!await userHasBoard(req.userId!, boardId)) {
      res.status(403).json({ error: 'Sem permissão' }); return
    }
    const count = await prisma.column.count({ where: { boardId } })
    const column = await prisma.column.create({
      data: { title, color: color || '#7c6d2e', order: count, boardId },
    })
    res.status(201).json(column)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.put('/columns/:id', async (req: AuthRequest, res: Response) => {
  try {
    const col = await prisma.column.findUnique({ where: { id: req.params.id } })
    if (!col) { res.status(404).json({ error: 'Coluna não encontrada' }); return }
    if (!await userHasBoard(req.userId!, col.boardId)) {
      res.status(403).json({ error: 'Sem permissão' }); return
    }
    const { title, color, order } = req.body
    const updated = await prisma.column.update({
      where: { id: req.params.id },
      data: { ...(title && { title }), ...(color && { color }), ...(order !== undefined && { order }) },
    })
    res.json(updated)
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.delete('/columns/:id', async (req: AuthRequest, res: Response) => {
  try {
    const col = await prisma.column.findUnique({ where: { id: req.params.id } })
    if (!col) { res.status(404).json({ error: 'Coluna não encontrada' }); return }
    if (!await userHasBoard(req.userId!, col.boardId)) {
      res.status(403).json({ error: 'Sem permissão' }); return
    }
    await prisma.column.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch {
    res.status(500).json({ error: 'Erro interno' })
  }
})

export default router
