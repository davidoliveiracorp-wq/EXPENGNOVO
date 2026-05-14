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

export const config = { runtime: 'edge' }

interface SendPayload {
  to: string | string[]
  subject: string
  text?: string
  html?: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'

  if (!apiKey) {
    return json({ error: 'RESEND_API_KEY não configurado no servidor.' }, 503)
  }

  let payload: SendPayload
  try {
    payload = (await req.json()) as SendPayload
  } catch {
    return json({ error: 'JSON inválido no body.' }, 400)
  }

  if (!payload.to || !payload.subject || (!payload.text && !payload.html)) {
    return json({ error: 'Campos obrigatórios: to, subject, text|html.' }, 400)
  }

  const toList = Array.isArray(payload.to) ? payload.to : [payload.to]
  if (toList.length === 0 || toList.some((e) => !e || !e.includes('@'))) {
    return json({ error: 'Campo "to" deve conter e-mails válidos.' }, 400)
  }

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: toList,
      subject: payload.subject,
      ...(payload.html ? { html: payload.html } : {}),
      ...(payload.text ? { text: payload.text } : {}),
    }),
  })

  if (!resendRes.ok) {
    const details = await resendRes.text()
    return json({ error: 'Resend falhou', status: resendRes.status, details }, 502)
  }

  const data = await resendRes.json().catch(() => ({}))
  return json({ ok: true, id: data?.id })
}
