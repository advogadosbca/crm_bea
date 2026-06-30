# Deploy na VPS (Docker / Portainer) — Supabase Cloud

O app roda em container Docker e usa o Supabase Cloud atual como backend.

## 1. Levar o código para a VPS
Use **uma** das opções:
- **Git** (recomendado): suba o projeto para um repositório (GitHub/GitLab) e, no Portainer, crie a Stack via **Repository**.
- **Upload**: compacte a pasta (sem `node_modules` e `.next`) e descompacte na VPS, ex.: `/opt/crm-bernardes`.

## 2. Variáveis de ambiente
Crie um arquivo `.env` ao lado do `docker-compose.yml` (ou preencha em Portainer → Stack → Environment variables):

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon...
SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
```
> Os valores são os mesmos do `.env.local` local. A `SERVICE_ROLE_KEY` é secreta — nunca exponha.

## 3. Subir a stack
**Via Portainer:** Stacks → Add stack → cole o `docker-compose.yml` → preencha as variáveis → Deploy.

**Via linha de comando:**
```bash
cd /opt/crm-bernardes
docker compose up -d --build
```
O app sobe na porta **3010** do host (container escuta na 3000). Ajuste em `docker-compose.yml` se precisar.

## 4. Domínio + HTTPS (reverse proxy)
Aponte seu proxy (Nginx Proxy Manager / Traefik) para o container (porta 3000) ou para a porta publicada (3010) e ative o SSL para o domínio, ex.: `crm.bernardeseazevedo.com.br`.

## 5. IMPORTANTE — ajustar URLs no Supabase
Os e-mails (confirmação/convite/reset) e redirecionamentos hoje apontam para `http://localhost:3010`.
Depois de definir o domínio de produção, é preciso atualizar no Supabase Auth:
- **Site URL** → `https://SEU_DOMINIO`
- **Redirect URLs** → `https://SEU_DOMINIO/**`

(Posso fazer isso por você via Management API — só me passar o domínio.)

## 6. Atualizações futuras
```bash
git pull            # se usou git
docker compose up -d --build
```

## Notas
- Node 22 na imagem; build usa `output: standalone` (imagem enxuta).
- `NEXT_PUBLIC_*` são embutidas no build (por isso vão como build args). A service role entra só em runtime.
