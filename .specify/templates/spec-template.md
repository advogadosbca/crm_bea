# Feature Specification: [FEATURE_NAME]

**Feature ID**: [NNN-feature-slug]
**Status**: Draft | In Review | Approved | Implemented
**Created**: [YYYY-MM-DD]
**Last Updated**: [YYYY-MM-DD]

> Esta especificação descreve O QUE e POR QUÊ — não COMO. Detalhes de implementação ficam no
> plan.md. Toda regra deve ser testável e estar em conformidade com a constituição do projeto
> (`.specify/memory/constitution.md`).

## 1. Resumo

[Um parágrafo: o que é a feature e qual problema resolve.]

## 2. Contexto e Motivação

- **Problema**: [o que está faltando / dói hoje]
- **Quem é impactado**: [perfis de usuário: super_admin, admin, colaborador]
- **Resultado esperado**: [estado final desejado]

## 3. User Stories

- Como **[perfil]**, quero **[ação]**, para **[benefício]**.
- … (uma por linha)

## 4. Requisitos Funcionais

Cada requisito MUST ser numerado e testável.

- **FR-1**: O sistema MUST …
- **FR-2**: …

## 5. Requisitos Não-Funcionais

- **NFR-1** (Segurança/RLS): …
- **NFR-2** (Performance): …
- **NFR-3** (Visual/UX): …

## 6. Modelo de Dados

| Entidade | Campos-chave | Observações |
|----------|--------------|-------------|
| [tabela] | … | RLS por `workspace_id` |

## 7. Permissões

| Ação | super_admin | admin | colaborador |
|------|:-----------:|:-----:|:-----------:|
| … | ✅ | ✅ | ❌ |

## 8. Fora de Escopo

- [o que NÃO faz parte desta feature]

## 9. Critérios de Aceitação

- [ ] [condição verificável de "pronto"]
- [ ] `next build` limpo
- [ ] Dado real validado de ponta a ponta

## 10. Questões em Aberto

- [TODO / dúvidas a resolver com o usuário]
