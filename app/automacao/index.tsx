import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Colors, FontSize, Spacing, BorderRadius, Shadows, FontWeight } from '@/constants/theme';
import { useAutomacaoStore } from '@/stores/automacaoStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================
// Types
// ============================================
interface DeviceStatus {
  nome: string;
  icon: string;
  conectado: boolean;
}

interface QuickAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  bgColor: string;
  route: string;
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
// KPI Card
// ============================================
function KPICard({
  icon,
  iconLibrary,
  label,
  value,
  subtitle,
  color,
  bgColor,
  index,
  onPress,
}: {
  icon: string;
  iconLibrary?: 'material-community';
  label: string;
  value: string | number;
  subtitle?: string;
  color: string;
  bgColor: string;
  index: number;
  onPress?: () => void;
}) {
  const IconComponent = iconLibrary === 'material-community' ? MaterialCommunityIcons : Ionicons;

  const content = (
    <View style={[styles.kpiCard, Shadows.card, { backgroundColor: bgColor }]}>
      <View style={[styles.kpiAccentLine, { backgroundColor: color }]} />
      <View style={[styles.kpiIconWrap, { backgroundColor: color + '1A' }]}>
        <IconComponent name={icon as never} size={22} color={color} />
      </View>
      <Text
        style={styles.kpiValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      <Text style={styles.kpiLabel} numberOfLines={2}>
        {label}
      </Text>
      {subtitle && (
        <Text style={styles.kpiSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      )}
    </View>
  );

  return (
    <Animated.View
      entering={FadeInDown.delay(80 + index * 60).duration(400).springify()}
      style={styles.kpiCardWrapper}
    >
      {onPress ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
          {content}
        </TouchableOpacity>
      ) : (
        content
      )}
    </Animated.View>
  );
}

// ============================================
// Progress Card
// ============================================
function ProgressCard({
  title,
  icon,
  fornecido,
  previsto,
  color,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  fornecido: number;
  previsto: number;
  color: string;
}) {
  const percentual = previsto > 0 ? (fornecido / previsto) * 100 : 0;

  return (
    <Animated.View entering={FadeInDown.delay(100).springify()}>
      <View style={[styles.progressCard, Shadows.card]}>
        <View style={styles.progressCardHeader}>
          <View style={[styles.progressIconWrap, { backgroundColor: color + '15' }]}>
            <Ionicons name={icon} size={20} color={color} />
          </View>
          <Text style={styles.progressCardTitle}>{title}</Text>
        </View>
        <View style={styles.progressValues}>
          <Text style={styles.progressFornecido}>
            {fornecido.toLocaleString('pt-BR')} <Text style={styles.progressUnit}>kg</Text>
          </Text>
          <Text style={styles.progressSeparator}>/</Text>
          <Text style={styles.progressPrevisto}>
            {previsto.toLocaleString('pt-BR')} kg
          </Text>
        </View>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(percentual, 100)}%`,
                backgroundColor: percentual > 100 ? Colors.warning : color,
              },
            ]}
          />
        </View>
        <Text style={styles.progressPercent}>{percentual.toFixed(1)}% concluido</Text>
      </View>
    </Animated.View>
  );
}

// ============================================
// Quick Actions Grid
// ============================================
const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: 'flask-outline',
    label: 'Iniciar Fabricacao',
    color: Colors.info,
    bgColor: Colors.infoSubtle,
    route: '/automacao/fabricacao',
  },
  {
    icon: 'navigate-outline',
    label: 'Fornecimento',
    color: Colors.primary,
    bgColor: Colors.primarySubtle,
    route: '/automacao/fornecimento-automatico',
  },
  {
    icon: 'settings-outline',
    label: 'Configuracoes',
    color: Colors.warning,
    bgColor: Colors.warningSubtle,
    route: '/automacao/configuracoes',
  },
];

function QuickActionsGrid() {
  return (
    <Animated.View entering={FadeInDown.delay(400).duration(400)}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionIconWrap, { backgroundColor: Colors.secondary + '12' }]}>
            <Ionicons name="flash" size={16} color={Colors.secondary} />
          </View>
          <Text style={styles.sectionTitle}>Acoes Rapidas</Text>
        </View>
      </View>
      <View style={styles.quickActionsGrid}>
        {QUICK_ACTIONS.map((action, index) => (
          <Animated.View
            key={action.route}
            entering={FadeInDown.delay(420 + index * 50).duration(350).springify()}
            style={styles.quickActionWrapper}
          >
            <TouchableOpacity
              onPress={() => router.push(action.route as any)}
              style={styles.quickAction}
              activeOpacity={0.7}
              accessibilityLabel={action.label}
            >
              <View style={[styles.quickActionIconWrap, { backgroundColor: action.bgColor }]}>
                <Ionicons name={action.icon} size={24} color={action.color} />
              </View>
              <Text style={styles.quickActionLabel} numberOfLines={1}>
                {action.label}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

// ============================================
// Dashboard Screen
// ============================================
export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const {
    resumoDiario,
    fabricacaoAtiva,
    carregamentoAtivo,
    fornecimentosDia,
    loading,
    error,
    carregarDadosDia,
  } = useAutomacaoStore();

  // Mock data for demonstration - replace with real store data
  const fornecidoHoje = resumoDiario?.total_fornecido_kg ?? 12500;
  const previstoHoje = resumoDiario?.total_previsto_kg ?? 18200;
  const fabricacoesAndamento = fabricacaoAtiva ? 1 : 0;
  const fabricacoesCompletadas = resumoDiario?.fabricacoes_completadas ?? 3;
  const ultimoFornecimentoCurral = fornecimentosDia.length > 0
    ? fornecimentosDia[fornecimentosDia.length - 1]
    : null;

  // Device statuses (mock - replace with real hardware status)
  const deviceStatuses: DeviceStatus[] = [
    { nome: 'Balanca', icon: 'scale-outline', conectado: true },
    { nome: 'RFID', icon: 'radio-outline', conectado: true },
    { nome: 'Display', icon: 'tv-outline', conectado: false },
  ];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Replace 'fazenda-id' with actual fazenda_id from auth
      await carregarDadosDia('fazenda-id');
    } catch {
      // Error handled in store
    }
    setRefreshing(false);
  }, [carregarDadosDia]);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
          <View style={styles.headerContent}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerGreetingBlock}>
                <Text style={styles.greetingText}>Rumo Automacao</Text>
                <Text style={styles.greetingName}>Dashboard</Text>
              </View>
              <TouchableOpacity
                style={styles.headerIconBtn}
                activeOpacity={0.7}
                onPress={() => router.push('/automacao/dispositivos' as any)}
              >
                <Ionicons name="hardware-chip-outline" size={22} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
            </View>

            {/* Device Status Bar */}
            <View style={styles.deviceStatusBar}>
              {deviceStatuses.map((d) => (
                <StatusDot key={d.nome} conectado={d.conectado} label={d.nome} />
              ))}
            </View>
          </View>
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Carregando dados...</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.errorCard}>
            <Ionicons name="alert-circle" size={20} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
        )}

        {/* Fornecido Hoje Progress */}
        <View style={styles.cardSection}>
          <ProgressCard
            title="Fornecido Hoje"
            icon="nutrition-outline"
            fornecido={fornecidoHoje}
            previsto={previstoHoje}
            color={Colors.primary}
          />
        </View>

        {/* KPI Cards */}
        <Animated.View entering={FadeIn.delay(200)} style={styles.kpiGrid}>
          <KPICard
            icon="flask-outline"
            label="Fabricacao"
            value={`${fabricacoesAndamento} / ${fabricacoesCompletadas}`}
            subtitle={fabricacaoAtiva ? 'Em andamento' : 'Nenhuma ativa'}
            color={Colors.info}
            bgColor={Colors.cardBlue}
            index={0}
            onPress={() => router.push('/automacao/fabricacao' as any)}
          />
          <KPICard
            icon="cube-outline"
            label="Carregamento"
            value={carregamentoAtivo ? `${(carregamentoAtivo as any).peso_balancao_saida ?? 0} kg` : 'Nenhum'}
            subtitle={carregamentoAtivo ? (carregamentoAtivo as any).vagao?.nome ?? 'Vagao' : 'Sem carregamento'}
            color={Colors.warning}
            bgColor={Colors.cardAmber}
            index={1}
          />
          <KPICard
            icon="checkmark-done-outline"
            label="Ultimo Fornecimento"
            value={ultimoFornecimentoCurral
              ? `${(ultimoFornecimentoCurral as any).fornecido_kg?.toFixed(0) ?? '0'} kg`
              : '--'}
            subtitle={ultimoFornecimentoCurral
              ? (ultimoFornecimentoCurral as any).curral?.nome ?? 'Curral'
              : 'Nenhum hoje'}
            color={Colors.success}
            bgColor={Colors.cardGreen}
            index={2}
          />
          <KPICard
            icon="hardware-chip-outline"
            label="Dispositivos"
            value={`${deviceStatuses.filter(d => d.conectado).length}/${deviceStatuses.length}`}
            subtitle="Conectados"
            color={deviceStatuses.every(d => d.conectado) ? Colors.success : Colors.warning}
            bgColor={deviceStatuses.every(d => d.conectado) ? Colors.cardGreen : Colors.cardAmber}
            index={3}
            onPress={() => router.push('/automacao/dispositivos' as any)}
          />
        </Animated.View>

        {/* Quick Actions */}
        <QuickActionsGrid />

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// ============================================
// Styles
// ============================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingBottom: Spacing.xxl },

  // Header
  header: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  headerContent: { zIndex: 1 },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerGreetingBlock: { flex: 1 },
  greetingText: {
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: FontWeight.medium,
  },
  greetingName: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extrabold,
    color: Colors.textLight,
    letterSpacing: -0.3,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceStatusBar: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },

  // Status dot
  statusDotContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },

  // Loading
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },

  // Error
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.errorSubtle,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.error,
    fontWeight: FontWeight.medium,
  },

  // Card section
  cardSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },

  // Progress card
  progressCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
  },
  progressCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  progressIconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCardTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  progressValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  progressFornecido: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
  },
  progressUnit: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  progressSeparator: {
    fontSize: FontSize.xl,
    color: Colors.textTertiary,
  },
  progressPrevisto: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: Colors.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
    fontWeight: FontWeight.medium,
  },

  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  kpiCardWrapper: {
    width: (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm) / 2,
  },
  kpiCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    overflow: 'hidden',
    position: 'relative',
  },
  kpiAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  kpiIconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  kpiValue: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    marginBottom: 2,
  },
  kpiLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  kpiSubtitle: {
    fontSize: FontSize.xxs,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // Sections
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },

  // Quick Actions
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  quickActionWrapper: {
    width: (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm * 2) / 3,
  },
  quickAction: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...Shadows.xs,
  },
  quickActionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  quickActionLabel: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
});
