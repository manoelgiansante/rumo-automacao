-- ============================================================================
-- RUMO AUTOMACAO - Correções de Auditoria (002_correcoes_auditoria.sql)
-- 10 tabelas novas + correções de constraints + colunas faltantes
-- + flag_sync + views + RLS + indexes + triggers + sync logs
-- ============================================================================

-- ============================================================================
-- SECAO 1: TABELAS NOVAS (10 tabelas)
-- ============================================================================

-- 1. Configuração V10
CREATE TABLE IF NOT EXISTS vet_auto_configuracao_v10 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID NOT NULL REFERENCES vet_fazendas(id) ON DELETE CASCADE,
  usa_config_v10 BOOLEAN DEFAULT false,
  intensidade_led INTEGER DEFAULT 5 CHECK (intensidade_led BETWEEN 0 AND 7),
  usa_balancao_v10 BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Endereços V10 (ESP32 IPs)
CREATE TABLE IF NOT EXISTS vet_auto_endereco_v10 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID NOT NULL REFERENCES vet_fazendas(id) ON DELETE CASCADE,
  endereco VARCHAR(100) NOT NULL, -- IP:PORT format
  tipo_uso VARCHAR(20) CHECK (tipo_uso IN ('balanca', 'rfid', 'display', 'balancao')),
  misturador_id UUID REFERENCES vet_auto_misturadores(id) ON DELETE SET NULL,
  misturador_desc VARCHAR(100),
  nome VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Configuração de misturadores (separada de dispositivos)
CREATE TABLE IF NOT EXISTS vet_auto_configuracao_misturadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID NOT NULL REFERENCES vet_fazendas(id) ON DELETE CASCADE,
  misturador_id UUID NOT NULL REFERENCES vet_auto_misturadores(id) ON DELETE CASCADE,
  posicao INTEGER,
  porta_balanca TEXT, -- COM port ou IP:PORT
  resolucao NUMERIC(10,2),
  capacidade_min NUMERIC(12,2),
  capacidade_max NUMERIC(12,2),
  tempo_troca_ingrediente INTEGER DEFAULT 0, -- segundos
  faixa_estabilidade NUMERIC(10,2) DEFAULT 5.0, -- kg
  porta_display TEXT, -- COM port ou IP:PORT
  porta_rfid TEXT, -- COM port ou IP:PORT
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fazenda_id, misturador_id)
);

-- 4. Usuários locais (operadores) para automação
CREATE TABLE IF NOT EXISTS vet_auto_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID NOT NULL REFERENCES vet_fazendas(id) ON DELETE CASCADE,
  auth_user_id UUID, -- link opcional para supabase auth
  codigo INTEGER,
  nome TEXT NOT NULL,
  login TEXT,
  senha_hash TEXT, -- bcrypt hash
  tipo_usuario VARCHAR(20) DEFAULT 'tratador' CHECK (tipo_usuario IN ('tratador', 'operador_pa', 'admin', 'outros')),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fazenda_id, login)
);

-- 5. Balanças (registro separado de dispositivos, paridade com CR1)
CREATE TABLE IF NOT EXISTS vet_auto_balancas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID NOT NULL REFERENCES vet_fazendas(id) ON DELETE CASCADE,
  codigo INTEGER,
  modelo TEXT,
  fabricante TEXT,
  precisao NUMERIC(10,4),
  codigo_protocolo INTEGER DEFAULT 1, -- 1=SMA
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fazenda_id, codigo)
);

-- 6. Fabricações do dia (sumário materializado para performance)
CREATE TABLE IF NOT EXISTS vet_auto_fabricacoes_dia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID NOT NULL REFERENCES vet_fazendas(id) ON DELETE CASCADE,
  receita_id UUID REFERENCES vet_auto_receitas(id),
  trato_numero INTEGER,
  total_fabricado NUMERIC(12,2) DEFAULT 0,
  data DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fazenda_id, receita_id, trato_numero, data)
);

-- 7. Ordens de produção
CREATE TABLE IF NOT EXISTS vet_auto_ordens_producao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID NOT NULL REFERENCES vet_fazendas(id) ON DELETE CASCADE,
  receita_id UUID REFERENCES vet_auto_receitas(id),
  previsto_kg NUMERIC(12,2),
  status VARCHAR(20) DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'produzindo', 'encerrado', 'cancelado')),
  data_producao DATE,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Plano nutricional
