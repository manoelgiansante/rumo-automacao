import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontWeight } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { VetAutoSyncLog, SyncEntidade } from '@/services/sincronismoService';

// ============================================
// Types
// ============================================
interface PendingCounts {
  fabricacoes: number;
  fornecimentos: number;
  safe_points: number;
}

interface SyncLogEntry {
  id: string;
  entidade: SyncEntidade;
  direcao: 'upload' | 'download';
  total_registros: number;
  registros_sucesso: number;
  registros_erro: number;
  status: string;
  mensagem: string | null;
  data_sync: string;
}

const ENTIDADE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  fabricacoes: { label: 'Fabricacoes', icon: 'flask-outline', color: Colors.info },
  fornecimentos: { label: 'Fornecimentos', icon: 'car-outline', color: Colors.primary },
  safe_points: { label: 'Safe Points', icon: 'shield-checkmark-outline', color: Colors.success },
  previsoes: { label: 'Previsoes', icon: 'calendar-outline', color: Colors.warning },
  receitas: { label: 'Receitas', icon: 'document-text-outline', color: Colors.info },
  dispositivos: { label: 'Dispositivos', icon: 'hardware-chip-outline', color: Colors.textSecondary },
};

// ============================================
// Main Screen
// ============================================
export default function SincronismoScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>({
    fabricacoes: 0,
    fornecimentos: 0,
    safe_points: 0,
  });
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [isOnline, setIsOnline] = useState(true);

  // TODO: pegar fazenda_id do contexto/store global
  const fazenda_id = '';

  const carregarDados = useCallback(async () => {
    if (!fazenda_id) {
      setLoading(false);
      return;
    }
    try {
      // Buscar ultimo sync
      const { data: lastSync } = await supabase
        .from('vet_auto_sync_logs')
        .select('data_sync')
        .eq('fazenda_id', fazenda_id)
        .eq('status', 'sincronizado')
        .order('data_sync', { ascending: false })
        .limit(1)
        .single();

      if (lastSync) {
        setLastSyncDate(lastSync.data_sync);
      }

      // Contar pendentes
      const [fabRes, fornRes, spRes] = await Promise.all([
        supabase
          .from('vet_auto_fabricacoes')
          .select('id', { count: 'exact', head: true })
          .eq('fazenda_id', fazenda_id)
          .eq('flag_sync', false),
        supabase
          .from('vet_auto_fornecimentos')
          .select('id', { count: 'exact', head: true })
          .eq('flag_sync', false),
        supabase
          .from('vet_auto_safe_points')
          .select('id', { count: 'exact', head: true })
          .eq('fazenda_id', fazenda_id)
          .eq('flag_sync', false),
      ]);

      setPendingCounts({
        fabricacoes: fabRes.count ?? 0,
        fornecimentos: fornRes.count ?? 0,
        safe_points: spRes.count ?? 0,
      });

      // Buscar logs recentes
      const { data: logs } = await supabase
        .from('vet_auto_sync_logs')
        .select('*')
        .eq('fazenda_id', fazenda_id)
        .order('data_sync', { ascending: false })
        .limit(20);

      setSyncLogs((logs ?? []) as SyncLogEntry[]);

      // Verificar conexao
      setIsOnline(true);
    } catch (err: any) {
      setIsOnline(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fazenda_id]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    carregarDados();
  }, [carregarDados]);

  const handleSyncNow = async () => {
    if (!isOnline) {
      Alert.alert('Sem Conexao', 'Verifique sua conexao com a internet');
      return;
    }

    const totalPending = pendingCounts.fabricacoes + pendingCounts.fornecimentos + pendingCounts.safe_points;
    if (totalPending === 0) {
      Alert.alert('Informacao', 'Nenhum registro pendente de sincronizacao');
      return;
    }

    try {
      setSyncing(true);
      setSyncProgress(0);

      // Simular progresso de sync
      const steps = ['fabricacoes', 'fornecimentos', 'safe_points'];
      for (let i = 0; i < steps.length; i++) {
        setSyncProgress(((i + 1) / steps.length) * 100);

        // Marcar registros como sincronizados
        const table = steps[i] === 'fabricacoes' ? 'vet_auto_fabricacoes' :
                      steps[i] === 'fornecimentos' ? 'vet_auto_fornecimentos' :
                      'vet_auto_safe_points';

        const query = supabase.from(table).update({
          flag_sync: true,
          updated_at: new Date().toISOString(),
        }).eq('flag_sync', false);

        if (steps[i] !== 'fornecimentos') {
          query.eq('fazenda_id', fazenda_id);
        }

        await query;

        // Registrar log
        await supabase.from('vet_auto_sync_logs').insert({
          fazenda_id,
          entidade: steps[i],
          direcao: 'upload',
          total_registros: steps[i] === 'fabricacoes' ? pendingCounts.fabricacoes :
                           steps[i] === 'fornecimentos' ? pendingCounts.fornecimentos :
                           pendingCounts.safe_points,
          registros_sucesso: steps[i] === 'fabricacoes' ? pendingCounts.fabricacoes :
                             steps[i] === 'fornecimentos' ? pendingCounts.fornecimentos :
                             pendingCounts.safe_points,
          registros_erro: 0,
          registros_conflito: 0,
          status: 'sincronizado',
          mensagem: 'Sincronizacao concluida',
          data_sync: new Date().toISOString(),
        });
      }

      Alert.alert('Sucesso', 'Sincronizacao concluida com sucesso');
      carregarDados();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro durante sincronizacao');
    } finally {
      setSyncing(false);
      setSyncProgress(0);
    }
  };

  const totalPending = pendingCounts.fabricacoes + pendingCounts.fornecimentos + pendingCounts.safe_points;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Sincronismo</Text>
            <Text style={styles.headerSubtitle}>Gerenciamento de sync</Text>
          </View>
        </View>
        <View style={[styles.connectionBadge, { backgroundColor: isOnline ? Colors.success + '20' : Colors.error + '20' }]}>
          <View style={[styles.connectionDot, { backgroundColor: isOnline ? Colors.success : Colors.error }]} />
          <Text style={[styles.connectionText, { color: isOnline ? Colors.success : Colors.error }]}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <>
            {/* Last Sync */}
            <Animated.View entering={FadeIn.delay(100)}>
              <View style={[styles.lastSyncCard, Shadows.sm]}>
                <View style={styles.lastSyncIcon}>
                  <Ionicons name="sync-outline" size={28} color={Colors.primary} />
                </View>
                <View style={styles.lastSyncInfo}>
                  <Text style={styles.lastSyncLabel}>Ultima Sincronizacao</Text>
                  <Text style={styles.lastSyncValue}>
                    {lastSyncDate
                      ? new Date(lastSyncDate).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })
                      : 'Nunca sincronizado'}
                  </Text>
                </View>
              </View>
            </Animated.View>

            {/* Pending Counts */}
            <Animated.View entering={FadeInDown.delay(200).springify()}>
              <Text style={styles.sectionTitle}>Registros Pendentes</Text>
              <View style={styles.pendingGrid}>
                {[
                  { key: 'fabricacoes', count: pendingCounts.fabricacoes },
                  { key: 'fornecimentos', count: pendingCounts.fornecimentos },
                  { key: 'safe_points', count: pendingCounts.safe_points },
                ].map((item) => {
                  const config = ENTIDADE_CONFIG[item.key];
                  return (
                    <View key={item.key} style={[styles.pendingCard, Shadows.xs]}>
                      <View style={[styles.pendingIcon, { backgroundColor: config.color + '15' }]}>
                        <Ionicons name={config.icon as any} size={20} color={config.color} />
                      </View>
                      <Text style={styles.pendingCount}>{item.count}</Text>
                      <Text style={styles.pendingLabel}>{config.label}</Text>
                    </View>
                  );
                })}
              </View>
            </Animated.View>

            {/* Sync Button */}
            <Animated.View entering={FadeInDown.delay(300).springify()}>
              <TouchableOpacity
                style={[
                  styles.syncButton,
                  (syncing || totalPending === 0) && styles.syncButtonDisabled,
                ]}
                onPress={handleSyncNow}
                disabled={syncing || totalPending === 0}
                activeOpacity={0.7}
              >
                {syncing ? (
                  <View style={styles.syncingContent}>
                    <ActivityIndicator color={Colors.textLight} />
                    <Text style={styles.syncButtonText}>Sincronizando... {syncProgress.toFixed(0)}%</Text>
                    <View style={styles.progressBarContainer}>
                      <View style={[styles.progressBar, { width: `${syncProgress}%` }]} />
                    </View>
                  </View>
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={22} color={Colors.textLight} />
                    <Text style={styles.syncButtonText}>
                      {totalPending === 0 ? 'Tudo Sincronizado' : `Sincronizar Agora (${totalPending} pendentes)`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>

            {/* Sync Log */}
            <Text style={styles.sectionTitle}>Historico de Sincronizacao</Text>
            {syncLogs.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={40} color={Colors.textTertiary} />
                <Text style={styles.emptyText}>Nenhum registro de sync</Text>
              </View>
            ) : (
              <View style={styles.logList}>
                {syncLogs.map((log, index) => {
                  const config = ENTIDADE_CONFIG[log.entidade] || ENTIDADE_CONFIG.fabricacoes;
                  const isSuccess = log.status === 'sincronizado';
                  return (
                    <Animated.View key={log.id} entering={FadeInDown.delay(400 + index * 40).springify()}>
                      <View style={[styles.logCard, Shadows.xs]}>
                        <View style={[styles.logIcon, { backgroundColor: isSuccess ? Colors.success + '15' : Colors.error + '15' }]}>
                          <Ionicons
                            name={isSuccess ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                            size={18}
                            color={isSuccess ? Colors.success : Colors.error}
                          />
                        </View>
                        <View style={styles.logInfo}>
                          <View style={styles.logHeader}>
                            <Text style={styles.logEntidade}>{config.label}</Text>
                            <View style={styles.logDirecaoBadge}>
                              <Ionicons
                                name={log.direcao === 'upload' ? 'cloud-upload-outline' : 'cloud-download-outline'}
                                size={12}
                                color={Colors.textTertiary}
                              />
                              <Text style={styles.logDirecaoText}>
                                {log.direcao === 'upload' ? 'Upload' : 'Download'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.logDetails}>
                            {log.registros_sucesso}/{log.total_registros} registros
                            {log.registros_erro > 0 ? ` | ${log.registros_erro} erros` : ''}
                          </Text>
                          <Text style={styles.logDate}>
                            {new Date(log.data_sync).toLocaleString('pt-BR', {
                              day: '2-digit', month: '2-digit',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </Text>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            )}
          </>
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
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },

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
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.lg,
  },
  connectionDot: { width: 8, height: 8, borderRadius: 4 },
  connectionText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  // Section
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  // Last Sync
  lastSyncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  lastSyncIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center', alignItems: 'center',
  },
  lastSyncInfo: { flex: 1 },
  lastSyncLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3 },
  lastSyncValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, marginTop: 2 },

  // Pending
  pendingGrid: { flexDirection: 'row', gap: Spacing.sm },
  pendingCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    alignItems: 'center',
  },
  pendingIcon: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  pendingCount: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.text },
  pendingLabel: { fontSize: FontSize.xxs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2, textAlign: 'center' },

  // Sync Button
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md + 2,
    marginTop: Spacing.md,
  },
  syncButtonDisabled: { opacity: 0.5 },
  syncButtonText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textLight },
  syncingContent: { alignItems: 'center', gap: Spacing.sm, width: '100%', paddingHorizontal: Spacing.lg },
  progressBarContainer: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.textLight,
    borderRadius: 2,
  },

  // Loading / Empty
  loadingContainer: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyContainer: { alignItems: 'center', paddingVertical: Spacing.xl },
  emptyText: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: Spacing.sm },

  // Log List
  logList: { gap: Spacing.sm },
  logCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  logIcon: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  logInfo: { flex: 1 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logEntidade: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  logDirecaoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  logDirecaoText: { fontSize: FontSize.xxs, color: Colors.textTertiary, fontWeight: FontWeight.medium },
  logDetails: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium, marginTop: 2 },
  logDate: { fontSize: FontSize.xxs, color: Colors.textTertiary, marginTop: 2 },
});
