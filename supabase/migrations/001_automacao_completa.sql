-- ============================================================================
-- RUMO AUTOMACAO - Schema Completo (001_automacao_completa.sql)
-- 20 tabelas + 5 views + indexes + RLS + triggers
-- Sistema de automacao de fabricacao e fornecimento de racao
-- Prefixo: vet_auto_
-- ============================================================================

-- ============================================================================
-- SECAO 0: FUNCOES AUXILIARES
-- ============================================================================

-- Funcao generica para atualizar updated_at
CREATE OR REPLACE FUNCTION vet_auto_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECAO 1: TABELAS DE CONFIGURACAO E CADASTRO
-- ============================================================================

-- 1. Configuracoes do app de automacao por fazenda
-- Controla comportamento geral: RFID, display LED, estabilidade de balanca, etc.
CREATE TABLE IF NOT EXISTS vet_auto_configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  tipo_sincronismo TEXT DEFAULT 'online',
  usa_display_led BOOLEAN DEFAULT FALSE,
  usa_antena_unica BOOLEAN DEFAULT TRUE,
  antena_manual BOOLEAN DEFAULT FALSE,
  tamanho_tag INTEGER DEFAULT 24,
  timeout_rfid_sem_leitura INTEGER DEFAULT 5,
  usa_safe_point BOOLEAN DEFAULT FALSE,
  usa_api_hardware_v10 BOOLEAN DEFAULT FALSE,
  enable_log_peso BOOLEAN DEFAULT FALSE,
  enable_log_fornecimento BOOLEAN DEFAULT FALSE,
  validate_tipo_receita_diferente BOOLEAN DEFAULT TRUE,
  faixa_estabilidade_padrao NUMERIC(10,2) DEFAULT 5.0,
  min_time_estabilidade INTEGER DEFAULT 3,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fazenda_id)
);
COMMENT ON TABLE vet_auto_configuracoes IS 'Configuracoes gerais do app de automacao por fazenda (RFID, display, estabilidade)';

-- 2. Registro de dispositivos de hardware (balancas, leitoras RFID, displays, ESP)
-- Cada dispositivo tem tipo de conexao (serial/TCP/HTTP) e configuracao especifica em JSONB
CREATE TABLE IF NOT EXISTS vet_auto_dispositivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('balanca', 'rfid', 'display_led', 'esp_v10')),
  conexao_tipo TEXT NOT NULL CHECK (conexao_tipo IN ('serial', 'tcp', 'http_api')),
  endereco TEXT NOT NULL, -- COM port (ex: COM3) ou IP:PORT (ex: 192.168.1.100:9100)
  configuracao JSONB DEFAULT '{}', -- baud_rate, data_bits, stop_bits, parity, etc.
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'erro', 'desconectado')),
  misturador_id UUID, -- FK definida apos criacao de vet_auto_misturadores
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_dispositivos IS 'Registro de dispositivos de hardware: balancas, leitoras RFID, displays LED, ESP32';

-- 3. Misturadores/vagoes (estacionarios, rotomix, batchbox)
-- Equipamento que mistura e/ou distribui a racao
CREATE TABLE IF NOT EXISTS vet_auto_misturadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  codigo TEXT,
  nome TEXT NOT NULL,
  modelo TEXT,
  fabricante TEXT,
  numero INTEGER NOT NULL,
  tipo_uso TEXT DEFAULT 'rotomix' CHECK (tipo_uso IN ('estacionario', 'rotomix', 'batchbox')),
  capacidade_minima NUMERIC(10,2) DEFAULT 0,
  capacidade_maxima NUMERIC(10,2) NOT NULL,
  balanca_id UUID REFERENCES vet_auto_dispositivos(id) ON DELETE SET NULL,
  ativo BOOLEAN DEFAULT TRUE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_misturadores IS 'Misturadores/vagoes de racao: estacionarios, rotomix ou batchbox';

-- Adicionar FK de dispositivo -> misturador agora que ambas tabelas existem
ALTER TABLE vet_auto_dispositivos
  ADD CONSTRAINT fk_auto_dispositivo_misturador
  FOREIGN KEY (misturador_id) REFERENCES vet_auto_misturadores(id) ON DELETE SET NULL;

-- 4. Ingredientes disponiveis para fabricacao de racao
-- Inclui dados de materia seca, custo, estoque e local fisico
CREATE TABLE IF NOT EXISTS vet_auto_ingredientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  codigo TEXT,
  nome TEXT NOT NULL,
  tipo TEXT, -- volumoso, concentrado, mineral, etc.
  materia_seca NUMERIC(5,2) DEFAULT 100, -- percentual MS
  custo_kg NUMERIC(12,4) DEFAULT 0,
  estoque_atual NUMERIC(12,2) DEFAULT 0,
  estoque_minimo_kg NUMERIC(12,2) DEFAULT 0,
  tempo_persistencia INTEGER DEFAULT 0, -- segundos para manter no misturador
  local_fisico TEXT, -- silo, galpao, etc.
  ativo BOOLEAN DEFAULT TRUE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fazenda_id, codigo)
);
COMMENT ON TABLE vet_auto_ingredientes IS 'Ingredientes para fabricacao de racao com dados de MS, custo e estoque';

