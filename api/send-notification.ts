// Serverless function (Vercel) — envia e-mail via Resend.
//
// Env vars necessárias (configurar em Vercel → Settings → Environment Variables):
//   RESEND_API_KEY    — chave da API criada em resend.com/api-keys
//   RESEND_FROM_EMAIL — remetente (ex: 'notifications@seudominio.com')
//                       Sem domínio verificado: use 'onboarding@resend.dev'
//                       (só envia para o e-mail dono da conta Resend)
//
// Body esperado (POST JSON):
//   { to: string | string[], subject: string, text?: string, html?: string }

declare const process: { env: { [key: string]: string | undefined } }

interface SendPayload {
  to: string | string[]
  subject: string
  text?: string
  html?: string
}

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
  if ((req.method || 'GET').toUpperCase() !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' })
  }
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
  if (!apiKey) return send(res, 503, { error: 'RESEND_API_KEY não configurado no servidor.' })

  let payload: SendPayload
  try { payload = (await readJsonBody(req)) as SendPayload } catch { return send(res, 400, { error: 'JSON inválido no body.' }) }
  if (!payload?.to || !payload?.subject || (!payload?.text && !payload?.html)) {
    return send(res, 400, { error: 'Campos obrigatórios: to, subject, text|html.' })
  }
  const toList = Array.isArray(payload.to) ? payload.to : [payload.to]
  if (toList.length === 0 || toList.some((e) => !e || !e.includes('@'))) {
    return send(res, 400, { error: 'Campo "to" deve conter e-mails válidos.' })
  }

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail,
      to: toList,
      subject: payload.subject,
      ...(payload.html ? { html: payload.html } : {}),
      ...(payload.text ? { text: payload.text } : {}),
    }),
  })
  if (!r.ok) {
    const details = await r.text()
    return send(res, 502, { error: 'Resend falhou', status: r.status, details })
  }
  const data = await r.json().catch(() => ({}))
  return send(res, 200, { ok: true, id: (data as { id?: string })?.id })
}
