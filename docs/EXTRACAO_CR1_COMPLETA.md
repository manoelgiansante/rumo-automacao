# Extração Completa - CR1_Onboard_3.17.3 (Gestão Agropecuária)

## Visão Geral

O CR1 TGT é um sistema de gerenciamento de fabricação e distribuição de ração para confinamento bovino.
- **CR1** = Sistema embarcado de fabricação (mistura de ingredientes)
- **TGT** = Sistema de distribuição/fornecimento de ração aos currais
- **Plataforma**: .NET Framework 4.8 / WPF / MVVM
- **Versão**: 3.17.3
- **Publisher**: Gestão Agropecuária
- **Locale**: pt-BR

## Arquitetura de Hardware

### Dois modos de operação:

#### 1. Legacy (Serial/TCP direto)
- `Communication.dll` + `Dispositivos.dll`
- Comunicação via porta serial (COM) ou TCP/IP
- Protocolo SMA para balanças
- Protocolo BRI para RFID Intermec

#### 2. V10 (ESP32 HTTP API)
- `DriverBoardMKD.dll`
- REST API via HTTP para ESP32
- Endpoints: `/scale/read-weight`, `/tag/read-tag`, `/led/write-lines`

---

## 1. SCHEMA DO BANCO DE DADOS (SQLite - db2.sdb)

### Tabelas de Configuração

```sql
-- Configurações gerais do aplicativo
CREATE TABLE tbl_configuracoes (
  url_web_service TEXT,
  numero_dispositivo INTEGER,
  tipo_sincronismo INTEGER, -- 0=TGTLegado, 1=WebService
  tipo_uso INTEGER,
  tipo_software INTEGER, -- 0=WITHOUT, 1=CR1, 2=TGT, 3=TGTManual, 4=TGTSigaFran, 5=CR1BatchBox
  -- Firebird connection
  firebird_host TEXT DEFAULT '192.168.0.5',
  firebird_database TEXT DEFAULT 'C:\cr1\DB_TGC.FDB',
  firebird_user TEXT DEFAULT 'SYSDBA',
  firebird_password TEXT DEFAULT 'masterkey',
  -- Licenciamento
  chave_licenca TEXT,
  data_validade TEXT,
  -- LED Display
  usa_display_led INTEGER DEFAULT 0,
  intensidade_led INTEGER DEFAULT 5,
  -- RFID/Antena
  usa_antena_unica INTEGER DEFAULT 0,
  antena_manual INTEGER DEFAULT 0,
  tamanho_tag INTEGER DEFAULT 24,
  timeout_rfid_sem_leitura INTEGER DEFAULT 5,
  -- Safe Point
  usa_safe_point INTEGER DEFAULT 0,
  -- V10 Hardware
  utiliza_api_hardware INTEGER DEFAULT 0,
  -- Logging
  enable_log_peso INTEGER DEFAULT 0,
  enable_log_comunicacao_balanca INTEGER DEFAULT 0,
  enable_log_fornecimento INTEGER DEFAULT 0,
  -- Validações
  validate_tipo_receita_diferente INTEGER DEFAULT 0,
  -- Integration Server
  integration_server_url TEXT,
  integration_server_token TEXT
);

-- Configuração V10
CREATE TABLE configuracao_v10 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usa_config_v10 INTEGER DEFAULT 0,
  intensidade_led INTEGER DEFAULT 5,
  usa_balancao_v10 INTEGER DEFAULT 0
);

-- Endereços V10 (IP dos dispositivos ESP32)
CREATE TABLE endereco_v10 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endereco VARCHAR(100), -- formato: IP:PORTA (ex: 192.168.25.200:80)
  tipo_uso INTEGER,
  misturador INTEGER,
  misturador_desc VARCHAR(100),
  nome VARCHAR(100)
);

-- Configuração por misturador
CREATE TABLE tbl_configuracoes_misturadores (
  codigo_misturador INTEGER PRIMARY KEY,
  posicao INTEGER,
  porta TEXT, -- porta COM ou IP:PORTA da balança
  resolucao INTEGER,
  capacidade_min REAL,
  capacidade_max REAL,
  tempo_troca_ingrediente INTEGER, -- segundos
  faixa_estabilidade REAL, -- kg de variação aceitável
  porta_display TEXT, -- porta COM ou IP:PORTA do display LED
  porta_rfid TEXT -- porta COM ou IP:PORTA do leitor RFID
);
```