-- 5. Receitas/racoes formuladas
-- Define composicao, tolerancia e parametros de mistura
CREATE TABLE IF NOT EXISTS vet_auto_receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  codigo TEXT,
  nome TEXT NOT NULL,
  materia_seca NUMERIC(5,2) DEFAULT 0,
  imn_por_cabeca_dia NUMERIC(10,2) DEFAULT 0, -- ingestao materia natural por cabeca/dia
  custo_tonelada_mn NUMERIC(12,2) DEFAULT 0,
  tempo_mistura INTEGER DEFAULT 0, -- segundos
  tipo_receita TEXT, -- ex: terminacao, adaptacao, recria
  perc_tolerancia NUMERIC(5,2) DEFAULT 5,
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'rascunho')),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fazenda_id, codigo)
);
COMMENT ON TABLE vet_auto_receitas IS 'Receitas/racoes formuladas com parametros de mistura e tolerancia';

-- 6. Ingredientes de cada receita (composicao da racao)
-- Define percentuais, ordem de batida e tolerancia por ingrediente
CREATE TABLE IF NOT EXISTS vet_auto_receita_ingredientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receita_id UUID NOT NULL REFERENCES vet_auto_receitas(id) ON DELETE CASCADE,
  ingrediente_id UUID NOT NULL REFERENCES vet_auto_ingredientes(id) ON DELETE CASCADE,
  percentual_materia_natural NUMERIC(8,4) DEFAULT 0,
  percentual_materia_seca NUMERIC(8,4) DEFAULT 0,
  tolerancia NUMERIC(5,2) DEFAULT 5,
  ordem_batida INTEGER DEFAULT 0,
  automatizado BOOLEAN DEFAULT TRUE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(receita_id, ingrediente_id)
);
COMMENT ON TABLE vet_auto_receita_ingredientes IS 'Composicao da receita: ingredientes com percentuais, ordem de batida e tolerancia';

-- 7. Currais com tags RFID para identificacao automatica na distribuicao
-- Pode ou nao estar vinculado a um curral do confinamento
CREATE TABLE IF NOT EXISTS vet_auto_currais_rfid (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  curral_id UUID, -- FK nullable para vet_conf_currais se existir no schema
  nome TEXT NOT NULL,
  tag_inicial TEXT NOT NULL,
  tag_final TEXT NOT NULL,
  linha TEXT,
  numero TEXT,
  ordem_trato INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_currais_rfid IS 'Currais com tags RFID inicial/final para identificacao automatica na distribuicao';

-- 8. Horarios de trato definidos por fazenda
CREATE TABLE IF NOT EXISTS vet_auto_tratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  numero INTEGER NOT NULL,
  horario TIME NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fazenda_id, numero)
);
COMMENT ON TABLE vet_auto_tratos IS 'Horarios de trato (numero sequencial + horario) definidos por fazenda';

-- ============================================================================
-- SECAO 2: TABELAS OPERACIONAIS
-- ============================================================================

-- 9. Previstos de fornecimento por curral/trato/dia
-- Gerado a partir do manejo nutricional, serve como meta para o operador
CREATE TABLE IF NOT EXISTS vet_auto_previstos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  curral_rfid_id UUID NOT NULL REFERENCES vet_auto_currais_rfid(id) ON DELETE CASCADE,
  trato_id UUID NOT NULL REFERENCES vet_auto_tratos(id) ON DELETE CASCADE,
  receita_id UUID REFERENCES vet_auto_receitas(id) ON DELETE SET NULL,
  data_fornecimento DATE NOT NULL DEFAULT CURRENT_DATE,
  previsto_kg NUMERIC(10,2) DEFAULT 0,
  quantidade_cab INTEGER DEFAULT 0,
  realizado_kg NUMERIC(10,2) DEFAULT 0,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(curral_rfid_id, trato_id, data_fornecimento)
);
COMMENT ON TABLE vet_auto_previstos IS 'Meta de fornecimento por curral/trato/dia - gerado pelo manejo nutricional';

