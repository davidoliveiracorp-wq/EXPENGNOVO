// Endpoint de diagnóstico — confirma que a function roda e que o banco
// Neon Postgres está acessível.

import { pingDb } from './_lib/db.js'

declare const process: { env: { [key: string]: string | undefined } }

type ResLike = { setHeader: (k: string, v: string) => void; statusCode?: number; end: (data: string) => void }

export default async function handler(_req: unknown, res: ResLike): Promise<void> {
  res.setHeader('Content-Type', 'application/json')
  const databaseUrlSet = !!process.env.DATABASE_URL
  if (!databaseUrlSet) {
    res.statusCode = 200
    res.end(JSON.stringify({
      ok: false,
      ts: new Date().toISOString(),
      databaseUrlSet: false,
      db: { ok: false, error: 'DATABASE_URL não configurado.' },
    }))
    return
  }
  const db = await pingDb()
  res.statusCode = 200
  res.end(JSON.stringify({
    ok: db.ok,
    ts: new Date().toISOString(),
    databaseUrlSet: true,
    db,
  }))
}
