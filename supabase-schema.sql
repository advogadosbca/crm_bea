-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workspaces (empresas)
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  banner_url TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'colaborador' CHECK (role IN ('super_admin', 'admin', 'colaborador')),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts / Leads
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  origem TEXT DEFAULT 'Orgânico',
  status_geral TEXT DEFAULT 'Em negociação',
  alerta TEXT DEFAULT 'Normal',
  data_contato DATE,
  status_processual TEXT,
  prazo_execucao DATE,
  data_final DATE,
  observacao TEXT,
  total_transacoes NUMERIC DEFAULT 0,
  responsavel_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  pendencia_processual TEXT,
  requerimento_administrativo TEXT,
  is_lead BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Processos Judiciais
CREATE TABLE IF NOT EXISTS processos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  titulo TEXT,
  tipo TEXT,
  status TEXT DEFAULT 'Em andamento',
  vara TEXT,
  comarca TEXT,
  data_distribuicao DATE,
  prazo DATE,
  responsavel_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  descricao TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audiencias
CREATE TABLE IF NOT EXISTS audiencias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  data_hora TIMESTAMPTZ NOT NULL,
  tipo TEXT,
  status TEXT DEFAULT 'Agendada',
  local TEXT,
  processo_id UUID REFERENCES processos(id) ON DELETE SET NULL,
  responsavel_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transacoes Financeiras
CREATE TABLE IF NOT EXISTS transacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  status TEXT DEFAULT 'pendente',
  data_vencimento DATE,
  data_pagamento DATE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  responsavel_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alvaras
CREATE TABLE IF NOT EXISTS alvaras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  numero TEXT,
  descricao TEXT NOT NULL,
  status TEXT DEFAULT 'Pendente',
  data_emissao DATE,
  data_vencimento DATE,
  orgao TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  responsavel_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Acoes Coletivas
CREATE TABLE IF NOT EXISTS acoes_coletivas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT DEFAULT 'Ativa',
  processo_id UUID REFERENCES processos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE audiencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE alvaras ENABLE ROW LEVEL SECURITY;
ALTER TABLE acoes_coletivas ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "contacts_workspace" ON contacts FOR ALL USING (
  workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "processos_workspace" ON processos FOR ALL USING (
  workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "audiencias_workspace" ON audiencias FOR ALL USING (
  workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "transacoes_workspace" ON transacoes FOR ALL USING (
  workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "alvaras_workspace" ON alvaras FOR ALL USING (
  workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "acoes_workspace" ON acoes_coletivas FOR ALL USING (
  workspace_id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "profiles_policy" ON profiles FOR ALL USING (
  id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin')
  )
);
CREATE POLICY "workspaces_member" ON workspaces FOR SELECT USING (
  id IN (SELECT workspace_id FROM profiles WHERE id = auth.uid())
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Handle new user
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'colaborador')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