-- 10. Fabricacoes (batidas de racao no misturador)
-- Registra todo o processo de fabricacao de uma batelada
CREATE TABLE IF NOT EXISTS vet_auto_fabricacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  lote_fabricacao UUID DEFAULT gen_random_uuid(),
  receita_id UUID REFERENCES vet_auto_receitas(id) ON DELETE SET NULL,
  usuario_id UUID,
  operador_pa_id UUID, -- operador da pa carregadeira
  misturador_id UUID REFERENCES vet_auto_misturadores(id) ON DELETE SET NULL,
  numero_trato INTEGER DEFAULT 1,
  data_registro DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio TIMESTAMPTZ,
  hora_fim TIMESTAMPTZ,
  total_kg_fabricada NUMERIC(10,2) DEFAULT 0,
  total_kg_previsto NUMERIC(10,2) DEFAULT 0,
  total_cabeca INTEGER DEFAULT 0,
  tipo_uso TEXT, -- estacionario, rotomix, batchbox
  total_perda_kg NUMERIC(10,2) DEFAULT 0,
  total_sobra_kg NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'espera' CHECK (status IN ('espera', 'processando', 'processado', 'cancelado')),
  flag_automation BOOLEAN DEFAULT FALSE,
  flag_batchbox BOOLEAN DEFAULT FALSE,
  observacoes TEXT,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_fabricacoes IS 'Fabricacoes/batidas de racao: processo completo de mistura no misturador';

-- 11. Detalhes de ingredientes por fabricacao
-- Cada ingrediente pesado durante a batida com tempos, pesos e status
CREATE TABLE IF NOT EXISTS vet_auto_fabricacao_ingredientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fabricacao_id UUID NOT NULL REFERENCES vet_auto_fabricacoes(id) ON DELETE CASCADE,
  ingrediente_id UUID NOT NULL REFERENCES vet_auto_ingredientes(id) ON DELETE CASCADE,
  total_kg_fabricada NUMERIC(10,2) DEFAULT 0,
  total_kg_previsto NUMERIC(10,2) DEFAULT 0,
  materia_seca NUMERIC(5,2) DEFAULT 0,
  hora_inicio TIMESTAMPTZ,
  hora_fim TIMESTAMPTZ,
  diferenca_percentual NUMERIC(5,2) DEFAULT 0,
  diferenca_kg NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'pesando', 'concluido', 'cancelado')),
  ordem INTEGER DEFAULT 0,
  tolerancia NUMERIC(5,2) DEFAULT 5,
  peso_inicial NUMERIC(10,2) DEFAULT 0,
  peso_final NUMERIC(10,2) DEFAULT 0,
  flag_manual TEXT DEFAULT 'automatico' CHECK (flag_manual IN ('automatico', 'manual', 'deslocamento', 'pausa', 'cancelamento')),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_fabricacao_ingredientes IS 'Pesagem de cada ingrediente na fabricacao: pesos, tempos, tolerancia e modo (auto/manual)';

-- 12. Carregamentos (vagao carregado saindo para distribuicao)
CREATE TABLE IF NOT EXISTS vet_auto_carregamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  data_registro DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'aberto' CHECK (status IN ('aberto', 'fornecendo', 'fechado', 'cancelado')),
  total_carregado NUMERIC(10,2) DEFAULT 0,
  trato_id UUID REFERENCES vet_auto_tratos(id) ON DELETE SET NULL,
  misturador_id UUID REFERENCES vet_auto_misturadores(id) ON DELETE SET NULL,
  peso_balancao NUMERIC(10,2) DEFAULT 0, -- peso na saida
  peso_balancao_retorno NUMERIC(10,2) DEFAULT 0, -- peso no retorno
  flag_automation BOOLEAN DEFAULT FALSE,
  usuario_id UUID,
  usuario_nome TEXT,
  observacoes TEXT,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_carregamentos IS 'Carregamentos: vagao carregado saindo para distribuicao nos currais';

-- 13. Detalhes do carregamento (composicao do que foi carregado)
CREATE TABLE IF NOT EXISTS vet_auto_carregamento_detalhes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carregamento_id UUID NOT NULL REFERENCES vet_auto_carregamentos(id) ON DELETE CASCADE,
  peso_inicial NUMERIC(10,2) DEFAULT 0,
  peso_final NUMERIC(10,2) DEFAULT 0,
  hora_inicial TIMESTAMPTZ,
  hora_final TIMESTAMPTZ,
  usuario_id UUID,
  lote_fabricacao UUID, -- referencia ao lote da fabricacao
  receita_id UUID REFERENCES vet_auto_receitas(id) ON DELETE SET NULL,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_carregamento_detalhes IS 'Detalhes do carregamento: pesos e lotes de fabricacao que compoem a carga';

