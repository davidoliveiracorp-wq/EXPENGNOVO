import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'

const router = Router()

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) {
      res.status(400).json({ error: 'Nome, email e senha são obrigatórios' })
      return
    }
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      res.status(409).json({ error: 'Email já cadastrado' })
      return
    }
    const hash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { name, email, password: hash },
      select: { id: true, name: true, email: true, avatar: true, createdAt: true },
    })
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' })
    res.status(201).json({ user, token })
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      res.status(400).json({ error: 'Email e senha são obrigatórios' })
      return
    }
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      res.status(401).json({ error: 'Credenciais inválidas' })
      return
    }
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      res.status(401).json({ error: 'Credenciais inválidas' })
      return
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' })
    const { password: _, ...userSafe } = user
    res.json({ user: userSafe, token })
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' })
  }
})

router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) { res.status(401).json({ error: 'Não autorizado' }); return }
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, email: true, avatar: true, createdAt: true },
    })
    if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return }
    res.json({ user })
  } catch {
    res.status(401).json({ error: 'Token inválido' })
  }
})

export default router
