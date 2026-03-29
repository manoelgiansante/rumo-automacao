// =====================================================================
// Rumo Automacao - Database Types (CR1/TGT System)
// Todas as tabelas com prefixo vet_auto_ para evitar conflitos
// Sistema de fabricacao de racao e fornecimento automatizado
// =====================================================================

// =====================================================================
// ENUMS E UNION TYPES
// =====================================================================

/** Tipo de uso do misturador */
export type TipoUsoMisturador = 'estacionario' | 'rotomix' | 'batchbox';

/** Status do ingrediente na fabricacao */
export type StatusIngrediente = 'espera' | 'processando' | 'processado' | 'cancelado';

/** Status da fabricacao (lote) */
export type StatusFabricacao = 'espera' | 'processando' | 'processado' | 'cancelado';

/** Status do carregamento */
export type StatusCarregamento = 'aberto' | 'carregando' | 'fornecendo' | 'fechado' | 'cancelado';

/** Status da conexao de hardware */
export type StatusConexao = 'desconectado' | 'conectando' | 'conectado' | 'reconectando' | 'erro';

/** Status da balanca */
export type StatusBalanca = 'movimento' | 'estavel' | 'zerando' | 'desconectada';

/** Tipo de usuario no sistema */
export type TipoUsuario = 'tratador' | 'operador_pa' | 'admin' | 'outros';

/** Tipo de dispositivo de hardware */
export type TipoDispositivo = 'balanca' | 'rfid' | 'display_led' | 'esp32';

/** Tipo de conexao com dispositivo */
export type TipoConexao = 'serial' | 'tcp' | 'http_v10';

/** Tipo de safe point */
export type SafePointTipo = 'entrada' | 'saida' | 'checkpoint';

/** Flag de modo de troca de ingrediente */
export type FlagManual = 'troca_automatica' | 'manual' | 'deslocamento' | 'pausa' | 'cancelamento';

/** Tela/estado da fabricacao */
export type ScreenFabricar = 'blank' | 'sobra' | 'selecao' | 'fabricar' | 'misturar';

/** Status geral ativo/inativo */
export type StatusAtivo = 'ativo' | 'inativo';

/** Status da ordem de producao */
export type StatusOrdemProducao = 'aguardando' | 'produzindo' | 'encerrado' | 'cancelado';

/** Tipo de ingrediente */
export type TipoIngrediente =
  | 'volumoso'
  | 'concentrado'
  | 'mineral'
  | 'aditivo'
  | 'nucleo'
  | 'premix'
  | 'ionoforo'
  | 'tamponante'
  | 'outro';

/** Status do fornecimento individual */
export type StatusFornecido = 'pendente' | 'fornecido' | 'parcial' | 'cancelado';

// =====================================================================
// RE-EXPORT HARDWARE TYPES
// =====================================================================

export type {
  BalancaConfig,
  LeituraPeso,
  BalancaStatus,
  PesoStatus,
  BalancaProtocolo,
  RfidConfig,
  LeituraRfid,
  RfidStatus,
  RfidProtocolo,
  Antena,
  DisplayConfig,
  DisplayProtocolo,
  HardwareStatus,
} from '../services/hardware';

// =====================================================================
// 1. CONFIGURACAO
// =====================================================================

/**
 * Configuracoes gerais do sistema de automacao
 * Tabela: vet_auto_configuracoes
 */