### Tabelas de Cadastro

```sql
-- Usuários
CREATE TABLE tbl_usuarios (
  codigo INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  login TEXT,
  senha TEXT, -- MD5 hash
  data_registro TEXT,
  tipo_usuario INTEGER -- 1=Tratador, 2=Operador de Pá, 3=Outros
);

-- Ingredientes
CREATE TABLE tbl_ingredientes (
  codigo INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT,
  materia_seca REAL,
  custo_kg REAL,
  estoque_atual REAL,
  codigo_alfa TEXT,
  estoque_minimo_kg REAL,
  tempo_de_persistencia INTEGER,
  local_fisico TEXT
);

-- Receitas (Rações)
CREATE TABLE tbl_receitas (
  codigo INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  codigo_alfa TEXT,
  materia_seca REAL,
  imn_por_cabeca_dia REAL, -- ingestão matéria natural por cabeça/dia
  custo_tonelada_mn REAL,
  data_criacao TEXT,
  tempo_mistura INTEGER, -- segundos
  tipo_receita TEXT,
  id_tipo_receita INTEGER,
  perc_tolerancia REAL,
  status INTEGER
);

-- Ingredientes por receita
CREATE TABLE tbl_det_ingredientes_receita (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_receita INTEGER REFERENCES tbl_receitas(codigo),
  codigo_ingrediente INTEGER REFERENCES tbl_ingredientes(codigo),
  percentual_materia_natural REAL,
  percentual_materia_seca REAL,
  tolerancia REAL,
  tolerancia_tipo_uso INTEGER,
  ordem_batida INTEGER,
  automatizado INTEGER DEFAULT 0
);

-- Ingredientes por receita por misturador
CREATE TABLE tbl_det_ingrediente_receita_misturador (
  codigo_receita INTEGER,
  codigo_ingrediente INTEGER,
  percentual_materia_natural REAL,
  percentual_materia_seca REAL,
  tolerancia REAL,
  tolerancia_tipo_uso INTEGER,
  ordem_batida INTEGER,
  codigo_misturador INTEGER,
  automatizado INTEGER DEFAULT 0,
  PRIMARY KEY (codigo_receita, codigo_ingrediente, codigo_misturador)
);

-- Misturadores/Vagões
CREATE TABLE tbl_misturador_vagao (
  codigo INTEGER PRIMARY KEY,
  codigo_balanca INTEGER REFERENCES tbl_balanca(codigo),
  modelo TEXT,
  fabricante TEXT,
  numero INTEGER,
  capacidade_minima REAL,
  capacidade_maxima REAL
);

-- Balanças
CREATE TABLE tbl_balanca (
  codigo INTEGER PRIMARY KEY,
  modelo TEXT,
  fabricante TEXT,
  precisao REAL,
  codigo_protocolo INTEGER
);

-- Horários de trato
CREATE TABLE tbl_tratos (
  numero INTEGER PRIMARY KEY,
  hora_inicio INTEGER,
  minuto_inicio INTEGER
);

CREATE TABLE tbl_tgt_tratos (
  trato INTEGER PRIMARY KEY,
  horario TEXT
);

-- Currais com tags RFID
CREATE TABLE tbl_tgt_curral (
  codigo INTEGER PRIMARY KEY,
  tag_inicial TEXT, -- tag RFID no início do curral
  tag_final TEXT, -- tag RFID no final do curral
  linha INTEGER,
  numero INTEGER,
  ordem_trato INTEGER,
  nome TEXT
);

-- Previsão de fornecimento
CREATE TABLE tbl_tgt_previsto (
  codigo INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_tgt_curral INTEGER REFERENCES tbl_tgt_curral(codigo),
  codigo_tgt_trato INTEGER,
  codigo_receita INTEGER REFERENCES tbl_receitas(codigo),
  data_fornecimento TEXT,
  previsto_kg REAL,
  quantidade_cab INTEGER,
  realizado_kg REAL DEFAULT 0
);
```

