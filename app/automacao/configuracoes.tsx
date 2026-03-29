import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontWeight } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAutomacaoStore } from '@/stores/automacaoStore';
import { useHardwareStore } from '@/stores/hardwareStore';
import {
  hardwareManager,
  balancaService,
  rfidService,
  ledDisplayService,
} from '@/services/hardware';

// ============================================
// Toggle Row
// ============================================
function ToggleRow({
  icon,
  label,
  description,
  value,
  onToggle,
  index,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  value: boolean;
  onToggle: (val: boolean) => void;
  index: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
      <View style={[styles.toggleRow, Shadows.xs]}>
        <View style={[styles.toggleIcon, { backgroundColor: value ? Colors.primary + '15' : Colors.surfaceSubtle }]}>
          <Ionicons name={icon} size={20} color={value ? Colors.primary : Colors.textTertiary} />
        </View>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>{label}</Text>
          <Text style={styles.toggleDesc}>{description}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: Colors.border, true: Colors.primaryLight }}
          thumbColor={value ? Colors.primary : Colors.surfaceSubtle}
        />
      </View>
    </Animated.View>
  );
}

// ============================================
// Config Input Row
// ============================================
function ConfigInputRow({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  suffix,
  index,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'numeric';
  suffix?: string;
  index: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <View style={styles.configInputRow}>
        <Text style={styles.configInputLabel}>{label}</Text>
        <View style={styles.configInputWrap}>
          <TextInput
            style={styles.configInput}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={Colors.placeholder}
            keyboardType={keyboardType ?? 'default'}
          />
          {suffix && <Text style={styles.configInputSuffix}>{suffix}</Text>}
        </View>
      </View>
    </Animated.View>
  );
}

// ============================================
// Section Header
// ============================================
function SectionHeader({
  icon,
  title,
  color,
  index,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  color: string;
  index: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionIconWrap, { backgroundColor: color + '12' }]}>
            <Ionicons name={icon} size={16} color={color} />
          </View>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ============================================
// Slider Row (simple version with +/- buttons)
// ============================================
function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
  index,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  index: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <View style={styles.sliderControls}>
          <TouchableOpacity
            style={styles.sliderBtn}
            onPress={() => onChange(Math.max(min, value - 1))}
            activeOpacity={0.7}
          >
            <Ionicons name="remove" size={18} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.sliderValue}>{value}</Text>
          <TouchableOpacity
            style={styles.sliderBtn}
            onPress={() => onChange(Math.min(max, value + 1))}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={18} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ============================================
// Helper: get fazenda_id from automacaoStore or hardwareStore
// ============================================
function useFazendaId(): string | null {
  const carregamentoAtivo = useAutomacaoStore((s) => s.carregamentoAtivo);
  const configuracao = useHardwareStore((s) => s.configuracao);
  return (
    carregamentoAtivo?.fazenda_id ??
    configuracao?.configuracao?.fazenda_id ??
    null
  );
}

