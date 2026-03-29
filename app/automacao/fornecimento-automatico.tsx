import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { useFornecimento } from '@/hooks/useFornecimento';

const SCREEN_WIDTH = Dimensions.get('window').width;

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
// Peso Display
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
    </Animated.View>
  );
}

// ============================================
// RFID Status Indicator
// ============================================
function RfidStatusIndicator({
  status,
  curralNome,
}: {
  status: 'searching' | 'tag_lida' | 'curral_identificado';
  curralNome?: string;
}) {
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    if (status === 'searching') {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      pulseAnim.value = withSpring(1);
    }
  }, [status]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const color = useMemo(() => {
    switch (status) {
      case 'searching': return Colors.warning;
      case 'tag_lida': return Colors.info;
      case 'curral_identificado': return Colors.success;
    }
  }, [status]);

  const label = useMemo(() => {
    switch (status) {
      case 'searching': return 'Buscando tag RFID...';
      case 'tag_lida': return 'Tag lida!';
      case 'curral_identificado': return `Curral: ${curralNome}`;
    }
  }, [status, curralNome]);

  return (
    <View style={[styles.rfidStatus, { backgroundColor: color + '12' }]}>
      <Animated.View style={pulseStyle}>
        <Ionicons
          name={status === 'searching' ? 'radio-outline' : status === 'tag_lida' ? 'scan-outline' : 'checkmark-circle'}
          size={24}
          color={color}
        />
      </Animated.View>
      <Text style={[styles.rfidStatusText, { color }]}>{label}</Text>
    </View>
  );
}

