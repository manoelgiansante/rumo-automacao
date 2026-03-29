import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontWeight } from '@/constants/theme';
import {
  getOrdens,
  createOrdem,
  updateOrdemStatus,
} from '@/services/ordemProducaoService';
import type {
  OrdemProducaoComDetalhes,
  StatusOrdemProducao,
} from '@/services/ordemProducaoService';
import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================
interface ReceitaOption {
  id: string;
  nome: string;
}

const STATUS_CONFIG: Record<StatusOrdemProducao, { label: string; color: string; icon: string }> = {
  aguardando: { label: 'Aguardando', color: Colors.warning, icon: 'time-outline' },
  produzindo: { label: 'Produzindo', color: Colors.info, icon: 'flask-outline' },
  encerrado: { label: 'Encerrado', color: Colors.success, icon: 'checkmark-circle-outline' },
  cancelado: { label: 'Cancelado', color: Colors.error, icon: 'close-circle-outline' },
};

const STATUS_FILTERS: (StatusOrdemProducao | 'todos')[] = ['todos', 'aguardando', 'produzindo', 'encerrado', 'cancelado'];

// ============================================
// Main Screen
// ============================================
export default function OrdemProducaoScreen() {
  const insets = useSafeAreaInsets();
  const [ordens, setOrdens] = useState<OrdemProducaoComDetalhes[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusOrdemProducao | 'todos'>('todos');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create form state
  const [receitas, setReceitas] = useState<ReceitaOption[]>([]);
  const [selectedReceita, setSelectedReceita] = useState<string>('');
  const [previstoKg, setPrevistoKg] = useState('');
  const [dataProducao, setDataProducao] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  // TODO: pegar fazenda_id do contexto/store global
  const fazenda_id = '';

  const carregarOrdens = useCallback(async () => {
    if (!fazenda_id) {
      setLoading(false);
      return;
    }
    try {
      const filters = statusFilter !== 'todos' ? { status: statusFilter } : undefined;
      const lista = await getOrdens(fazenda_id, filters);
      setOrdens(lista);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao carregar ordens');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fazenda_id, statusFilter]);

  const carregarReceitas = useCallback(async () => {
    if (!fazenda_id) return;
    try {
      const { data } = await supabase
        .from('vet_auto_receitas')
        .select('id, nome')
        .eq('fazenda_id', fazenda_id)
        .eq('ativa', true)
        .order('nome');
      setReceitas((data ?? []) as ReceitaOption[]);
    } catch (_) {}
  }, [fazenda_id]);

  useEffect(() => {
    carregarOrdens();
    carregarReceitas();
  }, [carregarOrdens, carregarReceitas]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    carregarOrdens();
  }, [carregarOrdens]);

  const handleCreate = async () => {
    if (!selectedReceita) {
      Alert.alert('Atencao', 'Selecione uma receita');
      return;
    }
    const kg = parseFloat(previstoKg);
    if (isNaN(kg) || kg <= 0) {
      Alert.alert('Atencao', 'Informe o peso previsto em kg');
      return;
    }

    try {
      setSaving(true);
      await createOrdem(fazenda_id, selectedReceita, kg, dataProducao);
      setShowCreateModal(false);
      setSelectedReceita('');
      setPrevistoKg('');
      Alert.alert('Sucesso', 'Ordem de producao criada');
      carregarOrdens();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao criar ordem');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = (ordem: OrdemProducaoComDetalhes, novoStatus: StatusOrdemProducao) => {
    Alert.alert(
      'Confirmar',
      `Alterar status para "${STATUS_CONFIG[novoStatus].label}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              await updateOrdemStatus(ordem.id, novoStatus);
              carregarOrdens();
            } catch (err: any) {
              Alert.alert('Erro', err.message);
            }
          },
        },
      ]
    );
  };

  const renderStatusBadge = (status: StatusOrdemProducao) => {
    const config = STATUS_CONFIG[status];
    return (
      <View style={[styles.statusBadge, { backgroundColor: config.color + '15' }]}>
        <Ionicons name={config.icon as any} size={14} color={config.color} />
        <Text style={[styles.statusBadgeText, { color: config.color }]}>{config.label}</Text>
      </View>
    );
  };

  const renderOrdemCard = (ordem: OrdemProducaoComDetalhes, index: number) => {
    const config = STATUS_CONFIG[ordem.status];
    return (
      <Animated.View key={ordem.id} entering={FadeInDown.delay(index * 60).springify()}>
        <View style={[styles.ordemCard, Shadows.xs]}>
          <View style={[styles.ordemCardStripe, { backgroundColor: config.color }]} />
          <View style={styles.ordemCardContent}>
            <View style={styles.ordemCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ordemReceitaNome}>
                  {ordem.receita?.nome || 'Receita desconhecida'}
                </Text>
                <Text style={styles.ordemData}>
                  {new Date(ordem.data_producao).toLocaleDateString('pt-BR')}
                </Text>
              </View>
              {renderStatusBadge(ordem.status)}
            </View>

            <View style={styles.ordemCardValues}>
              <View style={styles.ordemValueItem}>
                <Text style={styles.ordemValueLabel}>Previsto</Text>
                <Text style={styles.ordemValueNumber}>{ordem.previsto_kg.toFixed(0)} kg</Text>
              </View>
              {ordem.realizado_kg != null && (
                <View style={styles.ordemValueItem}>
                  <Text style={styles.ordemValueLabel}>Realizado</Text>
                  <Text style={styles.ordemValueNumber}>{ordem.realizado_kg.toFixed(0)} kg</Text>
                </View>
              )}
              {ordem.fabricacao && (
                <View style={styles.ordemValueItem}>
                  <Text style={styles.ordemValueLabel}>Lote</Text>
                  <Text style={styles.ordemValueNumber}>{ordem.fabricacao.lote_fabricacao}</Text>
                </View>
              )}
            </View>

            {/* Action buttons */}
            {ordem.status === 'aguardando' && (
              <View style={styles.ordemActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: Colors.info + '15' }]}
                  onPress={() => handleStatusChange(ordem, 'produzindo')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="play-outline" size={16} color={Colors.info} />
                  <Text style={[styles.actionBtnText, { color: Colors.info }]}>Iniciar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: Colors.error + '15' }]}
                  onPress={() => handleStatusChange(ordem, 'cancelado')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-outline" size={16} color={Colors.error} />
                  <Text style={[styles.actionBtnText, { color: Colors.error }]}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}
            {ordem.status === 'produzindo' && (
              <View style={styles.ordemActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: Colors.success + '15' }]}
                  onPress={() => handleStatusChange(ordem, 'encerrado')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="checkmark-outline" size={16} color={Colors.success} />
                  <Text style={[styles.actionBtnText, { color: Colors.success }]}>Encerrar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: Colors.primary + '15' }]}
                  onPress={() => router.push('/automacao/fabricacao')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="flask-outline" size={16} color={Colors.primary} />
                  <Text style={[styles.actionBtnText, { color: Colors.primary }]}>Fabricacao</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Ordens de Producao</Text>
            <Text style={styles.headerSubtitle}>{ordens.length} ordens</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={22} color={Colors.textLight} />
        </TouchableOpacity>
      </View>

      {/* Status Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {STATUS_FILTERS.map((sf) => {
          const isSelected = statusFilter === sf;
          const label = sf === 'todos' ? 'Todos' : STATUS_CONFIG[sf].label;
          const color = sf === 'todos' ? Colors.primary : STATUS_CONFIG[sf].color;
          return (
            <TouchableOpacity
              key={sf}
              style={[
                styles.filterChip,
                isSelected && { backgroundColor: color, borderColor: color },
              ]}
              onPress={() => setStatusFilter(sf)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.filterChipText,
                isSelected && { color: Colors.textLight },
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : ordens.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="clipboard-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>Nenhuma ordem encontrada</Text>
            <Text style={styles.emptySubtext}>Crie uma nova ordem de producao</Text>
          </View>
        ) : (
          <View style={styles.ordemList}>
            {ordens.map((ordem, index) => renderOrdemCard(ordem, index))}
          </View>
        )}
      </ScrollView>

      {/* Create Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.md }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nova Ordem de Producao</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Receita */}
              <Text style={styles.fieldLabel}>Receita</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.receitaScroll}>
                {receitas.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[
                      styles.receitaChip,
                      selectedReceita === r.id && styles.receitaChipSelected,
                    ]}
                    onPress={() => setSelectedReceita(r.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.receitaChipText,
                      selectedReceita === r.id && styles.receitaChipTextSelected,
                    ]}>
                      {r.nome}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Previsto */}
              <Text style={styles.fieldLabel}>Peso Previsto (kg)</Text>
              <TextInput
                style={[styles.input, Shadows.xs]}
                placeholder="Ex: 2500"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numeric"
                value={previstoKg}
                onChangeText={setPrevistoKg}
              />

              {/* Data */}
              <Text style={styles.fieldLabel}>Data de Producao</Text>
              <TextInput
                style={[styles.input, Shadows.xs]}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={Colors.textTertiary}
                value={dataProducao}
                onChangeText={setDataProducao}
              />

              <TouchableOpacity
                style={[styles.createButton, saving && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={saving}
                activeOpacity={0.7}
              >
                {saving ? (
                  <ActivityIndicator color={Colors.textLight} />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={20} color={Colors.textLight} />
                    <Text style={styles.createButtonText}>Criar Ordem</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
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
  listContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },

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

  // Filters
  filterScroll: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  filterContent: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.xs },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginRight: Spacing.xs,
  },
  filterChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },

  // Loading / Empty
  loadingContainer: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyContainer: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginTop: Spacing.sm },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: Spacing.xs },

  // Order List
  ordemList: { gap: Spacing.sm },
  ordemCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  ordemCardStripe: { width: 4 },
  ordemCardContent: { flex: 1, padding: Spacing.md },
  ordemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  ordemReceitaNome: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  ordemData: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statusBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  ordemCardValues: { flexDirection: 'row', gap: Spacing.lg, marginBottom: Spacing.sm },
  ordemValueItem: {},
  ordemValueLabel: { fontSize: FontSize.xxs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3 },
  ordemValueNumber: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, marginTop: 2 },
  ordemActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.sm,
  },
  actionBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.text },
  fieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  receitaScroll: { marginBottom: Spacing.sm },
  receitaChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSubtle,
    marginRight: Spacing.sm,
  },
  receitaChipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  receitaChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  receitaChipTextSelected: { color: Colors.primary },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  createButtonText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textLight },
});
