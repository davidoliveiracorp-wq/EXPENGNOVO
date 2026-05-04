import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import authRoutes from './routes/auth'
import boardRoutes from './routes/boards'
import columnRoutes from './routes/columns'
import cardRoutes from './routes/cards'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/boards', boardRoutes)
app.use('/api', columnRoutes)
app.use('/api', cardRoutes)

app.get('/api/health', (_, res) => res.json({ status: 'ok' }))

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})
