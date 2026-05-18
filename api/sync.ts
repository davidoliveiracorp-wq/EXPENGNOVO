// Serverless function (Vercel) — sincronização do estado do app entre usuários.
//
// GET  /api/sync   → retorna { payload, updatedAt, updatedBy } da linha
//                    única em shared_state (Neon Postgres).
// POST /api/sync   → recebe { payload, updatedBy } e grava como versão atual
//                    (upsert na linha id=1).
//
// Backend: Neon Postgres via @neondatabase/serverless (driver HTTP, ideal
// para serverless functions). Schema é auto-criado na primeira chamada.
//
// Requer: DATABASE_URL no ambiente (injetada pela integração Neon-Vercel).

import { getSharedState, setSharedState } from './_lib/db'

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

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return send(res, 503, { error: 'Banco de dados não configurado (DATABASE_URL ausente).' })
  }

  const method = (req.method || 'GET').toUpperCase()

  if (method === 'GET') {
    try {
      const state = await getSharedState()
      if (!state) {
        return send(res, 200, { payload: null, updatedAt: null, updatedBy: null })
      }
      return send(res, 200, {
        payload: state.payload,
        updatedAt: state.updatedAt,
        updatedBy: state.updatedBy,
      })
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : 'Erro inesperado.' })
    }
  }

  if (method === 'POST') {
    let body: unknown
    try { body = await readJsonBody(req) } catch { return send(res, 400, { error: 'JSON inválido no body.' }) }
    const b = body as { payload?: unknown; updatedBy?: string } | undefined
    if (!b?.payload) return send(res, 400, { error: 'Campo "payload" é obrigatório.' })
    try {
      const state = await setSharedState(b.payload, b.updatedBy || 'unknown')
      return send(res, 200, { ok: true, updatedAt: state.updatedAt })
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : 'Erro ao gravar no banco.' })
    }
  }

  return send(res, 405, { error: 'Method not allowed' })
}
