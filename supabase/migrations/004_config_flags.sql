ALTER TABLE vet_auto_configuracoes ADD COLUMN IF NOT EXISTS confirmar_fornecimento BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_configuracoes ADD COLUMN IF NOT EXISTS abertura_curral_manual BOOLEAN DEFAULT false;
ALTER TABLE vet_auto_configuracoes ADD COLUMN IF NOT EXISTS valor_corte_fornecimento NUMERIC(10,2) DEFAULT 0;
ALTER TABLE vet_auto_configuracoes ADD COLUMN IF NOT EXISTS tempo_ingrediente_led INTEGER DEFAULT 3;
ALTER TABLE vet_auto_configuracoes ADD COLUMN IF NOT EXISTS velocidade_led INTEGER DEFAULT 5;
