// Helper de conexão com Neon Postgres compartilhado pelos endpoints /api/*.
//
// Arquivos sob api/_lib/ não viram Serverless Functions (Vercel ignora
// diretórios prefixados com "_"), então é seguro colocar utilitários aqui.
//
// Schema: uma única linha (id=1) na tabela shared_state. Postgres como
// key-value store, mantendo o contrato anterior do /api/sync (que enviava
// e recebia o backup JSON inteiro).
//
// Requer: DATABASE_URL no ambiente (injetada automaticamente pela
// integração Neon-Vercel no Vercel Marketplace).

import { neon } from '@neondatabase/serverless'

declare const process: { env: { [key: string]: string | undefined } }

export type SharedState = {
  payload: unknown
  updatedAt: string
  updatedBy: string | null
}

let schemaReady = false

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não configurado.')
  return neon(url)
}

// Cria a tabela se ainda não existir. Idempotente. Chamado no início de
// cada operação — a primeira execução paga o custo, as seguintes são
// no-op (CREATE IF NOT EXISTS).
async function ensureSchema(): Promise<void> {
  if (schemaReady) return
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS shared_state (
      id INTEGER PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT,
      CONSTRAINT shared_state_single_row CHECK (id = 1)
    )
  `
  schemaReady = true
}

export async function getSharedState(): Promise<SharedState | null> {
  await ensureSchema()
  const sql = getSql()
  const rows = await sql`
    SELECT payload, updated_at, updated_by
    FROM shared_state
    WHERE id = 1
  ` as Array<{ payload: unknown; updated_at: string | Date; updated_by: string | null }>
  if (rows.length === 0) return null
  const row = rows[0]
  return {
    payload: row.payload,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    updatedBy: row.updated_by,
  }
}

export async function setSharedState(payload: unknown, updatedBy: string): Promise<SharedState> {
  await ensureSchema()
  const sql = getSql()
  const rows = await sql`
    INSERT INTO shared_state (id, payload, updated_at, updated_by)
    VALUES (1, ${JSON.stringify(payload)}::jsonb, NOW(), ${updatedBy})
    ON CONFLICT (id) DO UPDATE
      SET payload = EXCLUDED.payload,
          updated_at = EXCLUDED.updated_at,
          updated_by = EXCLUDED.updated_by
    RETURNING payload, updated_at, updated_by
  ` as Array<{ payload: unknown; updated_at: string | Date; updated_by: string | null }>
  const row = rows[0]
  return {
    payload: row.payload,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    updatedBy: row.updated_by,
  }
}

// Health check leve — apenas confirma que conseguimos conectar e o schema
// está acessível. Não toca em dados.
export async function pingDb(): Promise<{ ok: true; hasState: boolean } | { ok: false; error: string }> {
  try {
    await ensureSchema()
    const sql = getSql()
    const rows = await sql`SELECT 1 AS ok, EXISTS(SELECT 1 FROM shared_state WHERE id = 1) AS has_state` as Array<{ ok: number; has_state: boolean }>
    return { ok: true, hasState: !!rows[0]?.has_state }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
