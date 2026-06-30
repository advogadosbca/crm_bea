# Deploy do CRM Bernardes & Azevedo — Supabase Cloud

O app roda em container Docker e usa o Supabase Cloud como backend.
Domínio de produção: **https://crm.bernardeseazevedo.com.br**

Há dois caminhos. Use o **A) Swarm** (que é o seu ambiente atual no Portainer).

---

## A) VPS / Docker Swarm + Traefik (Portainer) — RECOMENDADO

Arquivo: **`stack.yml`**. O Swarm **não builda imagem**, então o fluxo é:
**(1) buildar a imagem na VPS → (2) deployar a stack.**

### 1. Clonar o repositório na VPS
```bash
cd /opt
git clone https://github.com/advogadosbca/crm_bea.git
cd crm_bea
```

### 2. Buildar a imagem (com as chaves públicas embutidas no build)
```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://SEU_PROJETO.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ...anon..." \
  -t crm-bernardes:latest .
```
> Imagem fica local no nó manager (onde a stack roda). Em cluster multi-nó, use um registry.

### 3. Deployar a stack
**Portainer:** Stacks → Add stack → cole o conteúdo de `stack.yml` → em **Environment variables** preencha:
```
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon...
SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
```
→ Deploy.

**CLI:**
```bash
export NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
docker stack deploy -c stack.yml crm
```

O Traefik roteia `crm.bernardeseazevedo.com.br` → container porta 3000
(rede `network_swarm_public`, certresolver `letsencryptresolver`, entrypoint `websecure`).

### 4. Atualizações futuras
```bash
cd /opt/crm_bea && git pull
docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... -t crm-bernardes:latest .
docker service update --image crm-bernardes:latest --force crm_crm
```

---

## B) docker compose (não-Swarm) — alternativo
Arquivo `docker-compose.yml` (faz `build` automático). Use só se NÃO for Swarm:
```bash
cd /opt/crm_bea
# .env com as 3 vars + CRM_DOMAIN + TRAEFIK_CERTRESOLVER
docker compose up -d --build
```

---

## Cloudflare (DNS)
Registro **A**: `crm` → `46.224.209.229`.
- Para o Let's Encrypt do Traefik funcionar: deixe **DNS only (cinza)** até o cert ser emitido, ou use **SSL Full (strict)** + DNS-01 da Cloudflare no Traefik.

## ⚠️ Supabase Auth (URLs)
O Site URL e Redirect URLs precisam apontar para `https://crm.bernardeseazevedo.com.br`
(senão e-mails de confirmação/convite/reset quebram). Já configurável via Management API.

## Notas
- Node 22; build usa `output: standalone`.
- `NEXT_PUBLIC_*` são embutidas no build (build args). A `SERVICE_ROLE` entra só em runtime.
