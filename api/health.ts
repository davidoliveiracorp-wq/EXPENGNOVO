// Endpoint de diagnóstico — Node serverless function classic (req, res).
// Sem @vercel/blob, sem export const config. Deve retornar instantaneamente.

declare const process: { env: { [key: string]: string | undefined } }

export default function handler(_req: unknown, res: { setHeader: (k: string, v: string) => void; statusCode?: number; end: (data: string) => void }): void {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 200
  res.end(JSON.stringify({
    ok: true,
    ts: new Date().toISOString(),
    blobTokenSet: !!process.env.BLOB_READ_WRITE_TOKEN,
    blobTokenPrefix: process.env.BLOB_READ_WRITE_TOKEN?.slice(0, 24) || null,
  }))
}
