// Serverless function (Vercel) — sincronização do estado do app entre usuários.
//
// GET  /api/sync   → retorna { payload, updatedAt, updatedBy } do blob compartilhado
// POST /api/sync   → recebe { payload, updatedBy } e grava como versão atual
//
// Roda em Node runtime (default). Edge não é compatível com @vercel/blob
// porque o SDK usa undici/fastify internamente. Por isso o handler é no
// formato Node legacy (req, res) em vez de Request -> Response.
//
// Requer: Vercel Blob habilitado (BLOB_READ_WRITE_TOKEN auto-injetado).

import { put, list, del } from '@vercel/blob'

declare const process: { env: { [key: string]: string | undefined } }

const BLOB_PATH = 'shared-state.json'

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
  // Vercel parses JSON bodies automatically when Content-Type is application/json
  if (req.body !== undefined) return req.body
  // Fallback: read stream manually
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
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return send(res, 503, { error: 'Vercel Blob não configurado (BLOB_READ_WRITE_TOKEN ausente).' })
  }

  const method = (req.method || 'GET').toUpperCase()

  if (method === 'GET') {
    try {
      const { blobs } = await list({ prefix: BLOB_PATH })
      if (blobs.length === 0) {
        return send(res, 200, { payload: null, updatedAt: null, updatedBy: null })
      }
      const sorted = [...blobs].sort(
        (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      )
      const latest = sorted[0]
      const r = await fetch(latest.url, { cache: 'no-store' })
      if (!r.ok) return send(res, 502, { error: `Falha ao buscar blob: ${r.status}` })
      const text = await r.text()
      let stored: { payload?: unknown; updatedAt?: string; updatedBy?: string } = {}
      try { stored = JSON.parse(text) } catch { return send(res, 502, { error: 'Conteúdo do blob inválido.' }) }
      return send(res, 200, {
        payload: stored.payload ?? null,
        updatedAt: stored.updatedAt ?? latest.uploadedAt,
        updatedBy: stored.updatedBy ?? null,
      })
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : 'Erro inesperado.' })
    }
  }

  if (method === 'POST') {
    let body: { payload?: unknown; updatedBy?: string } | unknown
    try { body = await readJsonBody(req) } catch { return send(res, 400, { error: 'JSON inválido no body.' }) }
    const b = body as { payload?: unknown; updatedBy?: string } | undefined
    if (!b?.payload) return send(res, 400, { error: 'Campo "payload" é obrigatório.' })
    const updatedAt = new Date().toISOString()
    const wrapped = JSON.stringify({
      payload: b.payload,
      updatedAt,
      updatedBy: b.updatedBy || 'unknown',
    })
    try {
      const blob = await put(BLOB_PATH, wrapped, {
        access: 'public',
        addRandomSuffix: true,
        contentType: 'application/json',
      })
      try {
        const { blobs: all } = await list({ prefix: BLOB_PATH })
        const older = all.filter((x) => x.url !== blob.url)
        await Promise.all(older.map((x) => del(x.url).catch(() => null)))
      } catch { /* cleanup pode falhar silenciosamente */ }
      return send(res, 200, { ok: true, url: blob.url, updatedAt })
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : 'Erro ao gravar blob.' })
    }
  }

  return send(res, 405, { error: 'Method not allowed' })
}