### Tabelas de Fabricação (CR1)

```sql
-- Fabricação de receita (lote)
CREATE TABLE tbl_fab_receitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_fabricacao TEXT UNIQUE, -- identificador único do lote
  codigo_receita INTEGER REFERENCES tbl_receitas(codigo),
  codigo_usuario INTEGER,
  codigo_operador_pa INTEGER,
  codigo_misturador INTEGER,
  numero_lote_animais INTEGER,
  numero_trato INTEGER,
  data_registro TEXT,
  hora_inicio_fabricacao TEXT,
  hora_fim_fabricacao TEXT,
  total_kg_materia_natural_fabricada REAL,
  total_kg_materia_natural_previsto REAL,
  total_cabeca INTEGER,
  tipo_uso INTEGER, -- ESTACIONARIO, ROTOMIX, BATCHBOX
  total_perda_kg REAL,
  total_sobra_carregado_kg REAL,
  lote_fabricacao_sobra TEXT,
  flag_automation INTEGER DEFAULT 0,
  flag_batchbox INTEGER DEFAULT 0,
  codigo_ordem_producao INTEGER,
  status_receita INTEGER -- ESPERA, PROCESSANDO, PROCESSADO, CANCELADO
);

-- Detalhe ingredientes fabricados
CREATE TABLE tbl_fab_det_ingredientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_fabricacao_receita TEXT REFERENCES tbl_fab_receitas(lote_fabricacao),
  codigo_ingrediente INTEGER,
  codigo_usuario INTEGER,
  total_kg_materia_natural_fabricada REAL,
  total_kg_materia_natural_previsto REAL,
  materia_seca_ingrediente REAL,
  hora_inicio TEXT,
  hora_fim TEXT,
  total_diferenca_percentual REAL,
  total_diferenca_kg REAL,
  status_ingrediente INTEGER,
  ordem INTEGER,
  nome TEXT,
  tolerancia REAL,
  codigo_operador INTEGER,
  nome_operador TEXT,
  peso_inicial REAL,
  peso_final REAL,
  flag_manual INTEGER, -- TROCA_AUTOMATICA, MANUAL, DESLOCAMENTO, PAUSA, CANCELAMENTO
  flag_automation INTEGER DEFAULT 0,
  flag_batchbox INTEGER DEFAULT 0
);

-- Resumo fabricação do dia
CREATE TABLE cr1_fabricacoes_dia (
  codigo_receita INTEGER,
  trato INTEGER,
  total_fabricado REAL,
  data TEXT
);

-- Descarte de fabricação
CREATE TABLE descarte_fabricacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_fabricacao_receita TEXT,
  codigo_usuario INTEGER,
  quantidade REAL,
  observacao TEXT
);

-- Ordem de produção
CREATE TABLE tbl_ordem_producao (
  codigo INTEGER PRIMARY KEY,
  codigo_receita INTEGER,
  previsto_kg REAL,
  status INTEGER, -- Aguardando, Produzindo, Encerrado, Cancelado
  data_producao TEXT
);
```

### Tabelas de Distribuição/Fornecimento (TGT)