// ============================================
// Fornecimento Item (completed delivery)
// ============================================
function FornecimentoItem({
  curralNome,
  fornecidoKg,
  previstoKg,
  index,
}: {
  curralNome: string;
  fornecidoKg: number;
  previstoKg: number;
  index: number;
}) {
  const diferenca = fornecidoKg - previstoKg;
  const diferencaPct = previstoKg > 0 ? (diferenca / previstoKg) * 100 : 0;
  const absPct = Math.abs(diferencaPct);
  const diffColor = absPct <= 5 ? Colors.success : absPct <= 15 ? Colors.warning : Colors.error;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <View style={styles.fornecimentoItem}>
        <View style={styles.fornecimentoItemLeft}>
          <View style={[styles.fornecimentoCheckmark, { backgroundColor: Colors.success + '15' }]}>
            <Ionicons name="checkmark" size={14} color={Colors.success} />
          </View>
          <View>
            <Text style={styles.fornecimentoItemCurral}>{curralNome}</Text>
            <Text style={styles.fornecimentoItemPrevisto}>
              Previsto: {previstoKg.toLocaleString('pt-BR')} kg
            </Text>
          </View>
        </View>
        <View style={styles.fornecimentoItemRight}>
          <Text style={styles.fornecimentoItemKg}>
            {fornecidoKg.toLocaleString('pt-BR')} kg
          </Text>
          <View style={[styles.fornecimentoItemDiffBadge, { backgroundColor: diffColor + '15' }]}>
            <Text style={[styles.fornecimentoItemDiffText, { color: diffColor }]}>
              {diferenca > 0 ? '+' : ''}{diferenca.toFixed(0)} ({diferencaPct.toFixed(1)}%)
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ============================================
// Main Screen
// ============================================
export default function FornecimentoAutomaticoScreen() {
  const insets = useSafeAreaInsets();

  const forn = useFornecimento({
    autoCapturaInicial: true,
    autoCapturaFinal: true,
    vibrarAlerta: true,
    onCurralDetectado: (curral, tipo) => {
      // Feedback handled by RFID status indicator
    },
    onFornecimentoRegistrado: (fornecido) => {
      Alert.alert('Fornecido', `${fornecido.curral?.nome}: ${fornecido.fornecido_kg.toFixed(0)} kg`);
    },
    onCurralNaoEncontrado: (tag) => {
      Alert.alert('Tag Desconhecida', `A tag "${tag}" nao corresponde a nenhum curral cadastrado.`);
    },
  });

  const pesoEstavel = forn.hardware?.status?.pesoEstavel ?? true;
  const balancaConectada = forn.hardware?.conectado ?? false;
  const rfidConectado = forn.hardware?.status?.rfidConectado ?? false;
  const pesoAtual = forn.pesoDisplay ?? 0;

  // RFID status
  const rfidDisplayStatus = useMemo(() => {
    if (forn.curralAtual) return 'curral_identificado' as const;
    if (forn.hardware?.status?.ultimaTagRfid) return 'tag_lida' as const;
    return 'searching' as const;
  }, [forn.curralAtual, forn.hardware?.status?.ultimaTagRfid]);

  // Carregamento info
  const carregamento = forn.carregamentoAtivo;
  const vagaoNome = (carregamento as any)?.vagao?.nome ?? 'Vagao';
  const totalCarregado = (carregamento as any)?.peso_balancao_saida ?? 0;
  const numeroTrato = (carregamento as any)?.numero_trato ?? 1;

  // Current curral fornecimento
  const fornecimentoAtual = forn.fornecimentoAtual;
  const curralNome = fornecimentoAtual?.curral?.nome ?? '--';
  const previstoCurral = fornecimentoAtual?.previsto?.previsto_kg ?? 0;
  const fornecidoAtual = forn.fornecidoAtual ?? 0;

  const handleFinalizarCarregamento = useCallback(() => {
    Alert.alert(
      'Finalizar Carregamento',
      `Total fornecido: ${forn.totalFornecido.toLocaleString('pt-BR')} kg\nDeseja finalizar?`,
      [
        { text: 'Nao', style: 'cancel' },
        {
          text: 'Sim, Finalizar',
          onPress: async () => {
            try {
              await forn.finalizarCarregamento(pesoAtual);
              Alert.alert('Sucesso', 'Carregamento finalizado.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch {
              Alert.alert('Erro', 'Nao foi possivel finalizar.');
            }
          },
        },
      ]
    );
  }, [forn, pesoAtual]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Fornecimento Auto</Text>
            <Text style={styles.headerSubtitle}>Deteccao por RFID</Text>
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
        {/* Carregamento Info */}
        {carregamento && (
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <View style={[styles.carregamentoCard, Shadows.card]}>
              <View style={styles.carregamentoRow}>
                <View style={styles.carregamentoItem}>
                  <MaterialCommunityIcons name="truck-outline" size={18} color={Colors.info} />
                  <Text style={styles.carregamentoLabel}>Vagao</Text>
                  <Text style={styles.carregamentoValue}>{vagaoNome}</Text>
                </View>
                <View style={styles.carregamentoSep} />
                <View style={styles.carregamentoItem}>
                  <Ionicons name="layers-outline" size={18} color={Colors.warning} />
                  <Text style={styles.carregamentoLabel}>Trato</Text>
                  <Text style={styles.carregamentoValue}>{numeroTrato}</Text>
                </View>
                <View style={styles.carregamentoSep} />
                <View style={styles.carregamentoItem}>
                  <Ionicons name="scale-outline" size={18} color={Colors.primary} />
                  <Text style={styles.carregamentoLabel}>Carregado</Text>
                  <Text style={styles.carregamentoValue}>{totalCarregado.toLocaleString('pt-BR')} kg</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        )}

        {/* BIG Peso Display */}
        <Animated.View entering={FadeIn.duration(300)}>
          <View style={[styles.pesoCard, Shadows.lg]}>
            <PesoDisplay peso={pesoAtual} estavel={pesoEstavel} />
          </View>
        </Animated.View>

        {/* RFID Status */}
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <RfidStatusIndicator
            status={rfidDisplayStatus}
            curralNome={forn.curralAtual?.nome}
          />
        </Animated.View>

        {/* Current Curral (active fornecimento) */}
        {fornecimentoAtual && (
          <Animated.View entering={FadeIn.duration(300)}>
            <View style={[styles.curralCard, Shadows.md]}>
              <View style={styles.curralCardHeader}>
                <Text style={styles.curralCardLabel}>Curral Atual</Text>
                <View style={[styles.curralStatusBadge, { backgroundColor: Colors.success + '15' }]}>
                  <Text style={[styles.curralStatusText, { color: Colors.success }]}>FORNECENDO</Text>
                </View>
              </View>
              <Text style={styles.curralCardNome}>{curralNome}</Text>

              {/* Peso progress */}
              <View style={styles.curralPesoRow}>
                <View style={styles.curralPesoItem}>
                  <Text style={styles.curralPesoLabel}>Peso Inicial</Text>
                  <Text style={styles.curralPesoValue}>
                    {fornecimentoAtual.pesoInicial.toLocaleString('pt-BR')} kg
                  </Text>
                </View>
                <View style={styles.curralPesoArrow}>
                  <Ionicons name="arrow-forward" size={20} color={Colors.textTertiary} />
                </View>
                <View style={styles.curralPesoItem}>
                  <Text style={styles.curralPesoLabel}>Peso Atual</Text>
                  <Text style={styles.curralPesoValue}>
                    {pesoAtual.toLocaleString('pt-BR')} kg
                  </Text>
                </View>
              </View>

              <View style={styles.curralFornecidoRow}>
                <Text style={styles.curralFornecidoLabel}>Fornecido:</Text>
                <Text style={styles.curralFornecidoValue}>
                  {fornecidoAtual.toFixed(0)} kg
                </Text>
                {previstoCurral > 0 && (
                  <Text style={styles.curralFornecidoPrevisto}>
                    / {previstoCurral.toLocaleString('pt-BR')} kg previsto
                  </Text>
                )}
              </View>

              {/* Progress bar */}
              {previstoCurral > 0 && (
                <View style={styles.curralProgressBg}>
                  <View
                    style={[
                      styles.curralProgressFill,
                      {
                        width: `${Math.min((fornecidoAtual / previstoCurral) * 100, 100)}%`,
                        backgroundColor: fornecidoAtual > previstoCurral ? Colors.warning : Colors.primary,
                      },
                    ]}
                  />
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* Running Totals */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <View style={[styles.totalsCard, Shadows.card]}>
            <View style={styles.totalsRow}>
              <View style={styles.totalsItem}>
                <Text style={styles.totalsLabel}>Total Fornecido</Text>
                <Text style={styles.totalsValue}>
                  {forn.totalFornecido.toLocaleString('pt-BR')} kg
                </Text>
              </View>
              <View style={styles.totalsSep} />
              <View style={styles.totalsItem}>
                <Text style={styles.totalsLabel}>Restante</Text>
                <Text style={[styles.totalsValue, { color: Colors.warning }]}>
                  {forn.pesoRestante.toLocaleString('pt-BR')} kg
                </Text>
              </View>
            </View>
            <View style={styles.totalsProgressBg}>
              <View
                style={[
                  styles.totalsProgressFill,
                  { width: `${Math.min(forn.percentualRealizado, 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.totalsPercent}>
              {forn.percentualRealizado.toFixed(1)}% do total fornecido
            </Text>
          </View>
        </Animated.View>

        {/* Safe Point Readings */}
        {(forn.hardware?.status as any)?.safePoints && (
          <Animated.View entering={FadeInDown.delay(350).springify()}>
            <View style={[styles.safePointCard, Shadows.xs]}>
              <View style={styles.safePointHeader}>
                <Ionicons name="shield-checkmark-outline" size={18} color={Colors.info} />
                <Text style={styles.safePointTitle}>Safe Points</Text>
              </View>
              <Text style={styles.safePointText}>Leituras de safe point ativas</Text>
            </View>
          </Animated.View>
        )}

        {/* Fornecimentos List */}
        {forn.fornecimentos.length > 0 && (
          <Animated.View entering={FadeInDown.delay(400).springify()}>
            <Text style={styles.inputLabel}>Fornecimentos Realizados ({forn.fornecimentos.length})</Text>
            <View style={[styles.fornecimentosList, Shadows.card]}>
              {forn.fornecimentos.map((f, index) => (
                <FornecimentoItem
                  key={(f as any).id ?? index}
                  curralNome={(f as any).curral?.nome ?? 'Curral'}
                  fornecidoKg={(f as any).fornecido_kg ?? 0}
                  previstoKg={(f as any).previsto_kg ?? 0}
                  index={index}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* Error */}
        {forn.error && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={20} color={Colors.error} />
            <Text style={styles.errorText}>{forn.error}</Text>
          </View>
        )}

        {/* Finalizar Button */}
        {carregamento && (
          <Animated.View entering={FadeInDown.delay(500).springify()} style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.finalizarButton, Shadows.md]}
              onPress={handleFinalizarCarregamento}
              disabled={forn.loadingSalvar}
              activeOpacity={0.7}
            >
              {forn.loadingSalvar ? (
                <ActivityIndicator color={Colors.textLight} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={24} color={Colors.textLight} />
                  <Text style={styles.finalizarButtonText}>Finalizar Carregamento</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
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

  // Carregamento
  carregamentoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  carregamentoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  carregamentoItem: { alignItems: 'center', gap: Spacing.xxs },
  carregamentoSep: { width: 1, height: 40, backgroundColor: Colors.borderLight },
  carregamentoLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3 },
  carregamentoValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },

  // Peso Display
  pesoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  pesoDisplayContainer: { alignItems: 'center' },
  pesoGrande: {
    fontSize: 64,
    fontWeight: FontWeight.black,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  pesoInstavel: { color: Colors.warning },
  pesoUnidade: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginTop: -Spacing.sm },

  // RFID Status
  rfidStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  rfidStatusText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold },

  // Current Curral
  curralCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  curralCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  curralCardLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  curralStatusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xxs, borderRadius: BorderRadius.full },
  curralStatusText: { fontSize: FontSize.xxs, fontWeight: FontWeight.bold, letterSpacing: 0.5 },
  curralCardNome: { fontSize: FontSize.xxxl, fontWeight: FontWeight.extrabold, color: Colors.text, marginBottom: Spacing.sm },
  curralPesoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  curralPesoItem: { alignItems: 'center', flex: 1 },
  curralPesoArrow: { paddingHorizontal: Spacing.sm },
  curralPesoLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase' },
  curralPesoValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, marginTop: 2 },
  curralFornecidoRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  curralFornecidoLabel: { fontSize: FontSize.md, color: Colors.textSecondary },
  curralFornecidoValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.primary },
  curralFornecidoPrevisto: { fontSize: FontSize.sm, color: Colors.textTertiary },
  curralProgressBg: { height: 8, backgroundColor: Colors.borderLight, borderRadius: 4, overflow: 'hidden' },
  curralProgressFill: { height: '100%', borderRadius: 4 },

  // Totals
  totalsCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: Spacing.sm },
  totalsItem: { alignItems: 'center' },
  totalsSep: { width: 1, height: 40, backgroundColor: Colors.borderLight },
  totalsLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3 },
  totalsValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.text, marginTop: 2 },
  totalsProgressBg: { height: 8, backgroundColor: Colors.borderLight, borderRadius: 4, overflow: 'hidden' },
  totalsProgressFill: { height: '100%', borderRadius: 4, backgroundColor: Colors.primary },
  totalsPercent: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: Spacing.xs, fontWeight: FontWeight.medium },

  // Safe Point
  safePointCard: {
    backgroundColor: Colors.infoSubtle,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  safePointHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  safePointTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.info },
  safePointText: { fontSize: FontSize.sm, color: Colors.textSecondary },

  // Fornecimentos List
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  fornecimentosList: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  fornecimentoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  fornecimentoItemLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  fornecimentoCheckmark: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  fornecimentoItemCurral: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  fornecimentoItemPrevisto: { fontSize: FontSize.sm, color: Colors.textSecondary },
  fornecimentoItemRight: { alignItems: 'flex-end' },
  fornecimentoItemKg: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  fornecimentoItemDiffBadge: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xxs, borderRadius: BorderRadius.full, marginTop: 2 },
  fornecimentoItemDiffText: { fontSize: FontSize.xxs, fontWeight: FontWeight.bold },

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
  actionsContainer: { marginTop: Spacing.xl },
  finalizarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md + 4,
    minHeight: 60,
  },
  finalizarButtonText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textLight },
});