CREATE TABLE IF NOT EXISTS vet_auto_plano_nutricional (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID NOT NULL REFERENCES vet_fazendas(id) ON DELETE CASCADE,
  receita_id UUID REFERENCES vet_auto_receitas(id),
  numero_lote_animais INTEGER,
  data_uso DATE,
  consumo_mn_por_cabeca NUMERIC(10,4), -- matéria natural
  consumo_ms_por_cabeca NUMERIC(10,4), -- matéria seca
  total_mn NUMERIC(12,2),
  total_ms NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Ingredientes de receita por misturador (overrides)
CREATE TABLE IF NOT EXISTS vet_auto_receita_ingrediente_misturador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID NOT NULL REFERENCES vet_fazendas(id) ON DELETE CASCADE,
  receita_id UUID NOT NULL REFERENCES vet_auto_receitas(id) ON DELETE CASCADE,
  ingrediente_id UUID NOT NULL REFERENCES vet_auto_ingredientes(id) ON DELETE CASCADE,
  misturador_id UUID NOT NULL REFERENCES vet_auto_misturadores(id) ON DELETE CASCADE,
  percentual_materia_natural NUMERIC(10,4),
  percentual_materia_seca NUMERIC(10,4),
  tolerancia NUMERIC(10,2),
  ordem_batida INTEGER DEFAULT 1,
  automatizado BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(receita_id, ingrediente_id, misturador_id)
);

-- 10. Controle de versão do schema
CREATE TABLE IF NOT EXISTS vet_auto_versao_schema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  versao INTEGER NOT NULL,
  descricao TEXT,
  data_atualizacao TIMESTAMPTZ DEFAULT now()
);
INSERT INTO vet_auto_versao_schema (versao, descricao) VALUES (2, 'Correções auditoria - tabelas faltantes');

-- 11. Sync logs (referenciado por sincronismoService)
CREATE TABLE IF NOT EXISTS vet_auto_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID NOT NULL REFERENCES vet_fazendas(id) ON DELETE CASCADE,
  tipo_sync VARCHAR(50) NOT NULL,
  registros_enviados INTEGER DEFAULT 0,
  registros_recebidos INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'sucesso' CHECK (status IN ('sucesso', 'erro', 'parcial')),
  erro_mensagem TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- SECAO 2: CORREÇÃO DE CONSTRAINTS EM TABELAS EXISTENTES
-- ============================================================================

-- Fix vet_auto_fabricacao_ingredientes status values para match com CR1
ALTER TABLE vet_auto_fabricacao_ingredientes DROP CONSTRAINT IF EXISTS vet_auto_fabricacao_ingredientes_status_check;

-- Atualizar dados existentes ANTES de aplicar nova constraint
UPDATE vet_auto_fabricacao_ingredientes SET status = 'espera' WHERE status = 'pendente';
UPDATE vet_auto_fabricacao_ingredientes SET status = 'processando' WHERE status = 'pesando';
UPDATE vet_auto_fabricacao_ingredientes SET status = 'processado' WHERE status = 'concluido';

ALTER TABLE vet_auto_fabricacao_ingredientes ADD CONSTRAINT vet_auto_fabricacao_ingredientes_status_check
  CHECK (status IN ('espera', 'processando', 'processado', 'cancelado'));

-- Fix flag_manual para match com CR1 'troca_automatica'
ALTER TABLE vet_auto_fabricacao_ingredientes DROP CONSTRAINT IF EXISTS vet_auto_fabricacao_ingredientes_flag_manual_check;

-- Atualizar dados existentes ANTES de aplicar nova constraint
UPDATE vet_auto_fabricacao_ingredientes SET flag_manual = 'troca_automatica' WHERE flag_manual = 'automatico';

ALTER TABLE vet_auto_fabricacao_ingredientes ADD CONSTRAINT vet_auto_fabricacao_ingredientes_flag_manual_check
  CHECK (flag_manual IN ('troca_automatica', 'manual', 'deslocamento', 'pausa', 'cancelamento'));

-- ============================================================================
-- SECAO 3: COLUNAS FALTANTES EM TABELAS EXISTENTES
-- ============================================================================

-- vet_auto_configuracoes: colunas faltantes
ALTER TABLE vet_auto_configuracoes ADD COLUMN IF NOT EXISTS url_web_service TEXT;
ALTER TABLE vet_auto_configuracoes ADD COLUMN IF NOT EXISTS numero_dispositivo INTEGER;
ALTER TABLE vet_auto_configuracoes ADD COLUMN IF NOT EXISTS tipo_software VARCHAR(20) DEFAULT 'tgt';
ALTER TABLE vet_auto_configuracoes ADD COLUMN IF NOT EXISTS intensidade_led INTEGER DEFAULT 5;
ALTER TABLE vet_auto_configuracoes ADD COLUMN IF NOT EXISTS enable_log_comunicacao_balanca BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_configuracoes ADD COLUMN IF NOT EXISTS integration_server_url TEXT;
ALTER TABLE vet_auto_configuracoes ADD COLUMN IF NOT EXISTS integration_server_token TEXT;