```sql
-- Carregamento (saída do misturador para o vagão)
CREATE TABLE tbl_tgt_carregamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_registro TEXT,
  flag_status INTEGER,
  total_carregado REAL,
  codigo_tgt_trato INTEGER,
  codigo_misturador_vagao INTEGER,
  flag_envio INTEGER DEFAULT 2, -- 2=não enviado
  peso_balancao REAL, -- peso na balança de saída
  peso_balancao_retorno REAL, -- peso na balança de retorno
  flag_automation INTEGER DEFAULT 0,
  flag_sigafran INTEGER DEFAULT 0
);

-- Detalhe do carregamento (receitas carregadas)
CREATE TABLE tbl_tgt_det_carregamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_registro TEXT,
  peso_inicial REAL,
  peso_final REAL,
  hora_inicial TEXT,
  hora_final TEXT,
  codigo_tgt_carregamento INTEGER REFERENCES tbl_tgt_carregamento(id),
  codigo_usuarios INTEGER,
  codigo_misturador_vagao INTEGER,
  lote_fabricacao TEXT,
  codigo_receita INTEGER,
  flag_automation INTEGER DEFAULT 0
);

-- Fornecimento por curral (CORE DO TGT!)
CREATE TABLE tbl_tgt_fornecido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fornecido_kg REAL, -- quantidade realmente fornecida
  flag_fornecido INTEGER,
  data_registro TEXT,
  tag_inicial TEXT, -- tag RFID lida na entrada do curral
  tag_final TEXT, -- tag RFID lida na saída do curral
  ordem_trato INTEGER,
  peso_inicial REAL, -- peso do vagão ANTES de fornecer
  peso_final REAL, -- peso do vagão DEPOIS de fornecer
  hora_inicio TEXT,
  hora_final TEXT,
  codigo_tgt_carregamento INTEGER REFERENCES tbl_tgt_carregamento(id),
  codigo_tgt_curral INTEGER REFERENCES tbl_tgt_curral(codigo),
  codigo_usuarios INTEGER,
  codigo_misturador_vagao INTEGER,
  trato INTEGER,
  grupo_safe_point TEXT,
  grupo_safe_point_nome TEXT,
  numero_dispositivo INTEGER,
  codigo_receita INTEGER,
  flag_rateio INTEGER DEFAULT 0, -- distribuição proporcional
  peso_antigo REAL,
  entrada_manual INTEGER DEFAULT 0
);

-- Descarte de fornecimento
CREATE TABLE descarte_fornecimento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_misturador_vagao INTEGER,
  id_carregamento INTEGER,
  motivo TEXT,
  quantidade REAL
);

-- Safe Points (pontos de pesagem intermediários)
CREATE TABLE safe_point (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT,
  tag TEXT, -- tag RFID do safe point
  data_registro TEXT,
  tipo INTEGER, -- tipo do checkpoint
  flag_envio INTEGER DEFAULT 2,
  data_envio TEXT,
  api_esp_id INTEGER
);

-- Leituras nos safe points
CREATE TABLE safe_point_input (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  safe_point_id INTEGER REFERENCES safe_point(id),
  carregamento_id INTEGER REFERENCES tbl_tgt_carregamento(id),
  peso_kg REAL,
  data_registro TEXT,
  input_type INTEGER,
  flag_envio INTEGER DEFAULT 2,
  data_envio TEXT,
  tara_kg REAL,
  peso_bruto_kg REAL
);

-- Ocorrências de parada
CREATE TABLE ocorrencia_parada (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT,
  data_registro TEXT
);

CREATE TABLE ocorrencia_parada_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ocorrencia_id INTEGER REFERENCES ocorrencia_parada(id),
  nome TEXT,
  observacao TEXT,
  operador TEXT,
  receita TEXT,
  peso_balanca REAL
);

-- Log de atividades do usuário
CREATE TABLE tbl_log_usuario (
  usuario_codigo INTEGER,
  usuario_nome TEXT,
  acao TEXT,
  numero_dispositivo INTEGER,
  data TEXT,
  numero_vagao INTEGER
);

-- Plano nutricional por animal
CREATE TABLE tbl_plan_nutricional_animais (
  codigo_receita INTEGER,
  numero_lote_animais INTEGER,
  data_uso TEXT,
  consumo_materia_natural_por_cabeca REAL,
  consumo_materia_seca_por_cabeca REAL,
  total_materia_natural REAL,
  total_materia_seca REAL
);

-- Sequenciador de IDs
CREATE TABLE tbl_identificador (
  tabela TEXT PRIMARY KEY,
  identificador INTEGER
);

-- Controle de versão do schema
CREATE TABLE tbl_version (
  version INTEGER,
  data_atualizacao TEXT
);
```

### Views

