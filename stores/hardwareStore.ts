import { create } from 'zustand';
import type {
  StatusConexao,
  StatusBalanca,
  DispositivoHardware,
  AutomacaoConfig,
  VetAutoConfiguracao,
  VetAutoConfiguracaoV10,
  VetAutoEnderecoV10,
  VetAutoConfiguracaoMisturador,
  TipoConexao,
} from '@/types/automacao';
import type { LeituraPeso, LeituraRfid } from '@/services/hardware';
import {
  hardwareManager,
  balancaService,
  rfidService,
  ledDisplayService,
} from '@/services/hardware';
import { supabase } from '@/lib/supabase';

// ─── State interface ─────────────────────────────────────────────────────────

interface HardwareState {
  // Real-time state
  pesoAtual: LeituraPeso | null;
  tagAtual: LeituraRfid | null;
  statusBalanca: StatusConexao;
  statusRFID: StatusConexao;
  statusDisplay: StatusConexao;

  // Devices
  dispositivos: DispositivoHardware[];

  // Configuration
  configuracao: AutomacaoConfig;

  // UI state
  loading: boolean;
  error: string | null;

  // Actions - Connection
  conectarBalanca: () => Promise<boolean>;
  conectarRFID: () => Promise<boolean>;
  conectarDisplay: () => Promise<boolean>;
  conectarTudo: () => Promise<{ balanca: boolean; rfid: boolean }>;
  desconectarTudo: () => void;

  // Actions - Real-time updates
  atualizarPeso: (leitura: LeituraPeso) => void;
  atualizarTag: (leitura: LeituraRfid) => void;
  atualizarStatusBalanca: (status: StatusConexao) => void;
  atualizarStatusRFID: (status: StatusConexao) => void;
  atualizarStatusDisplay: (status: StatusConexao) => void;

  // Actions - Config
  fetchConfiguracao: (fazendaId: string) => Promise<void>;
  selecionarMisturador: (misturador: VetAutoConfiguracaoMisturador) => void;

  // Actions - Devices
  atualizarDispositivo: (id: string, updates: Partial<DispositivoHardware>) => void;

  // Reset
  limpar: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const configInicial: AutomacaoConfig = {
  configuracao: null,
  configuracaoV10: null,
  enderecosV10: [],
  misturadores: [],
  misturadorAtual: null,
  tipoConexao: 'http_v10',
  configurado: false,
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useHardwareStore = create<HardwareState>((set, get) => ({
  // Initial state
  pesoAtual: null,
  tagAtual: null,
  statusBalanca: 'desconectado',
  statusRFID: 'desconectado',
  statusDisplay: 'desconectado',
  dispositivos: [],
  configuracao: { ...configInicial },
  loading: false,
  error: null,

  // ── Connection ──────────────────────────────────────────────────────

  conectarBalanca: async () => {
    set({ statusBalanca: 'conectando', error: null });
    try {
      const result = await balancaService.conectar();
      set({ statusBalanca: result ? 'conectado' : 'erro' });
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao conectar balanca';
      set({ statusBalanca: 'erro', error: msg });
      return false;
    }
  },

  conectarRFID: async () => {
    set({ statusRFID: 'conectando', error: null });
    try {
      const result = await rfidService.conectar();
      set({ statusRFID: result ? 'conectado' : 'erro' });
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao conectar RFID';
      set({ statusRFID: 'erro', error: msg });
      return false;
    }
  },

  conectarDisplay: async () => {
    set({ statusDisplay: 'conectando', error: null });
    try {
      // Display connects automatically when writing
      set({ statusDisplay: 'conectado' });
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao conectar display';
      set({ statusDisplay: 'erro', error: msg });
      return false;
    }
  },

  conectarTudo: async () => {
    set({ error: null });
    const result = await hardwareManager.conectarTudo();
    set({
      statusBalanca: result.balanca ? 'conectado' : 'desconectado',
      statusRFID: result.rfid ? 'conectado' : 'desconectado',
    });

    if (result.balanca || result.rfid) {
      hardwareManager.iniciarTudo();
    }

    return result;
  },

  desconectarTudo: () => {
    hardwareManager.desconectarTudo();
    set({
      statusBalanca: 'desconectado',
      statusRFID: 'desconectado',
      statusDisplay: 'desconectado',
      pesoAtual: null,
      tagAtual: null,
    });
  },

  // ── Real-time updates ──────────────────────────────────────────────

  atualizarPeso: (leitura) => set({ pesoAtual: leitura }),
  atualizarTag: (leitura) => set({ tagAtual: leitura }),
  atualizarStatusBalanca: (status) => set({ statusBalanca: status }),
  atualizarStatusRFID: (status) => set({ statusRFID: status }),
  atualizarStatusDisplay: (status) => set({ statusDisplay: status }),

  // ── Config ──────────────────────────────────────────────────────────

  fetchConfiguracao: async (fazendaId: string) => {
    set({ loading: true, error: null });
    try {
      // Fetch all config in parallel
      const [configRes, v10Res, enderecosRes, misturadoresRes] = await Promise.all([
        supabase
          .from('vet_auto_configuracoes')
          .select('*')
          .eq('fazenda_id', fazendaId)
          .maybeSingle(),
        supabase
          .from('vet_auto_configuracao_v10')
          .select('*')
          .eq('fazenda_id', fazendaId)
          .maybeSingle(),
        supabase
          .from('vet_auto_endereco_v10')
          .select('*')
          .eq('fazenda_id', fazendaId)
          .order('misturador', { ascending: true }),
        supabase
          .from('vet_auto_configuracoes_misturadores')
          .select('*')
          .eq('fazenda_id', fazendaId)
          .order('posicao', { ascending: true }),
      ]);

      const configuracao = configRes.data as VetAutoConfiguracao | null;
      const configuracaoV10 = v10Res.data as VetAutoConfiguracaoV10 | null;
      const enderecosV10 = (enderecosRes.data ?? []) as VetAutoEnderecoV10[];
      const misturadores = (misturadoresRes.data ?? []) as VetAutoConfiguracaoMisturador[];

      // Determine connection type
      let tipoConexao: TipoConexao = 'serial';
      if (configuracao?.utiliza_api_hardware || configuracaoV10?.usa_config_v10) {
        tipoConexao = 'http_v10';
      }

      const config: AutomacaoConfig = {
        configuracao,
        configuracaoV10,
        enderecosV10,
        misturadores,
        misturadorAtual: misturadores[0] ?? null,
        tipoConexao,
        configurado: !!configuracao,
      };

      set({ configuracao: config, loading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao carregar configuracao de hardware';
      set({ error: msg, loading: false });
    }
  },

  selecionarMisturador: (misturador) => {
    set((state) => ({
      configuracao: {
        ...state.configuracao,
        misturadorAtual: misturador,
      },
    }));
  },

  // ── Devices ─────────────────────────────────────────────────────────

  atualizarDispositivo: (id, updates) => {
    set((state) => ({
      dispositivos: state.dispositivos.map((d) =>
        d.id === id ? { ...d, ...updates } : d,
      ),
    }));
  },

  // ── Reset ──────────────────────────────────────────────────────────

  limpar: () => {
    hardwareManager.desconectarTudo();
    set({
      pesoAtual: null,
      tagAtual: null,
      statusBalanca: 'desconectado',
      statusRFID: 'desconectado',
      statusDisplay: 'desconectado',
      dispositivos: [],
      configuracao: { ...configInicial },
      loading: false,
      error: null,
    });
  },
}));
