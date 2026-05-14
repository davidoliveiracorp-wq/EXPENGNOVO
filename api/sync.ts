// Serverless function (Vercel) — sincronização do estado do app entre usuários.
//
// GET  /api/sync   → retorna { payload, updatedAt, updatedBy } do blob compartilhado
// POST /api/sync   → recebe { payload, updatedBy } e grava como versão atual
//
// Requer: Vercel Blob habilitado no projeto (Dashboard → Storage → Create Store
// → Blob → Connect). O env var BLOB_READ_WRITE_TOKEN é injetado automaticamente.

import { put, list } from '@vercel/blob'

export const config = { runtime: 'edge' }

const BLOB_PATH = 'shared-state.json'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return json({ error: 'Vercel Blob não configurado (BLOB_READ_WRITE_TOKEN ausente).' }, 503)
  }

  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: BLOB_PATH, token })
      if (blobs.length === 0) {
        return json({ payload: null, updatedAt: null, updatedBy: null })
      }
      const latest = blobs[0]
      const res = await fetch(latest.url, { cache: 'no-store' })
      if (!res.ok) return json({ error: `Falha ao buscar blob: ${res.status}` }, 502)
      const text = await res.text()
      let stored: { payload?: unknown; updatedAt?: string; updatedBy?: string } = {}
      try { stored = JSON.parse(text) } catch { return json({ error: 'Conteúdo do blob inválido.' }, 502) }
      return json({
        payload: stored.payload ?? null,
        updatedAt: stored.updatedAt ?? latest.uploadedAt,
        updatedBy: stored.updatedBy ?? null,
      })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Erro inesperado.' }, 500)
    }
  }

  if (req.method === 'POST') {
    let body: { payload?: unknown; updatedBy?: string }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'JSON inválido no body.' }, 400)
    }
    if (!body?.payload) {
      return json({ error: 'Campo "payload" é obrigatório.' }, 400)
    }
    const wrapped = JSON.stringify({
      payload: body.payload,
      updatedAt: new Date().toISOString(),
      updatedBy: body.updatedBy || 'unknown',
    })
    try {
      const blob = await put(BLOB_PATH, wrapped, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        token,
      })
      return json({ ok: true, url: blob.url, updatedAt: new Date().toISOString() })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Erro ao gravar blob.' }, 500)
    }
  }

  return json({ error: 'Method not allowed' }, 405)
}