-- vet_auto_fabricacoes: colunas faltantes
ALTER TABLE vet_auto_fabricacoes ADD COLUMN IF NOT EXISTS numero_lote_animais INTEGER;
ALTER TABLE vet_auto_fabricacoes ADD COLUMN IF NOT EXISTS lote_fabricacao_sobra TEXT;
ALTER TABLE vet_auto_fabricacoes ADD COLUMN IF NOT EXISTS ordem_producao_id UUID REFERENCES vet_auto_ordens_producao(id) ON DELETE SET NULL;

-- vet_auto_fabricacao_ingredientes: colunas faltantes
ALTER TABLE vet_auto_fabricacao_ingredientes ADD COLUMN IF NOT EXISTS nome_ingrediente TEXT;
ALTER TABLE vet_auto_fabricacao_ingredientes ADD COLUMN IF NOT EXISTS codigo_operador UUID;
ALTER TABLE vet_auto_fabricacao_ingredientes ADD COLUMN IF NOT EXISTS nome_operador TEXT;
ALTER TABLE vet_auto_fabricacao_ingredientes ADD COLUMN IF NOT EXISTS flag_automation BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_fabricacao_ingredientes ADD COLUMN IF NOT EXISTS flag_batchbox BOOLEAN DEFAULT false;

-- vet_auto_carregamentos: colunas faltantes
ALTER TABLE vet_auto_carregamentos ADD COLUMN IF NOT EXISTS flag_sigafran BOOLEAN DEFAULT false;

-- vet_auto_fornecimentos: colunas faltantes
ALTER TABLE vet_auto_fornecimentos ADD COLUMN IF NOT EXISTS flag_fornecido BOOLEAN DEFAULT true;
ALTER TABLE vet_auto_fornecimentos ADD COLUMN IF NOT EXISTS safe_point_grupo_nome TEXT;
ALTER TABLE vet_auto_fornecimentos ADD COLUMN IF NOT EXISTS numero_dispositivo INTEGER;
ALTER TABLE vet_auto_fornecimentos ADD COLUMN IF NOT EXISTS peso_antigo NUMERIC(12,2);

-- vet_auto_safe_points: dispositivo_id já existe na 001, não precisa adicionar

-- vet_auto_safe_point_leituras: tara_kg e peso_bruto_kg já existem na 001, não precisa adicionar

-- ============================================================================
-- SECAO 4: FLAG_SYNC EM TODAS AS TABELAS OPERACIONAIS
-- ============================================================================

ALTER TABLE vet_auto_fabricacoes ADD COLUMN IF NOT EXISTS flag_sync BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_fabricacao_ingredientes ADD COLUMN IF NOT EXISTS flag_sync BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_carregamentos ADD COLUMN IF NOT EXISTS flag_sync BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_carregamento_detalhes ADD COLUMN IF NOT EXISTS flag_sync BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_fornecimentos ADD COLUMN IF NOT EXISTS flag_sync BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_descartes ADD COLUMN IF NOT EXISTS flag_sync BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_safe_points ADD COLUMN IF NOT EXISTS flag_sync BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_safe_point_leituras ADD COLUMN IF NOT EXISTS flag_sync BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_ocorrencia_paradas ADD COLUMN IF NOT EXISTS flag_sync BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_ocorrencia_parada_itens ADD COLUMN IF NOT EXISTS flag_sync BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_log_atividades ADD COLUMN IF NOT EXISTS flag_sync BOOLEAN DEFAULT false;

-- ============================================================================
-- SECAO 5: VIEWS NOVAS
-- ============================================================================

-- Previsto do dia por receita
CREATE OR REPLACE VIEW view_auto_previsto_dia_por_receita AS
SELECT r.id AS receita_id, r.nome AS nome_receita, r.fazenda_id,
       SUM(p.previsto_kg) AS total_previsto,
       COUNT(p.id) AS total_currais,
       SUM(p.realizado_kg) AS total_realizado
FROM vet_auto_previstos p
JOIN vet_auto_receitas r ON p.receita_id = r.id
WHERE p.data_fornecimento = CURRENT_DATE
GROUP BY r.id, r.nome, r.fazenda_id;

-- Total fabricado por receita no dia
CREATE OR REPLACE VIEW view_auto_fabricado_dia_por_receita AS
SELECT f.receita_id, r.nome AS nome_receita, f.fazenda_id,
       SUM(f.total_kg_fabricada) AS total_fabricado,
       COUNT(f.id) AS total_lotes
