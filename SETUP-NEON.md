# Setup do banco de dados (Neon Postgres)

O app agora usa **Neon Postgres** como backend de sincronização em vez do
Vercel Blob. Estado compartilhado entre todos os usuários fica numa única
linha (`id=1`) da tabela `shared_state`, com o JSON do app em coluna `JSONB`.

## Por que essa mudança

- O Blob anterior precisava de um "primeiro push" manual do admin para
  popular o servidor; antes disso, ninguém em um navegador zerado
  conseguia logar nem usar "Esqueci a senha".
- Com Postgres, o schema é criado automaticamente na primeira chamada e
  o Neon entrega **backup nativo (Point-in-Time Recovery)** de 7 dias no
  plano free — não precisamos cuidar disso manualmente.
- A GitHub Action `.github/workflows/daily-snapshot.yml` continua
  funcionando porque ela só consome `GET /api/sync` — indiferente ao
  backend que está por trás.

## Passos no Vercel (~3 minutos)

1. Abra o projeto **expengnovo** no [dashboard da Vercel](https://vercel.com/dashboard).
2. Vá em **Storage** → **Create Database** → **Neon Postgres** (marketplace).
3. Aceite o plano **Free** (0,5GB, mais que suficiente).
4. Quando o provisionamento terminar, clique em **Connect to Project** e
   selecione **Production**, **Preview** e **Development**.
   - Isso injeta `DATABASE_URL` automaticamente como variável de
     ambiente em todos os ambientes.
5. Vá em **Deployments** → última deploy → **Redeploy** (para o build
   pegar a nova var).

## Validação

Após o redeploy, abra:

- `https://expengnovo.vercel.app/api/health` → deve retornar `ok: true`,
  `databaseUrlSet: true`, `db.ok: true`.
- `https://expengnovo.vercel.app/api/sync` (GET) → deve retornar
  `{ payload: null, updatedAt: null, updatedBy: null }` (servidor vazio,
  esperado na primeira vez).

## Primeiro sync (popular o banco)

1. Logue como admin (`dasioli@gmail.com`) em um navegador que já tenha
   os dados (quadros, louvores, etc.).
2. O auto-push agora detecta servidor vazio + dados locais e dispara
   sozinho dentro de até 30s (era um bug antes — só rodava uma vez por
   navegador). Você verá o status na sidebar piscar `pushing` →
   `idle`.
3. Para forçar manualmente: clique no ícone de seta-pra-cima ao lado do
   indicador de sync na sidebar.

Depois disso, qualquer outro usuário (Emilly, Nathan, etc.) consegue:
- Logar normalmente em navegadores novos (dados puxam via auto-pull).
- Usar "Esqueci a senha" pra gerar nova senha sem depender de SMTP.

## Backup

- **Automático (Neon)**: PITR de 7 dias incluído no plano free. Painel
  Neon → Branches → você pode restaurar para qualquer ponto.
- **Automático (Git)**: a Action `daily-snapshot.yml` continua rodando
  todo dia às 00:00 BRT, commitando o JSON em `data/snapshot-*.json` no
  repositório. Mantém últimos 30 dias.
- **Manual**: `GET /api/sync` retorna o backup completo a qualquer hora.

## Schema

```sql
CREATE TABLE shared_state (
  id INTEGER PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  CONSTRAINT shared_state_single_row CHECK (id = 1)
);
```

Criado automaticamente pelo `api/_lib/db.ts` na primeira chamada.

## Rollback (se algo der errado)

Voltar para Vercel Blob é trivial — basta reverter o commit de
migração no Git. Os dados do Neon ficam preservados; o blob continua
intacto também (não apagamos nada).

```bash
git revert <commit-sha>
git push
```

## Custos

- Neon free tier: 0,5GB storage + 191 horas-compute/mês. Mais que
  suficiente — o JSON do app tem alguns KB e as queries são raras.
- Vercel Blob: pode ser desativado no painel pra economizar a
  quota gratuita.
