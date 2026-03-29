import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export type TipoDispositivo = 'balanca' | 'rfid' | 'display_led' | 'esp32' | 'plc' | 'outro';

export type ConexaoTipo = 'serial' | 'tcp' | 'http_api' | 'bluetooth';

export interface ConfiguracaoDispositivo {
  porta_com?: string;
  baud_rate?: number;
  ip?: string;
  porta?: number;
  protocolo?: string;
  resolucao?: number;
  faixa_estabilidade?: number;
  timeout_ms?: number;
  usa_config_v10?: boolean;
  intensidade_led?: number;
  tamanho_tag?: number;
  [key: string]: unknown;
}

export interface VetAutoDispositivo {
  id: string;
  fazenda_id: string;
  misturador_id: string | null;
  nome: string;
  tipo: TipoDispositivo;
  conexao_tipo: ConexaoTipo;
  endereco: string;
  configuracao: ConfiguracaoDispositivo | null;
  ativo: boolean;
  ultimo_ping: string | null;
  status_conexao: 'online' | 'offline' | 'erro' | null;
  created_at: string;
  updated_at: string;
}

export interface TestConnectionResult {
  dispositivo_id: string;
  nome: string;
  sucesso: boolean;
  latencia_ms: number | null;
  mensagem: string;
}

// ============================================
// DISPOSITIVOS
// ============================================

/**
 * Lista todos os dispositivos de uma fazenda
 */
export async function getDispositivos(
  fazenda_id: string
): Promise<VetAutoDispositivo[]> {
  const { data, error } = await supabase
    .from('vet_auto_dispositivos')
    .select('*')
    .eq('fazenda_id', fazenda_id)
    .eq('ativo', true)
    .order('tipo', { ascending: true })
    .order('nome', { ascending: true });

  if (error) throw new Error(`Erro ao buscar dispositivos: ${error.message}`);
  return (data ?? []) as VetAutoDispositivo[];
}

/**
 * Cria um novo dispositivo
 */
export async function createDispositivo(
  fazenda_id: string,
  nome: string,
  tipo: TipoDispositivo,
  conexao_tipo: ConexaoTipo,
  endereco: string,
  configuracao: ConfiguracaoDispositivo | null
): Promise<VetAutoDispositivo> {
  const { data, error } = await supabase
    .from('vet_auto_dispositivos')
    .insert({
      fazenda_id,
      nome,
      tipo,
      conexao_tipo,
      endereco,
      configuracao: configuracao ?? null,
      ativo: true,
      status_conexao: 'offline',
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao criar dispositivo: ${error.message}`);
  return data as VetAutoDispositivo;
}

/**
 * Atualiza um dispositivo existente
 */
export async function updateDispositivo(
  id: string,
  updates: Partial<Omit<VetAutoDispositivo, 'id' | 'created_at'>>
): Promise<VetAutoDispositivo> {
  const { data, error } = await supabase
    .from('vet_auto_dispositivos')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Erro ao atualizar dispositivo: ${error.message}`);
  return data as VetAutoDispositivo;
}

/**
 * Desativa um dispositivo (soft delete)
 */
export async function deleteDispositivo(
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('vet_auto_dispositivos')
    .update({
      ativo: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(`Erro ao remover dispositivo: ${error.message}`);
}

/**
 * Testa a conexao com um dispositivo (ping/connect)
 * Para dispositivos HTTP/API, faz uma requisicao de teste
 * Para serial/TCP, registra tentativa no banco
 */
export async function testConnection(
  id: string
): Promise<TestConnectionResult> {
  // Buscar dados do dispositivo
  const { data: dispositivo, error: fetchError } = await supabase
    .from('vet_auto_dispositivos')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) throw new Error(`Erro ao buscar dispositivo: ${fetchError.message}`);
  if (!dispositivo) throw new Error('Dispositivo nao encontrado');

  const dev = dispositivo as VetAutoDispositivo;
  const inicio = Date.now();
  let sucesso = false;
  let mensagem = '';

  try {
    if (dev.conexao_tipo === 'http_api') {
      // Para ESP32/HTTP, tenta um ping via fetch
      const url = dev.endereco.startsWith('http')
        ? dev.endereco
        : `http://${dev.endereco}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${url}/scale/read-weight`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        sucesso = response.ok;
        mensagem = sucesso
          ? `Conectado com sucesso (HTTP ${response.status})`
          : `Falha na conexao (HTTP ${response.status})`;
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        sucesso = false;
        mensagem = `Timeout ou erro de conexao: ${fetchErr instanceof Error ? fetchErr.message : 'Erro desconhecido'}`;
      }
    } else {
      // Para serial/TCP/bluetooth, registrar como pendente
      // A verificacao real depende do hardware layer
      sucesso = false;
      mensagem = `Teste de conexao ${dev.conexao_tipo} deve ser feito pela camada de hardware`;
    }
  } catch (err) {
    sucesso = false;
    mensagem = `Erro inesperado: ${err instanceof Error ? err.message : 'Erro desconhecido'}`;
  }

  const latencia_ms = Date.now() - inicio;

  // Atualizar status no banco
  await supabase
    .from('vet_auto_dispositivos')
    .update({
      status_conexao: sucesso ? 'online' : 'erro',
      ultimo_ping: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return {
    dispositivo_id: id,
    nome: dev.nome,
    sucesso,
    latencia_ms,
    mensagem,
  };
}

/**
 * Busca dispositivos associados a um misturador
 */
export async function getDispositivosPorMisturador(
  misturador_id: string
): Promise<VetAutoDispositivo[]> {
  const { data, error } = await supabase
    .from('vet_auto_dispositivos')
    .select('*')
    .eq('misturador_id', misturador_id)
    .eq('ativo', true)
    .order('tipo', { ascending: true });

  if (error) throw new Error(`Erro ao buscar dispositivos do misturador: ${error.message}`);
  return (data ?? []) as VetAutoDispositivo[];
}
