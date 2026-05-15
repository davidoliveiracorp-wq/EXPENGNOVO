// Serverless function (Vercel) — recuperação de senha.
//
// POST /api/forgot-password  body: { email }
//
// Fluxo (100% Vercel + Git, sem SMTP):
// 1. Lê o estado compartilhado do Blob (mesmo blob usado por /api/sync)
// 2. Localiza o usuário em kb_users pelo e-mail (case-insensitive)
// 3. Gera uma senha aleatória de 10 caracteres
// 4. Atualiza o passwordHash no kb_users do blob (SHA-256 + base64,
//    mesmo algoritmo do frontend em src/lib/storage.ts hashPassword)
// 5. Retorna a nova senha na resposta JSON para o cliente exibir na tela
//
// Não envia e-mail por design — Vercel/GitHub não têm serviço SMTP nativo.
// O usuário copia a senha exibida e usa imediatamente para entrar.
//
// Requer no Vercel:
//   BLOB_READ_WRITE_TOKEN — auto-injetado se Vercel Blob estiver conectado

import { put, list, del } from '@vercel/blob'

declare const process: { env: { [key: string]: string | undefined } }

const BLOB_PATH = 'shared-state.json'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function generatePassword(): string {
  // Evita caracteres ambíguos (0/O, 1/l/I)
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let pw = ''
  const arr = new Uint32Array(10)
  crypto.getRandomValues(arr)
  for (let i = 0; i < arr.length; i++) pw += chars[arr[i] % chars.length]
  return pw
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return json({ error: 'Vercel Blob não configurado.' }, 503)

  let body: { email?: string }
  try { body = await req.json() } catch { return json({ error: 'JSON inválido no body.' }, 400) }
  const email = (body.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return json({ error: 'E-mail inválido.' }, 400)

  let blobs
  try {
    const r = await list({ prefix: BLOB_PATH })
    blobs = r.blobs
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro ao listar blobs.' }, 500)
  }
  if (blobs.length === 0) {
    return json({ error: 'Servidor ainda não tem dados. Peça ao admin para fazer o primeiro sync.' }, 409)
  }
  const sorted = [...blobs].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
  const latest = sorted[0]
  const blobRes = await fetch(latest.url, { cache: 'no-store' })
  if (!blobRes.ok) return json({ error: `Falha ao baixar blob: ${blobRes.status}` }, 502)
  const stored: { payload?: { data?: Record<string, string> } } = await blobRes.json()
  const data = stored?.payload?.data
  if (!data || !data.kb_users) return json({ error: 'Estado do servidor não tem usuários.' }, 409)

  let users: Array<{ id: string; name?: string; email: string; passwordHash?: string }>
  try { users = JSON.parse(data.kb_users) } catch { return json({ error: 'kb_users corrompido no servidor.' }, 500) }
  const idx = users.findIndex((u) => (u.email || '').toLowerCase() === email)
  if (idx < 0) {
    // Resposta genérica — não vaza quais e-mails estão cadastrados
    return json({
      ok: false,
      message: 'Não encontramos esse e-mail. Verifique se está correto.',
    })
  }

  const newPassword = generatePassword()
  const newHash = await hashPassword(newPassword)
  users[idx] = { ...users[idx], passwordHash: newHash }
  data.kb_users = JSON.stringify(users)

  const wrapped = JSON.stringify({
    payload: { ...stored.payload, data },
    updatedAt: new Date().toISOString(),
    updatedBy: `${users[idx].name || email} (esqueci-a-senha)`,
  })
  try {
    const newBlob = await put(BLOB_PATH, wrapped, {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'application/json',
    })
    try {
      const { blobs: all } = await list({ prefix: BLOB_PATH })
      const older = all.filter((b) => b.url !== newBlob.url)
      await Promise.all(older.map((b) => del(b.url).catch(() => null)))
    } catch { /* ignore cleanup */ }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro ao gravar blob.' }, 500)
  }

  return json({
    ok: true,
    tempPassword: newPassword,
    name: users[idx].name || null,
    message: 'Nova senha gerada. Copie e use abaixo para entrar.',
  })
}
