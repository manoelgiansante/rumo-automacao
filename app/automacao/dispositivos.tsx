import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontWeight } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAutomacaoStore } from '@/stores/automacaoStore';
import { useHardwareStore } from '@/stores/hardwareStore';
import type { TipoDispositivo, TipoConexao } from '@/types/automacao';

// ============================================
// Types
// ============================================
interface Dispositivo {
  id: string;
  nome: string;
  tipo: TipoDispositivo;
  conexao_tipo: TipoConexao;
  endereco: string;
  status: string;
  configuracao: Record<string, any>;
  ultimo_teste?: string | null;
}

// ============================================
// Constants
// ============================================
const TIPO_LABELS: Record<TipoDispositivo, string> = {
  balanca: 'Balancas',
  rfid: 'RFID',
  display_led: 'Displays',
  esp32: 'ESP32 / V10',
};

const TIPO_ICONS: Record<TipoDispositivo, keyof typeof Ionicons.glyphMap> = {
  balanca: 'scale-outline',
  rfid: 'radio-outline',
  display_led: 'tv-outline',
  esp32: 'wifi-outline',
};

const TIPO_COLORS: Record<TipoDispositivo, string> = {
  balanca: Colors.primary,
  rfid: Colors.warning,
  display_led: Colors.purple,
  esp32: Colors.info,
};

const CONEXAO_LABELS: Record<TipoConexao, string> = {
  serial: 'Serial',
  tcp: 'TCP/IP',
  http_v10: 'HTTP (V10)',
};

// DB uses slightly different values for conexao_tipo
const CONEXAO_TO_DB: Record<TipoConexao, string> = {
  serial: 'serial',
  tcp: 'tcp',
  http_v10: 'http_api',
};

const DB_TO_CONEXAO: Record<string, TipoConexao> = {
  serial: 'serial',
  tcp: 'tcp',
  http_api: 'http_v10',
};

// DB uses slightly different values for tipo
const TIPO_TO_DB: Record<TipoDispositivo, string> = {
  balanca: 'balanca',
  rfid: 'rfid',
  display_led: 'display_led',
  esp32: 'esp_v10',
};

const DB_TO_TIPO: Record<string, TipoDispositivo> = {
  balanca: 'balanca',
  rfid: 'rfid',
  display_led: 'display_led',
  esp_v10: 'esp32',
};

// ============================================
// Helper: get fazenda_id
// ============================================
function useFazendaId(): string | null {
  const fazendaAtiva = useAutomacaoStore((s) => s.fazendaAtiva);
  const carregamentoAtivo = useAutomacaoStore((s) => s.carregamentoAtivo);
  const configuracao = useHardwareStore((s) => s.configuracao);
  return (
    fazendaAtiva?.fazenda_id ??
    carregamentoAtivo?.fazenda_id ??
    configuracao?.configuracao?.fazenda_id ??
    null
  );
}

