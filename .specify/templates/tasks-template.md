# Tasks: [FEATURE_NAME]

**Feature ID**: [NNN-feature-slug]
**Plan**: ./plan.md

> Tarefas ordenadas por dependência. `[P]` = pode rodar em paralelo. Marque `[x]` ao concluir.

## Fase 1 — Dados & Segurança
- [ ] T001 — Criar/alterar tabela(s) via migração idempotente
- [ ] T002 — Habilitar RLS + política `my_workspace_id()` para cada tabela nova
- [ ] T003 — Seed de dados padrão (se aplicável)

## Fase 2 — Servidor
- [ ] T010 — Query no `page.tsx` filtrando por `workspace_id`
- [ ] T011 [P] — API route para ações com service role (se houver criação de usuário/escrita privilegiada)

## Fase 3 — Interface
- [ ] T020 — Client Component reutilizando `EditableHeader` + primitivos de UI
- [ ] T021 [P] — Formulário/modal de criação/edição
- [ ] T022 [P] — Estados vazios, busca e filtros

## Fase 4 — Permissões
- [ ] T030 — Gate de `canEdit` na UI conforme papel
- [ ] T031 — Verificação de papel no servidor

## Fase 5 — Verificação
- [ ] T040 — `next build` limpo
- [ ] T041 — Validar dado real de ponta a ponta (criar → ler → conferir no banco)
- [ ] T042 — Conformidade com a constituição revisada
