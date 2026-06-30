# Feature Specification: CRM Jurídico Multi-Empresa (estilo Notion)

**Feature ID**: 001-crm-juridico
**Status**: Implemented (parcial — Fases 1–7) / In Review
**Created**: 2026-06-26
**Last Updated**: 2026-06-26

> Esta especificação descreve O QUE e POR QUÊ. Em conformidade com
> `.specify/memory/constitution.md` (v1.0.0).

## 1. Resumo

CRM jurídico multi-empresa com interface inspirada no Notion. Cada empresa (workspace) tem
página inicial personalizável (banner/logo), painel de colaboradores e módulos de gestão
acessíveis por um menu de ícones. Dados completamente isolados entre empresas. Substitui o
uso do Notion pelo escritório, com controle total dos dados em Supabase.

## 2. Contexto e Motivação

- **Problema**: o escritório operava no Notion, sem controle de dados, automações próprias nem
  multi-tenancy real.
- **Quem é impactado**: `super_admin` (gestão global), `admin` (gestão do workspace),
  `colaborador` (operação dos próprios registros).
- **Resultado esperado**: sistema próprio, rápido, com isolamento por empresa, kanbans e tabelas
  configuráveis, e personalização visual por página.

## 3. User Stories

- Como **admin**, quero personalizar banner e logo (por página ou globais) para refletir a marca.
- Como **admin**, quero cadastrar colaboradores e definir seus papéis.
- Como **colaborador**, quero cadastrar e acompanhar contatos/leads com status e prazos.
- Como **colaborador**, quero mover leads entre etapas de funil arrastando cards.
- Como **admin**, quero adicionar, renomear, recolorir e excluir colunas de funil sem deploy.
- Como **admin**, quero ver alertas de alta prioridade e prazos vencidos em tabelas dedicadas.
- Como **admin**, quero gerir processos judiciais, audiências, financeiro, alvarás e mais.

## 4. Requisitos Funcionais

- **FR-1**: O sistema MUST autenticar via e-mail/senha e redirecionar ao workspace do usuário.
- **FR-2**: A Home MUST exibir banner, logo, painel de membros e grade de 13 módulos.
- **FR-3**: Banner e logo MUST ser editáveis por upload (bucket `assets`), com escolha de escopo
  **"somente esta página"** (tabela `page_assets`) ou **"todas as páginas"** (workspace).
- **FR-4**: O módulo Geral MUST oferecer as visões: Tabelas (Alerta–Alta Prioridade e Prazos
  Vencidos) e 3 Kanbans (Funil Pré-Atendimento, Leads em Negociação, Ações).
- **FR-5**: Kanbans MUST suportar arrastar-e-soltar para mudar o campo de status do contato.
- **FR-6**: Colunas de kanban MUST ser gerenciáveis pelo admin (adicionar / renomear com cascade
  nos contatos / mudar cor / excluir), persistidas em `kanban_columns`.
- **FR-7**: Cada coluna MUST permitir criar um lead já naquele funil ("Nova página" → formulário
  com o funil pré-selecionado).
- **FR-8**: Cadastro de contato MUST conter: nome, origem, status geral, status processual, funil,
  renda, análise jurídica, alerta, datas, total de transações, responsável e observação.
- **FR-9**: Módulos Processos, Audiências, Financeiro, Alvarás, Ações Coletivas, Metas, Ideias,
  Marketing, Administrativo, Membros, Pendências e Settings MUST existir com CRUD próprio.
- **FR-10**: Admin MUST criar usuários via rota de servidor com service role.

## 5. Requisitos Não-Funcionais

- **NFR-1 (Segurança/RLS)**: todas as tabelas de negócio com RLS por `workspace_id` usando
  `my_workspace_id()`; sem políticas recursivas.
- **NFR-2 (Performance)**: deduplicação de `getUser`+perfil por request via `cache()`; preferir
  build de produção para uso (sem recompilar a cada navegação).
- **NFR-3 (Visual/UX)**: tema escuro Notion, IBM Plex, sem emojis como ícones, componentes
  compartilhados reutilizados.

## 6. Modelo de Dados

| Entidade | Campos-chave | Observações |
|----------|--------------|-------------|
| `workspaces` | name, slug, banner_url, logo_url | raiz do tenant |
| `profiles` | full_name, email, role, workspace_id | estende auth.users |
| `contacts` | name, origem, status_geral, status_processual, funil_status, renda, analise_juridica, prazo_execucao, total_transacoes, responsavel_id | núcleo do CRM |
| `processos` | numero, grau_jurisdicao, prazo_limite, ato_processual, status | + `processo_membros` |
| `audiencias`, `transacoes`, `alvaras`, `acoes_coletivas` | … | por workspace |
| `metas`, `ideias`, `campanhas`, `documentos` | … | módulos auxiliares |
| `kanban_columns` | board_key, label, color, position | colunas configuráveis |
| `page_assets` | page_key, banner_url, logo_url | override visual por página |
| `audit_logs` | action, table_name, old/new data | auditoria |

## 7. Permissões

| Ação | super_admin | admin | colaborador |
|------|:-----------:|:-----:|:-----------:|
| Gerenciar workspaces | ✅ | ❌ | ❌ |
| Criar/editar usuários | ✅ | ✅ | ❌ |
| Editar banner/logo, colunas de kanban | ✅ | ✅ | ❌ |
| Ver/editar todos os registros do workspace | ✅ | ✅ | ❌ |
| Ver/editar próprios registros | ✅ | ✅ | ✅ |
| Mover cards de kanban | ✅ | ✅ | ✅ |

## 8. Fora de Escopo (nesta fase)

- Automações/webhooks (n8n, alertas automáticos de prazo).
- Importação/exportação CSV.
- Painel global do super_admin.
- Visualização de auditoria na interface.

## 9. Critérios de Aceitação

- [x] Login + isolamento por workspace funcionando.
- [x] Home com banner/logo editáveis e escopo página/global.
- [x] Geral com tabelas (Alerta, Prazos) e 3 kanbans com drag-and-drop.
- [x] Colunas de funil configuráveis (add/renomear/cor/excluir).
- [x] Criar lead direto na coluna do funil.
- [x] Demais 12 módulos com CRUD.
- [x] RLS sem recursão (`my_workspace_id()`).
- [x] `next build` limpo.
- [ ] Validação final do usuário no navegador (kanban exibindo cards após rebuild limpo).

## 10. Questões em Aberto

- Múltiplos responsáveis por contato (hoje 1; prints mostram vários) — confirmar se vira join.
- Observação como tag colorida vs texto livre — hoje texto; definir taxonomia se for select.
- Próximas fases (8): automações, import/export, auditoria, painel super_admin.