-- 14. Fornecimentos realizados por curral
-- Registro de cada descarga de racao em um curral
CREATE TABLE IF NOT EXISTS vet_auto_fornecimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  fornecido_kg NUMERIC(10,2) DEFAULT 0,
  data_registro DATE NOT NULL DEFAULT CURRENT_DATE,
  tag_inicial TEXT,
  tag_final TEXT,
  ordem_trato INTEGER DEFAULT 0,
  peso_inicial NUMERIC(10,2) DEFAULT 0,
  peso_final NUMERIC(10,2) DEFAULT 0,
  hora_inicio TIMESTAMPTZ,
  hora_final TIMESTAMPTZ,
  carregamento_id UUID REFERENCES vet_auto_carregamentos(id) ON DELETE SET NULL,
  curral_rfid_id UUID REFERENCES vet_auto_currais_rfid(id) ON DELETE SET NULL,
  usuario_id UUID,
  misturador_id UUID REFERENCES vet_auto_misturadores(id) ON DELETE SET NULL,
  trato_numero INTEGER,
  receita_id UUID REFERENCES vet_auto_receitas(id) ON DELETE SET NULL,
  safe_point_grupo UUID, -- agrupa fornecimentos entre safe points
  flag_rateio BOOLEAN DEFAULT FALSE,
  entrada_manual BOOLEAN DEFAULT FALSE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_fornecimentos IS 'Fornecimentos realizados: cada descarga de racao em um curral com pesos e tempos';

-- 15. Descartes de racao (perdas durante fabricacao ou fornecimento)
CREATE TABLE IF NOT EXISTS vet_auto_descartes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('fabricacao', 'fornecimento')),
  referencia_id UUID, -- id da fabricacao ou carregamento de origem
  misturador_id UUID REFERENCES vet_auto_misturadores(id) ON DELETE SET NULL,
  motivo TEXT NOT NULL,
  quantidade_kg NUMERIC(10,2) NOT NULL,
  observacao TEXT,
  usuario_id UUID,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_descartes IS 'Descartes de racao: perdas durante fabricacao ou fornecimento com motivo e quantidade';

-- 16. Safe points (pontos de checkpoint RFID no percurso do vagao)
CREATE TABLE IF NOT EXISTS vet_auto_safe_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  tag TEXT NOT NULL,
  tipo TEXT DEFAULT 'checkpoint' CHECK (tipo IN ('entrada', 'saida', 'checkpoint')),
  dispositivo_id UUID REFERENCES vet_auto_dispositivos(id) ON DELETE SET NULL,
  ativo BOOLEAN DEFAULT TRUE,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_safe_points IS 'Pontos de checkpoint RFID no percurso do vagao para controle de pesagem';

-- 17. Leituras nos safe points (pesagens automaticas)
CREATE TABLE IF NOT EXISTS vet_auto_safe_point_leituras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  safe_point_id UUID NOT NULL REFERENCES vet_auto_safe_points(id) ON DELETE CASCADE,
  carregamento_id UUID REFERENCES vet_auto_carregamentos(id) ON DELETE SET NULL,
  peso_kg NUMERIC(10,2) DEFAULT 0,
  input_type TEXT DEFAULT 'automatica',
  tara_kg NUMERIC(10,2) DEFAULT 0,
  peso_bruto_kg NUMERIC(10,2) DEFAULT 0,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_safe_point_leituras IS 'Leituras de peso nos safe points: peso bruto, tara e liquido por carregamento';

-- 18. Ocorrencias de parada (eventos que interrompem a operacao)
CREATE TABLE IF NOT EXISTS vet_auto_ocorrencia_paradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  data_registro TIMESTAMPTZ DEFAULT NOW(),
  carregamento_id UUID REFERENCES vet_auto_carregamentos(id) ON DELETE SET NULL,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_ocorrencia_paradas IS 'Ocorrencias de parada: eventos que interrompem fabricacao ou fornecimento';

-- 19. Itens de cada ocorrencia de parada
CREATE TABLE IF NOT EXISTS vet_auto_ocorrencia_parada_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrencia_id UUID NOT NULL REFERENCES vet_auto_ocorrencia_paradas(id) ON DELETE CASCADE,
  nome TEXT,
  observacao TEXT,
  operador TEXT,
  receita TEXT,
  peso_balanca NUMERIC(10,2) DEFAULT 0,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_ocorrencia_parada_itens IS 'Detalhes de cada ocorrencia de parada: operador, receita em uso e peso no momento';

-- 20. Log de atividades do sistema de automacao
CREATE TABLE IF NOT EXISTS vet_auto_log_atividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID REFERENCES vet_fazendas(id) ON DELETE CASCADE NOT NULL,
  usuario_id UUID,
  usuario_nome TEXT,
  acao TEXT NOT NULL,
  numero_dispositivo TEXT,
  data_registro TIMESTAMPTZ DEFAULT NOW(),
  numero_vagao TEXT,
  detalhes JSONB DEFAULT '{}',
  user_id UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE vet_auto_log_atividades IS 'Log de todas as atividades do sistema de automacao: acoes de usuarios e dispositivos';

-- ============================================================================
-- SECAO 3: INDEXES
-- ============================================================================

-- Configuracoes
CREATE INDEX IF NOT EXISTS idx_auto_config_fazenda ON vet_auto_configuracoes(fazenda_id);