// ============================================
// Device Card
// ============================================
function DeviceCard({
  device,
  onTest,
  onDelete,
  index,
}: {
  device: Dispositivo;
  onTest: () => void;
  onDelete: () => void;
  index: number;
}) {
  const [testing, setTesting] = useState(false);
  const isOnline = device.status === 'ativo';
  const tipo = DB_TO_TIPO[device.tipo] ?? (device.tipo as TipoDispositivo);
  const conexao = DB_TO_CONEXAO[device.conexao_tipo] ?? (device.conexao_tipo as TipoConexao);

  const handleTest = useCallback(async () => {
    setTesting(true);
    try {
      await onTest();
    } finally {
      setTesting(false);
    }
  }, [onTest]);

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
      <View style={[styles.deviceCard, Shadows.card]}>
        <View style={styles.deviceCardHeader}>
          <View style={[styles.deviceIconWrap, { backgroundColor: (TIPO_COLORS[tipo] ?? Colors.info) + '15' }]}>
            <Ionicons name={TIPO_ICONS[tipo] ?? 'hardware-chip-outline'} size={22} color={TIPO_COLORS[tipo] ?? Colors.info} />
          </View>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>{device.nome}</Text>
            <Text style={styles.deviceAddress}>
              {CONEXAO_LABELS[conexao] ?? device.conexao_tipo} - {device.endereco}
            </Text>
            {device.ultimo_teste && (
              <Text style={styles.deviceLastTest}>
                Ultimo teste: {new Date(device.ultimo_teste).toLocaleString('pt-BR')}
              </Text>
            )}
          </View>
          <View style={[styles.deviceStatusDot, { backgroundColor: isOnline ? Colors.success : Colors.error }]} />
        </View>

        <View style={styles.deviceActions}>
          <TouchableOpacity
            style={[styles.deviceActionBtn, styles.deviceTestBtn]}
            onPress={handleTest}
            disabled={testing}
            activeOpacity={0.7}
          >
            {testing ? (
              <ActivityIndicator size="small" color={Colors.info} />
            ) : (
              <>
                <Ionicons name="pulse-outline" size={16} color={Colors.info} />
                <Text style={[styles.deviceActionText, { color: Colors.info }]}>Testar</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deviceActionBtn, styles.deviceDeleteBtn]}
            onPress={onDelete}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.error} />
            <Text style={[styles.deviceActionText, { color: Colors.error }]}>Remover</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ============================================
// Add Device Modal
// ============================================
function AddDeviceModal({
  visible,
  onClose,
  onAdd,
  adding,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (device: { nome: string; tipo: TipoDispositivo; conexao_tipo: TipoConexao; endereco: string }) => void;
  adding: boolean;
}) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoDispositivo>('balanca');
  const [conexaoTipo, setConexaoTipo] = useState<TipoConexao>('serial');
  const [endereco, setEndereco] = useState('');

  const tipos: TipoDispositivo[] = ['balanca', 'rfid', 'display_led', 'esp32'];
  const conexoes: TipoConexao[] = ['serial', 'tcp', 'http_v10'];

  const handleAdd = () => {
    if (!nome.trim() || !endereco.trim()) {
      Alert.alert('Atencao', 'Preencha todos os campos obrigatorios.');
      return;
    }
    onAdd({ nome: nome.trim(), tipo, conexao_tipo: conexaoTipo, endereco: endereco.trim() });
  };

  // Reset fields when modal closes
  useEffect(() => {
    if (!visible) {
      setNome('');
      setEndereco('');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, Shadows.xl]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Adicionar Dispositivo</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Nome */}
            <Text style={styles.modalLabel}>Nome</Text>
            <TextInput
              style={styles.modalInput}
              value={nome}
              onChangeText={setNome}
              placeholder="Ex: Balanca Principal"
              placeholderTextColor={Colors.placeholder}
            />

            {/* Tipo */}
            <Text style={styles.modalLabel}>Tipo</Text>
            <View style={styles.chipsRow}>
              {tipos.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tipoChip, tipo === t && styles.tipoChipSelected]}
                  onPress={() => setTipo(t)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={TIPO_ICONS[t]}
                    size={16}
                    color={tipo === t ? Colors.textLight : TIPO_COLORS[t]}
                  />
                  <Text style={[styles.tipoChipText, tipo === t && { color: Colors.textLight }]}>
                    {TIPO_LABELS[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Conexao */}
            <Text style={styles.modalLabel}>Tipo de Conexao</Text>
            <View style={styles.chipsRow}>
              {conexoes.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.tipoChip, conexaoTipo === c && styles.tipoChipSelected]}
                  onPress={() => setConexaoTipo(c)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tipoChipText, conexaoTipo === c && { color: Colors.textLight }]}>
                    {CONEXAO_LABELS[c]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Endereco */}
            <Text style={styles.modalLabel}>Endereco</Text>
            <TextInput
              style={styles.modalInput}
              value={endereco}
              onChangeText={setEndereco}
              placeholder={conexaoTipo === 'serial' ? 'COM3' : '192.168.1.100:5000'}
              placeholderTextColor={Colors.placeholder}
            />

            {/* Add button */}
            <TouchableOpacity
              style={[styles.modalAddBtn, (!nome.trim() || !endereco.trim() || adding) && styles.modalAddBtnDisabled]}
              onPress={handleAdd}
              disabled={!nome.trim() || !endereco.trim() || adding}
              activeOpacity={0.7}
            >
              {adding ? (
                <ActivityIndicator color={Colors.textLight} />
              ) : (
                <>
                  <Ionicons name="add-circle" size={22} color={Colors.textLight} />
                  <Text style={styles.modalAddBtnText}>Adicionar</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ============================================
// Test connection helper
// ============================================
async function testDeviceConnection(device: Dispositivo): Promise<{ success: boolean; message: string }> {
  const conexao = DB_TO_CONEXAO[device.conexao_tipo] ?? device.conexao_tipo;
  const tipo = DB_TO_TIPO[device.tipo] ?? device.tipo;

  if (conexao === 'http_v10' || tipo === 'esp32' || tipo === 'esp_v10') {
    // HTTP test - fetch /status endpoint
    const addr = device.endereco.includes('://') ? device.endereco : `http://${device.endereco}`;
    const url = addr.endsWith('/status') ? addr : `${addr}/status`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        return { success: true, message: `Dispositivo respondeu com status ${response.status}.` };
      }
      return { success: false, message: `Dispositivo respondeu com erro HTTP ${response.status}.` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('abort')) {
        return { success: false, message: 'Timeout: dispositivo nao respondeu em 5 segundos.' };
      }
      return { success: false, message: `Falha na conexao: ${msg}` };
    }
  }

  if (conexao === 'tcp') {
    // TCP socket test - not natively available in Expo/RN without extra deps
    return {
      success: false,
      message: 'Teste TCP requer react-native-tcp-socket. Instale o pacote para testar conexoes TCP.',
    };
  }

  if (conexao === 'serial') {
    // Serial test - not natively available in Expo/RN without extra deps
    return {
      success: false,
      message: 'Teste serial requer react-native-serialport. Instale o pacote para testar conexoes seriais.',
    };
  }

  return { success: false, message: 'Tipo de conexao desconhecido.' };
}

