# Implementation Plan: [FEATURE_NAME]

**Feature ID**: [NNN-feature-slug]
**Spec**: ./spec.md
**Created**: [YYYY-MM-DD]

> Descreve COMO implementar a spec. MUST estar em conformidade com a constituição.

## Constitution Check

Confirme conformidade com cada princípio antes de prosseguir (justifique exceções):

- [ ] **I. Isolamento Multi-Tenant** — todas as tabelas/queries filtram por `workspace_id`
- [ ] **II. RLS Sem Recursão** — políticas usam `my_workspace_id()`, sem subquery na própria tabela
- [ ] **III. Papéis e Permissões** — ações sensíveis checadas no servidor + UI; service role só no servidor
- [ ] **IV. Verificar Antes de Concluir** — plano inclui `next build` + validação de dado real
- [ ] **V. Consistência Visual Notion** — reúso de `EditableHeader`/primitivos/`KanbanBoard`

## Abordagem Técnica

[Resumo da estratégia: que componentes/rotas/tabelas serão criados ou alterados.]

## Mudanças de Schema

| Tabela | Mudança | Migração | RLS |
|--------|---------|----------|-----|
| … | `ADD COLUMN …` | `migrate-xxx.mjs` | `USING (workspace_id = my_workspace_id())` |

## Arquivos Afetados

- `src/app/(dashboard)/[modulo]/page.tsx` — server fetch
- `src/app/(dashboard)/[modulo]/[Modulo]Client.tsx` — UI
- `src/components/...` — componentes reutilizados/criados

## Riscos e Decisões

- [risco] → [mitigação]

## Verificação

- Como rodar: `node node_modules/next/dist/bin/next build && … start --port 3010`
- Checagem de dado real: [query/credencial usada para validar]
