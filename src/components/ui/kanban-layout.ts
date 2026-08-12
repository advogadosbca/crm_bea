/**
 * Altura máxima da pilha de cards de uma coluna de kanban.
 *
 * Sem teto, uma coluna com 40 cards estica o quadro inteiro e empurra tudo que
 * vem depois na página para fora da tela — na Geral, onde há três quadros
 * empilhados, isso torna a página inutilizável. Com teto, cada coluna rola por
 * dentro: o cabeçalho e o botão de adicionar ficam parados, o quadro não muda
 * de tamanho, e a página continua navegável.
 *
 * Em vh e não em px porque a mesma tela é usada em notebook e em monitor
 * grande; 58vh deixa sempre um pedaço do que vem abaixo visível, que é o que
 * avisa o usuário de que a página continua.
 */
export const ALTURA_MAX_COLUNA = '58vh'
