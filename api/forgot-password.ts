// Serverless function (Vercel) — recuperação de senha.
//
// POST /api/forgot-password  body: { email }
//
// Fluxo:
// 1. Lê o estado compartilhado do Blob (mesmo blob usado por /api/sync)
// 2. Localiza o usuário em kb_users pelo e-mail (case-insensitive)
// 3. Gera uma senha aleatória de 10 caracteres
// 4. Atualiza o passwordHash no kb_users do blob (SHA-256 + base64,
//    mesmo algoritmo do frontend em src/lib/storage.ts hashPassword)
// 5. Envia a senha por e-mail via Resend
//
// Resposta inclui `tempPassword` quando Resend não está configurado, para
// permitir a recuperação mesmo sem SMTP em piloto inicial.
//
// Requer no Vercel:
//   BLOB_READ_WRITE_TOKEN — auto-injetado se Vercel Blob estiver conectado
//   RESEND_API_KEY        — opcional; sem ele, mostra a senha na resposta
//   RESEND_FROM_EMAIL     — opcional; padrão 'onboarding@resend.dev'

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

async function sendEmail(to: string, name: string, password: string): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY ausente' }
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
  const subject = 'Sua nova senha — Expansão'
  const text =
    `Olá, ${name}!\n\n` +
    `Foi solicitada a recuperação da sua senha. Use a senha temporária abaixo para entrar:\n\n` +
    `    ${password}\n\n` +
    `Recomendamos que você troque essa senha após o login.\n`
  const html =
    `<p>Olá, <strong>${name}</strong>!</p>` +
    `<p>Foi solicitada a recuperação da sua senha. Use a senha temporária abaixo para entrar:</p>` +
    `<p style="font-family:monospace;font-size:18px;padding:12px 16px;background:#f4f4f4;border-radius:8px;display:inline-block">${password}</p>` +
    `<p>Recomendamos que você troque essa senha após o login.</p>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [to], subject, text, html }),
  })
  if (!res.ok) {
    const details = await res.text().catch(() => '')
    return { sent: false, error: `Resend HTTP ${res.status}: ${details.slice(0, 200)}` }
  }
  return { sent: true }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return json({ error: 'Vercel Blob não configurado.' }, 503)

  let body: { email?: string }
  try { body = await req.json() } catch { return json({ error: 'JSON inválido no body.' }, 400) }
  const email = (body.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return json({ error: 'E-mail inválido.' }, 400)

  // Lê o estado atual do blob
  let blobs
  try {
    const r = await list({ prefix: BLOB_PATH, token })
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

  // Atualiza kb_users
  let users: Array<{ id: string; name: string; email: string; passwordHash?: string }>
  try { users = JSON.parse(data.kb_users) } catch { return json({ error: 'kb_users corrompido no servidor.' }, 500) }
  const idx = users.findIndex((u) => (u.email || '').toLowerCase() === email)
  if (idx < 0) {
    // Resposta genérica para não vazar quais e-mails estão cadastrados
    return json({ ok: true, sent: false, message: 'Se o e-mail está cadastrado, você receberá a nova senha.' })
  }
  const newPassword = generatePassword()
  const newHash = await hashPassword(newPassword)
  users[idx] = { ...users[idx], passwordHash: newHash }
  data.kb_users = JSON.stringify(users)

  // Grava de volta no blob
  const wrapped = JSON.stringify({
    payload: { ...stored.payload, data },
    updatedAt: new Date().toISOString(),
    updatedBy: 'forgot-password',
  })
  try {
    const newBlob = await put(BLOB_PATH, wrapped, {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'application/json',
      token,
    })
    // limpa blobs antigos
    try {
      const { blobs: all } = await list({ prefix: BLOB_PATH, token })
      const older = all.filter((b) => b.url !== newBlob.url)
      await Promise.all(older.map((b) => del(b.url, { token }).catch(() => null)))
    } catch { /* ignore */ }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro ao gravar blob.' }, 500)
  }

  const userName = users[idx].name || email.split('@')[0]
  const send = await sendEmail(email, userName, newPassword)

  if (send.sent) {
    return json({ ok: true, sent: true, message: 'Nova senha enviada para o e-mail cadastrado.' })
  }
  // Fallback: retorna a senha na resposta quando Resend não está configurado
  return json({
    ok: true,
    sent: false,
    tempPassword: newPassword,
    message: 'Servidor de e-mail não configurado. Use a senha temporária abaixo para entrar.',
    emailError: send.error,
  })
}
