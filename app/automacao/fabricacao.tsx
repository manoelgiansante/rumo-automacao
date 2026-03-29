import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontWeight } from '@/constants/theme';
import { useFabricacao } from '@/hooks/useFabricacao';
import type { IngredienteFabricacao } from '@/stores/fabricacaoStore';
import { useAutomacaoStore } from '@/stores/automacaoStore';
import { supabase } from '@/lib/supabase';
import type { TipoUsoMisturador } from '@/types/automacao';

const SCREEN_WIDTH = Dimensions.get('window').width;

// ============================================
// Operator type for PA operator selection
// ============================================
interface OperadorOption {
  id: string;
  nome: string;
  tipo_usuario: string;
}

// ============================================
// Types
// ============================================
interface ReceitaOption {
  id: string;
  nome: string;
  tipo: string;
  total_kg: number;
}

interface VagaoOption {
  id: string;
  nome: string;
  codigo: number;
  capacidade_kg: number;
}

// ============================================
// Status Dot
// ============================================
function StatusDot({ conectado, label }: { conectado: boolean; label: string }) {
  return (
    <View style={styles.statusDotContainer}>
      <View style={[styles.statusDot, { backgroundColor: conectado ? Colors.success : Colors.error }]} />
      <Text style={[styles.statusDotLabel, { color: conectado ? Colors.success : Colors.error }]}>
        {label}
      </Text>
    </View>
  );
}