```sql
-- Lista de carregamentos
CREATE VIEW view_lista_carregamento AS
SELECT c.*, m.numero as numero_vagao, m.modelo as modelo_vagao
FROM tbl_tgt_carregamento c
JOIN tbl_misturador_vagao m ON c.codigo_misturador_vagao = m.codigo;

-- Relatório de fornecimento
CREATE VIEW view_relatorio_fornecimento AS
SELECT f.*, cu.nome as nome_curral, cu.numero as numero_curral,
       r.nome as nome_receita, u.nome as nome_usuario
FROM tbl_tgt_fornecido f
LEFT JOIN tbl_tgt_curral cu ON f.codigo_tgt_curral = cu.codigo
LEFT JOIN tbl_receitas r ON f.codigo_receita = r.codigo
LEFT JOIN tbl_usuarios u ON f.codigo_usuarios = u.codigo;

-- Previsto do dia por receita
CREATE VIEW view_previsto_do_dia_por_receita AS
SELECT r.codigo as codigo_receita, r.nome as nome_receita,
       SUM(p.previsto_kg) as total_previsto,
       COUNT(p.codigo) as total_currais
FROM tbl_tgt_previsto p
JOIN tbl_receitas r ON p.codigo_receita = r.codigo
WHERE date(p.data_fornecimento) = date('now')
GROUP BY r.codigo, r.nome;

-- Total fabricado por receita
CREATE VIEW view_total_fabricado_por_receita AS
SELECT codigo_receita, SUM(total_fabricado) as total_fabricado
FROM cr1_fabricacoes_dia
WHERE date(data) = date('now')
GROUP BY codigo_receita;

-- Total geral por trato
CREATE VIEW view_total_geral_trato AS
SELECT t.trato, t.horario,
       SUM(p.previsto_kg) as total_previsto,
       SUM(p.realizado_kg) as total_realizado
FROM tbl_tgt_tratos t
LEFT JOIN tbl_tgt_previsto p ON p.codigo_tgt_trato = t.trato
  AND date(p.data_fornecimento) = date('now')
GROUP BY t.trato, t.horario;
```

---

## 2. PROTOCOLOS DE COMUNICAÇÃO

### Protocolo SMA (Balanças Industriais)

Usado para comunicação com balanças Alfa/Digistar e compatíveis SMA.

#### Comandos Padrão SMA:
| Comando | Descrição |
|---------|-----------|
| RequestDisplayWeight | Solicita peso exibido |
| RequestHighResolutionWeight | Peso alta resolução |
| RequestDisplayedWeightAfterStability | Peso após estabilização |
| RequestScaleToZero | Zerar balança |
| RequestScaleToTare | Tarar balança |
| ClearScaleTareWeight | Limpar tara |
| SetScaleTareWeight | Definir valor de tara |
| ReturnTareWeight | Retornar tara atual |
| GrossNormalWeight | Peso bruto normal |
| NetNormalWeight | Peso líquido |
| RepeatDisplayedWeightContinuously | Stream contínuo de peso |
| AbortCommand | Abortar comando |

#### Comandos Estendidos SMA (ProtocoloModuloPesagemSMAX):
| Função | Comando | Descrição |
|--------|---------|-----------|
| AutozeroOn | `\nXA` | Ativar autozero |
| AutozeroOff | `\nXa` | Desativar autozero |
| GetAutozeroValue | `\nXv` | Obter valor autozero |
| GetCalibData | `\nXc` | Dados de calibração |
| GetSensorName | `\nXn` | Nome do sensor |
| SetCalibData | `\nXC:{p1}:{p2}:{p3}:{p4}:{p5}:{p6}` | Calibrar |
| Calibrar | `\nXR:{p1}:{p2}:{p3}` | Calibração rápida |
| Write | `\nXW:{valor}` | Escrever valor |

#### Resposta SMA:
- Marcadores: `Ynam:`, `Ycal:`, `END:`
- Status: PesoEstavel, ScaleInMotion, ScaleNotInMotion
- CRC-16 para verificação de integridade