// ============================================
// Main Screen
// ============================================
export default function DispositivosScreen() {
  const insets = useSafeAreaInsets();
  const [showAddModal, setShowAddModal] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [adding, setAdding] = useState(false);
  const fazendaId = useFazendaId();

  const [devices, setDevices] = useState<Dispositivo[]>([]);

  // ── Load devices from Supabase ──
  useEffect(() => {
    loadDevices();
  }, [fazendaId]);

  const loadDevices = useCallback(async () => {
    if (!fazendaId) {
      setLoadingDevices(false);
      return;
    }

    setLoadingDevices(true);
    try {
      const { data, error } = await supabase
        .from('vet_auto_dispositivos')
        .select('*')
        .eq('fazenda_id', fazendaId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setDevices(
        (data ?? []).map((d: any) => ({
          id: d.id,
          nome: d.nome,
          tipo: d.tipo,
          conexao_tipo: d.conexao_tipo,
          endereco: d.endereco,
          status: d.status ?? 'ativo',
          configuracao: d.configuracao ?? {},
          ultimo_teste: d.ultimo_teste ?? null,
        }))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Erro ao carregar dispositivos:', msg);
      Alert.alert('Erro', `Nao foi possivel carregar dispositivos: ${msg}`);
    } finally {
      setLoadingDevices(false);
    }
  }, [fazendaId]);

  // ── Add device to Supabase ──
  const handleAddDevice = useCallback(async (device: {
    nome: string;
    tipo: TipoDispositivo;
    conexao_tipo: TipoConexao;
    endereco: string;
  }) => {
    if (!fazendaId) {
      Alert.alert('Erro', 'Fazenda nao identificada.');
      return;
    }

    setAdding(true);
    try {
      const dbPayload = {
        fazenda_id: fazendaId,
        nome: device.nome,
        tipo: TIPO_TO_DB[device.tipo] ?? device.tipo,
        conexao_tipo: CONEXAO_TO_DB[device.conexao_tipo] ?? device.conexao_tipo,
        endereco: device.endereco,
        status: 'ativo',
        configuracao: {},
      };

      const { data, error } = await supabase
        .from('vet_auto_dispositivos')
        .insert(dbPayload)
        .select()
        .single();

      if (error) throw error;

      setDevices((prev) => [
        ...prev,
        {
          id: data.id,
          nome: data.nome,
          tipo: data.tipo,
          conexao_tipo: data.conexao_tipo,
          endereco: data.endereco,
          status: data.status ?? 'ativo',
          configuracao: data.configuracao ?? {},
          ultimo_teste: null,
        },
      ]);

      setShowAddModal(false);
      Alert.alert('Sucesso', `Dispositivo "${device.nome}" adicionado.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Erro ao adicionar dispositivo:', msg);
      Alert.alert('Erro', `Nao foi possivel adicionar dispositivo: ${msg}`);
    } finally {
      setAdding(false);
    }
  }, [fazendaId]);

  // ── Delete device from Supabase ──
  const handleDeleteDevice = useCallback((id: string, nome: string) => {
    Alert.alert(
      'Remover Dispositivo',
      `Deseja realmente remover "${nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('vet_auto_dispositivos')
                .delete()
                .eq('id', id);

              if (error) throw error;

              setDevices((prev) => prev.filter((d) => d.id !== id));
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error('Erro ao remover dispositivo:', msg);
              Alert.alert('Erro', `Nao foi possivel remover dispositivo: ${msg}`);
            }
          },
        },
      ]
    );
  }, []);

  // ── Test device connection ──
  const handleTestDevice = useCallback(async (device: Dispositivo) => {
    const result = await testDeviceConnection(device);

    // Update status in Supabase
    const newStatus = result.success ? 'ativo' : 'erro';
    try {
      await supabase
        .from('vet_auto_dispositivos')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', device.id);

      setDevices((prev) =>
        prev.map((d) =>
          d.id === device.id
            ? { ...d, status: newStatus, ultimo_teste: new Date().toISOString() }
            : d
        )
      );
    } catch {
      // Non-critical, status update failed but test result is still valid
    }

    Alert.alert(
      result.success ? 'Conectado' : 'Falha',
      `${device.nome}: ${result.message}`
    );
  }, []);

  // Normalize for display grouping
  const normalizedDevices = devices.map((d) => ({
    ...d,
    tipoNorm: (DB_TO_TIPO[d.tipo] ?? d.tipo) as TipoDispositivo,
    conexaoNorm: (DB_TO_CONEXAO[d.conexao_tipo] ?? d.conexao_tipo) as TipoConexao,
  }));

  // Group devices by type
  const groupedDevices = (['balanca', 'rfid', 'display_led', 'esp32'] as TipoDispositivo[])
    .map((tipo) => ({
      tipo,
      label: TIPO_LABELS[tipo],
      icon: TIPO_ICONS[tipo],
      color: TIPO_COLORS[tipo],
      devices: normalizedDevices.filter((d) => d.tipoNorm === tipo),
    }))
    .filter((g) => g.devices.length > 0);

  const connectedCount = devices.filter((d) => d.status === 'ativo').length;
  const offlineCount = devices.filter((d) => d.status !== 'ativo').length;

  // Loading state
  if (loadingDevices) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>Dispositivos</Text>
              <Text style={styles.headerSubtitle}>Carregando...</Text>
            </View>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Carregando dispositivos...</Text>
        </View>
      </View>
    );
  }

  if (!fazendaId) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>Dispositivos</Text>
              <Text style={styles.headerSubtitle}>Sem fazenda</Text>
            </View>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="warning-outline" size={48} color={Colors.warning} />
          <Text style={styles.loadingText}>Fazenda nao identificada.</Text>
          <Text style={[styles.loadingText, { fontSize: FontSize.sm }]}>
            Inicie um carregamento para gerenciar dispositivos.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Dispositivos</Text>
            <Text style={styles.headerSubtitle}>{devices.length} configurados</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={22} color={Colors.textLight} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xxl }]}
      >
        {/* Summary */}
        <Animated.View entering={FadeIn.duration(300)}>
          <View style={[styles.summaryCard, Shadows.card]}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{devices.length}</Text>
                <Text style={styles.summaryLabel}>Total</Text>
              </View>
              <View style={styles.summarySep} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: Colors.success }]}>
                  {connectedCount}
                </Text>
                <Text style={styles.summaryLabel}>Ativos</Text>
              </View>
              <View style={styles.summarySep} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: Colors.error }]}>
                  {offlineCount}
                </Text>
                <Text style={styles.summaryLabel}>Erro/Inativo</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Device Groups */}
        {groupedDevices.map((group) => (
          <View key={group.tipo}>
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <View style={styles.groupHeader}>
                <View style={styles.groupHeaderLeft}>
                  <View style={[styles.groupIconWrap, { backgroundColor: group.color + '12' }]}>
                    <Ionicons name={group.icon} size={16} color={group.color} />
                  </View>
                  <Text style={styles.groupTitle}>{group.label}</Text>
                </View>
                <View style={styles.groupCountBadge}>
                  <Text style={styles.groupCountText}>{group.devices.length}</Text>
                </View>
              </View>
            </Animated.View>

            {group.devices.map((device, index) => (
              <DeviceCard
                key={device.id}
                device={device}
                onTest={() => handleTestDevice(device)}
                onDelete={() => handleDeleteDevice(device.id, device.nome)}
                index={index}
              />
            ))}
          </View>
        ))}

        {/* Empty state */}
        {devices.length === 0 && (
          <Animated.View entering={FadeIn.duration(300)}>
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: Colors.primarySubtle }]}>
                <Ionicons name="hardware-chip-outline" size={48} color={Colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Nenhum dispositivo</Text>
              <Text style={styles.emptyText}>
                Adicione balancas, leitores RFID, displays e outros dispositivos.
              </Text>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      <AddDeviceModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddDevice}
        adding={adding}
      />
    </View>
  );
}

