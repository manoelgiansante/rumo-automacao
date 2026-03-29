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
  TextInput,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontWeight } from '@/constants/theme';
import { useAutomacaoStore } from '@/stores/automacaoStore';
import {
  getFabricacoesComSobra,
  registrarSobra,
  vincularSobra,
  zerarSobra,
} from '@/services/fabricacaoService';

// ============================================
// Types
// ============================================
interface FabricacaoComSobra {
  id: string;
  lote_fabricacao: string;
  total_sobra_carregado_kg: number;
  data_registro: string;
  receita?: { id: string; nome: string } | null;
  lote_fabricacao_sobra?: string | null;
}

// ============================================
// Main Screen
// ============================================
export default function SobraScreen() {
  const insets = useSafeAreaInsets();
  const [fabricacoes, setFabricacoes] = useState<FabricacaoComSobra[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal for registering sobra manually
  const [registrarModalVisible, setRegistrarModalVisible] = useState(false);
  const [registrarFabId, setRegistrarFabId] = useState<string>('');
  const [registrarSobraKg, setRegistrarSobraKg] = useState<string>('');
  const [savingRegistrar, setSavingRegistrar] = useState(false);

  // Modal for redistribution (linking sobra to new fabricacao)
  const [redistribuirModalVisible, setRedistribuirModalVisible] = useState(false);
  const [selectedSobra, setSelectedSobra] = useState<FabricacaoComSobra | null>(null);
  const [novaFabricacaoId, setNovaFabricacaoId] = useState<string>('');
  const [savingRedistribuir, setSavingRedistribuir] = useState(false);

  const { fazendaAtiva } = useAutomacaoStore();
  const fazenda_id = fazendaAtiva?.fazenda_id ?? '';

  const carregarSobras = useCallback(async () => {
    if (!fazenda_id) {
      setLoading(false);
      return;
    }
    try {
      const data = await getFabricacoesComSobra(fazenda_id);
      setFabricacoes(
        (data ?? []).map((d: any) => ({
          id: d.id,
          lote_fabricacao: d.lote_fabricacao,
          total_sobra_carregado_kg: d.total_sobra_carregado_kg ?? 0,
          data_registro: d.data_registro,
          receita: d.receita ?? null,
          lote_fabricacao_sobra: d.lote_fabricacao_sobra ?? null,
        }))
      );
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao carregar sobras');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fazenda_id]);

  useEffect(() => {
    carregarSobras();
  }, [carregarSobras]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    carregarSobras();
  }, [carregarSobras]);

  // ── Register sobra on an existing fabricacao ──
  const handleRegistrarSobra = useCallback(async () => {
    const sobraKg = parseFloat(registrarSobraKg.replace(',', '.'));
    if (!registrarFabId || isNaN(sobraKg) || sobraKg <= 0) {
      Alert.alert('Atencao', 'Informe uma quantidade de sobra valida.');
      return;
    }
    setSavingRegistrar(true);
    try {
      await registrarSobra(registrarFabId, sobraKg);
      Alert.alert('Sucesso', `Sobra de ${sobraKg.toFixed(1)} kg registrada.`);
      setRegistrarModalVisible(false);
      setRegistrarSobraKg('');
      setRegistrarFabId('');
      carregarSobras();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao registrar sobra');
    } finally {
      setSavingRegistrar(false);
    }
  }, [registrarFabId, registrarSobraKg, carregarSobras]);

  // ── Redistribute sobra ──
  const handleRedistribuir = (fab: FabricacaoComSobra) => {
    setSelectedSobra(fab);
    setNovaFabricacaoId('');
    setRedistribuirModalVisible(true);
  };

  const confirmarRedistribuicao = useCallback(async () => {
    if (!selectedSobra) return;

    Alert.alert(
      'Redistribuir Sobra',
      `Confirma redistribuicao de ${selectedSobra.total_sobra_carregado_kg.toFixed(1)} kg do lote ${selectedSobra.lote_fabricacao}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setSavingRedistribuir(true);
            try {
              // If a target fabricacao is specified, link the sobra
              if (novaFabricacaoId.trim()) {
                await vincularSobra(
                  novaFabricacaoId.trim(),
                  selectedSobra.id,
                  selectedSobra.lote_fabricacao
                );
              }
              // Zero out the sobra on the original fabricacao
              await zerarSobra(selectedSobra.id);

              Alert.alert('Sucesso', 'Sobra redistribuida com sucesso.');
              setRedistribuirModalVisible(false);
              setSelectedSobra(null);
              setNovaFabricacaoId('');
              carregarSobras();
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Erro ao redistribuir sobra');
            } finally {
              setSavingRedistribuir(false);
            }
          },
        },
      ]
    );
  }, [selectedSobra, novaFabricacaoId, carregarSobras]);

  const totalSobra = fabricacoes.reduce((acc, f) => acc + (f.total_sobra_carregado_kg || 0), 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Gestao de Sobras</Text>
            <Text style={styles.headerSubtitle}>Redistribuicao de material</Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
      >
        {/* Summary Card */}
        <Animated.View entering={FadeIn.delay(100)}>
          <View style={[styles.summaryCard, Shadows.sm]}>
            <View style={styles.summaryIcon}>
              <Ionicons name="layers-outline" size={28} color={Colors.warning} />
            </View>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Total de Sobra Acumulada</Text>
              <Text style={styles.summaryValue}>{totalSobra.toFixed(1)} kg</Text>
            </View>
            <View style={styles.summaryBadge}>
              <Text style={styles.summaryBadgeText}>{fabricacoes.length} lotes</Text>
            </View>
          </View>
        </Animated.View>

        {/* List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : fabricacoes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={48} color={Colors.success} />
            <Text style={styles.emptyText}>Nenhuma sobra pendente</Text>
            <Text style={styles.emptySubtext}>Todas as fabricacoes sem sobra</Text>
          </View>
        ) : (
          <View style={styles.sobraList}>
            {fabricacoes.map((fab, index) => (
              <Animated.View key={fab.id} entering={FadeInDown.delay(index * 60).springify()}>
                <View style={[styles.sobraCard, Shadows.xs]}>
                  <View style={[styles.sobraStripe, { backgroundColor: fab.lote_fabricacao_sobra ? Colors.success : Colors.warning }]} />
                  <View style={styles.sobraContent}>
                    <View style={styles.sobraHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sobraLote}>{fab.lote_fabricacao}</Text>
                        <Text style={styles.sobraReceita}>{fab.receita?.nome || 'Receita desconhecida'}</Text>
                      </View>
                      <View style={styles.sobraPesoContainer}>
                        <Text style={styles.sobraPesoValue}>{fab.total_sobra_carregado_kg.toFixed(1)}</Text>
                        <Text style={styles.sobraPesoUnit}>kg</Text>
                      </View>
                    </View>

                    <View style={styles.sobraDetails}>
                      <View style={styles.sobraDetailItem}>
                        <Ionicons name="calendar-outline" size={14} color={Colors.textTertiary} />
                        <Text style={styles.sobraDetailText}>
                          {new Date(fab.data_registro).toLocaleDateString('pt-BR')}
                        </Text>
                      </View>
                      {fab.lote_fabricacao_sobra && (
                        <View style={styles.sobraDetailItem}>
                          <Ionicons name="link-outline" size={14} color={Colors.success} />
                          <Text style={[styles.sobraDetailText, { color: Colors.success }]}>
                            {fab.lote_fabricacao_sobra}
                          </Text>
                        </View>
                      )}
                    </View>

                    {!fab.lote_fabricacao_sobra && (
                      <TouchableOpacity
                        style={styles.redistribuirBtn}
                        onPress={() => handleRedistribuir(fab)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="shuffle-outline" size={16} color={Colors.primary} />
                        <Text style={styles.redistribuirBtnText}>Redistribuir Sobra</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Redistribuir Modal ── */}
      <Modal
        visible={redistribuirModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRedistribuirModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, Shadows.lg]}>
            <Text style={styles.modalTitle}>Redistribuir Sobra</Text>
            {selectedSobra && (
              <>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Lote origem:</Text>
                  <Text style={styles.modalInfoValue}>{selectedSobra.lote_fabricacao}</Text>
                </View>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Sobra:</Text>
                  <Text style={[styles.modalInfoValue, { color: Colors.warning }]}>
                    {selectedSobra.total_sobra_carregado_kg.toFixed(1)} kg
                  </Text>
                </View>
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalInfoLabel}>Receita:</Text>
                  <Text style={styles.modalInfoValue}>{selectedSobra.receita?.nome ?? '-'}</Text>
                </View>

                <Text style={styles.modalFieldLabel}>
                  ID da nova fabricacao (opcional - vincular sobra)
                </Text>
                <TextInput
                  style={styles.modalInput}
                  value={novaFabricacaoId}
                  onChangeText={setNovaFabricacaoId}
                  placeholder="ID da fabricacao destino"
                  placeholderTextColor={Colors.textTertiary}
                  autoCapitalize="none"
                />
                <Text style={styles.modalHint}>
                  Deixe em branco para apenas zerar a sobra do lote original.
                </Text>
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setRedistribuirModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm, savingRedistribuir && styles.actionButtonDisabled]}
                onPress={confirmarRedistribuicao}
                disabled={savingRedistribuir}
                activeOpacity={0.7}
              >
                {savingRedistribuir ? (
                  <ActivityIndicator color={Colors.textLight} size="small" />
                ) : (
                  <Text style={styles.modalBtnConfirmText}>Confirmar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  // Summary
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  summaryIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.warning + '15',
    justifyContent: 'center', alignItems: 'center',
  },
  summaryInfo: { flex: 1 },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3 },
  summaryValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.text, marginTop: 2 },
  summaryBadge: {
    backgroundColor: Colors.warning + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  summaryBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.warning },

  // Loading / Empty
  loadingContainer: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyContainer: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginTop: Spacing.sm },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: Spacing.xs },

  // Sobra List
  sobraList: { gap: Spacing.sm },
  sobraCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  sobraStripe: { width: 4 },
  sobraContent: { flex: 1, padding: Spacing.md },
  sobraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  sobraLote: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  sobraReceita: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, marginTop: 2 },
  sobraPesoContainer: { alignItems: 'flex-end' },
  sobraPesoValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.warning },
  sobraPesoUnit: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium },
  sobraDetails: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  sobraDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sobraDetailText: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium },
  redistribuirBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  redistribuirBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 440,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  modalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  modalInfoLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  modalInfoValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  modalFieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHint: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  modalBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.lg,
    minHeight: 48,
  },
  modalBtnCancel: {
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalBtnCancelText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  modalBtnConfirm: { backgroundColor: Colors.primary },
  modalBtnConfirmText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textLight },
  actionButtonDisabled: { opacity: 0.6 },
});