#### Configuração Serial:
```
BaudRate: configurável (9600 padrão)
DataBits: 8
StopBits: 1
Parity: None
Handshake: None
DTR: configurável
RTS: configurável
Encoding: iso-8859-1
```

### Protocolo RFID

#### Intermec BRI (Basic Reader Interface):
```
"attribute ants=1"  -- selecionar antena 1
"read report=event" -- modo de leitura por evento
```
- Suporta até 4 antenas (Antena1-Antena4)
- Designação esquerda/direita (AntenaE/AntenaD)
- Modo antena única disponível

#### ESP32/V10 (HTTP REST):
```
GET http://<ip>:<porta>/tag/read-tag
Response: { tag, rssi, counter, TagReader, EPC, ID }
```

### Display LED (Triunfo)

#### V10 (HTTP REST):
```
POST http://<ip>:<porta>/led/write-lines
Body: { lines: [{ txt, x, y }] }
```
- Exibe: peso atual, tempo, título, informações do curral

### Status de Conexão:
- CONECTADO, DESCONECTADO, CONECTANDO, RECONECTANDO
- ERRO_ANTENA, TIMEOUT
- ZERANDO, PESANDO, ESTAVEL, MOVIMENTO

---

## 3. FLUXO DE NEGÓCIO

### Fluxo de Fabricação (CR1):
1. Operador seleciona receita e misturador
2. Sistema calcula peso de cada ingrediente baseado na receita
3. Para cada ingrediente (na ordem de batida):
   - Exibe peso previsto no display LED
   - Operador de pá carrega ingrediente
   - Balança monitora peso continuamente
   - Sistema verifica tolerância (% configurável)
   - Registra peso_inicial e peso_final
   - Flag: TROCA_AUTOMATICA, MANUAL, DESLOCAMENTO, PAUSA, CANCELAMENTO
4. Tempo de mistura após último ingrediente
5. Gera lote_fabricacao único
6. Status: ESPERA → PROCESSANDO → PROCESSADO / CANCELADO

### Fluxo de Carregamento:
1. Receita fabricada é carregada no vagão
2. Registra peso_balancao (saída)
3. Associa ao trato (horário de alimentação)
4. Pode ter múltiplas receitas por carregamento

### Fluxo de Fornecimento (TGT) - CORE:
1. Vagão sai com ração carregada
2. Trator passa pelo curral
3. **Tag Inicial**: leitor RFID lê tag na ENTRADA do curral
   - Sistema identifica o curral pela tag
   - Registra peso_inicial (peso no vagão antes de fornecer)
4. Operador fornece ração ao curral
5. **Tag Final**: leitor RFID lê tag na SAÍDA do curral
   - Registra peso_final (peso no vagão após fornecer)
   - **fornecido_kg = peso_inicial - peso_final**
6. Sistema compara com previsto_kg
7. Repete para próximo curral
8. Safe Points podem ser usados como checkpoints intermediários

### Safe Points:
- Tags RFID especiais em pontos estratégicos
- Registram peso do vagão em pontos intermediários
- Permitem rateio (distribuição proporcional) quando não é possível medir por curral
- Tipos: entrada, saída, checkpoint

### Sincronização:
- Dados são sincronizados com servidor central via REST API
- flag_envio: 2 = não enviado, muda após sync
- Suporta: TGTLegado (Firebird direto) e WebService (REST)

---

## 4. ENTIDADES DO SISTEMA

### Enumerações:

```typescript
enum TipoSoftware { WITHOUT=0, CR1=1, TGT=2, TGTManual=3, TGTSigaFran=4, CR1BatchBox=5 }
enum TipoUsoMisturador { ESTACIONARIO=0, ROTOMIX=1, BATCHBOX=2 }
enum StatusIngrediente { ESPERA=0, PROCESSANDO=1, PROCESSADO=2, CANCELADO=3 }
enum StatusBalanca { CONECTADO=0, DESCONECTADO=1, ESPERANDO=2 }
enum StatusConexao { DESCONECTADO=0, CONECTANDO=1, CONECTADO=2, RECONECTANDO=3, ERRO=4 }
enum TipoUsuario { TRATADOR=1, OPERADOR_PA=2, OUTROS=3 }
enum StatusOrdemProducao { AGUARDANDO=1, PRODUZINDO=2, ENCERRADO=3, CANCELADO=4 }
enum ScreenFabricar { BLANK=0, SOBRA=1, SELECAO=2, FABRICAR=3, MISTURAR=4 }
enum SafePointType { ENTRADA=0, SAIDA=1, CHECKPOINT=2 }
enum FlagManual { TROCA_AUTOMATICA=0, MANUAL=1, DESLOCAMENTO=2, PAUSA=3, CANCELAMENTO=4 }
enum StatusCLP { DESCONECTADA=0, CONNECTING=1, STANDBY=2, TIMEOUT=3, ERRO_ANTENA=4 }
enum BalancaStatus { MOVIMENTO=0, ESTAVEL=1, ZERANDO=2, DESCONECTADA=3 }
```

### API Endpoints (Backend):
```
api/balancas/{id}
api/configuracoes/{id}
api/Usuarios/{id}
api/misturadores/{id}
api/fabricacoes/{id}
api/fabricacoes/{id}/ingredientes/{ingredienteId}
api/fabricacoes/{id}/descartes/{descarteId}
api/receitas/{id}
api/ingredientes/{id}
api/receitas/{id}/ingredientes/{ingredienteId}
api/Currais/{id}
api/Previsoes/{id}
api/Tratos/{id}
api/Carregamentos/{id}
api/carregamentos/{id}/itens/{itemId}
api/Fornecimentos/{id}
api/carregamentos/{id}/descartes/{descarteId}
api/Vagoes/{id}
api/webservice
rpc/login_cr1
rpc/valid_op
rpc/get_local
rpc/set_local
```

---

## 5. MARCAS/MODELOS DE EQUIPAMENTOS SUPORTADOS

### Balanças:
- **Alfa Digistar** (serial e IP)
- Qualquer balança compatível com protocolo **SMA**
- Conexão: Serial (COM) ou TCP/IP (default: 192.168.25.200)

### Leitores RFID:
- **Intermec** (protocolo BRI - Basic Reader Interface)
- **Ideal Rastreabilidade** (com checksum)
- **USB RFID Reader** (genérico)
- Antenas: até 4, com designação esquerda/direita

### Display LED:
- **Triunfo** (protocolo próprio)
- Modo compatibilidade LED antigo

### Controlador (V10):
- **ESP32** com GPIO
- Comunicação HTTP REST API
- Integra balança + RFID + LED display em um único dispositivo

---

## 6. INTEGRAÇÃO SIGAFRAN (Caminhões)

Status workflow:
1. SEM_CICLO → BUSCA_ETAPA
2. AGUARDANDO_CAMINHAO → AGUARDANDO_PRODUCAO
3. AGUARDANDO_POSICIONAR_CAMINHAO
4. DESCARGA_LIBERADA_NO_CAMINHAO
5. DESCARGA_CONCLUIDA_AGUARDE
6. CAMINHAO_SAIR_PROXIMA_BALANCA / CARGA_COMPLETA
7. FINALIZA_CICLO / FIM_CICLO

---

## 7. TELAS DO APLICATIVO (35+ Windows)

### Principais:
- MainWindow - Tela principal
- WindowFabricar - Fabricação de ração
- WindowFabricarStatus - Status de fabricação em tempo real
- WindowFornecimento - Fornecimento/distribuição
- WindowCarregamento - Carregamento do vagão
- WindowConfiguracao - Configurações gerais
- WindowSelectCOM - Seleção de porta COM
- WindowSelectRFID - Configuração RFID
- WindowSelectLED - Configuração Display LED
- WindowBalancao - Balança externa/truck scale
- WindowSafePoint - Configuração safe points
- WindowRelatorio - Relatórios
- WindowSincronismo - Sincronização de dados
- WindowLogin - Login de usuário
- WindowSobra - Gestão de sobras
- WindowDescarte - Gestão de descartes
- WindowOrdemProducao - Ordens de produção
- WindowOcorrenciaParada - Registro de paradas
