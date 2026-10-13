<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Padrão visual do CRM — obrigatório em toda tela nova ou alterada

O CRM tem um visual próprio (tema escuro estilo Notion). Nada pode abrir com a
cara padrão do navegador. Antes de criar um campo, procure o componente pronto
em `src/components/ui/` e use-o; se não existir, crie-o lá (reutilizável) em vez
de resolver só na tela.

**Campos de formulário**
- Data → `DatePicker` (`@/components/ui/DatePicker`). Data + hora → `DatePicker withTime`.
- Hora → `TimePicker` (`@/components/ui/TimePicker`); `compact` dentro de popovers.
- **Proibido** `<input type="date">`, `type="time"` e `type="datetime-local"`: o seletor
  nativo abre uma lista/calendário branco do navegador, fora do tema.
- Texto, número, select e textarea → `Input`, `Select`, `Textarea`, `Field` de
  `@/components/ui/primitives` (ou o mesmo `inputStyle`).
- Rótulo do campo: `text-xs`, cor `var(--notion-text-2)`, acima do campo.

**Cores e superfícies** — só as variáveis de `globals.css`, nunca hex solto para fundo/texto:
- fundo da página `--notion-bg`; cartões/seções `--notion-bg-2`; campos e popovers
  `--notion-bg-3`; hover/realce `--notion-bg-4`; bordas `--notion-border`.
- texto `--notion-text` (principal), `--notion-text-2` (secundário), `--notion-text-3` (apagado).
- ação principal / selecionado: `--notion-accent` com texto branco.
- Etiqueta colorida (status, área): fundo `${cor}22` + texto na própria cor.

**Popovers, menus e modais**
- Popover: `rounded-xl`, `shadow-2xl`, fundo `--notion-bg-3`, borda `--notion-border`,
  renderizado com `createPortal` em `document.body` e `position: fixed` (não é
  cortado por contêiner com rolagem). Fecha ao clicar fora e no Esc quando couber.
- Modal: fundo `rgba(0,0,0,0.5)`, caixa `rounded-xl` em `--notion-bg-2`, botões
  Cancelar (`--notion-bg-3`) e ação principal (`--notion-accent`) lado a lado.
- Mensagem de sucesso/erro: `Aviso` + `useAviso` (`@/components/ui/Aviso`), não `alert()`.

**Respeitar o perfil Visualizador**: botões que gravam somem com `useSomenteLeitura()`.
