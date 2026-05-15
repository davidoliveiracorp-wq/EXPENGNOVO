// Endpoint de diagnóstico — não usa @vercel/blob, retorna instantaneamente.
// Usar para confirmar que serverless functions estão saudáveis e que as
// env vars estão disponíveis.

declare const process: { env: { [key: string]: string | undefined } }

export default async function handler(_req: Request): Promise<Response> {
  const body = {
    ok: true,
    ts: new Date().toISOString(),
    blobTokenSet: !!process.env.BLOB_READ_WRITE_TOKEN,
    blobTokenPrefix: process.env.BLOB_READ_WRITE_TOKEN?.slice(0, 24) || null,
    nodeVersion: typeof process !== 'undefined' ? (process as unknown as { version?: string }).version : 'unknown',
  }
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