// ============================================
// Main Screen
// ============================================
export default function ConfiguracoesScreen() {
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configId, setConfigId] = useState<string | null>(null);
  const fazendaId = useFazendaId();

  // Dispositivos count (loaded from DB)
  const [dispositivosCount, setDispositivosCount] = useState(0);

  // Balanca
  const [balancaPorta, setBalancaPorta] = useState('');
  const [balancaProtocolo, setBalancaProtocolo] = useState('');
  const [balancaResolucao, setBalancaResolucao] = useState('');
  const [balancaCapacidade, setBalancaCapacidade] = useState('');
  const [balancaFaixaEstabilidade, setBalancaFaixaEstabilidade] = useState('5.0');
  const [minTimeEstabilidade, setMinTimeEstabilidade] = useState('3');

  // RFID
  const [usaAntenaUnica, setUsaAntenaUnica] = useState(true);
  const [antenaManual, setAntenaManual] = useState(false);
  const [rfidTimeout, setRfidTimeout] = useState('5');
  const [rfidTamanhoTag, setRfidTamanhoTag] = useState('24');

  // Display LED
  const [usaDisplayLed, setUsaDisplayLed] = useState(false);
  const [intensidadeLed, setIntensidadeLed] = useState(5);

  // Safe Points
  const [usaSafePoints, setUsaSafePoints] = useState(false);

  // Logging & Validation
  const [enableLogPeso, setEnableLogPeso] = useState(false);
  const [enableLogFornecimento, setEnableLogFornecimento] = useState(false);
  const [validateTipoReceita, setValidateTipoReceita] = useState(true);

  // V10/ESP32
  const [usaV10, setUsaV10] = useState(false);
  const [v10Ip, setV10Ip] = useState('192.168.1.100');

  // Sincronismo
  const [tipoSync, setTipoSync] = useState('online');
  const [syncUrl, setSyncUrl] = useState('');
  const [ultimoSync, setUltimoSync] = useState('Nunca');

  // ── Load config from Supabase on mount ──
  useEffect(() => {
    loadConfig();
  }, [fazendaId]);

  const loadConfig = useCallback(async () => {
    if (!fazendaId) {
      setLoadingConfig(false);
      return;
    }

    setLoadingConfig(true);
    try {
      // Load config and device count in parallel
      const [configRes, devCountRes] = await Promise.all([
        supabase
          .from('vet_auto_configuracoes')
          .select('*')
          .eq('fazenda_id', fazendaId)
          .maybeSingle(),
        supabase
          .from('vet_auto_dispositivos')
          .select('id', { count: 'exact', head: true })
          .eq('fazenda_id', fazendaId),
      ]);

      if (configRes.error && configRes.error.code !== 'PGRST116') {
        throw configRes.error;
      }

      setDispositivosCount(devCountRes.count ?? 0);

      const cfg = configRes.data;
      if (cfg) {
        setConfigId(cfg.id);
        setUsaSafePoints(cfg.usa_safe_point ?? false);
        setUsaDisplayLed(cfg.usa_display_led ?? false);
        setUsaAntenaUnica(cfg.usa_antena_unica ?? true);
        setAntenaManual(cfg.antena_manual ?? false);
        setRfidTamanhoTag(String(cfg.tamanho_tag ?? 24));
        setRfidTimeout(String(cfg.timeout_rfid_sem_leitura ?? 5));
        setBalancaFaixaEstabilidade(String(cfg.faixa_estabilidade_padrao ?? 5.0));
        setMinTimeEstabilidade(String(cfg.min_time_estabilidade ?? 3));
        setValidateTipoReceita(cfg.validate_tipo_receita_diferente ?? true);
        setEnableLogPeso(cfg.enable_log_peso ?? false);
        setEnableLogFornecimento(cfg.enable_log_fornecimento ?? false);
        setUsaV10(cfg.usa_api_hardware_v10 ?? false);
        setIntensidadeLed(cfg.intensidade_led ?? 5);
        setTipoSync(cfg.tipo_sincronismo ?? 'online');
        setSyncUrl(cfg.url_web_service ?? '');
        // balanca/protocolo fields are stored per-misturador in vet_auto_configuracao_misturadores
        // but we show them here for convenience
      }

      // Load misturador config for balanca fields
      const { data: misturadorCfg } = await supabase
        .from('vet_auto_configuracao_misturadores')
        .select('*')
        .eq('fazenda_id', fazendaId)
        .order('posicao', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (misturadorCfg) {
        setBalancaPorta(misturadorCfg.porta_balanca ?? '');
        setBalancaResolucao(String(misturadorCfg.resolucao ?? ''));
        setBalancaCapacidade(String(misturadorCfg.capacidade_max ?? ''));
      }

      // Get last sync time
      const { data: lastSync } = await supabase
        .from('vet_auto_sync_log')
        .select('data_sync')
        .eq('fazenda_id', fazendaId)
        .order('data_sync', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastSync?.data_sync) {
        const d = new Date(lastSync.data_sync);
        setUltimoSync(d.toLocaleString('pt-BR'));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Erro ao carregar configuracao:', msg);
      Alert.alert('Erro', `Nao foi possivel carregar configuracoes: ${msg}`);
    } finally {
      setLoadingConfig(false);
    }
  }, [fazendaId]);

  // ── Save config to Supabase ──
  const handleSalvar = useCallback(async () => {
    if (!fazendaId) {
      Alert.alert('Erro', 'Fazenda nao identificada. Inicie um carregamento primeiro.');
      return;
    }

    setSaving(true);
    try {
      const configPayload = {
        fazenda_id: fazendaId,
        usa_safe_point: usaSafePoints,
        usa_display_led: usaDisplayLed,
        usa_antena_unica: usaAntenaUnica,
        antena_manual: antenaManual,
        tamanho_tag: parseInt(rfidTamanhoTag, 10) || 24,
        timeout_rfid_sem_leitura: parseInt(rfidTimeout, 10) || 5,
        faixa_estabilidade_padrao: parseFloat(balancaFaixaEstabilidade) || 5.0,
        min_time_estabilidade: parseInt(minTimeEstabilidade, 10) || 3,
        validate_tipo_receita_diferente: validateTipoReceita,
        enable_log_peso: enableLogPeso,
        enable_log_fornecimento: enableLogFornecimento,
        usa_api_hardware_v10: usaV10,
        intensidade_led: intensidadeLed,
        tipo_sincronismo: tipoSync,
        url_web_service: syncUrl || null,
        updated_at: new Date().toISOString(),
      };

      // Upsert config
      const { error: upsertError } = await supabase
        .from('vet_auto_configuracoes')
        .upsert(
          configId
            ? { id: configId, ...configPayload }
            : configPayload,
          { onConflict: 'fazenda_id' }
        );

      if (upsertError) {
        throw upsertError;
      }

      // Apply config to hardware services in memory
      try {
        balancaService.configurar({
          faixa_estabilidade: parseFloat(balancaFaixaEstabilidade) || 5.0,
          min_time_estabilidade: (parseInt(minTimeEstabilidade, 10) || 3) * 1000,
        });

        rfidService.configurar({
          tamanho_tag: parseInt(rfidTamanhoTag, 10) || 24,
          usa_antena_unica: usaAntenaUnica,
        });

        if (usaDisplayLed) {
          ledDisplayService.configurar({
            intensidade: intensidadeLed,
          });
          ledDisplayService.setIntensidade(intensidadeLed);
        }
      } catch (hwErr) {
        // Hardware config application is best-effort; don't fail the save
        console.warn('Aviso ao aplicar config ao hardware:', hwErr);
      }

      // Refresh hardwareStore config
      try {
        await useHardwareStore.getState().fetchConfiguracao(fazendaId);
      } catch {
        // non-critical
      }

      Alert.alert('Sucesso', 'Configuracoes salvas com sucesso.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Erro ao salvar configuracao:', msg);
      Alert.alert('Erro', `Nao foi possivel salvar as configuracoes: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [
    fazendaId, configId,
    usaSafePoints, usaDisplayLed, usaAntenaUnica, antenaManual,
    rfidTamanhoTag, rfidTimeout, balancaFaixaEstabilidade, minTimeEstabilidade,
    validateTipoReceita, enableLogPeso, enableLogFornecimento,
    usaV10, intensidadeLed, tipoSync, syncUrl,
  ]);

  let animIndex = 0;

  // Show loading state
  if (loadingConfig) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>Configuracoes</Text>
              <Text style={styles.headerSubtitle}>Automacao de Trato</Text>
            </View>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Carregando configuracoes...</Text>
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
              <Text style={styles.headerTitle}>Configuracoes</Text>
              <Text style={styles.headerSubtitle}>Automacao de Trato</Text>
            </View>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="warning-outline" size={48} color={Colors.warning} />
          <Text style={styles.loadingText}>Fazenda nao identificada.</Text>
          <Text style={[styles.loadingText, { fontSize: FontSize.sm }]}>
            Inicie um carregamento para configurar.
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
            <Text style={styles.headerTitle}>Configuracoes</Text>
            <Text style={styles.headerSubtitle}>Automacao de Trato</Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xxl }]}
      >
        {/* ── Dispositivos ── */}
        <SectionHeader icon="hardware-chip-outline" title="Dispositivos" color={Colors.info} index={animIndex++} />
        <Animated.View entering={FadeInDown.delay(animIndex * 60).springify()}>
          <TouchableOpacity
            style={[styles.devicesSummary, Shadows.xs]}
            onPress={() => router.push('/automacao/dispositivos' as any)}
            activeOpacity={0.7}
          >
            <View style={styles.devicesSummaryLeft}>
              <Ionicons name="hardware-chip" size={20} color={Colors.info} />
              <Text style={styles.devicesSummaryText}>
                {dispositivosCount} dispositivo{dispositivosCount !== 1 ? 's' : ''} configurado{dispositivosCount !== 1 ? 's' : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </TouchableOpacity>
        </Animated.View>

        {/* ── Balanca ── */}
        <SectionHeader icon="scale-outline" title="Balanca" color={Colors.primary} index={animIndex++} />
        <ConfigInputRow label="Porta" value={balancaPorta} onChangeText={setBalancaPorta} placeholder="COM3" index={animIndex++} />
        <ConfigInputRow label="Protocolo" value={balancaProtocolo} onChangeText={setBalancaProtocolo} placeholder="SMA" index={animIndex++} />
        <ConfigInputRow label="Resolucao" value={balancaResolucao} onChangeText={setBalancaResolucao} placeholder="1" keyboardType="numeric" suffix="kg" index={animIndex++} />
        <ConfigInputRow label="Capacidade" value={balancaCapacidade} onChangeText={setBalancaCapacidade} placeholder="10000" keyboardType="numeric" suffix="kg" index={animIndex++} />
        <ConfigInputRow label="Faixa Estabilidade" value={balancaFaixaEstabilidade} onChangeText={setBalancaFaixaEstabilidade} placeholder="5.0" keyboardType="numeric" suffix="kg" index={animIndex++} />
        <ConfigInputRow label="Tempo Estabilidade" value={minTimeEstabilidade} onChangeText={setMinTimeEstabilidade} placeholder="3" keyboardType="numeric" suffix="seg" index={animIndex++} />

        {/* ── RFID ── */}
        <SectionHeader icon="radio-outline" title="RFID" color={Colors.warning} index={animIndex++} />
        <ToggleRow
          icon="radio-outline"
          label="Antena Unica"
          description="Usar apenas uma antena RFID"
          value={usaAntenaUnica}
          onToggle={setUsaAntenaUnica}
          index={animIndex++}
        />
        <ToggleRow
          icon="hand-left-outline"
          label="Antena Manual"
          description="Permitir troca manual de antena"
          value={antenaManual}
          onToggle={setAntenaManual}
          index={animIndex++}
        />
        <ConfigInputRow label="Timeout" value={rfidTimeout} onChangeText={setRfidTimeout} placeholder="5" keyboardType="numeric" suffix="seg" index={animIndex++} />
        <ConfigInputRow label="Tamanho Tag" value={rfidTamanhoTag} onChangeText={setRfidTamanhoTag} placeholder="24" keyboardType="numeric" suffix="chars" index={animIndex++} />

        {/* ── Display LED ── */}
        <SectionHeader icon="tv-outline" title="Display LED" color={Colors.purple} index={animIndex++} />
        <ToggleRow
          icon="tv-outline"
          label="Ativar Display"
          description="Exibir informacoes no display LED externo"
          value={usaDisplayLed}
          onToggle={setUsaDisplayLed}
          index={animIndex++}
        />
        {usaDisplayLed && (
          <SliderRow
            label="Intensidade"
            value={intensidadeLed}
            min={0}
            max={7}
            onChange={setIntensidadeLed}
            index={animIndex++}
          />
        )}

        {/* ── Safe Points ── */}
        <SectionHeader icon="shield-checkmark-outline" title="Safe Points" color={Colors.success} index={animIndex++} />
        <ToggleRow
          icon="shield-checkmark-outline"
          label="Usar Safe Points"
          description="Pontos de seguranca para validacao de rota"
          value={usaSafePoints}
          onToggle={setUsaSafePoints}
          index={animIndex++}
        />
        {usaSafePoints && (
          <Animated.View entering={FadeInDown.delay(animIndex * 60).springify()}>
            <TouchableOpacity
              style={[styles.devicesSummary, Shadows.xs]}
              onPress={() => router.push('/automacao/safe-points' as any)}
              activeOpacity={0.7}
            >
              <View style={styles.devicesSummaryLeft}>
                <Ionicons name="list-outline" size={20} color={Colors.success} />
                <Text style={styles.devicesSummaryText}>Gerenciar Safe Points</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Logging & Validacao ── */}
        <SectionHeader icon="document-text-outline" title="Logs e Validacao" color={Colors.textSecondary} index={animIndex++} />
        <ToggleRow
          icon="analytics-outline"
          label="Log de Peso"
          description="Registrar historico de leituras de peso"
          value={enableLogPeso}
          onToggle={setEnableLogPeso}
          index={animIndex++}
        />
        <ToggleRow
          icon="car-outline"
          label="Log de Fornecimento"
          description="Registrar historico detalhado de fornecimentos"
          value={enableLogFornecimento}
          onToggle={setEnableLogFornecimento}
          index={animIndex++}
        />
        <ToggleRow
          icon="alert-circle-outline"
          label="Validar Tipo Receita"
          description="Alertar quando receita difere do esperado"
          value={validateTipoReceita}
          onToggle={setValidateTipoReceita}
          index={animIndex++}
        />

        {/* ── Sincronismo ── */}
        <SectionHeader icon="sync-outline" title="Sincronismo" color={Colors.info} index={animIndex++} />
        <ConfigInputRow label="Tipo" value={tipoSync} onChangeText={setTipoSync} placeholder="online" index={animIndex++} />
        <ConfigInputRow label="URL" value={syncUrl} onChangeText={setSyncUrl} placeholder="https://..." index={animIndex++} />
        <Animated.View entering={FadeInDown.delay(animIndex * 60).springify()}>
          <View style={styles.configInputRow}>
            <Text style={styles.configInputLabel}>Ultimo Sync</Text>
            <Text style={styles.lastSyncText}>{ultimoSync}</Text>
          </View>
        </Animated.View>

        {/* ── V10/ESP32 ── */}
        <SectionHeader icon="wifi-outline" title="V10 / ESP32" color={Colors.secondary} index={animIndex++} />
        <ToggleRow
          icon="wifi-outline"
          label="Ativar V10"
          description="Comunicacao com ESP32 via HTTP"
          value={usaV10}
          onToggle={setUsaV10}
          index={animIndex++}
        />
        {usaV10 && (
          <ConfigInputRow label="Endereco IP" value={v10Ip} onChangeText={setV10Ip} placeholder="192.168.1.100" index={animIndex++} />
        )}

        {/* Save Button */}
        <Animated.View entering={FadeInDown.delay(animIndex * 60).springify()} style={styles.saveContainer}>
          <TouchableOpacity
            style={[styles.saveButton, Shadows.md]}
            onPress={handleSalvar}
            disabled={saving}
            activeOpacity={0.7}
          >
            {saving ? (
              <ActivityIndicator color={Colors.textLight} />
            ) : (
              <>
                <Ionicons name="save-outline" size={24} color={Colors.textLight} />
                <Text style={styles.saveButtonText}>Salvar Configuracoes</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
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

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionIconWrap: {
    width: 28, height: 28, borderRadius: BorderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },

  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  toggleIcon: {
    width: 40, height: 40, borderRadius: BorderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  toggleDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 1 },

  // Config input row
  configInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.xs,
  },
  configInputLabel: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.textSecondary, flex: 1 },
  configInputWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  configInput: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textAlign: 'right',
    minWidth: 100,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  configInputSuffix: { fontSize: FontSize.sm, color: Colors.textTertiary, fontWeight: FontWeight.medium },
  lastSyncText: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.textTertiary },

  // Devices summary
  devicesSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  devicesSummaryLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  devicesSummaryText: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.text },

  // Slider row
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.xs,
  },
  sliderLabel: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.textSecondary },
  sliderControls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sliderBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  sliderValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, minWidth: 24, textAlign: 'center' },

  // Save
  saveContainer: { marginTop: Spacing.xl },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md + 4,
    minHeight: 60,
  },
  saveButtonText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textLight },
});