FROM vet_auto_fabricacoes f
JOIN vet_auto_receitas r ON f.receita_id = r.id
WHERE DATE(f.created_at) = CURRENT_DATE
  AND f.status = 'processado'
GROUP BY f.receita_id, r.nome, f.fazenda_id;

-- Total por trato (rodada de alimentação)
CREATE OR REPLACE VIEW view_auto_total_por_trato AS
SELECT t.id AS trato_id, t.numero, t.horario, t.fazenda_id,
       COALESCE(SUM(p.previsto_kg), 0) AS total_previsto,
       COALESCE(SUM(p.realizado_kg), 0) AS total_realizado
FROM vet_auto_tratos t
LEFT JOIN vet_auto_previstos p ON p.trato_id = t.id
  AND p.data_fornecimento = CURRENT_DATE
GROUP BY t.id, t.numero, t.horario, t.fazenda_id;

-- ============================================================================
-- SECAO 6: INDEXES PARA TABELAS NOVAS
-- ============================================================================

-- vet_auto_configuracao_v10
CREATE INDEX IF NOT EXISTS idx_auto_config_v10_fazenda ON vet_auto_configuracao_v10(fazenda_id);

-- vet_auto_endereco_v10
CREATE INDEX IF NOT EXISTS idx_auto_end_v10_fazenda ON vet_auto_endereco_v10(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_end_v10_misturador ON vet_auto_endereco_v10(misturador_id);
CREATE INDEX IF NOT EXISTS idx_auto_end_v10_tipo ON vet_auto_endereco_v10(tipo_uso);

-- vet_auto_configuracao_misturadores
CREATE INDEX IF NOT EXISTS idx_auto_config_mist_fazenda ON vet_auto_configuracao_misturadores(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_config_mist_misturador ON vet_auto_configuracao_misturadores(misturador_id);

-- vet_auto_usuarios
CREATE INDEX IF NOT EXISTS idx_auto_usuarios_fazenda ON vet_auto_usuarios(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_usuarios_tipo ON vet_auto_usuarios(tipo_usuario);
CREATE INDEX IF NOT EXISTS idx_auto_usuarios_ativo ON vet_auto_usuarios(ativo);

-- vet_auto_balancas
CREATE INDEX IF NOT EXISTS idx_auto_balancas_fazenda ON vet_auto_balancas(fazenda_id);

-- vet_auto_fabricacoes_dia
CREATE INDEX IF NOT EXISTS idx_auto_fab_dia_fazenda ON vet_auto_fabricacoes_dia(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_fab_dia_data ON vet_auto_fabricacoes_dia(data);
CREATE INDEX IF NOT EXISTS idx_auto_fab_dia_receita ON vet_auto_fabricacoes_dia(receita_id);

-- vet_auto_ordens_producao
CREATE INDEX IF NOT EXISTS idx_auto_ordens_fazenda ON vet_auto_ordens_producao(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_ordens_status ON vet_auto_ordens_producao(status);
CREATE INDEX IF NOT EXISTS idx_auto_ordens_data ON vet_auto_ordens_producao(data_producao);
CREATE INDEX IF NOT EXISTS idx_auto_ordens_receita ON vet_auto_ordens_producao(receita_id);

-- vet_auto_plano_nutricional
CREATE INDEX IF NOT EXISTS idx_auto_plano_nut_fazenda ON vet_auto_plano_nutricional(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_plano_nut_receita ON vet_auto_plano_nutricional(receita_id);
CREATE INDEX IF NOT EXISTS idx_auto_plano_nut_data ON vet_auto_plano_nutricional(data_uso);

-- vet_auto_receita_ingrediente_misturador
CREATE INDEX IF NOT EXISTS idx_auto_rec_ingr_mist_fazenda ON vet_auto_receita_ingrediente_misturador(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_rec_ingr_mist_receita ON vet_auto_receita_ingrediente_misturador(receita_id);
CREATE INDEX IF NOT EXISTS idx_auto_rec_ingr_mist_ingrediente ON vet_auto_receita_ingrediente_misturador(ingrediente_id);
CREATE INDEX IF NOT EXISTS idx_auto_rec_ingr_mist_misturador ON vet_auto_receita_ingrediente_misturador(misturador_id);

-- vet_auto_sync_logs
CREATE INDEX IF NOT EXISTS idx_auto_sync_logs_fazenda ON vet_auto_sync_logs(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_sync_logs_tipo ON vet_auto_sync_logs(tipo_sync);
CREATE INDEX IF NOT EXISTS idx_auto_sync_logs_created ON vet_auto_sync_logs(created_at);

-- Indexes para flag_sync (busca de registros não sincronizados)
CREATE INDEX IF NOT EXISTS idx_auto_fab_sync ON vet_auto_fabricacoes(flag_sync) WHERE flag_sync = false;
CREATE INDEX IF NOT EXISTS idx_auto_fab_ingr_sync ON vet_auto_fabricacao_ingredientes(flag_sync) WHERE flag_sync = false;
CREATE INDEX IF NOT EXISTS idx_auto_carreg_sync ON vet_auto_carregamentos(flag_sync) WHERE flag_sync = false;
CREATE INDEX IF NOT EXISTS idx_auto_carreg_det_sync ON vet_auto_carregamento_detalhes(flag_sync) WHERE flag_sync = false;
CREATE INDEX IF NOT EXISTS idx_auto_fornec_sync ON vet_auto_fornecimentos(flag_sync) WHERE flag_sync = false;
CREATE INDEX IF NOT EXISTS idx_auto_desc_sync ON vet_auto_descartes(flag_sync) WHERE flag_sync = false;
CREATE INDEX IF NOT EXISTS idx_auto_sp_sync ON vet_auto_safe_points(flag_sync) WHERE flag_sync = false;
CREATE INDEX IF NOT EXISTS idx_auto_sp_leit_sync ON vet_auto_safe_point_leituras(flag_sync) WHERE flag_sync = false;
CREATE INDEX IF NOT EXISTS idx_auto_oc_parada_sync ON vet_auto_ocorrencia_paradas(flag_sync) WHERE flag_sync = false;
CREATE INDEX IF NOT EXISTS idx_auto_oc_parada_itens_sync ON vet_auto_ocorrencia_parada_itens(flag_sync) WHERE flag_sync = false;
CREATE INDEX IF NOT EXISTS idx_auto_log_sync ON vet_auto_log_atividades(flag_sync) WHERE flag_sync = false;

-- Index para ordem_producao_id na fabricacoes
CREATE INDEX IF NOT EXISTS idx_auto_fab_ordem_producao ON vet_auto_fabricacoes(ordem_producao_id);

-- ============================================================================
-- SECAO 7: RLS PARA TABELAS NOVAS
-- ============================================================================

-- Enable RLS em todas as novas tabelas
ALTER TABLE vet_auto_configuracao_v10 ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_endereco_v10 ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_configuracao_misturadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_balancas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_fabricacoes_dia ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_ordens_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_plano_nutricional ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_receita_ingrediente_misturador ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_versao_schema ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_sync_logs ENABLE ROW LEVEL SECURITY;

-- Policies usando vet_user_has_fazenda_access(fazenda_id)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'vet_auto_configuracao_v10',
    'vet_auto_endereco_v10',
    'vet_auto_configuracao_misturadores',
    'vet_auto_usuarios',
    'vet_auto_balancas',
    'vet_auto_fabricacoes_dia',
    'vet_auto_ordens_producao',
    'vet_auto_plano_nutricional',
    'vet_auto_receita_ingrediente_misturador',
    'vet_auto_sync_logs'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (vet_user_has_fazenda_access(fazenda_id))',
      tbl || '_select', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (vet_user_has_fazenda_access(fazenda_id))',
      tbl || '_insert', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (vet_user_has_fazenda_access(fazenda_id))',
      tbl || '_update', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (vet_user_has_fazenda_access(fazenda_id))',
      tbl || '_delete', tbl
    );
  END LOOP;
END $$;

-- vet_auto_versao_schema: política aberta para leitura (sem fazenda_id)
CREATE POLICY vet_auto_versao_schema_select ON vet_auto_versao_schema FOR SELECT USING (true);
CREATE POLICY vet_auto_versao_schema_insert ON vet_auto_versao_schema FOR INSERT WITH CHECK (true);
CREATE POLICY vet_auto_versao_schema_update ON vet_auto_versao_schema FOR UPDATE USING (true);
CREATE POLICY vet_auto_versao_schema_delete ON vet_auto_versao_schema FOR DELETE USING (true);

-- ============================================================================
-- SECAO 8: TRIGGERS updated_at PARA TABELAS NOVAS
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'vet_auto_configuracao_v10',
    'vet_auto_endereco_v10',
    'vet_auto_configuracao_misturadores',
    'vet_auto_usuarios',
    'vet_auto_balancas',
    'vet_auto_ordens_producao',
    'vet_auto_plano_nutricional',
    'vet_auto_receita_ingrediente_misturador'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION vet_auto_update_updated_at()',
      tbl || '_updated_at', tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- FIM DA MIGRACAO 002 - Correções de Auditoria
-- ============================================================================
