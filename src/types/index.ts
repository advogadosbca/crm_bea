export type Role = 'super_admin' | 'admin' | 'colaborador'

export interface Workspace {
  id: string
  name: string
  slug: string
  banner_url?: string
  logo_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  full_name: string
  email: string
  avatar_url?: string
  role: Role
  workspace_id?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  workspace_id: string
  name: string
  origem: string
  status_geral: string
  alerta: string
  data_contato?: string
  status_processual?: string
  prazo_execucao?: string
  data_final?: string
  observacao?: string
  total_transacoes: number
  responsavel_id?: string
  pendencia_processual?: string
  requerimento_administrativo?: string
  funil_status?: string
  renda?: string
  analise_juridica?: string
  is_lead: boolean
  created_at: string
  updated_at: string
  created_by?: string
  updated_by?: string
  responsavel?: { full_name: string; avatar_url?: string } | null
}

export interface Processo {
  id: string
  workspace_id: string
  numero: string
  titulo?: string
  tipo?: string
  status: string
  vara?: string
  comarca?: string
  data_distribuicao?: string
  prazo?: string
  responsavel_id?: string
  descricao?: string
  contact_id?: string
  diario_judicial?: string
  grau_jurisdicao?: string
  prazo_limite?: string
  prioridade?: string
  ato_processual?: string
  created_at: string
  updated_at: string
  membros?: { profile_id: string; profiles?: { full_name: string; avatar_url?: string } }[]
}

export const GRAU_JURISDICAO_OPTIONS = [
  '1ª Instância',
  '2ª Instância',
  'Turma Recursal',
  'STJ',
  'STF',
  'Juizado Especial',
]

export const PROCESSO_STATUS_OPTIONS = [
  'Pendente',
  'Em andamento',
  'Concluído',
  'Arquivado',
  'Suspenso',
]

export const PRIORIDADE_OPTIONS = ['Baixa', 'Média', 'Alta', 'Urgente']

export const PROCESSO_STATUS_COLORS: Record<string, string> = {
  'Pendente': '#EF4444',
  'Em andamento': '#F59E0B',
  'Concluído': '#10B981',
  'Arquivado': '#94A3B8',
  'Suspenso': '#8B5CF6',
}

export const GRAU_COLORS: Record<string, string> = {
  '1ª Instância': '#3B82F6',
  '2ª Instância': '#6366F1',
  'Turma Recursal': '#F59E0B',
  'STJ': '#8B5CF6',
  'STF': '#EC4899',
  'Juizado Especial': '#06B6D4',
}

export const PRIORIDADE_COLORS: Record<string, string> = {
  'Baixa': '#94A3B8',
  'Média': '#3B82F6',
  'Alta': '#F59E0B',
  'Urgente': '#EF4444',
}

export interface Audiencia {
  id: string
  workspace_id: string
  titulo: string
  data_hora: string
  tipo?: string
  status: string
  local?: string
  processo_id?: string
  responsavel_id?: string
  observacoes?: string
  created_at: string
}

export interface Transacao {
  id: string
  workspace_id: string
  descricao: string
  valor: number
  tipo: 'receita' | 'despesa'
  status: string
  data_vencimento?: string
  data_pagamento?: string
  contact_id?: string
  responsavel_id?: string
  banco?: string
  parcelado?: boolean
  contratos?: string
  cobranca_status?: string
  pendencias?: boolean
  follow?: boolean
  area?: string
  canal?: string
  created_at: string
  contact?: { name: string; telefone?: string } | null
}

export const AREA_OPTIONS = [
  'Cível', 'Criminal', 'Diligências', 'Empresarial', 'Família', 'Mensalista',
  'Parceria', 'Previdenciário', 'Trabalhista', 'Tributário', 'Imobiliário',
  'Trânsito', 'Ambiental', 'Bancário',
]
export const CANAL_OPTIONS = [
  'Face ADS', 'Google ADS', 'Orgânico', 'Indicação', 'BNI', 'Parceria', 'G4', 'ACID',
]

export const COBRANCA_STATUS_OPTIONS = ['Pendente', 'Cobrança Gerada', 'Pago', 'Atrasado']

