import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Badge } from '@/components/ui';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontWeight } from '@/constants/theme';

// ============================================
// Types
// ============================================
interface ReceitaItem {
  id: string;
  nome: string;
  tipo_receita: string | null;
  materia_seca: number | null;
  perc_tolerancia: number | null;
  tempo_mistura: number | null;
  total_ingredientes: number;
  ativo: boolean;
}

interface IngredienteReceita {
  id: string;
  ingrediente_id: string;
  ingrediente_nome: string;
  percentual_mn: number;
  percentual_ms: number | null;
  tolerancia: number;
  ordem_batida: number;
  automatizado: boolean;
}

// ============================================
// Receita Card
// ============================================
function ReceitaCard({
  item,
  index,
  onPress,
}: {
  item: ReceitaItem;
  index: number;
  onPress: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <TouchableOpacity
        style={[styles.receitaCard, Shadows.xs]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={[styles.receitaCardStatusBar, { backgroundColor: Colors.primary }]} />
        <View style={styles.receitaCardContent}>
          <View style={styles.receitaCardHeader}>
            <View style={styles.receitaCardHeaderLeft}>
              <View style={[styles.receitaIcon, { backgroundColor: Colors.primarySubtle }]}>
                <Ionicons name="document-text-outline" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.receitaNome} numberOfLines={1}>{item.nome}</Text>
                {item.tipo_receita && (
                  <Text style={styles.receitaTipo}>{item.tipo_receita}</Text>
                )}
              </View>
            </View>
          </View>

          <View style={styles.receitaInfoRow}>
            <View style={styles.receitaInfoItem}>
              <Text style={styles.receitaInfoLabel}>Ingredientes</Text>
              <Text style={styles.receitaInfoValue}>{item.total_ingredientes}</Text>
            </View>
            {item.materia_seca != null && (
              <View style={styles.receitaInfoItem}>
                <Text style={styles.receitaInfoLabel}>MS</Text>
                <Text style={styles.receitaInfoValue}>{item.materia_seca.toFixed(1)}%</Text>
              </View>
            )}
            {item.tempo_mistura != null && (
              <View style={styles.receitaInfoItem}>
                <Text style={styles.receitaInfoLabel}>Mistura</Text>
                <Text style={styles.receitaInfoValue}>{Math.floor(item.tempo_mistura / 60)}min</Text>
              </View>
            )}
            {item.perc_tolerancia != null && (
              <View style={styles.receitaInfoItem}>
                <Text style={styles.receitaInfoLabel}>Tolerancia</Text>
                <Text style={styles.receitaInfoValue}>{item.perc_tolerancia}%</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================
// Detail/Edit Modal
// ============================================
function ReceitaDetailModal({
  visible,
  onClose,
  receita,
  ingredientes,
  onSave,
  onAddIngrediente,
  onRemoveIngrediente,
}: {
  visible: boolean;
  onClose: () => void;
  receita: ReceitaItem | null;
  ingredientes: IngredienteReceita[];
  onSave: (data: Partial<ReceitaItem>) => void;
  onAddIngrediente: () => void;
  onRemoveIngrediente: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('');
  const [tolerancia, setTolerancia] = useState('');
  const [tempoMistura, setTempoMistura] = useState('');

  React.useEffect(() => {
    if (receita) {
      setNome(receita.nome);
      setTipo(receita.tipo_receita ?? '');
      setTolerancia(receita.perc_tolerancia?.toString() ?? '');
      setTempoMistura(receita.tempo_mistura ? (receita.tempo_mistura / 60).toString() : '');
    } else {
      setNome('');
      setTipo('');
      setTolerancia('');
      setTempoMistura('');
    }
  }, [receita, visible]);

  const totalPerc = ingredientes.reduce((sum, i) => sum + i.percentual_mn, 0);

  const handleSave = () => {
    if (!nome.trim()) {
      Alert.alert('Atencao', 'Informe o nome da receita.');
      return;
    }
    onSave({
      nome: nome.trim(),
      tipo_receita: tipo.trim() || null,
      perc_tolerancia: tolerancia ? parseFloat(tolerancia) : null,
      tempo_mistura: tempoMistura ? parseFloat(tempoMistura) * 60 : null,
    });
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {receita ? 'Editar Receita' : 'Nova Receita'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Nome */}
            <Text style={styles.inputLabel}>Nome</Text>
            <TextInput
              style={styles.input}
              value={nome}
              onChangeText={setNome}
              placeholder="Ex: Engorda Fase 1"
              placeholderTextColor={Colors.placeholder}
            />

            {/* Tipo */}
            <Text style={styles.inputLabel}>Tipo da Receita</Text>
            <TextInput
              style={styles.input}
              value={tipo}
              onChangeText={setTipo}
              placeholder="Ex: Engorda, Adaptacao"
              placeholderTextColor={Colors.placeholder}
            />

            {/* Tolerancia */}
            <Text style={styles.inputLabel}>Tolerancia (%)</Text>
            <TextInput
              style={styles.input}
              value={tolerancia}
              onChangeText={setTolerancia}
              placeholder="Ex: 3"
              placeholderTextColor={Colors.placeholder}
              keyboardType="decimal-pad"
            />

            {/* Tempo Mistura */}
            <Text style={styles.inputLabel}>Tempo de Mistura (min)</Text>
            <TextInput
              style={styles.input}
              value={tempoMistura}
              onChangeText={setTempoMistura}
              placeholder="Ex: 5"
              placeholderTextColor={Colors.placeholder}
              keyboardType="decimal-pad"
            />

            {/* Ingredientes */}
            <View style={styles.ingredientesHeader}>
              <Text style={styles.inputLabel}>Ingredientes</Text>
              <TouchableOpacity onPress={onAddIngrediente} style={styles.addIngBtn}>
                <Ionicons name="add-circle" size={20} color={Colors.primary} />
                <Text style={styles.addIngBtnText}>Adicionar</Text>
              </TouchableOpacity>
            </View>

            {ingredientes.length === 0 ? (
              <View style={styles.emptyIngredientes}>
                <Text style={styles.emptyIngText}>Nenhum ingrediente adicionado</Text>
              </View>
            ) : (
              <>
                {ingredientes.map((ing, idx) => (
                  <View key={ing.id} style={[styles.ingCard, Shadows.xs]}>
                    <View style={styles.ingCardLeft}>
                      <View style={styles.ingOrdem}>
                        <Text style={styles.ingOrdemText}>{ing.ordem_batida}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ingNome}>{ing.ingrediente_nome}</Text>
                        <Text style={styles.ingDetail}>
                          {ing.percentual_mn.toFixed(2)}% MN | Tol: {ing.tolerancia}%
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => onRemoveIngrediente(ing.id)}
                      style={styles.ingRemoveBtn}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Total */}
                <View style={styles.totalPercRow}>
                  <Text style={styles.totalPercLabel}>Total %MN:</Text>
                  <Text
                    style={[
                      styles.totalPercValue,
                      { color: Math.abs(totalPerc - 100) < 0.1 ? Colors.success : Colors.error },
                    ]}
                  >
                    {totalPerc.toFixed(2)}%
                  </Text>
                </View>
              </>
            )}

            {/* Save */}
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={22} color={Colors.textLight} />
              <Text style={styles.saveButtonText}>Salvar Receita</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ============================================
// Main Screen
// ============================================
export default function ReceitasScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [selectedReceita, setSelectedReceita] = useState<ReceitaItem | null>(null);

  // Mock data
  const [receitas] = useState<ReceitaItem[]>([
    { id: '1', nome: 'Engorda Fase 1', tipo_receita: 'Engorda', materia_seca: 52.3, perc_tolerancia: 3, tempo_mistura: 300, total_ingredientes: 6, ativo: true },
    { id: '2', nome: 'Engorda Fase 2', tipo_receita: 'Engorda', materia_seca: 55.1, perc_tolerancia: 3, tempo_mistura: 300, total_ingredientes: 5, ativo: true },
    { id: '3', nome: 'Adaptacao 21 dias', tipo_receita: 'Adaptacao', materia_seca: 48.7, perc_tolerancia: 5, tempo_mistura: 240, total_ingredientes: 7, ativo: true },
    { id: '4', nome: 'Terminacao', tipo_receita: 'Terminacao', materia_seca: 58.2, perc_tolerancia: 2, tempo_mistura: 360, total_ingredientes: 4, ativo: true },
    { id: '5', nome: 'Recria Intensiva', tipo_receita: 'Recria', materia_seca: 45.5, perc_tolerancia: 4, tempo_mistura: 300, total_ingredientes: 8, ativo: true },
  ]);

  const [mockIngredientes] = useState<IngredienteReceita[]>([
    { id: 'i1', ingrediente_id: 'ing1', ingrediente_nome: 'Silagem de Milho', percentual_mn: 50.00, percentual_ms: null, tolerancia: 5, ordem_batida: 1, automatizado: true },
    { id: 'i2', ingrediente_id: 'ing2', ingrediente_nome: 'Milho Grão', percentual_mn: 25.00, percentual_ms: null, tolerancia: 3, ordem_batida: 2, automatizado: true },
    { id: 'i3', ingrediente_id: 'ing3', ingrediente_nome: 'Farelo de Soja', percentual_mn: 15.00, percentual_ms: null, tolerancia: 3, ordem_batida: 3, automatizado: true },
    { id: 'i4', ingrediente_id: 'ing4', ingrediente_nome: 'Nucleo Mineral', percentual_mn: 5.00, percentual_ms: null, tolerancia: 2, ordem_batida: 4, automatizado: false },
    { id: 'i5', ingrediente_id: 'ing5', ingrediente_nome: 'Ureia', percentual_mn: 3.00, percentual_ms: null, tolerancia: 1, ordem_batida: 5, automatizado: false },
    { id: 'i6', ingrediente_id: 'ing6', ingrediente_nome: 'Virginiamicina', percentual_mn: 2.00, percentual_ms: null, tolerancia: 1, ordem_batida: 6, automatizado: false },
  ]);

  const filteredReceitas = useMemo(() => {
    if (!search.trim()) return receitas;
    const q = search.toLowerCase();
    return receitas.filter(
      (r) => r.nome.toLowerCase().includes(q) || (r.tipo_receita?.toLowerCase().includes(q)),
    );
  }, [receitas, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setRefreshing(false);
  }, []);

  const handleOpenDetail = (receita: ReceitaItem) => {
    setSelectedReceita(receita);
    setShowDetail(true);
  };

  const handleNew = () => {
    setSelectedReceita(null);
    setShowDetail(true);
  };

  const handleSave = (data: Partial<ReceitaItem>) => {
    Alert.alert('Sucesso', `Receita "${data.nome}" salva com sucesso!`);
  };

  const handleAddIngrediente = () => {
    Alert.alert('Adicionar Ingrediente', 'Selecione o ingrediente da lista de cadastro.\n\n(Funcionalidade completa requer receitaService)');
  };

  const handleRemoveIngrediente = (id: string) => {
    Alert.alert('Remover', 'Deseja remover este ingrediente?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => {} },
    ]);
  };

  const renderHeader = () => (
    <Animated.View entering={FadeIn.delay(100)}>
      {/* Search */}
      <View style={[styles.searchContainer, Shadows.xs]}>
        <Ionicons name="search" size={18} color={Colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar receita..."
          placeholderTextColor={Colors.placeholder}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Summary */}
      <View style={[styles.summaryCard, Shadows.sm]}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Receitas</Text>
            <Text style={styles.summaryValue}>{receitas.length}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Ativas</Text>
            <Text style={[styles.summaryValue, { color: Colors.success }]}>
              {receitas.filter((r) => r.ativo).length}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Receitas</Text>
            <Text style={styles.headerSubtitle}>Gerenciamento de receitas</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={filteredReceitas}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ReceitaCard item={item} index={index} onPress={() => handleOpenDetail(item)} />
        )}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={40} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>Nenhuma receita encontrada</Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, Shadows.md, { bottom: insets.bottom + Spacing.md }]}
        onPress={handleNew}
        activeOpacity={0.7}
      >
        <Ionicons name="add" size={28} color={Colors.textLight} />
      </TouchableOpacity>

      <ReceitaDetailModal
        visible={showDetail}
        onClose={() => { setShowDetail(false); setSelectedReceita(null); }}
        receita={selectedReceita}
        ingredientes={selectedReceita ? mockIngredientes : []}
        onSave={handleSave}
        onAddIngrediente={handleAddIngrediente}
        onRemoveIngrediente={handleRemoveIngrediente}
      />
    </View>
  );
}

// ============================================
// Styles
// ============================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  listContent: { padding: Spacing.md, paddingTop: Spacing.sm },

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

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: FontWeight.medium,
    paddingVertical: 0,
  },

  // Summary
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 32, backgroundColor: Colors.borderLight },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
  summaryValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.text },

  // Receita Card
  receitaCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  receitaCardStatusBar: { width: 4 },
  receitaCardContent: { flex: 1, padding: Spacing.md },
  receitaCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  receitaCardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  receitaIcon: {
    width: 40, height: 40, borderRadius: BorderRadius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  receitaNome: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  receitaTipo: { fontSize: FontSize.xs, color: Colors.textSecondary },
  receitaInfoRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
  },
  receitaInfoItem: { flex: 1, alignItems: 'center' },
  receitaInfoLabel: { fontSize: FontSize.xxs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  receitaInfoValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },

  // FAB
  fab: {
    position: 'absolute',
    right: Spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty
  emptyContainer: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm },
  emptyText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textTertiary },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.md,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.text },
  modalCloseBtn: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.surfaceSubtle,
  },

  // Form
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Ingredientes
  ingredientesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addIngBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  addIngBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },
  emptyIngredientes: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyIngText: { fontSize: FontSize.sm, color: Colors.textTertiary },

  ingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.xs,
  },
  ingCardLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  ingOrdem: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  ingOrdemText: { fontSize: FontSize.xxs, fontWeight: FontWeight.bold, color: Colors.textLight },
  ingNome: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  ingDetail: { fontSize: FontSize.xxs, color: Colors.textSecondary },
  ingRemoveBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.errorSubtle,
  },

  totalPercRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    marginTop: Spacing.xs,
  },
  totalPercLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  totalPercValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  // Save
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md + 4,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    minHeight: 56,
  },
  saveButtonText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textLight },
});