export interface VetAutoConfiguracao {
  id: string;
  fazenda_id: string;
  /** URL do webservice para sincronizacao */
  url_web_service: string | null;
  /** Numero do dispositivo na rede */
  numero_dispositivo: number;
  /** Tipo de uso principal do sistema */
  tipo_uso: TipoUsoMisturador;
  /** Se utiliza display LED */
  usa_display_led: boolean;
  /** Intensidade do LED (0-10) */
  intensidade_led: number;
  /** Se usa antena unica para RFID */
  usa_antena_unica: boolean;
  /** Se permite troca manual de antena */
  antena_manual: boolean;
  /** Tamanho da tag RFID em caracteres */
  tamanho_tag: number;
  /** Timeout em segundos para leitura RFID sem resposta */
  timeout_rfid_sem_leitura: number;
  /** Se utiliza safe points */
  usa_safe_point: boolean;
  /** Se utiliza API V10 (ESP32 HTTP) */
  utiliza_api_hardware: boolean;
  /** Se habilita log de peso */
  enable_log_peso: boolean;
  /** Se habilita log de comunicacao da balanca */
  enable_log_comunicacao_balanca: boolean;
  /** Se habilita log de fornecimento */
  enable_log_fornecimento: boolean;
  /** Se valida tipo de receita diferente */
  validate_tipo_receita_diferente: boolean;
  /** URL do servidor de integracao */
  integration_server_url: string | null;
  /** Token do servidor de integracao */
  integration_server_token: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Configuracao V10 (ESP32)
 * Tabela: vet_auto_configuracao_v10
 */
export interface VetAutoConfiguracaoV10 {
  id: string;
  fazenda_id: string;
  usa_config_v10: boolean;
  intensidade_led: number;
  usa_balancao_v10: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Enderecos dos dispositivos V10 (ESP32)
 * Tabela: vet_auto_endereco_v10
 */
export interface VetAutoEnderecoV10 {
  id: string;
  fazenda_id: string;
  /** Endereco IP:PORTA do dispositivo */
  endereco: string;
  /** Tipo de uso do dispositivo */
  tipo_uso: TipoUsoMisturador;
  /** Codigo do misturador associado */
  misturador: number;
  /** Descricao do misturador */
  misturador_desc: string | null;
  /** Nome do dispositivo */
  nome: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Configuracao por misturador
 * Tabela: vet_auto_configuracoes_misturadores
 */
export interface VetAutoConfiguracaoMisturador {
  id: string;
  fazenda_id: string;
  /** Codigo do misturador */
  codigo_misturador: number;
  /** Posicao/ordem do misturador */
  posicao: number;
  /** Porta COM ou IP:PORTA da balanca */
  porta: string | null;
  /** Resolucao da balanca (casas decimais) */
  resolucao: number;
  /** Capacidade minima em kg */
  capacidade_min: number;
  /** Capacidade maxima em kg */
  capacidade_max: number;
  /** Tempo de troca de ingrediente em segundos */
  tempo_troca_ingrediente: number;
  /** Faixa de estabilidade em kg */
  faixa_estabilidade: number;
  /** Porta COM ou IP:PORTA do display LED */
  porta_display: string | null;
  /** Porta COM ou IP:PORTA do leitor RFID */
  porta_rfid: string | null;
  created_at: string;
  updated_at: string;
}

// =====================================================================
// 2. CADASTROS
// =====================================================================

/**
 * Usuarios do sistema de automacao
 * Tabela: vet_auto_usuarios
 */
export interface VetAutoUsuario {
  id: string;
  fazenda_id: string;
  /** Codigo legado do usuario */
  codigo: number;
  nome: string;
  login: string | null;
  /** Senha hash MD5 */
  senha: string | null;
  tipo_usuario: TipoUsuario;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Ingredientes para fabricacao de racao
 * Tabela: vet_auto_ingredientes
 */
export interface VetAutoIngrediente {
  id: string;
  fazenda_id: string;
  /** Codigo legado do ingrediente */
  codigo: number;
  nome: string;
  tipo: TipoIngrediente;
  /** Percentual de materia seca */
  materia_seca: number | null;
  /** Custo por kg em R$ */
  custo_kg: number | null;
  /** Estoque atual em kg */
  estoque_atual: number;
  /** Codigo alfanumerico */
  codigo_alfa: string | null;
  /** Estoque minimo em kg */
  estoque_minimo_kg: number | null;
  /** Tempo de persistencia em minutos */
  tempo_de_persistencia: number | null;
  /** Local fisico de armazenamento */
  local_fisico: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Receitas de racao
 * Tabela: vet_auto_receitas
 */
export interface VetAutoReceita {
  id: string;
  fazenda_id: string;
  /** Codigo legado */
  codigo: number;
  nome: string;
  codigo_alfa: string | null;
  /** Percentual de materia seca */
  materia_seca: number | null;
  /** Ingestao de materia natural por cabeca/dia em kg */
  imn_por_cabeca_dia: number | null;
  /** Custo por tonelada de materia natural em R$ */
  custo_tonelada_mn: number | null;
  /** Tempo de mistura em segundos */
  tempo_mistura: number | null;
  /** Tipo da receita (referencia a tipo_receita) */
  tipo_receita: string | null;
  id_tipo_receita: number | null;
  /** Percentual de tolerancia padrao */
  perc_tolerancia: number | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Ingredientes por receita
 * Tabela: vet_auto_receita_ingredientes
 */
export interface VetAutoReceitaIngrediente {
  id: string;
  receita_id: string;
  ingrediente_id: string;
  /** Percentual de materia natural */
  percentual_materia_natural: number;
  /** Percentual de materia seca */
  percentual_materia_seca: number | null;
  /** Tolerancia em % */
  tolerancia: number;
  /** Tipo de uso da tolerancia */
  tolerancia_tipo_uso: number | null;
  /** Ordem na batida */
  ordem_batida: number;
  /** Se o ingrediente e automatizado */
  automatizado: boolean;
  created_at: string;
  updated_at: string;
  /** JOIN: dados do ingrediente */
  ingrediente?: VetAutoIngrediente;
}

/**
 * Ingredientes por receita por misturador
 * Tabela: vet_auto_receita_ingrediente_misturador
 */
export interface VetAutoReceitaIngredienteMisturador {
  id: string;
  receita_id: string;
  ingrediente_id: string;
  codigo_misturador: number;
  percentual_materia_natural: number;
  percentual_materia_seca: number | null;
  tolerancia: number;
  tolerancia_tipo_uso: number | null;
  ordem_batida: number;
  automatizado: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Misturadores / Vagoes
 * Tabela: vet_auto_misturador_vagao
 */
export interface VetAutoMisturadorVagao {
  id: string;
  fazenda_id: string;
  /** Codigo legado */
  codigo: number;
  /** Numero do vagao/misturador */
  numero: number;
  modelo: string | null;
  fabricante: string | null;
  /** Capacidade minima em kg */
  capacidade_minima: number | null;
  /** Capacidade maxima em kg */
  capacidade_maxima: number | null;
  /** ID da balanca associada */
  balanca_id: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Balancas cadastradas
 * Tabela: vet_auto_balancas
 */
export interface VetAutoBalanca {
  id: string;
  fazenda_id: string;
  /** Codigo legado */
  codigo: number;
  modelo: string | null;
  fabricante: string | null;
  /** Precisao em kg */
  precisao: number | null;
  /** Codigo do protocolo (SMA, etc) */
  codigo_protocolo: number | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Horarios de trato
 * Tabela: vet_auto_tratos
 */
export interface VetAutoTrato {
  id: string;
  fazenda_id: string;
  /** Numero do trato (1, 2, 3...) */
  numero: number;
  /** Horario do trato (HH:MM) */
  horario: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Currais com tags RFID
 * Tabela: vet_auto_currais
 */
export interface VetAutoCurral {
  id: string;
  fazenda_id: string;
  /** Codigo legado */
  codigo: number;
  nome: string;
  /** Tag RFID de entrada do curral */
  tag_inicial: string | null;
  /** Tag RFID de saida do curral */
  tag_final: string | null;
  /** Numero da linha */
  linha: number | null;
  /** Numero do curral na linha */
  numero: number | null;
  /** Ordem no trato */
  ordem_trato: number | null;
  /** ID do curral no sistema de confinamento (link) */
  curral_confinamento_id: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Previsao de fornecimento diario
 * Tabela: vet_auto_previstos
 */
export interface VetAutoPrevisto {
  id: string;
  fazenda_id: string;
  /** ID do curral */
  curral_id: string;
  /** Numero do trato */
  numero_trato: number;
  /** ID da receita */
  receita_id: string;
  /** Data do fornecimento */
  data_fornecimento: string;
  /** Previsto em kg */
  previsto_kg: number;
  /** Quantidade de cabecas */
  quantidade_cab: number;
  /** Realizado em kg */
  realizado_kg: number;
  created_at: string;
  updated_at: string;
  /** JOIN: dados do curral */
  curral?: VetAutoCurral;
  /** JOIN: dados da receita */
  receita?: VetAutoReceita;
}

// =====================================================================
// 3. FABRICACAO (CR1)
// =====================================================================

/**
 * Fabricacao de receita (lote de producao)
 * Tabela: vet_auto_fabricacoes
 */
export interface VetAutoFabricacao {
  id: string;
  fazenda_id: string;
  /** Identificador unico do lote */
  lote_fabricacao: string;
  /** ID da receita fabricada */
  receita_id: string;
  /** ID do usuario tratador */
  usuario_id: string | null;
  /** ID do operador de pa */
  operador_pa_id: string | null;
  /** Codigo do misturador utilizado */
  codigo_misturador: number;
  /** Numero do lote de animais */
  numero_lote_animais: number | null;
  /** Numero do trato */
  numero_trato: number | null;
  /** Data e hora do registro */
  data_registro: string;
  /** Hora de inicio da fabricacao */
  hora_inicio_fabricacao: string | null;
  /** Hora de fim da fabricacao */
  hora_fim_fabricacao: string | null;
  /** Total fabricado em kg de materia natural */
  total_kg_mn_fabricada: number;
  /** Total previsto em kg de materia natural */
  total_kg_mn_previsto: number;
  /** Total de cabecas */
  total_cabeca: number | null;
  /** Tipo de uso do misturador */
  tipo_uso: TipoUsoMisturador;
  /** Total de perda em kg */
  total_perda_kg: number;
  /** Total de sobra carregada em kg */
  total_sobra_carregado_kg: number;
  /** Lote de fabricacao da sobra */
  lote_fabricacao_sobra: string | null;
  /** Se a fabricacao foi automatizada */
  flag_automation: boolean;
  /** Se usou batchbox */
  flag_batchbox: boolean;
  /** ID da ordem de producao */
  ordem_producao_id: string | null;
  /** Status da fabricacao */
  status: StatusFabricacao;
  created_at: string;
  updated_at: string;
  /** JOIN: dados da receita */
  receita?: VetAutoReceita;
  /** JOIN: ingredientes fabricados */
  ingredientes?: VetAutoFabricacaoIngrediente[];
}

/**
 * Detalhe dos ingredientes fabricados
 * Tabela: vet_auto_fabricacao_ingredientes
 */
export interface VetAutoFabricacaoIngrediente {
  id: string;
  fabricacao_id: string;
  /** ID do ingrediente */
  ingrediente_id: string;
  /** ID do usuario que operou */
  usuario_id: string | null;
  /** Total fabricado em kg de materia natural */
  total_kg_mn_fabricada: number;
  /** Total previsto em kg de materia natural */
  total_kg_mn_previsto: number;
  /** Percentual de materia seca do ingrediente */
  materia_seca_ingrediente: number | null;
  /** Hora de inicio do ingrediente */
  hora_inicio: string | null;
  /** Hora de fim do ingrediente */
  hora_fim: string | null;
  /** Diferenca percentual (fabricado vs previsto) */
  total_diferenca_percentual: number;
  /** Diferenca em kg (fabricado vs previsto) */
  total_diferenca_kg: number;
  /** Status do ingrediente */
  status: StatusIngrediente;
  /** Ordem na batida */
  ordem: number;
  /** Nome do ingrediente (cache) */
  nome: string;
  /** Tolerancia em % */
  tolerancia: number;
  /** Codigo do operador */
  codigo_operador: number | null;
  /** Nome do operador (cache) */
  nome_operador: string | null;
  /** Peso na balanca antes de adicionar */
  peso_inicial: number;
  /** Peso na balanca depois de adicionar */
  peso_final: number;
  /** Flag de modo de troca */
  flag_manual: FlagManual;
  /** Se foi automatizado */
  flag_automation: boolean;
  /** Se usou batchbox */
  flag_batchbox: boolean;
  created_at: string;
  updated_at: string;
  /** JOIN: dados do ingrediente */
  ingrediente?: VetAutoIngrediente;
}

/**
 * Resumo de fabricacao do dia
 * Tabela: vet_auto_fabricacoes_dia
 */
export interface VetAutoFabricacaoDia {
  id: string;
  fazenda_id: string;
  receita_id: string;
  /** Numero do trato */
  trato: number;
  /** Total fabricado em kg */
  total_fabricado: number;
  /** Data da fabricacao */
  data: string;
  created_at: string;
  /** JOIN: dados da receita */
  receita?: VetAutoReceita;
}

/**
 * Descarte de fabricacao
 * Tabela: vet_auto_descartes_fabricacao
 */
export interface VetAutoDescarteFabricacao {
  id: string;
  fabricacao_id: string;
  usuario_id: string | null;
  /** Quantidade descartada em kg */
  quantidade: number;
  observacao: string | null;
  created_at: string;
}

/**
 * Ordem de producao
 * Tabela: vet_auto_ordens_producao
 */
export interface VetAutoOrdemProducao {
  id: string;
  fazenda_id: string;
  receita_id: string;
  /** Previsto em kg */
  previsto_kg: number;
  /** Status da ordem */
  status: StatusOrdemProducao;
  /** Data da producao */
  data_producao: string;
  created_at: string;
  updated_at: string;
  /** JOIN: dados da receita */
  receita?: VetAutoReceita;
}

// =====================================================================
// 4. CARREGAMENTO E FORNECIMENTO (TGT)
// =====================================================================

/**
 * Carregamento do vagao (saida do misturador)
 * Tabela: vet_auto_carregamentos
 */
export interface VetAutoCarregamento {
  id: string;
  fazenda_id: string;
  /** Data do carregamento */
  data: string;
  /** Status do carregamento */
  status: StatusCarregamento;
  /** Total carregado em kg */
  total_carregado: number;
  /** Numero do trato */
  numero_trato: number;
  /** ID do misturador/vagao */
  misturador_vagao_id: string;
  /** Peso na balanca de saida em kg */
  peso_balancao: number | null;
  /** Peso na balanca de retorno em kg */
  peso_balancao_retorno: number | null;
  /** Se foi automatizado */
  flag_automation: boolean;
  /** Numero do dispositivo */
  numero_dispositivo: number | null;
  created_at: string;
  updated_at: string;
  /** JOIN: dados do vagao */
  vagao?: VetAutoMisturadorVagao;
  /** JOIN: detalhes de carregamento */
  detalhes?: VetAutoCarregamentoDetalhe[];
  /** JOIN: fornecimentos associados */
  fornecimentos?: VetAutoFornecido[];
}

/**
 * Detalhe do carregamento (receitas carregadas)
 * Tabela: vet_auto_carregamento_detalhes
 */
export interface VetAutoCarregamentoDetalhe {
  id: string;
  carregamento_id: string;
  /** Data/hora do registro */
  data_registro: string;
  /** Peso inicial no vagao (antes de carregar) */
  peso_inicial: number;
  /** Peso final no vagao (depois de carregar) */
  peso_final: number;
  hora_inicial: string | null;
  hora_final: string | null;
  /** ID do usuario */
  usuario_id: string | null;
  /** ID do misturador/vagao */
  misturador_vagao_id: string | null;
  /** Lote de fabricacao carregado */
  lote_fabricacao: string | null;
  /** ID da receita carregada */
  receita_id: string | null;
  /** Se foi automatizado */
  flag_automation: boolean;
  created_at: string;
  /** JOIN: receita */
  receita?: VetAutoReceita;
}

/**
 * Fornecimento por curral (CORE DO TGT!)
 * Tabela: vet_auto_fornecidos
 */
export interface VetAutoFornecido {
  id: string;
  fazenda_id: string;
  /** Quantidade realmente fornecida em kg */
  fornecido_kg: number;
  /** Status do fornecimento */
  status: StatusFornecido;
  /** Data do fornecimento */
  data: string;
  /** Tag RFID lida na entrada do curral */
  tag_inicial: string | null;
  /** Tag RFID lida na saida do curral */
  tag_final: string | null;
  /** Ordem do trato */
  ordem_trato: number | null;
  /** Peso do vagao ANTES de fornecer */
  peso_inicial: number;
  /** Peso do vagao DEPOIS de fornecer */
  peso_final: number;
  hora_inicio: string | null;
  hora_final: string | null;
  /** ID do carregamento */
  carregamento_id: string;
  /** ID do curral */
  curral_id: string | null;
  /** ID do usuario */
  usuario_id: string | null;
  /** ID do misturador/vagao */
  misturador_vagao_id: string | null;
  /** Numero do trato */
  numero_trato: number;
  /** Grupo safe point */
  grupo_safe_point: string | null;
  /** Nome do grupo safe point */
  grupo_safe_point_nome: string | null;
  /** Numero do dispositivo */
  numero_dispositivo: number | null;
  /** ID da receita fornecida */
  receita_id: string | null;
  /** Se houve rateio (distribuicao proporcional) */
  flag_rateio: boolean;
  /** Peso antigo (para correcao) */
  peso_antigo: number | null;
  /** Se a entrada foi manual */
  entrada_manual: boolean;
  created_at: string;
  updated_at: string;
  /** JOIN: dados do curral */
  curral?: VetAutoCurral;
  /** JOIN: dados da receita */
  receita?: VetAutoReceita;
  /** JOIN: dados do carregamento */
  carregamento?: VetAutoCarregamento;
}

/**
 * Descarte de fornecimento
 * Tabela: vet_auto_descartes_fornecimento
 */
export interface VetAutoDescarteFornecimento {
  id: string;
  misturador_vagao_id: string | null;
  carregamento_id: string;
  motivo: string | null;
  /** Quantidade descartada em kg */
  quantidade: number;
  created_at: string;
}

// =====================================================================
// 5. SAFE POINTS
// =====================================================================

/**
 * Safe points (pontos de pesagem intermediarios)
 * Tabela: vet_auto_safe_points
 */
export interface VetAutoSafePoint {
  id: string;
  fazenda_id: string;
  nome: string;
  /** Tag RFID do safe point */
  tag: string;
  /** Tipo do checkpoint */
  tipo: SafePointTipo;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Leituras nos safe points
 * Tabela: vet_auto_safe_point_inputs
 */
export interface VetAutoSafePointInput {
  id: string;
  safe_point_id: string;
  carregamento_id: string;
  /** Peso liquido em kg */
  peso_kg: number;
  /** Data/hora do registro */
  data_registro: string;
  /** Tipo de input */
  input_type: number;
  /** Tara em kg */
  tara_kg: number | null;
  /** Peso bruto em kg */
  peso_bruto_kg: number | null;
  created_at: string;
  /** JOIN: safe point */
  safe_point?: VetAutoSafePoint;
}

// =====================================================================
// 6. LOG E OCORRENCIAS
// =====================================================================

/**
 * Log de atividades do usuario
 * Tabela: vet_auto_log_usuario
 */
export interface VetAutoLogUsuario {
  id: string;
  usuario_id: string | null;
  usuario_nome: string;
  acao: string;
  numero_dispositivo: number | null;
  data: string;
  numero_vagao: number | null;
  created_at: string;
}

/**
 * Ocorrencia de parada
 * Tabela: vet_auto_ocorrencia_paradas
 */
export interface VetAutoOcorrenciaParada {
  id: string;
  fazenda_id: string;
  nome: string;
  data_registro: string;
  created_at: string;
}

/**
 * Item de ocorrencia de parada
 * Tabela: vet_auto_ocorrencia_parada_itens
 */
export interface VetAutoOcorrenciaParadaItem {
  id: string;
  ocorrencia_id: string;
  nome: string | null;
  observacao: string | null;
  operador: string | null;
  receita: string | null;
  peso_balanca: number | null;
  created_at: string;
}

// =====================================================================
// 7. VIEWS (tipos para as SQL views)
// =====================================================================

/** View: lista de carregamentos com dados do vagao */
export interface ViewListaCarregamento {
  id: string;
  data: string;
  status: StatusCarregamento;
  total_carregado: number;
  numero_trato: number;
  peso_balancao: number | null;
  peso_balancao_retorno: number | null;
  numero_vagao: number;
  modelo_vagao: string | null;
  created_at: string;
}

/** View: relatorio de fornecimento com dados de curral, receita e usuario */
export interface ViewRelatorioFornecimento {
  id: string;
  fornecido_kg: number;
  status: StatusFornecido;
  data: string;
  tag_inicial: string | null;
  tag_final: string | null;
  peso_inicial: number;
  peso_final: number;
  hora_inicio: string | null;
  hora_final: string | null;
  numero_trato: number;
  nome_curral: string | null;
  numero_curral: number | null;
  nome_receita: string | null;
  nome_usuario: string | null;
  entrada_manual: boolean;
}

/** View: previsto do dia agrupado por receita */
export interface ViewPrevistoDiaPorReceita {
  receita_id: string;
  nome_receita: string;
  total_previsto: number;
  total_realizado: number;
  total_currais: number;
}

/** View: total fabricado por receita no dia */
export interface ViewTotalFabricadoPorReceita {
  receita_id: string;
  nome_receita: string;
  total_fabricado: number;
}

/** View: total geral por trato */
export interface ViewTotalGeralTrato {
  numero_trato: number;
  horario: string;
  total_previsto: number;
  total_realizado: number;
  percentual_realizado: number;
}

/** Resumo diario de operacoes */
export interface ResumoDiario {
  data: string;
  total_fabricado_kg: number;
  total_fornecido_kg: number;
  total_previsto_kg: number;
  total_descarte_kg: number;
  total_carregamentos: number;
  total_fornecimentos: number;
  percentual_realizado: number;
}

// =====================================================================
// 8. FORM / INPUT TYPES (Create/Update payloads)
// =====================================================================

/** Criar/atualizar configuracao */
export type VetAutoConfiguracaoCreate = Omit<VetAutoConfiguracao, 'id' | 'created_at' | 'updated_at'>;
export type VetAutoConfiguracaoUpdate = Partial<Omit<VetAutoConfiguracao, 'id' | 'fazenda_id' | 'created_at' | 'updated_at'>>;

/** Criar/atualizar ingrediente */
export type VetAutoIngredienteCreate = Omit<VetAutoIngrediente, 'id' | 'created_at' | 'updated_at'>;
export type VetAutoIngredienteUpdate = Partial<Omit<VetAutoIngrediente, 'id' | 'fazenda_id' | 'created_at' | 'updated_at'>>;

/** Criar/atualizar receita */
export type VetAutoReceitaCreate = Omit<VetAutoReceita, 'id' | 'created_at' | 'updated_at'>;
export type VetAutoReceitaUpdate = Partial<Omit<VetAutoReceita, 'id' | 'fazenda_id' | 'created_at' | 'updated_at'>>;

/** Criar ingrediente de receita */
export type VetAutoReceitaIngredienteCreate = Omit<VetAutoReceitaIngrediente, 'id' | 'created_at' | 'updated_at' | 'ingrediente'>;

/** Criar/atualizar misturador/vagao */
export type VetAutoMisturadorVagaoCreate = Omit<VetAutoMisturadorVagao, 'id' | 'created_at' | 'updated_at'>;
export type VetAutoMisturadorVagaoUpdate = Partial<Omit<VetAutoMisturadorVagao, 'id' | 'fazenda_id' | 'created_at' | 'updated_at'>>;

/** Criar fabricacao */
export type VetAutoFabricacaoCreate = Omit<VetAutoFabricacao, 'id' | 'created_at' | 'updated_at' | 'receita' | 'ingredientes'>;

/** Criar ingrediente de fabricacao */
export type VetAutoFabricacaoIngredienteCreate = Omit<VetAutoFabricacaoIngrediente, 'id' | 'created_at' | 'updated_at' | 'ingrediente'>;

/** Criar carregamento */
export type VetAutoCarregamentoCreate = Omit<VetAutoCarregamento, 'id' | 'created_at' | 'updated_at' | 'vagao' | 'detalhes' | 'fornecimentos'>;

/** Criar detalhe de carregamento */
export type VetAutoCarregamentoDetalheCreate = Omit<VetAutoCarregamentoDetalhe, 'id' | 'created_at' | 'receita'>;

/** Criar fornecimento */
export type VetAutoFornecidoCreate = Omit<VetAutoFornecido, 'id' | 'created_at' | 'updated_at' | 'curral' | 'receita' | 'carregamento'>;

/** Criar curral */
export type VetAutoCurralCreate = Omit<VetAutoCurral, 'id' | 'created_at' | 'updated_at'>;
export type VetAutoCurralUpdate = Partial<Omit<VetAutoCurral, 'id' | 'fazenda_id' | 'created_at' | 'updated_at'>>;

/** Criar previsto */
export type VetAutoPrevistoCreate = Omit<VetAutoPrevisto, 'id' | 'created_at' | 'updated_at' | 'curral' | 'receita'>;

/** Criar safe point */
export type VetAutoSafePointCreate = Omit<VetAutoSafePoint, 'id' | 'created_at' | 'updated_at'>;

/** Criar descarte de fabricacao */
export type VetAutoDescarteFabricacaoCreate = Omit<VetAutoDescarteFabricacao, 'id' | 'created_at'>;

/** Criar descarte de fornecimento */
export type VetAutoDescarteFornecimentoCreate = Omit<VetAutoDescarteFornecimento, 'id' | 'created_at'>;

/** Criar ordem de producao */
export type VetAutoOrdemProducaoCreate = Omit<VetAutoOrdemProducao, 'id' | 'created_at' | 'updated_at' | 'receita'>;

// =====================================================================
// 9. CONFIG INTERFACE (runtime config)
// =====================================================================

/** Configuracao completa do sistema de automacao para uso em runtime */
export interface AutomacaoConfig {
  /** Configuracoes gerais do banco */
  configuracao: VetAutoConfiguracao | null;
  /** Configuracao V10 */
  configuracaoV10: VetAutoConfiguracaoV10 | null;
  /** Enderecos dos dispositivos V10 */
  enderecosV10: VetAutoEnderecoV10[];
  /** Configuracoes por misturador */
  misturadores: VetAutoConfiguracaoMisturador[];
  /** Misturador/vagao selecionado */
  misturadorAtual: VetAutoConfiguracaoMisturador | null;
  /** Tipo de conexao com hardware */
  tipoConexao: TipoConexao;
  /** Se o sistema esta configurado e pronto */
  configurado: boolean;
}

// =====================================================================
// 10. DISPOSITIVO HARDWARE (state types for store)
// =====================================================================

/** Representacao de um dispositivo de hardware conectado */
export interface DispositivoHardware {
  id: string;
  tipo: TipoDispositivo;
  nome: string;
  endereco: string;
  statusConexao: StatusConexao;
  ultimaLeitura: string | null;
  erro: string | null;
}
