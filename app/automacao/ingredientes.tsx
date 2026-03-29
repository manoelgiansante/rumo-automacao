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
import type { TipoIngrediente } from '@/types/automacao';

// ============================================
// Types
// ============================================
interface IngredienteItem {
  id: string;
  nome: string;
  tipo: TipoIngrediente;
  materia_seca: number | null;
  custo_kg: number | null;
  estoque_atual: number;
  estoque_minimo_kg: number | null;
  local_fisico: string | null;
  ativo: boolean;
}

// ============================================
// Tipo color map
// ============================================
const TIPO_COLORS: Record<string, string> = {
  volumoso: '#2D8F47',
  concentrado: '#F5A623',
  mineral: '#8B5CF6',
  aditivo: '#2563EB',
  nucleo: '#EC4899',
  premix: '#135352',
  ionoforo: '#E67E22',
  tamponante: '#6366F1',
  outro: '#5A6B7D',
};

// ============================================
// Ingrediente Card
// ============================================
function IngredienteListCard({
  item,
  index,
  onEdit,
}: {
  item: IngredienteItem;
  index: number;
  onEdit: () => void;
}) {
  const tipoColor = TIPO_COLORS[item.tipo] ?? Colors.textSecondary;
  const estoqueBaixo =
    item.estoque_minimo_kg != null && item.estoque_atual <= item.estoque_minimo_kg;

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
      <TouchableOpacity
        style={[styles.ingCard, Shadows.xs]}
        onPress={onEdit}
        activeOpacity={0.7}
      >
        <View style={[styles.ingStatusBar, { backgroundColor: tipoColor }]} />
        <View style={styles.ingContent}>
          <View style={styles.ingHeader}>
            <View style={styles.ingHeaderLeft}>
              <View style={[styles.ingIcon, { backgroundColor: tipoColor + '20' }]}>
                <Ionicons name="flask-outline" size={18} color={tipoColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ingNome} numberOfLines={1}>{item.nome}</Text>
                <View style={styles.ingBadgeRow}>
                  <Badge label={item.tipo} color="default" size="sm" />
                  {estoqueBaixo && <Badge label="Estoque Baixo" color="error" size="sm" />}
                </View>
              </View>
            </View>
          </View>

          <View style={styles.ingGridRow}>
            {item.materia_seca != null && (
              <View style={styles.ingGridItem}>
                <Text style={styles.ingGridLabel}>MS</Text>
                <Text style={styles.ingGridValue}>{item.materia_seca.toFixed(1)}%</Text>
              </View>
            )}
            {item.custo_kg != null && (
              <View style={styles.ingGridItem}>
                <Text style={styles.ingGridLabel}>Custo/kg</Text>
                <Text style={styles.ingGridValue}>R$ {item.custo_kg.toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.ingGridItem}>
              <Text style={styles.ingGridLabel}>Estoque</Text>
              <Text
                style={[
                  styles.ingGridValue,
                  { color: estoqueBaixo ? Colors.error : Colors.text },
                ]}
              >
                {item.estoque_atual.toFixed(0)} kg
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================
// Add/Edit Modal
// ============================================
function IngredienteModal({
  visible,
  onClose,
  item,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  item: IngredienteItem | null;
  onSave: (data: Partial<IngredienteItem>) => void;
}) {
  const insets = useSafeAreaInsets();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoIngrediente>('volumoso');
  const [materiaSeca, setMateriaSeca] = useState('');
  const [custoKg, setCustoKg] = useState('');
  const [estoque, setEstoque] = useState('');
  const [estoqueMinimo, setEstoqueMinimo] = useState('');
  const [localFisico, setLocalFisico] = useState('');

  React.useEffect(() => {
    if (item) {
      setNome(item.nome);
      setTipo(item.tipo);
      setMateriaSeca(item.materia_seca?.toString() ?? '');
      setCustoKg(item.custo_kg?.toString() ?? '');
      setEstoque(item.estoque_atual.toString());
      setEstoqueMinimo(item.estoque_minimo_kg?.toString() ?? '');
      setLocalFisico(item.local_fisico ?? '');
    } else {
      setNome('');
      setTipo('volumoso');
      setMateriaSeca('');
      setCustoKg('');
      setEstoque('');
      setEstoqueMinimo('');
      setLocalFisico('');
    }
  }, [item, visible]);

  const tipoOptions: TipoIngrediente[] = [
    'volumoso', 'concentrado', 'mineral', 'aditivo',
    'nucleo', 'premix', 'ionoforo', 'tamponante', 'outro',
  ];

  const handleSave = () => {
    if (!nome.trim()) {
      Alert.alert('Atencao', 'Informe o nome do ingrediente.');
      return;
    }
    onSave({
      nome: nome.trim(),
      tipo,
      materia_seca: materiaSeca ? parseFloat(materiaSeca) : null,
      custo_kg: custoKg ? parseFloat(custoKg) : null,
      estoque_atual: estoque ? parseFloat(estoque) : 0,
      estoque_minimo_kg: estoqueMinimo ? parseFloat(estoqueMinimo) : null,
      local_fisico: localFisico.trim() || null,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {item ? 'Editar Ingrediente' : 'Novo Ingrediente'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.inputLabel}>Nome</Text>
            <TextInput
              style={styles.input}
              value={nome}
              onChangeText={setNome}
              placeholder="Ex: Silagem de Milho"
              placeholderTextColor={Colors.placeholder}
            />

            <Text style={styles.inputLabel}>Tipo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tipoScroll}>
              {tipoOptions.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.tipoChip,
                    tipo === t && { backgroundColor: TIPO_COLORS[t], borderColor: TIPO_COLORS[t] },
                  ]}
                  onPress={() => setTipo(t)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.tipoChipText,
                      tipo === t && { color: Colors.textLight },
                    ]}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Materia Seca (%)</Text>
            <TextInput
              style={styles.input}
              value={materiaSeca}
              onChangeText={setMateriaSeca}
              placeholder="Ex: 88.5"
              placeholderTextColor={Colors.placeholder}
              keyboardType="decimal-pad"
            />

            <Text style={styles.inputLabel}>Custo por kg (R$)</Text>
            <TextInput
              style={styles.input}
              value={custoKg}
              onChangeText={setCustoKg}
              placeholder="Ex: 0.35"
              placeholderTextColor={Colors.placeholder}
              keyboardType="decimal-pad"
            />

            <Text style={styles.inputLabel}>Estoque Atual (kg)</Text>
            <TextInput
              style={styles.input}
              value={estoque}
              onChangeText={setEstoque}
              placeholder="Ex: 15000"
              placeholderTextColor={Colors.placeholder}
              keyboardType="decimal-pad"
            />

            <Text style={styles.inputLabel}>Estoque Minimo (kg)</Text>
            <TextInput
              style={styles.input}
              value={estoqueMinimo}
              onChangeText={setEstoqueMinimo}
              placeholder="Ex: 5000"
              placeholderTextColor={Colors.placeholder}
              keyboardType="decimal-pad"
            />

            <Text style={styles.inputLabel}>Local Fisico</Text>
            <TextInput
              style={styles.input}
              value={localFisico}
              onChangeText={setLocalFisico}
              placeholder="Ex: Silo 3, Barracão A"
              placeholderTextColor={Colors.placeholder}
            />

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={22} color={Colors.textLight} />
              <Text style={styles.saveButtonText}>Salvar Ingrediente</Text>
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
export default function IngredientesScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<IngredienteItem | null>(null);

  // Mock data
  const [ingredientes] = useState<IngredienteItem[]>([
    { id: '1', nome: 'Silagem de Milho', tipo: 'volumoso', materia_seca: 35.2, custo_kg: 0.12, estoque_atual: 50000, estoque_minimo_kg: 10000, local_fisico: 'Silo 1', ativo: true },
    { id: '2', nome: 'Milho Grao Moido', tipo: 'concentrado', materia_seca: 88.0, custo_kg: 0.65, estoque_atual: 12000, estoque_minimo_kg: 5000, local_fisico: 'Barracão A', ativo: true },
    { id: '3', nome: 'Farelo de Soja', tipo: 'concentrado', materia_seca: 89.5, custo_kg: 1.85, estoque_atual: 8000, estoque_minimo_kg: 3000, local_fisico: 'Barracão A', ativo: true },
    { id: '4', nome: 'Nucleo Mineral', tipo: 'nucleo', materia_seca: 95.0, custo_kg: 3.50, estoque_atual: 2000, estoque_minimo_kg: 500, local_fisico: 'Deposito', ativo: true },
    { id: '5', nome: 'Ureia Pecuaria', tipo: 'aditivo', materia_seca: 100.0, custo_kg: 2.10, estoque_atual: 400, estoque_minimo_kg: 500, local_fisico: 'Deposito', ativo: true },
    { id: '6', nome: 'Virginiamicina', tipo: 'ionoforo', materia_seca: 100.0, custo_kg: 45.00, estoque_atual: 150, estoque_minimo_kg: 50, local_fisico: 'Deposito', ativo: true },
    { id: '7', nome: 'Calcario Calcitico', tipo: 'mineral', materia_seca: 100.0, custo_kg: 0.25, estoque_atual: 3000, estoque_minimo_kg: 1000, local_fisico: 'Patio', ativo: true },
    { id: '8', nome: 'Bagaco de Cana', tipo: 'volumoso', materia_seca: 50.0, custo_kg: 0.08, estoque_atual: 25000, estoque_minimo_kg: 8000, local_fisico: 'Silo 2', ativo: true },
  ]);

  const filtered = useMemo(() => {
    if (!search.trim()) return ingredientes;
    const q = search.toLowerCase();
    return ingredientes.filter(
      (i) => i.nome.toLowerCase().includes(q) || i.tipo.toLowerCase().includes(q),
    );
  }, [ingredientes, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setRefreshing(false);
  }, []);

  const handleEdit = (item: IngredienteItem) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleNew = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const handleSave = (data: Partial<IngredienteItem>) => {
    Alert.alert('Sucesso', `Ingrediente "${data.nome}" salvo com sucesso!`);
  };

  const renderHeader = () => (
    <Animated.View entering={FadeIn.delay(100)}>
      <View style={[styles.searchContainer, Shadows.xs]}>
        <Ionicons name="search" size={18} color={Colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar ingrediente..."
          placeholderTextColor={Colors.placeholder}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.summaryCard, Shadows.sm]}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={styles.summaryValue}>{ingredientes.length}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Estoque Baixo</Text>
            <Text style={[styles.summaryValue, { color: Colors.error }]}>
              {ingredientes.filter((i) => i.estoque_minimo_kg != null && i.estoque_atual <= i.estoque_minimo_kg).length}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Ingredientes</Text>
            <Text style={styles.headerSubtitle}>Cadastro e estoque</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <IngredienteListCard item={item} index={index} onEdit={() => handleEdit(item)} />
        )}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="flask-outline" size={40} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>Nenhum ingrediente encontrado</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={[styles.fab, Shadows.md, { bottom: insets.bottom + Spacing.md }]}
        onPress={handleNew}
        activeOpacity={0.7}
      >
        <Ionicons name="add" size={28} color={Colors.textLight} />
      </TouchableOpacity>

      <IngredienteModal
        visible={showModal}
        onClose={() => { setShowModal(false); setEditingItem(null); }}
        item={editingItem}
        onSave={handleSave}
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

  // Ingrediente Card
  ingCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  ingStatusBar: { width: 4 },
  ingContent: { flex: 1, padding: Spacing.md },
  ingHeader: { marginBottom: Spacing.sm },
  ingHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ingIcon: {
    width: 36, height: 36, borderRadius: BorderRadius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  ingNome: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  ingBadgeRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: 4 },
  ingGridRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
  },
  ingGridItem: { flex: 1, alignItems: 'center' },
  ingGridLabel: { fontSize: FontSize.xxs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  ingGridValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },

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
  tipoScroll: { marginBottom: Spacing.sm },
  tipoChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: Spacing.xs,
    backgroundColor: Colors.surface,
  },
  tipoChipText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },

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
