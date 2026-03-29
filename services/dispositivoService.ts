import { supabase } from '@/lib/supabase';
import { dataService } from '@/services/dataService';
import { generateId } from '@/services/offlineService';

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
  const data = await dataService.query(
    'vet_auto_dispositivos',
    { fazenda_id, ativo: true },
    { orderBy: 'tipo', ascending: true }
  );
  return data as unknown as VetAutoDispositivo[];
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
  const record = {
    id: generateId(),
    fazenda_id,
    nome,
    tipo,
    conexao_tipo,
    endereco,
    configuracao: configuracao ?? null,
    ativo: true,
    status_conexao: 'offline',
  };

  const data = await dataService.save('vet_auto_dispositivos', record);
  return data as unknown as VetAutoDispositivo;
}

/**
 * Atualiza um dispositivo existente
 */
export async function updateDispositivo(
  id: string,
  updates: Partial<Omit<VetAutoDispositivo, 'id' | 'created_at'>>
): Promise<VetAutoDispositivo> {
  await dataService.update('vet_auto_dispositivos', id, { ...updates });
  const data = await dataService.getById('vet_auto_dispositivos', id);
  return data as unknown as VetAutoDispositivo;
}

/**
 * Desativa um dispositivo (soft delete)
 */
export async function deleteDispositivo(
  id: string
): Promise<void> {
  await dataService.update('vet_auto_dispositivos', id, { ativo: false });
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
  const dispositivo = await dataService.getById('vet_auto_dispositivos', id);
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
  await dataService.update('vet_auto_dispositivos', id, {
    status_conexao: sucesso ? 'online' : 'erro',
    ultimo_ping: new Date().toISOString(),
  });

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
  const data = await dataService.query(
    'vet_auto_dispositivos',
    { misturador_id, ativo: true },
    { orderBy: 'tipo', ascending: true }
  );
  return data as unknown as VetAutoDispositivo[];
}