export const BANCO_OPTIONS = ['Banco Nubank', 'Banco do Brasil', 'Caixa', 'Itaú', 'Bradesco', 'Santander', 'Inter', 'Sicoob', 'Outro']

export const STATUS_GERAL_OPTIONS = [
  'Em negociação',
  'Pendente senha',
  'Agendar retorno',
  'Retorno agendado',
  'Retorno após reanálise',
  'Pendente Documentos',
  'Em andamento',
  'Finalizado',
  'Futuro',
  'Remarketing',
  'Sem interesse',
  'Não tem direito',
  'Follow Up 1',
  'Follow Up 2',
  'Follow Up 3',
  'Encaminhamento Humano',
]

export const STATUS_PROCESSUAL_OPTIONS = [
  'Pendências',
  'Assessoria Administrativa',
  'Análise Jurídica - Pendente',
  'Análise Jurídica - Realizada',
  'Fazer Contrato',
  'Enviar Contrato',
  'Aguardando Assinatura',
  'Fazer cálculos',
  'Aguardando Ação Coletiva',
  'Organizar Pasta',
  'Em andamento',
  'Concluído',
  'Arquivado',
]

export const STATUS_PROCESSUAL_COLORS: Record<string, string> = {
  'Pendências': '#EF4444',
  'Assessoria Administrativa': '#F59E0B',
  'Análise Jurídica - Pendente': '#FB923C',
  'Análise Jurídica - Realizada': '#10B981',
  'Fazer Contrato': '#06B6D4',
  'Enviar Contrato': '#A78BFA',
  'Aguardando Assinatura': '#6366F1',
  'Fazer cálculos': '#0EA5E9',
  'Aguardando Ação Coletiva': '#EC4899',
  'Organizar Pasta': '#8B5CF6',
  'Em andamento': '#22C55E',
  'Concluído': '#6EE7B7',
  'Arquivado': '#94A3B8',
}

// Funil de Pré-Atendimento (WhatsApp)
export const FUNIL_OPTIONS = [
  'Captação Ativa',
  'Aguardando Cadastro',
  'Introdução Agendada',
  'Primeiro Contato',
  'Follow-Up (1º)',
  'Follow-Up (2º)',
  'Follow-Up (3º)',
  'Follow-Up (4º)',
  'Arquivar',
]

export const FUNIL_COLORS: Record<string, string> = {
  'Captação Ativa': '#10B981',
  'Aguardando Cadastro': '#F59E0B',
  'Introdução Agendada': '#3B82F6',
  'Primeiro Contato': '#06B6D4',
  'Follow-Up (1º)': '#A78BFA',
  'Follow-Up (2º)': '#F97316',
  'Follow-Up (3º)': '#EC4899',
}

export const RENDA_OPTIONS = ['Padrão', 'Alta Renda (> R$5mil)', 'Baixa Renda (< R$2.5mil)']
export const RENDA_COLORS: Record<string, string> = {
  'Padrão': '#6366F1',
  'Alta Renda (> R$5mil)': '#10B981',
  'Baixa Renda (< R$2.5mil)': '#EF4444',
}

export const ANALISE_OPTIONS = ['Análise Jurídica - Pendente', 'Análise Jurídica - Realizada']

export const ORIGEM_OPTIONS = [
  'Indicação',
  'Já é cliente',
  'Orgânico',
  'Marketing',
  'Ação Coletiva',
  'Outro',
]

export const ALERTA_OPTIONS = ['Normal', 'Atenção especial']

export const STATUS_GERAL_COLORS: Record<string, string> = {
  'Em negociação': '#F59E0B',
  'Pendente senha': '#8B5CF6',
  'Agendar retorno': '#3B82F6',
  'Retorno agendado': '#06B6D4',
  'Retorno após reanálise': '#6366F1',
  'Pendente Documentos': '#F97316',
  'Em andamento': '#10B981',
  'Finalizado': '#6EE7B7',
  'Futuro': '#94A3B8',
  'Remarketing': '#EC4899',
  'Sem interesse': '#EF4444',
  'Não tem direito': '#DC2626',
  'Follow Up 1': '#0EA5E9',
  'Follow Up 2': '#0284C7',
  'Follow Up 3': '#0369A1',
  'Encaminhamento Humano': '#7C3AED',
}
