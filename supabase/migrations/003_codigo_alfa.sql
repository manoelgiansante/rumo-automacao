-- Add codigo_alfa to ingredientes and receitas (CR1 parity)
ALTER TABLE vet_auto_ingredientes ADD COLUMN IF NOT EXISTS codigo_alfa VARCHAR(20);
ALTER TABLE vet_auto_receitas ADD COLUMN IF NOT EXISTS codigo_alfa VARCHAR(20);

-- Add previsto_kg to fornecimentos (CR1 stores it inline)
ALTER TABLE vet_auto_fornecimentos ADD COLUMN IF NOT EXISTS previsto_kg NUMERIC(12,2);

-- Add habilita_ocorrencia_parada to config
ALTER TABLE vet_auto_configuracoes ADD COLUMN IF NOT EXISTS habilita_ocorrencia_parada BOOLEAN DEFAULT true;

-- Add api_esp_id to safe_points
ALTER TABLE vet_auto_safe_points ADD COLUMN IF NOT EXISTS api_esp_id INTEGER;

-- Add rfid_esquerdo/rfid_direito to configuracao_misturadores
ALTER TABLE vet_auto_configuracao_misturadores ADD COLUMN IF NOT EXISTS rfid_esquerdo INTEGER DEFAULT 1;
ALTER TABLE vet_auto_configuracao_misturadores ADD COLUMN IF NOT EXISTS rfid_direito INTEGER DEFAULT 2;

-- Add trato to ordens_producao
ALTER TABLE vet_auto_ordens_producao ADD COLUMN IF NOT EXISTS trato_numero INTEGER;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vet_auto_ingredientes_codigo_alfa ON vet_auto_ingredientes(codigo_alfa);
CREATE INDEX IF NOT EXISTS idx_vet_auto_receitas_codigo_alfa ON vet_auto_receitas(codigo_alfa);
