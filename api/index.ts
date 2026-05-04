import express from 'express'
import cors from 'cors'
import authRoutes from '../backend/src/routes/auth'
import boardRoutes from '../backend/src/routes/boards'
import columnRoutes from '../backend/src/routes/columns'
import cardRoutes from '../backend/src/routes/cards'

const app = express()

app.use(cors({ origin: '*' }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/boards', boardRoutes)
app.use('/api', columnRoutes)
app.use('/api', cardRoutes)
app.get('/api/health', (_, res) => res.json({ status: 'ok' }))

export default app
