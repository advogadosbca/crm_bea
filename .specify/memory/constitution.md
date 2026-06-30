<!--
Sync Impact Report
- Version change: (none) → 1.0.0
- Modified principles: N/A (initial ratification)
- Added sections: Core Principles (5), Stack & Architecture Constraints, Development Workflow, Governance
- Removed sections: none
- Templates requiring updates:
  - ✅ .specify/templates/constitution-template.md (created)
  - ⚠ .specify/templates/plan-template.md (pending — not yet present)
  - ⚠ .specify/templates/spec-template.md (pending — not yet present)
  - ⚠ .specify/templates/tasks-template.md (pending — not yet present)
- Follow-up TODOs: none
-->

# CRM Bernardes & Azevedo Constitution

Sistema de CRM jurídico multi-empresa com estética Notion, construído em Next.js + Supabase.
Esta constituição define as regras inegociáveis que governam o desenvolvimento do projeto.

## Core Principles

### I. Isolamento Multi-Tenant por Workspace
Todo dado de negócio MUST pertencer a um `workspace_id` e ser acessível apenas por membros
daquele workspace. Toda tabela com dados de cliente MUST ter RLS habilitada com política de
isolamento por workspace. Nenhuma query de aplicação pode depender de filtragem manual no
código como única barreira — a RLS é a fronteira de segurança.
**Rationale**: o sistema serve múltiplas empresas simultaneamente; vazamento entre workspaces
é a falha mais grave possível num produto jurídico.

### II. RLS Sem Recursão
Políticas RLS NUNCA podem fazer subconsulta na própria tabela que protegem. A identidade e o
workspace do usuário MUST ser resolvidos por funções `SECURITY DEFINER` (`my_workspace_id()`,
`my_role()`) que leem `profiles` sem disparar RLS. Toda nova tabela segue o padrão
`USING (workspace_id = my_workspace_id())`.
**Rationale**: uma política auto-referente causou erro `42P17 infinite recursion` que derrubou
toda leitura de perfil e dados; este princípio existe para que não se repita.

### III. Papéis e Permissões Explícitos
Existem três perfis: `super_admin`, `admin`, `colaborador`. Ações sensíveis (criar usuários,
editar banner/logo, configurar workspace, gerenciar colunas de kanban) MUST verificar o papel
tanto no servidor (API route / RLS) quanto na UI (`canEdit`). Criação de usuários e operações
com a service role key MUST ocorrer somente em rotas de servidor, nunca no cliente.
**Rationale**: o controle de acesso é parte do contrato com o cliente e não pode ser apenas
cosmético na interface.

### IV. Verificar Antes de Concluir
Toda mudança MUST ser validada com `next build` limpo antes de ser declarada pronta. Quando o
comportamento depende de dados, a verificação MUST checar o dado real (consulta ao banco com o
token apropriado) e não apenas a compilação. Ao reportar resultado, falhas MUST ser declaradas
com a saída real; "pronto" só após verificação efetiva.
**Rationale**: bugs como o build defasado e o card que não aparecia foram diagnosticados apenas
quando se verificou o dado de ponta a ponta em vez de presumir.

### V. Consistência Visual Notion
A interface MUST seguir a estética estabelecida: tema escuro via variáveis CSS
(`--notion-bg`, `--notion-text`, etc.), tipografia IBM Plex, sem emojis como ícones (usar
Lucide ou SVG inline). Componentes compartilhados (`ModuleHeader`/`EditableHeader`, primitivos
de `ui/`, `KanbanBoard`) MUST ser reutilizados em vez de reimplementados por página.
**Rationale**: a coerência visual é requisito explícito do produto e a reutilização mantém o
sistema sustentável conforme novos módulos são adicionados.

## Stack & Architecture Constraints

- **Frontend/Backend**: Next.js 16 (App Router) + Tailwind CSS. Páginas de dados são Server
  Components; interatividade fica em Client Components claramente separados.
- **Dados/Auth/Storage**: Supabase (PostgreSQL + Auth + Storage bucket `assets`). Migrações de
  schema são aplicadas via Management API e versionadas em scripts `.mjs` no repositório.
- **Componentes não-serializáveis** (ícones Lucide) NUNCA são passados como props de Server para
  Client Component; usar um wrapper client (ex.: `HomeHeader`).
- **Execução local**: por causa do `&` no caminho do diretório, usar
  `node node_modules/next/dist/bin/next <cmd>`. Preferir produção (`build` + `start`) para teste;
  rebuild é obrigatório após mudança de código.
- **Configuração sem deploy**: opções de status, colunas de kanban e assets (banner/logo) MUST
  ser editáveis pelo admin via interface, persistidas no banco — não hard-coded.

## Development Workflow

- Mudança de schema → script de migração idempotente (`IF NOT EXISTS` / `ON CONFLICT`) +
  política RLS no mesmo passo.
- Toda nova página de módulo reutiliza `EditableHeader` + primitivos de UI e respeita o
  isolamento por workspace na query do servidor.
- Antes de entregar: `next build` limpo, e quando aplicável validação do dado real.
- Segredos (service role key, access token) ficam em `.env.local` / rotas de servidor, nunca
  expostos ao cliente.

## Governance

Esta constituição prevalece sobre outras práticas do projeto. Emendas MUST ser registradas
neste arquivo com Sync Impact Report e versionamento semântico:

- **MAJOR**: remoção ou redefinição incompatível de um princípio ou regra de governança.
- **MINOR**: novo princípio/seção ou expansão material de orientação.
- **PATCH**: esclarecimentos, correções de texto, refinamentos não-semânticos.

Toda revisão de código e plano de implementação MUST checar conformidade com estes princípios;
violações precisam de justificativa explícita ou correção antes de prosseguir. Datas em formato
ISO `YYYY-MM-DD`.

**Version**: 1.0.0 | **Ratified**: 2026-06-26 | **Last Amended**: 2026-06-26