-- Dispositivos
CREATE INDEX IF NOT EXISTS idx_auto_disp_fazenda ON vet_auto_dispositivos(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_disp_tipo ON vet_auto_dispositivos(tipo);
CREATE INDEX IF NOT EXISTS idx_auto_disp_misturador ON vet_auto_dispositivos(misturador_id);

-- Misturadores
CREATE INDEX IF NOT EXISTS idx_auto_mist_fazenda ON vet_auto_misturadores(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_mist_balanca ON vet_auto_misturadores(balanca_id);

-- Ingredientes
CREATE INDEX IF NOT EXISTS idx_auto_ingr_fazenda ON vet_auto_ingredientes(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_ingr_tipo ON vet_auto_ingredientes(tipo);

-- Receitas
CREATE INDEX IF NOT EXISTS idx_auto_rec_fazenda ON vet_auto_receitas(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_rec_status ON vet_auto_receitas(status);
CREATE INDEX IF NOT EXISTS idx_auto_rec_tipo ON vet_auto_receitas(tipo_receita);

-- Receita ingredientes
CREATE INDEX IF NOT EXISTS idx_auto_rec_ingr_receita ON vet_auto_receita_ingredientes(receita_id);
CREATE INDEX IF NOT EXISTS idx_auto_rec_ingr_ingrediente ON vet_auto_receita_ingredientes(ingrediente_id);

-- Currais RFID
CREATE INDEX IF NOT EXISTS idx_auto_currais_rfid_fazenda ON vet_auto_currais_rfid(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_currais_rfid_curral ON vet_auto_currais_rfid(curral_id);
CREATE INDEX IF NOT EXISTS idx_auto_currais_rfid_tags ON vet_auto_currais_rfid(tag_inicial, tag_final);

-- Tratos
CREATE INDEX IF NOT EXISTS idx_auto_tratos_fazenda ON vet_auto_tratos(fazenda_id);

-- Previstos
CREATE INDEX IF NOT EXISTS idx_auto_prev_fazenda ON vet_auto_previstos(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_prev_curral ON vet_auto_previstos(curral_rfid_id);
CREATE INDEX IF NOT EXISTS idx_auto_prev_trato ON vet_auto_previstos(trato_id);
CREATE INDEX IF NOT EXISTS idx_auto_prev_data ON vet_auto_previstos(data_fornecimento);
CREATE INDEX IF NOT EXISTS idx_auto_prev_receita ON vet_auto_previstos(receita_id);

-- Fabricacoes
CREATE INDEX IF NOT EXISTS idx_auto_fab_fazenda ON vet_auto_fabricacoes(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_fab_data ON vet_auto_fabricacoes(data_registro);
CREATE INDEX IF NOT EXISTS idx_auto_fab_status ON vet_auto_fabricacoes(status);
CREATE INDEX IF NOT EXISTS idx_auto_fab_receita ON vet_auto_fabricacoes(receita_id);
CREATE INDEX IF NOT EXISTS idx_auto_fab_misturador ON vet_auto_fabricacoes(misturador_id);
CREATE INDEX IF NOT EXISTS idx_auto_fab_lote ON vet_auto_fabricacoes(lote_fabricacao);

-- Fabricacao ingredientes
CREATE INDEX IF NOT EXISTS idx_auto_fab_ingr_fabricacao ON vet_auto_fabricacao_ingredientes(fabricacao_id);
CREATE INDEX IF NOT EXISTS idx_auto_fab_ingr_ingrediente ON vet_auto_fabricacao_ingredientes(ingrediente_id);
CREATE INDEX IF NOT EXISTS idx_auto_fab_ingr_status ON vet_auto_fabricacao_ingredientes(status);

-- Carregamentos
CREATE INDEX IF NOT EXISTS idx_auto_carreg_fazenda ON vet_auto_carregamentos(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_carreg_data ON vet_auto_carregamentos(data_registro);
CREATE INDEX IF NOT EXISTS idx_auto_carreg_status ON vet_auto_carregamentos(status);
CREATE INDEX IF NOT EXISTS idx_auto_carreg_trato ON vet_auto_carregamentos(trato_id);
CREATE INDEX IF NOT EXISTS idx_auto_carreg_misturador ON vet_auto_carregamentos(misturador_id);

-- Carregamento detalhes
CREATE INDEX IF NOT EXISTS idx_auto_carreg_det_carreg ON vet_auto_carregamento_detalhes(carregamento_id);
CREATE INDEX IF NOT EXISTS idx_auto_carreg_det_receita ON vet_auto_carregamento_detalhes(receita_id);

-- Fornecimentos
CREATE INDEX IF NOT EXISTS idx_auto_fornec_fazenda ON vet_auto_fornecimentos(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_fornec_data ON vet_auto_fornecimentos(data_registro);
CREATE INDEX IF NOT EXISTS idx_auto_fornec_carreg ON vet_auto_fornecimentos(carregamento_id);
CREATE INDEX IF NOT EXISTS idx_auto_fornec_curral ON vet_auto_fornecimentos(curral_rfid_id);
CREATE INDEX IF NOT EXISTS idx_auto_fornec_misturador ON vet_auto_fornecimentos(misturador_id);
CREATE INDEX IF NOT EXISTS idx_auto_fornec_receita ON vet_auto_fornecimentos(receita_id);
CREATE INDEX IF NOT EXISTS idx_auto_fornec_trato ON vet_auto_fornecimentos(trato_numero);

-- Descartes
CREATE INDEX IF NOT EXISTS idx_auto_desc_fazenda ON vet_auto_descartes(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_desc_tipo ON vet_auto_descartes(tipo);
CREATE INDEX IF NOT EXISTS idx_auto_desc_misturador ON vet_auto_descartes(misturador_id);

-- Safe points
CREATE INDEX IF NOT EXISTS idx_auto_sp_fazenda ON vet_auto_safe_points(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_sp_tag ON vet_auto_safe_points(tag);
CREATE INDEX IF NOT EXISTS idx_auto_sp_dispositivo ON vet_auto_safe_points(dispositivo_id);

-- Safe point leituras
CREATE INDEX IF NOT EXISTS idx_auto_sp_leit_safe_point ON vet_auto_safe_point_leituras(safe_point_id);
CREATE INDEX IF NOT EXISTS idx_auto_sp_leit_carreg ON vet_auto_safe_point_leituras(carregamento_id);

-- Ocorrencia paradas
CREATE INDEX IF NOT EXISTS idx_auto_oc_parada_fazenda ON vet_auto_ocorrencia_paradas(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_oc_parada_carreg ON vet_auto_ocorrencia_paradas(carregamento_id);
CREATE INDEX IF NOT EXISTS idx_auto_oc_parada_data ON vet_auto_ocorrencia_paradas(data_registro);

-- Ocorrencia parada itens
CREATE INDEX IF NOT EXISTS idx_auto_oc_parada_itens_oc ON vet_auto_ocorrencia_parada_itens(ocorrencia_id);

-- Log atividades
CREATE INDEX IF NOT EXISTS idx_auto_log_fazenda ON vet_auto_log_atividades(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_auto_log_data ON vet_auto_log_atividades(data_registro);
CREATE INDEX IF NOT EXISTS idx_auto_log_usuario ON vet_auto_log_atividades(usuario_id);

-- ============================================================================
-- SECAO 4: RLS (Row Level Security)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE vet_auto_configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_dispositivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_misturadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_receitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_receita_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_currais_rfid ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_tratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_previstos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_fabricacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_fabricacao_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_carregamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_carregamento_detalhes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_fornecimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_descartes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_safe_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_safe_point_leituras ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_ocorrencia_paradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_ocorrencia_parada_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE vet_auto_log_atividades ENABLE ROW LEVEL SECURITY;

-- RLS Policies: tabelas com fazenda_id usam vet_user_has_fazenda_access()
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'vet_auto_configuracoes',
    'vet_auto_dispositivos',
    'vet_auto_misturadores',
    'vet_auto_ingredientes',
    'vet_auto_receitas',
    'vet_auto_currais_rfid',
    'vet_auto_tratos',
    'vet_auto_previstos',
    'vet_auto_fabricacoes',
    'vet_auto_carregamentos',
    'vet_auto_fornecimentos',
    'vet_auto_descartes',
    'vet_auto_safe_points',
    'vet_auto_ocorrencia_paradas',
    'vet_auto_log_atividades'
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

-- RLS Policies: tabelas sem fazenda_id direta (usam user_id = auth.uid())
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'vet_auto_receita_ingredientes',
    'vet_auto_fabricacao_ingredientes',
    'vet_auto_carregamento_detalhes',
    'vet_auto_safe_point_leituras',
    'vet_auto_ocorrencia_parada_itens'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (user_id = auth.uid())',
      tbl || '_select', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (user_id = auth.uid())',
      tbl || '_insert', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (user_id = auth.uid())',
      tbl || '_update', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (user_id = auth.uid())',
      tbl || '_delete', tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- SECAO 5: TRIGGERS (updated_at automatico)
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'vet_auto_configuracoes',
    'vet_auto_dispositivos',
    'vet_auto_misturadores',
    'vet_auto_ingredientes',
    'vet_auto_receitas',
    'vet_auto_receita_ingredientes',
    'vet_auto_currais_rfid',
    'vet_auto_tratos',
    'vet_auto_previstos',
    'vet_auto_fabricacoes',
    'vet_auto_fabricacao_ingredientes',
    'vet_auto_carregamentos',
    'vet_auto_carregamento_detalhes',
    'vet_auto_fornecimentos',
    'vet_auto_descartes',
    'vet_auto_safe_points',
    'vet_auto_safe_point_leituras',
    'vet_auto_ocorrencia_paradas',
    'vet_auto_ocorrencia_parada_itens',
    'vet_auto_log_atividades'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION vet_auto_update_updated_at()',
      tbl || '_updated_at', tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- SECAO 6: VIEWS
-- ============================================================================

-- View 1: Resumo de fornecimento do dia por curral
-- Mostra total fornecido vs previsto por curral no dia atual
CREATE OR REPLACE VIEW view_auto_fornecimento_dia AS
SELECT
  f.fazenda_id,
  f.curral_rfid_id,
  cr.nome AS curral_nome,
  cr.tag_inicial,
  cr.tag_final,
  f.trato_numero,
  f.data_registro,
  f.receita_id,
  r.nome AS receita_nome,
  COUNT(*) AS total_fornecimentos,
  SUM(f.fornecido_kg) AS total_fornecido_kg,
  COALESCE(p.total_previsto_kg, 0) AS total_previsto_kg,
  SUM(f.fornecido_kg) - COALESCE(p.total_previsto_kg, 0) AS diferenca_kg,
  CASE
    WHEN COALESCE(p.total_previsto_kg, 0) > 0
    THEN ROUND((SUM(f.fornecido_kg) / p.total_previsto_kg) * 100, 2)
    ELSE 0
  END AS percentual_atendido
FROM vet_auto_fornecimentos f
LEFT JOIN vet_auto_currais_rfid cr ON cr.id = f.curral_rfid_id
LEFT JOIN vet_auto_receitas r ON r.id = f.receita_id
LEFT JOIN LATERAL (
  SELECT SUM(pv.previsto_kg) AS total_previsto_kg
  FROM vet_auto_previstos pv
  WHERE pv.curral_rfid_id = f.curral_rfid_id
    AND pv.data_fornecimento = f.data_registro
) p ON TRUE
WHERE f.data_registro = CURRENT_DATE
GROUP BY f.fazenda_id, f.curral_rfid_id, cr.nome, cr.tag_inicial, cr.tag_final,
         f.trato_numero, f.data_registro, f.receita_id, r.nome, p.total_previsto_kg;

-- View 2: Status dos carregamentos com totais e vagao
CREATE OR REPLACE VIEW view_auto_carregamento_status AS
SELECT
  c.id AS carregamento_id,
  c.fazenda_id,
  c.data_registro,
  c.status,
  CASE c.status
    WHEN 'aberto' THEN 'Aberto'
    WHEN 'fornecendo' THEN 'Fornecendo'
    WHEN 'fechado' THEN 'Fechado'
    WHEN 'cancelado' THEN 'Cancelado'
  END AS status_label,
  c.total_carregado,
  c.peso_balancao,
  c.peso_balancao_retorno,
  c.total_carregado - COALESCE(c.peso_balancao_retorno, 0) AS total_distribuido_kg,
  c.flag_automation,
  c.usuario_nome,
  m.nome AS misturador_nome,
  m.numero AS misturador_numero,
  m.tipo_uso AS misturador_tipo,
  t.numero AS trato_numero,
  t.horario AS trato_horario,
  (SELECT COUNT(*) FROM vet_auto_fornecimentos fn WHERE fn.carregamento_id = c.id) AS total_currais_atendidos,
  (SELECT COALESCE(SUM(fn.fornecido_kg), 0) FROM vet_auto_fornecimentos fn WHERE fn.carregamento_id = c.id) AS total_fornecido_kg,
  c.created_at
FROM vet_auto_carregamentos c
LEFT JOIN vet_auto_misturadores m ON m.id = c.misturador_id
LEFT JOIN vet_auto_tratos t ON t.id = c.trato_id;

-- View 3: Previsto vs realizado por curral/trato/data
-- Relatorio principal de aderencia ao planejado
CREATE OR REPLACE VIEW view_auto_previsto_vs_realizado AS
SELECT
  p.fazenda_id,
  p.curral_rfid_id,
  cr.nome AS curral_nome,
  cr.tag_inicial,
  cr.tag_final,
  p.trato_id,
  t.numero AS trato_numero,
  t.horario AS trato_horario,
  p.receita_id,
  r.nome AS receita_nome,
  r.tipo_receita,
  p.data_fornecimento,
  p.quantidade_cab,
  p.previsto_kg,
  COALESCE(p.realizado_kg, 0) AS realizado_kg,
  COALESCE(p.realizado_kg, 0) - p.previsto_kg AS diferenca_kg,
  CASE
    WHEN p.previsto_kg > 0
    THEN ROUND(((COALESCE(p.realizado_kg, 0) - p.previsto_kg) / p.previsto_kg) * 100, 2)
    ELSE 0
  END AS diferenca_percentual,
  CASE
    WHEN COALESCE(p.realizado_kg, 0) = 0 THEN 'Pendente'
    WHEN ABS(COALESCE(p.realizado_kg, 0) - p.previsto_kg) <= (p.previsto_kg * 0.05) THEN 'OK'
    WHEN COALESCE(p.realizado_kg, 0) > p.previsto_kg THEN 'Excesso'
    ELSE 'Falta'
  END AS situacao
FROM vet_auto_previstos p
LEFT JOIN vet_auto_currais_rfid cr ON cr.id = p.curral_rfid_id
LEFT JOIN vet_auto_tratos t ON t.id = p.trato_id
LEFT JOIN vet_auto_receitas r ON r.id = p.receita_id;

-- View 4: Resumo diario consolidado (previsto, realizado, descarte, eficiencia)
CREATE OR REPLACE VIEW view_auto_resumo_diario AS
SELECT
  p.fazenda_id,
  p.data_fornecimento AS data,
  SUM(p.previsto_kg) AS total_previsto_kg,
  SUM(COALESCE(p.realizado_kg, 0)) AS total_realizado_kg,
  SUM(COALESCE(p.realizado_kg, 0)) - SUM(p.previsto_kg) AS diferenca_total_kg,
  CASE
    WHEN SUM(p.previsto_kg) > 0
    THEN ROUND((SUM(COALESCE(p.realizado_kg, 0)) / SUM(p.previsto_kg)) * 100, 2)
    ELSE 0
  END AS eficiencia_percentual,
  COUNT(DISTINCT p.curral_rfid_id) AS total_currais,
  SUM(p.quantidade_cab) AS total_cabecas,
  COALESCE(d.total_descarte_kg, 0) AS total_descarte_kg,
  COALESCE(fab.total_fabricado_kg, 0) AS total_fabricado_kg,
  COALESCE(fab.total_fabricacoes, 0) AS total_fabricacoes
FROM vet_auto_previstos p
LEFT JOIN LATERAL (
  SELECT SUM(ds.quantidade_kg) AS total_descarte_kg
  FROM vet_auto_descartes ds
  WHERE ds.fazenda_id = p.fazenda_id
    AND ds.created_at::date = p.data_fornecimento
) d ON TRUE
LEFT JOIN LATERAL (
  SELECT
    SUM(fb.total_kg_fabricada) AS total_fabricado_kg,
    COUNT(*) AS total_fabricacoes
  FROM vet_auto_fabricacoes fb
  WHERE fb.fazenda_id = p.fazenda_id
    AND fb.data_registro = p.data_fornecimento
    AND fb.status = 'processado'
) fab ON TRUE
GROUP BY p.fazenda_id, p.data_fornecimento, d.total_descarte_kg, fab.total_fabricado_kg, fab.total_fabricacoes;

-- View 5: Status das fabricacoes com detalhes de receita e misturador
CREATE OR REPLACE VIEW view_auto_fabricacao_status AS
SELECT
  f.id AS fabricacao_id,
  f.fazenda_id,
  f.lote_fabricacao,
  f.data_registro,
  f.status,
  CASE f.status
    WHEN 'espera' THEN 'Em Espera'
    WHEN 'processando' THEN 'Processando'
    WHEN 'processado' THEN 'Processado'
    WHEN 'cancelado' THEN 'Cancelado'
  END AS status_label,
  f.numero_trato,
  f.hora_inicio,
  f.hora_fim,
  EXTRACT(EPOCH FROM (f.hora_fim - f.hora_inicio)) / 60.0 AS duracao_minutos,
  f.total_kg_fabricada,
  f.total_kg_previsto,
  f.total_kg_fabricada - f.total_kg_previsto AS diferenca_kg,
  CASE
    WHEN f.total_kg_previsto > 0
    THEN ROUND(((f.total_kg_fabricada - f.total_kg_previsto) / f.total_kg_previsto) * 100, 2)
    ELSE 0
  END AS diferenca_percentual,
  f.total_cabeca,
  f.total_perda_kg,
  f.total_sobra_kg,
  f.tipo_uso,
  f.flag_automation,
  f.flag_batchbox,
  r.nome AS receita_nome,
  r.codigo AS receita_codigo,
  r.tipo_receita,
  m.nome AS misturador_nome,
  m.numero AS misturador_numero,
  m.tipo_uso AS misturador_tipo,
  (SELECT COUNT(*) FROM vet_auto_fabricacao_ingredientes fi WHERE fi.fabricacao_id = f.id) AS total_ingredientes,
  (SELECT COUNT(*) FROM vet_auto_fabricacao_ingredientes fi WHERE fi.fabricacao_id = f.id AND fi.status = 'concluido') AS ingredientes_concluidos,
  f.created_at
FROM vet_auto_fabricacoes f
LEFT JOIN vet_auto_receitas r ON r.id = f.receita_id
LEFT JOIN vet_auto_misturadores m ON m.id = f.misturador_id;

-- ============================================================================
-- FIM DA MIGRACAO 001 - Automacao Completa
-- ============================================================================
