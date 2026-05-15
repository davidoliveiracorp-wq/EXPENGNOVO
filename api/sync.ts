// Serverless function (Vercel) — sincronização do estado do app entre usuários.
//
// GET  /api/sync   → retorna { payload, updatedAt, updatedBy } do blob compartilhado
// POST /api/sync   → recebe { payload, updatedBy } e grava como versão atual
//
// Requer: Vercel Blob habilitado no projeto (Dashboard → Storage → Create Store
// → Blob → Connect). O env var BLOB_READ_WRITE_TOKEN é injetado automaticamente.
//
// Estratégia: cada POST cria um blob com sufixo aleatório (addRandomSuffix:true),
// depois deleta os antigos. Assim evita depender da option `allowOverwrite` (que
// só existe em versões mais novas do @vercel/blob). GET ordena por uploadedAt
// e retorna o mais recente.

import { put, list, del } from '@vercel/blob'

// Roda em Edge runtime — Vercel só suporta handler Web Standard
// (Request -> Response) em Edge functions. @vercel/blob 1.x suporta
// Edge (a versão 0.27.x antiga tinha o problema de undici).
export const config = { runtime: 'edge' }

// Declaração mínima para o type-checker (process existe em runtime, mas
// sem @types/node o TS não sabe).
declare const process: { env: { [key: string]: string | undefined } }

const BLOB_PATH = 'shared-state.json'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Garante que uma Promise resolva em até `ms`. Se demorar mais, lança erro
// claro em vez de deixar a função inteira estourar o timeout do Vercel.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout ${label} após ${ms}ms`)), ms)
    promise.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

export default async function handler(req: Request): Promise<Response> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return json({ error: 'Vercel Blob não configurado (BLOB_READ_WRITE_TOKEN ausente).' }, 503)
  }

  if (req.method === 'GET') {
    try {
      const { blobs } = await withTimeout(list({ prefix: BLOB_PATH }), 6000, 'blob list')
      if (blobs.length === 0) {
        return json({ payload: null, updatedAt: null, updatedBy: null })
      }
      const sorted = [...blobs].sort(
        (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      )
      const latest = sorted[0]
      const res = await withTimeout(fetch(latest.url, { cache: 'no-store' }), 5000, 'blob fetch')
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
    const updatedAt = new Date().toISOString()
    const wrapped = JSON.stringify({
      payload: body.payload,
      updatedAt,
      updatedBy: body.updatedBy || 'unknown',
    })
    try {
      const blob = await put(BLOB_PATH, wrapped, {
        access: 'public',
        addRandomSuffix: true,
        contentType: 'application/json',
      })
      // Limpeza: deleta blobs antigos do mesmo prefixo para não acumular
      // (free tier do Vercel Blob é 1 GB; cada push gera ~5 MB).
      try {
        const { blobs: all } = await list({ prefix: BLOB_PATH })
        const older = all.filter((b) => b.url !== blob.url)
        await Promise.all(older.map((b) => del(b.url).catch(() => null)))
      } catch {
        /* falha de cleanup não impede o save */
      }
      return json({ ok: true, url: blob.url, updatedAt })
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Erro ao gravar blob.' }, 500)
    }
  }

  return json({ error: 'Method not allowed' }, 405)
}