// ============================================
// Peso Display (Big real-time weight)
// ============================================
function PesoDisplay({ peso, estavel }: { peso: number; estavel: boolean }) {
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    if (!estavel) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 400 }),
          withTiming(0.98, { duration: 400 })
        ),
        -1,
        true
      );
    } else {
      pulseAnim.value = withSpring(1);
    }
  }, [estavel]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  return (
    <Animated.View style={[styles.pesoDisplayContainer, animatedStyle]}>
      <Text style={[styles.pesoGrande, !estavel && styles.pesoInstavel]}>
        {peso.toFixed(1).replace('.', ',')}
      </Text>
      <Text style={styles.pesoUnidade}>kg</Text>
      {!estavel && (
        <View style={styles.pesoStatusBadge}>
          <Text style={styles.pesoStatusText}>INSTAVEL</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ============================================
// Tolerance Progress Bar
// ============================================
function ToleranceBar({
  pesoAdicionado,
  pesoPrevisto,
  pesoMinimo,
  pesoMaximo,
}: {
  pesoAdicionado: number;
  pesoPrevisto: number;
  pesoMinimo: number;
  pesoMaximo: number;
}) {
  const maxRange = pesoMaximo * 1.2;
  const fillPercent = maxRange > 0 ? (pesoAdicionado / maxRange) * 100 : 0;
  const greenStart = maxRange > 0 ? (pesoMinimo / maxRange) * 100 : 0;
  const greenEnd = maxRange > 0 ? (pesoMaximo / maxRange) * 100 : 0;

  const dentroTolerancia = pesoAdicionado >= pesoMinimo && pesoAdicionado <= pesoMaximo;
  const excesso = pesoAdicionado > pesoMaximo;

  const fillColor = dentroTolerancia
    ? Colors.success
    : excesso
    ? Colors.error
    : Colors.info;

  return (
    <View style={styles.toleranceContainer}>
      <View style={styles.toleranceBarBg}>
        {/* Green zone indicator */}
        <View
          style={[
            styles.toleranceGreenZone,
            { left: `${greenStart}%`, width: `${greenEnd - greenStart}%` },
          ]}
        />
        {/* Fill */}
        <View
          style={[
            styles.toleranceBarFill,
            {
              width: `${Math.min(fillPercent, 100)}%`,
              backgroundColor: fillColor,
            },
          ]}
        />
        {/* Target line */}
        <View
          style={[
            styles.toleranceTargetLine,
            { left: `${maxRange > 0 ? (pesoPrevisto / maxRange) * 100 : 0}%` },
          ]}
        />
      </View>
      <View style={styles.toleranceLabels}>
        <Text style={styles.toleranceLabelText}>
          {pesoMinimo.toFixed(0)} kg
        </Text>
        <Text style={[styles.toleranceLabelText, { fontWeight: FontWeight.bold }]}>
          {pesoPrevisto.toFixed(0)} kg
        </Text>
        <Text style={styles.toleranceLabelText}>
          {pesoMaximo.toFixed(0)} kg
        </Text>
      </View>
    </View>
  );
}

// ============================================
// Ingredient Item
// ============================================
function IngredienteItem({
  item,
  isAtual,
  index,
}: {
  item: IngredienteFabricacao;
  isAtual: boolean;
  index: number;
}) {
  const nome = item.receitaIngrediente.ingrediente?.nome ?? `Ingrediente ${index + 1}`;
  const isProcessado = item.status === 'processado';
  const isProcessando = item.status === 'processando';

  return (
    <View style={[styles.ingredienteItem, isAtual && styles.ingredienteItemAtual]}>
      <View style={styles.ingredienteLeft}>
        <View
          style={[
            styles.ingredienteCheckbox,
            isProcessado && styles.ingredienteCheckboxDone,
            isProcessando && styles.ingredienteCheckboxActive,
          ]}
        >
          {isProcessado && (
            <Ionicons name="checkmark" size={14} color={Colors.textLight} />
          )}
          {isProcessando && (
            <Ionicons name="ellipse" size={8} color={Colors.textLight} />
          )}
          {!isProcessado && !isProcessando && (
            <Text style={styles.ingredienteOrdem}>{index + 1}</Text>
          )}
        </View>
        <View style={styles.ingredienteInfo}>
          <Text style={[styles.ingredienteNome, isProcessado && styles.ingredienteNomeDone]}>
            {nome}
          </Text>
          <Text style={styles.ingredientePeso}>
            Previsto: {item.pesoPrevisto.toFixed(1)} kg
          </Text>
        </View>
      </View>
      <View style={styles.ingredienteRight}>
        {item.pesoRegistrado !== null && (
          <View>
            <Text style={styles.ingredientePesoFabricado}>
              {item.pesoRegistrado.toFixed(1)} kg
            </Text>
            {item.diferencaKg !== null && (
              <Text
                style={[
                  styles.ingredienteDiferenca,
                  {
                    color:
                      Math.abs(item.diferencaKg) <= item.toleranciaKg
                        ? Colors.success
                        : Colors.error,
                  },
                ]}
              >
                {item.diferencaKg > 0 ? '+' : ''}{item.diferencaKg.toFixed(1)} kg
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ============================================
// Timer Display
// ============================================
function TimerDisplay({ startTime }: { startTime: string | null }) {
  const [elapsed, setElapsed] = useState('00:00:00');

  useEffect(() => {
    if (!startTime) return;
    const start = new Date(startTime).getTime();

    const interval = setInterval(() => {
      const diff = Date.now() - start;
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setElapsed(
        `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <View style={styles.timerContainer}>
      <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
      <Text style={styles.timerText}>{elapsed}</Text>
    </View>
  );
}

// ============================================
// Main Screen
// ============================================
export default function FabricacaoScreen() {
  const insets = useSafeAreaInsets();

  const fab = useFabricacao({
    autoAvancar: false,
    vibrarAlerta: true,
    onDentroTolerancia: () => {},
    onExcessoTolerancia: () => {},
    onIngredienteFinalizado: () => {},
    onTodosIngredientesFinalizados: () => {
      Alert.alert('Fabricacao', 'Todos os ingredientes foram pesados!');
    },
  });

  const { fazendaAtiva } = useAutomacaoStore();
  const fazenda_id = fazendaAtiva?.fazenda_id ?? '';

  // Local state for recipe/vagao selection
  const [selectedReceita, setSelectedReceita] = useState<string>('');
  const [selectedVagao, setSelectedVagao] = useState<string>('');
  const [showReceitaPicker, setShowReceitaPicker] = useState(false);

  // Tipo de uso (Estacionario / Rotomix / BatchBox)
  const [tipoUso, setTipoUso] = useState<TipoUsoMisturador>('estacionario');

  // Operador de Pa selection
  const [operadores, setOperadores] = useState<OperadorOption[]>([]);
  const [selectedOperadorPa, setSelectedOperadorPa] = useState<string>('');
  const [loadingOperadores, setLoadingOperadores] = useState(false);

  // Load operators on mount
  useEffect(() => {
    if (!fazenda_id) return;
    let cancelled = false;
    setLoadingOperadores(true);
    supabase
      .from('vet_auto_usuarios')
      .select('id, nome, tipo_usuario')
      .eq('fazenda_id', fazenda_id)
      .eq('ativo', true)
      .in('tipo_usuario', ['operador_pa', 'tratador', 'operador'])
      .order('nome')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          setOperadores(data as OperadorOption[]);
        }
        setLoadingOperadores(false);
      });
    return () => { cancelled = true; };
  }, [fazenda_id]);

  // Mock data - replace with real data from stores
  const receitas: ReceitaOption[] = [
    { id: 'r1', nome: 'Racao Confinamento 22%', tipo: 'concentrado', total_kg: 5000 },
    { id: 'r2', nome: 'Racao Terminacao 18%', tipo: 'volumoso', total_kg: 8000 },
    { id: 'r3', nome: 'Racao Adaptacao 25%', tipo: 'concentrado', total_kg: 3000 },
  ];

  const vagoes: VagaoOption[] = [
    { id: 'v1', nome: 'Vagao 01', codigo: 1, capacidade_kg: 10000 },
    { id: 'v2', nome: 'Vagao 02', codigo: 2, capacidade_kg: 8000 },
  ];

  const isAtiva = fab.status === 'processando';
  const isEspera = fab.status === 'espera' || !fab.fabricacaoAtiva;

  const pesoEstavel = fab.hardware?.status?.pesoEstavel ?? true;
  const pesoAtual = fab.pesoAtual ?? 0;
  const balancaConectada = fab.hardware?.conectado ?? false;
  const rfidConectado = fab.hardware?.status?.rfidConectado ?? false;

  const statusLabel = useMemo(() => {
    switch (fab.status) {
      case 'espera': return 'ESPERA';
      case 'processando': return 'PROCESSANDO';
      case 'processado': return 'FINALIZADO';
      case 'cancelado': return 'CANCELADO';
      default: return 'SELECIONE';
    }
  }, [fab.status]);

  const statusColor = useMemo(() => {
    switch (fab.status) {
      case 'processando': return Colors.success;
      case 'processado': return Colors.info;
      case 'cancelado': return Colors.error;
      default: return Colors.textTertiary;
    }
  }, [fab.status]);

  const handleIniciar = useCallback(async () => {
    if (!selectedReceita || !selectedVagao) {
      Alert.alert('Atencao', 'Selecione a receita e o vagao antes de iniciar.');
      return;
    }

    const receita = receitas.find(r => r.id === selectedReceita);
    const vagao = vagoes.find(v => v.id === selectedVagao);
    if (!receita || !vagao) return;

    try {
      await fab.iniciar(
        fazenda_id || 'fazenda-id',
        receita.id,
        vagao.codigo,
        receita.total_kg,
        undefined,
        tipoUso,
        selectedOperadorPa || null,
      );
    } catch (error) {
      Alert.alert('Erro', 'Nao foi possivel iniciar a fabricacao.');
    }
  }, [selectedReceita, selectedVagao, fab, tipoUso, selectedOperadorPa, fazenda_id]);

  const handleProximoIngrediente = useCallback(() => {
    if (fab.ingredienteAtual) {
      fab.avancarManual(pesoAtual);
    }
  }, [fab, pesoAtual]);

  const handlePausar = useCallback(() => {
    fab.pausar();
  }, [fab]);

  const handleCancelar = useCallback(() => {
    Alert.alert(
      'Cancelar Fabricacao',
      'Deseja realmente cancelar a fabricacao em andamento?',
      [
        { text: 'Nao', style: 'cancel' },
        {
          text: 'Sim, Cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              await fab.cancelar();
              Alert.alert('Cancelado', 'Fabricacao cancelada com sucesso.');
            } catch {
              Alert.alert('Erro', 'Nao foi possivel cancelar.');
            }
          },
        },
      ]
    );
  }, [fab]);

  const handleFinalizar = useCallback(() => {
    Alert.alert(
      'Finalizar Fabricacao',
      'Confirma a finalizacao da fabricacao?',
      [
        { text: 'Nao', style: 'cancel' },
        {
          text: 'Sim, Finalizar',
          onPress: async () => {
            try {
              await fab.finalizar();
              Alert.alert('Sucesso', 'Fabricacao finalizada com sucesso.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch {
              Alert.alert('Erro', 'Nao foi possivel finalizar.');
            }
          },
        },
      ]
    );
  }, [fab]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Fabricacao</Text>
            <Text style={styles.headerSubtitle}>Pesagem de ingredientes</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <StatusDot conectado={balancaConectada} label="Bal" />
          <StatusDot conectado={rfidConectado} label="RFID" />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xxl }]}
      >
        {/* Status Badge */}
        <Animated.View entering={FadeIn.duration(200)} style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
            <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          {isAtiva && fab.fabricacaoAtiva && (
            <TimerDisplay startTime={(fab.fabricacaoAtiva as any).hora_inicio_fabricacao} />
          )}
        </Animated.View>

        {/* Recipe & Vagao Selection (only when not active) */}
        {isEspera && (
          <>
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <Text style={styles.inputLabel}>Receita</Text>
              <View style={styles.chipsRow}>
                {receitas.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[
                      styles.selectorChip,
                      selectedReceita === r.id && styles.chipSelected,
                      selectedReceita === r.id && Shadows.sm,
                    ]}
                    onPress={() => setSelectedReceita(r.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="flask-outline"
                      size={16}
                      color={selectedReceita === r.id ? Colors.textLight : Colors.textSecondary}
                    />
                    <View>
                      <Text style={[
                        styles.selectorChipText,
                        selectedReceita === r.id && styles.chipTextSelected,
                      ]}>{r.nome}</Text>
                      <Text style={[
                        styles.selectorChipSub,
                        selectedReceita === r.id && { color: 'rgba(255,255,255,0.7)' },
                      ]}>{r.total_kg.toLocaleString('pt-BR')} kg</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).springify()}>
              <Text style={styles.inputLabel}>Misturador / Vagao</Text>
              <View style={styles.chipsRow}>
                {vagoes.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={[
                      styles.selectorChip,
                      selectedVagao === v.id && styles.chipSelected,
                      selectedVagao === v.id && Shadows.sm,
                    ]}
                    onPress={() => setSelectedVagao(v.id)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name="truck-outline"
                      size={16}
                      color={selectedVagao === v.id ? Colors.textLight : Colors.textSecondary}
                    />
                    <Text style={[
                      styles.selectorChipText,
                      selectedVagao === v.id && styles.chipTextSelected,
                    ]}>{v.nome}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>

            {/* Tipo de Uso selector */}
            <Animated.View entering={FadeInDown.delay(300).springify()}>
              <Text style={styles.inputLabel}>Tipo de Uso</Text>
              <View style={styles.chipsRow}>
                {([
                  { value: 'estacionario' as TipoUsoMisturador, label: 'Estacionario', icon: 'cube-outline' as const },
                  { value: 'rotomix' as TipoUsoMisturador, label: 'Rotomix', icon: 'sync-outline' as const },
                  { value: 'batchbox' as TipoUsoMisturador, label: 'BatchBox', icon: 'grid-outline' as const },
                ]).map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.selectorChip,
                      tipoUso === opt.value && styles.chipSelected,
                      tipoUso === opt.value && Shadows.sm,
                    ]}
                    onPress={() => setTipoUso(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={16}
                      color={tipoUso === opt.value ? Colors.textLight : Colors.textSecondary}
                    />
                    <Text style={[
                      styles.selectorChipText,
                      tipoUso === opt.value && styles.chipTextSelected,
                    ]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {tipoUso === 'batchbox' && (
                <Text style={styles.tipoUsoHint}>
                  BatchBox: mistura externa - etapa de mistura sera pulada.
                </Text>
              )}
            </Animated.View>

            {/* Operador de Pa selector */}
            <Animated.View entering={FadeInDown.delay(400).springify()}>
              <Text style={styles.inputLabel}>Operador de Pa</Text>
              {loadingOperadores ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ alignSelf: 'flex-start', marginVertical: Spacing.sm }} />
              ) : operadores.length === 0 ? (
                <Text style={styles.operadorEmpty}>Nenhum operador disponivel</Text>
              ) : (
                <View style={styles.chipsRow}>
                  {operadores.map((op) => (
                    <TouchableOpacity
                      key={op.id}
                      style={[
                        styles.selectorChip,
                        selectedOperadorPa === op.id && styles.chipSelected,
                        selectedOperadorPa === op.id && Shadows.sm,
                      ]}
                      onPress={() => setSelectedOperadorPa(selectedOperadorPa === op.id ? '' : op.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="person-outline"
                        size={16}
                        color={selectedOperadorPa === op.id ? Colors.textLight : Colors.textSecondary}
                      />
                      <View>
                        <Text style={[
                          styles.selectorChipText,
                          selectedOperadorPa === op.id && styles.chipTextSelected,
                        ]}>{op.nome}</Text>
                        <Text style={[
                          styles.selectorChipSub,
                          selectedOperadorPa === op.id && { color: 'rgba(255,255,255,0.7)' },
                        ]}>{op.tipo_usuario === 'operador_pa' ? 'Op. Pa' : op.tipo_usuario}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </Animated.View>
          </>
        )}

        {/* Current Ingredient Info */}
        {fab.ingredienteAtual && isAtiva && (
          <Animated.View entering={FadeIn.duration(300)}>
            <View style={[styles.currentIngredientCard, Shadows.md]}>
              <View style={styles.currentIngredientHeader}>
                <Text style={styles.currentIngredientLabel}>Ingrediente Atual</Text>
                <Text style={styles.currentIngredientOrdem}>
                  {(fab.ingredienteAtualIndex ?? 0) + 1} / {fab.ingredientes?.length ?? 0}
                </Text>
              </View>
              <Text style={styles.currentIngredientNome}>
                {fab.ingredienteAtual.receitaIngrediente.ingrediente?.nome ?? 'Ingrediente'}
              </Text>
              <Text style={styles.currentIngredientPrevisto}>
                Previsto: {fab.ingredienteAtual.pesoPrevisto.toFixed(1)} kg
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Troca de Ingrediente Countdown */}
        {fab.emTrocaIngrediente && isAtiva && (
          <Animated.View entering={FadeIn.duration(200)}>
            <View style={[styles.trocaIngredienteCard, Shadows.md]}>
              <Ionicons name="swap-horizontal-outline" size={32} color={Colors.warning} />
              <Text style={styles.trocaIngredienteTitle}>TROCA DE INGREDIENTE</Text>
              <Text style={styles.trocaIngredienteCountdown}>
                {fab.trocaIngredienteCountdown}s
              </Text>
              <Text style={styles.trocaIngredienteHint}>
                Aguarde para avancar ao proximo ingrediente...
              </Text>
            </View>
          </Animated.View>
        )}

        {/* BIG Peso Display */}
        {isAtiva && (
          <Animated.View entering={FadeIn.duration(300)}>
            <View style={[styles.pesoCard, Shadows.lg]}>
              <PesoDisplay peso={pesoAtual} estavel={pesoEstavel} />

              {fab.ingredienteAtual && (
                <>
                  <View style={styles.pesoDetails}>
                    <View style={styles.pesoDetailItem}>
                      <Text style={styles.pesoDetailLabel}>Adicionado</Text>
                      <Text style={styles.pesoDetailValue}>
                        {(fab.pesoAdicionado ?? 0).toFixed(1)} kg
                      </Text>
                    </View>
                    <View style={styles.pesoDetailSep} />
                    <View style={styles.pesoDetailItem}>
                      <Text style={styles.pesoDetailLabel}>Falta</Text>
                      <Text style={[styles.pesoDetailValue, { color: Colors.warning }]}>
                        {(fab.pesoFaltante ?? 0).toFixed(1)} kg
                      </Text>
                    </View>
                  </View>

                  {/* Tolerance Bar */}
                  <ToleranceBar
                    pesoAdicionado={fab.pesoAdicionado ?? 0}
                    pesoPrevisto={fab.ingredienteAtual.pesoPrevisto}
                    pesoMinimo={fab.ingredienteAtual.pesoMinimo}
                    pesoMaximo={fab.ingredienteAtual.pesoMaximo}
                  />
                </>
              )}
            </View>
          </Animated.View>
        )}

        {/* Progress bar */}
        {isAtiva && (
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <View style={[styles.progressSection, Shadows.xs]}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Progresso da Fabricacao</Text>
                <Text style={styles.progressPercent}>{((fab.progresso ?? 0) * 100).toFixed(0)}%</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View
                  style={[styles.progressBarFill, { width: `${(fab.progresso ?? 0) * 100}%` }]}
                />
              </View>
            </View>
          </Animated.View>
        )}

        {/* Ingredient List */}
        {fab.ingredientes && fab.ingredientes.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Text style={styles.inputLabel}>Ingredientes</Text>
            <View style={[styles.ingredientesList, Shadows.card]}>
              {fab.ingredientes.map((item, index) => (
                <IngredienteItem
                  key={index}
                  item={item}
                  isAtual={index === (fab.ingredienteAtualIndex ?? -1)}
                  index={index}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* Error */}
        {fab.error && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={20} color={Colors.error} />
            <Text style={styles.errorText}>{fab.error}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.actionsContainer}>
          {isEspera && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.actionButtonPrimary,
                (!selectedReceita || !selectedVagao) && styles.actionButtonDisabled,
                (selectedReceita && selectedVagao) && Shadows.md,
              ]}
              onPress={handleIniciar}
              disabled={!selectedReceita || !selectedVagao || fab.loadingSalvar}
              activeOpacity={0.7}
            >
              {fab.loadingSalvar ? (
                <ActivityIndicator color={Colors.textLight} />
              ) : (
                <>
                  <Ionicons name="play-circle" size={24} color={Colors.textLight} />
                  <Text style={styles.actionButtonText}>Iniciar Fabricacao</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {isAtiva && (
            <View style={styles.activeActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonSuccess, Shadows.sm]}
                onPress={handleProximoIngrediente}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-forward-circle" size={22} color={Colors.textLight} />
                <Text style={styles.actionButtonText}>Proximo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonWarning, Shadows.sm]}
                onPress={handlePausar}
                activeOpacity={0.7}
              >
                <Ionicons name="pause-circle" size={22} color={Colors.textLight} />
                <Text style={styles.actionButtonText}>Pausar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonDanger]}
                onPress={handleCancelar}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={22} color={Colors.error} />
                <Text style={[styles.actionButtonText, { color: Colors.error }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          )}

          {(fab.screen === 'misturar' || fab.status === 'processado') && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonPrimary, Shadows.md]}
              onPress={handleFinalizar}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={24} color={Colors.textLight} />
              <Text style={styles.actionButtonText}>Finalizar Fabricacao</Text>
            </TouchableOpacity>
          )}
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
  headerRight: { flexDirection: 'row', gap: Spacing.md },
  backButton: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.textLight, letterSpacing: -0.3 },
  headerSubtitle: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', fontWeight: FontWeight.medium },

  // Status dot
  statusDotContainer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  // Status badge
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  statusIndicator: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, letterSpacing: 0.5 },

  // Timer
  timerContainer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  timerText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, fontVariant: ['tabular-nums'] },

  // Input / Form
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  selectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    minHeight: 48,
  },
  selectorChipText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  selectorChipSub: { fontSize: FontSize.xxs, color: Colors.textTertiary },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTextSelected: { color: Colors.textLight },

  // Current Ingredient
  currentIngredientCard: {
    backgroundColor: Colors.infoSubtle,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.info,
  },
  currentIngredientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  currentIngredientLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.info, textTransform: 'uppercase', letterSpacing: 0.5 },
  currentIngredientOrdem: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.info },
  currentIngredientNome: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.text },
  currentIngredientPrevisto: { fontSize: FontSize.md, color: Colors.textSecondary, marginTop: Spacing.xs },

  // Peso Display
  pesoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  pesoDisplayContainer: { alignItems: 'center', marginBottom: Spacing.md },
  pesoGrande: {
    fontSize: 64,
    fontWeight: FontWeight.black,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  pesoInstavel: { color: Colors.warning },
  pesoUnidade: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginTop: -Spacing.sm },
  pesoStatusBadge: {
    backgroundColor: Colors.warningSubtle,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xs,
  },
  pesoStatusText: { fontSize: FontSize.xxs, fontWeight: FontWeight.bold, color: Colors.warning, letterSpacing: 0.5 },
  pesoDetails: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  pesoDetailItem: { alignItems: 'center' },
  pesoDetailSep: { width: 1, height: 32, backgroundColor: Colors.borderLight },
  pesoDetailLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3 },
  pesoDetailValue: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.text, marginTop: 2 },

  // Tolerance bar
  toleranceContainer: { width: '100%' },
  toleranceBarBg: {
    height: 12,
    backgroundColor: Colors.borderLight,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  toleranceGreenZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: Colors.success + '30',
    borderRadius: 6,
  },
  toleranceBarFill: { height: '100%', borderRadius: 6 },
  toleranceTargetLine: {
    position: 'absolute',
    top: -2,
    width: 2,
    height: 16,
    backgroundColor: Colors.text,
    borderRadius: 1,
    marginLeft: -1,
  },
  toleranceLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  toleranceLabelText: { fontSize: FontSize.xxs, color: Colors.textTertiary },

  // Progress
  progressSection: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  progressLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  progressPercent: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },
  progressBarBg: {
    height: 8,
    backgroundColor: Colors.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },

  // Ingredients List
  ingredientesList: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  ingredienteItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  ingredienteItemAtual: {
    backgroundColor: Colors.primarySubtle,
  },
  ingredienteLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  ingredienteCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingredienteCheckboxDone: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  ingredienteCheckboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  ingredienteOrdem: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textTertiary },
  ingredienteInfo: { flex: 1 },
  ingredienteNome: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  ingredienteNomeDone: { color: Colors.textTertiary, textDecorationLine: 'line-through' },
  ingredientePeso: { fontSize: FontSize.sm, color: Colors.textSecondary },
  ingredienteRight: { alignItems: 'flex-end' },
  ingredientePesoFabricado: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  ingredienteDiferenca: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  // Error
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.errorSubtle,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  errorText: { flex: 1, fontSize: FontSize.md, color: Colors.error, fontWeight: FontWeight.medium },

  // Actions
  actionsContainer: { marginTop: Spacing.xl, gap: Spacing.sm },
  activeActions: { gap: Spacing.sm },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md + 4,
    minHeight: 56,
  },
  actionButtonPrimary: { backgroundColor: Colors.primary },
  actionButtonSuccess: { backgroundColor: Colors.success },
  actionButtonWarning: { backgroundColor: Colors.warning },
  actionButtonDanger: { backgroundColor: Colors.errorSubtle, borderWidth: 1.5, borderColor: Colors.error },
  actionButtonDisabled: { backgroundColor: Colors.disabled },
  actionButtonText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textLight },

  // Troca de Ingrediente countdown
  trocaIngredienteCard: {
    backgroundColor: Colors.warningSubtle,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginTop: Spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.warning,
  },
  trocaIngredienteTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.extrabold,
    color: Colors.warning,
    marginTop: Spacing.sm,
    letterSpacing: 1,
  },
  trocaIngredienteCountdown: {
    fontSize: 48,
    fontWeight: FontWeight.black,
    color: Colors.warning,
    fontVariant: ['tabular-nums'],
    marginVertical: Spacing.xs,
  },
  trocaIngredienteHint: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Tipo de Uso hint
  tipoUsoHint: {
    fontSize: FontSize.xs,
    color: Colors.warning,
    fontWeight: FontWeight.medium,
    marginTop: Spacing.xs,
    fontStyle: 'italic',
  },

  // Operador empty text
  operadorEmpty: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    marginVertical: Spacing.sm,
  },
});
