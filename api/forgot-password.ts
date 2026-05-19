// Serverless function (Vercel) — recuperação de senha.
//
// POST /api/forgot-password  body: { email }
//
// Lê kb_users da linha compartilhada em shared_state (Neon Postgres),
// gera uma nova senha aleatória, atualiza o hash do usuário no payload
// e regrava. A nova senha é retornada no response para exibição na tela
// (sem dependência de SMTP).

import { getSharedState, setSharedState } from './_lib/db.js'

declare const process: { env: { [key: string]: string | undefined } }

type ReqLike = {
  method?: string
  on?: (event: 'data' | 'end' | 'error', cb: (chunk?: Buffer | Error) => void) => void
  body?: unknown
}
type ResLike = {
  setHeader: (k: string, v: string) => void
  statusCode?: number
  end: (data?: string) => void
}

function send(res: ResLike, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: ReqLike): Promise<unknown> {
  if (req.body !== undefined) return req.body
  return new Promise((resolve, reject) => {
    if (!req.on) { resolve(undefined); return }
    const chunks: Buffer[] = []
    req.on('data', (c) => { if (c instanceof Buffer) chunks.push(c) })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      try { resolve(raw ? JSON.parse(raw) : undefined) } catch (e) { reject(e) }
    })
    req.on('error', (e) => reject(e instanceof Error ? e : new Error(String(e))))
  })
}

async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let pw = ''
  const arr = new Uint32Array(10)
  crypto.getRandomValues(arr)
  for (let i = 0; i < arr.length; i++) pw += chars[arr[i] % chars.length]
  return pw
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  if ((req.method || 'GET').toUpperCase() !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' })
  }
  if (!process.env.DATABASE_URL) {
    return send(res, 503, { error: 'Banco de dados não configurado (DATABASE_URL ausente).' })
  }

  let body: unknown
  try { body = await readJsonBody(req) } catch { return send(res, 400, { error: 'JSON inválido no body.' }) }
  const email = (((body as { email?: string })?.email) || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return send(res, 400, { error: 'E-mail inválido.' })

  let state
  try {
    state = await getSharedState()
  } catch (e) {
    return send(res, 500, { error: e instanceof Error ? e.message : 'Erro ao consultar banco.' })
  }
  if (!state) {
    return send(res, 409, { error: 'Servidor ainda não tem dados. Peça ao admin para fazer o primeiro sync.' })
  }

  const stored = state.payload as { data?: Record<string, string> } | null
  const data = stored?.data
  if (!data || !data.kb_users) return send(res, 409, { error: 'Estado do servidor não tem usuários.' })

  let users: Array<{ id: string; name?: string; email: string; passwordHash?: string }>
  try { users = JSON.parse(data.kb_users) } catch { return send(res, 500, { error: 'kb_users corrompido no servidor.' }) }
  const idx = users.findIndex((u) => (u.email || '').toLowerCase() === email)
  if (idx < 0) {
    return send(res, 200, { ok: false, message: 'Não encontramos esse e-mail. Verifique se está correto.' })
  }

  const newPassword = generatePassword()
  const newHash = await hashPassword(newPassword)
  users[idx] = { ...users[idx], passwordHash: newHash }
  data.kb_users = JSON.stringify(users)

  try {
    await setSharedState(
      { ...stored, data },
      `${users[idx].name || email} (esqueci-a-senha)`,
    )
  } catch (e) {
    return send(res, 500, { error: e instanceof Error ? e.message : 'Erro ao gravar no banco.' })
  }

  return send(res, 200, {
    ok: true,
    tempPassword: newPassword,
    name: users[idx].name || null,
    message: 'Nova senha gerada. Copie e use abaixo para entrar.',
  })
}