// ============================================
// Styles
// ============================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.md },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },

  // Header
  header: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  backButton: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.textLight, letterSpacing: -0.3 },
  headerSubtitle: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', fontWeight: FontWeight.medium },
  addButton: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // Summary
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  summaryItem: { alignItems: 'center' },
  summarySep: { width: 1, height: 36, backgroundColor: Colors.borderLight },
  summaryValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.text },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },

  // Group
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  groupHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  groupIconWrap: { width: 28, height: 28, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  groupCountBadge: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.full,
    minWidth: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  groupCountText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary },

  // Device card
  deviceCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  deviceCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  deviceIconWrap: { width: 44, height: 44, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  deviceAddress: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 1 },
  deviceLastTest: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  deviceStatusDot: { width: 10, height: 10, borderRadius: 5 },
  deviceActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  deviceActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  deviceTestBtn: { backgroundColor: Colors.infoSubtle },
  deviceDeleteBtn: { backgroundColor: Colors.errorSubtle },
  deviceActionText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  emptyTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.xs },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', maxWidth: 280 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.text },
  modalLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  modalInput: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    minHeight: 48,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tipoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  tipoChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tipoChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },
  modalAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md + 4,
    marginTop: Spacing.xl,
    minHeight: 56,
  },
  modalAddBtnDisabled: { backgroundColor: Colors.disabled },
  modalAddBtnText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textLight },
});
