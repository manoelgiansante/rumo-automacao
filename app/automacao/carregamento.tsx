import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontWeight } from '@/constants/theme';
import { Badge } from '@/components/ui';
import { PesoDisplay } from '@/components/automacao/PesoDisplay';
import { StatusHardware } from '@/components/automacao/StatusHardware';
import { useFornecimentoStore } from '@/stores/fornecimentoStore';
import type { StatusCarregamento } from '@/types/automacao';

// ============================================
// Types
// ============================================
interface FabricacaoDisponivel {
  id: string;
  lote_fabricacao: string;
  receita_nome: string;
  total_fabricado: number;
  data_registro: string;
  selecionado: boolean;
}

interface ItemCarregado {
  id: string;
  lote_fabricacao: string;
  receita_nome: string;
  peso_inicial: number;
  peso_final: number;
  peso_carregado: number;
}

// ============================================
// Trato Selector
// ============================================
function TratoSelector({
  tratos,
  selectedTrato,
  onSelect,
}: {
  tratos: { numero: number; horario: string }[];
  selectedTrato: number | null;
  onSelect: (numero: number) => void;
}) {
  return (
    <View style={styles.tratoRow}>
      {tratos.map((trato) => (
        <TouchableOpacity
          key={trato.numero}
          style={[
            styles.tratoChip,
            selectedTrato === trato.numero && styles.tratoChipSelected,
          ]}
          onPress={() => onSelect(trato.numero)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.tratoChipText,
              selectedTrato === trato.numero && styles.tratoChipTextSelected,
            ]}
          >
            {trato.numero}o Trato
          </Text>
          <Text
            style={[
              styles.tratoChipHora,
              selectedTrato === trato.numero && styles.tratoChipHoraSelected,
            ]}
          >
            {trato.horario}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ============================================
// Add Lote Modal
// ============================================
function AddLoteModal({
  visible,
  onClose,
  fabricacoes,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  fabricacoes: FabricacaoDisponivel[];
  onAdd: (fab: FabricacaoDisponivel) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Fabricacoes Disponiveis</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={fabricacoes}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
                <TouchableOpacity
                  style={[styles.fabCard, Shadows.xs, item.selecionado && styles.fabCardDisabled]}
                  onPress={() => {
                    if (!item.selecionado) {
                      onAdd(item);
                      onClose();
                    }
                  }}
                  disabled={item.selecionado}
                  activeOpacity={0.7}
                >
                  <View style={styles.fabCardLeft}>
                    <View style={[styles.fabIcon, { backgroundColor: item.selecionado ? Colors.surfaceSubtle : Colors.primarySubtle }]}>
                      <Ionicons
                        name="flask-outline"
                        size={20}
                        color={item.selecionado ? Colors.textTertiary : Colors.primary}
                      />
                    </View>
                    <View>
                      <Text style={styles.fabLote}>{item.lote_fabricacao}</Text>
                      <Text style={styles.fabReceita}>{item.receita_nome}</Text>
                    </View>
                  </View>
                  <View style={styles.fabCardRight}>
                    <Text style={styles.fabPeso}>{item.total_fabricado.toFixed(0)} kg</Text>
                    {item.selecionado && (
                      <Badge label="Adicionado" color="success" size="sm" />
                    )}
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="flask-outline" size={40} color={Colors.textTertiary} />
                <Text style={styles.emptyText}>Nenhuma fabricacao disponivel</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

// ============================================
// Main Screen
// ============================================
export default function CarregamentoScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [showAddLote, setShowAddLote] = useState(false);
  const [selectedTrato, setSelectedTrato] = useState<number | null>(null);
  const [selectedMisturador, setSelectedMisturador] = useState<string | null>(null);
  const [statusCarregamento, setStatusCarregamento] = useState<'idle' | 'carregando' | 'finalizado'>('idle');

  // Mock data
  const tratos = [
    { numero: 1, horario: '06:00' },
    { numero: 2, horario: '11:00' },
    { numero: 3, horario: '16:00' },
  ];

  const misturadores = [
    { id: 'mist1', nome: 'Misturador 01', numero: 1 },
    { id: 'mist2', nome: 'Vagao 01', numero: 2 },
  ];

  const [fabricacoes, setFabricacoes] = useState<FabricacaoDisponivel[]>([
    { id: 'f1', lote_fabricacao: 'LOT-2026-001', receita_nome: 'Engorda Fase 1', total_fabricado: 2500, data_registro: '2026-03-27 06:30', selecionado: false },
    { id: 'f2', lote_fabricacao: 'LOT-2026-002', receita_nome: 'Engorda Fase 2', total_fabricado: 1800, data_registro: '2026-03-27 07:15', selecionado: false },
    { id: 'f3', lote_fabricacao: 'LOT-2026-003', receita_nome: 'Adaptacao', total_fabricado: 1200, data_registro: '2026-03-27 07:45', selecionado: false },
  ]);

  const [itensCarregados, setItensCarregados] = useState<ItemCarregado[]>([]);
  const pesoBalancao = 4200;
  const totalCarregado = itensCarregados.reduce((sum, item) => sum + item.peso_carregado, 0);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setRefreshing(false);
  }, []);

  const handleAddLote = (fab: FabricacaoDisponivel) => {
    const novoItem: ItemCarregado = {
      id: fab.id,
      lote_fabricacao: fab.lote_fabricacao,
      receita_nome: fab.receita_nome,
      peso_inicial: totalCarregado,
      peso_final: totalCarregado + fab.total_fabricado,
      peso_carregado: fab.total_fabricado,
    };
    setItensCarregados((prev) => [...prev, novoItem]);
    setFabricacoes((prev) => prev.map((f) => f.id === fab.id ? { ...f, selecionado: true } : f));
  };

  const handleIniciar = () => {
    if (!selectedTrato) {
      Alert.alert('Atencao', 'Selecione o trato antes de iniciar.');
      return;
    }
    if (!selectedMisturador) {
      Alert.alert('Atencao', 'Selecione o misturador/vagao.');
      return;
    }
    setStatusCarregamento('carregando');
  };

  const handleFinalizar = () => {
    Alert.alert(
      'Finalizar Carregamento',
      `Total carregado: ${totalCarregado.toFixed(0)} kg\nPeso balancao: ${pesoBalancao.toFixed(0)} kg\n\nConfirmar finalizacao?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: () => {
            setStatusCarregamento('finalizado');
            Alert.alert('Sucesso', 'Carregamento finalizado com sucesso!');
          },
        },
      ],
    );
  };

  const renderHeader = () => (
    <Animated.View entering={FadeIn.delay(100)}>
      {/* Hardware Status */}
      <StatusHardware
        statusBalanca="conectado"
        statusRFID="conectado"
        statusDisplay="desconectado"
      />

      {/* Selecao de Trato */}
      <Text style={styles.sectionTitle}>Selecionar Trato</Text>
      <TratoSelector tratos={tratos} selectedTrato={selectedTrato} onSelect={setSelectedTrato} />

      {/* Selecao de Misturador */}
      <Text style={styles.sectionTitle}>Misturador / Vagao</Text>
      <View style={styles.misturadorRow}>
        {misturadores.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[
              styles.misturadorChip,
              selectedMisturador === m.id && styles.misturadorChipSelected,
            ]}
            onPress={() => setSelectedMisturador(m.id)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="cog-outline"
              size={16}
              color={selectedMisturador === m.id ? Colors.textLight : Colors.textSecondary}
            />
            <Text
              style={[
                styles.misturadorChipText,
                selectedMisturador === m.id && styles.misturadorChipTextSelected,
              ]}
            >
              {m.nome}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Peso Balancao */}
      <Text style={styles.sectionTitle}>Peso Balancao</Text>
      <PesoDisplay peso={pesoBalancao} status="estavel" tamanho="medio" />

      {/* Resumo */}
      <View style={[styles.resumoCard, Shadows.sm]}>
        <View style={styles.resumoRow}>
          <View style={styles.resumoItem}>
            <Text style={styles.resumoLabel}>Lotes Carregados</Text>
            <Text style={styles.resumoValue}>{itensCarregados.length}</Text>
          </View>
          <View style={styles.resumoDivider} />
          <View style={styles.resumoItem}>
            <Text style={styles.resumoLabel}>Total Carregado</Text>
            <Text style={[styles.resumoValue, { color: Colors.primary }]}>
              {totalCarregado.toFixed(0)} kg
            </Text>
          </View>
        </View>
      </View>

      {/* Itens Header */}
      <View style={styles.itensHeaderRow}>
        <Text style={styles.sectionTitle}>Itens Carregados</Text>
        {statusCarregamento === 'carregando' && (
          <TouchableOpacity
            style={styles.addLoteBtn}
            onPress={() => setShowAddLote(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle" size={20} color={Colors.primary} />
            <Text style={styles.addLoteBtnText}>Adicionar Lote</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );

  const renderItem = ({ item, index }: { item: ItemCarregado; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <View style={[styles.itemCard, Shadows.xs]}>
        <View style={[styles.itemStatusBar, { backgroundColor: Colors.success }]} />
        <View style={styles.itemContent}>
          <View style={styles.itemHeader}>
            <View>
              <Text style={styles.itemLote}>{item.lote_fabricacao}</Text>
              <Text style={styles.itemReceita}>{item.receita_nome}</Text>
            </View>
            <Text style={styles.itemPeso}>{item.peso_carregado.toFixed(0)} kg</Text>
          </View>
          <View style={styles.itemPesosRow}>
            <Text style={styles.itemPesoDetail}>
              Peso inicial: {item.peso_inicial.toFixed(0)} kg
            </Text>
            <Text style={styles.itemPesoDetail}>
              Peso final: {item.peso_final.toFixed(0)} kg
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
            <Text style={styles.headerTitle}>Carregamento</Text>
            <Text style={styles.headerSubtitle}>Carregar vagao com racoes fabricadas</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={itensCarregados}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cube-outline" size={40} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>Nenhum lote carregado</Text>
            <Text style={styles.emptySubtext}>Inicie o carregamento e adicione lotes fabricados</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      {/* Bottom Actions */}
      <View style={[styles.bottomActions, { paddingBottom: insets.bottom + Spacing.md }]}>
        {statusCarregamento === 'idle' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonPrimary]}
            onPress={handleIniciar}
            activeOpacity={0.7}
          >
            <Ionicons name="play-circle" size={22} color={Colors.textLight} />
            <Text style={styles.actionButtonText}>Iniciar Carregamento</Text>
          </TouchableOpacity>
        )}
        {statusCarregamento === 'carregando' && (
          <View style={styles.bottomActionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonSecondary, { flex: 1 }]}
              onPress={() => setShowAddLote(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
              <Text style={[styles.actionButtonText, { color: Colors.primary }]}>Adicionar Lote</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonDanger, { flex: 1 }]}
              onPress={handleFinalizar}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={22} color={Colors.textLight} />
              <Text style={styles.actionButtonText}>Finalizar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <AddLoteModal
        visible={showAddLote}
        onClose={() => setShowAddLote(false)}
        fabricacoes={fabricacoes}
        onAdd={handleAddLote}
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

  // Sections
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },

  // Trato
  tratoRow: { flexDirection: 'row', gap: Spacing.sm },
  tratoChip: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm + 2,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  tratoChipSelected: {
    backgroundColor: Colors.primarySubtle,
    borderColor: Colors.primary,
  },
  tratoChipText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  tratoChipTextSelected: { color: Colors.primary },
  tratoChipHora: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  tratoChipHoraSelected: { color: Colors.primary },

  // Misturador
  misturadorRow: { flexDirection: 'row', gap: Spacing.sm },
  misturadorChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  misturadorChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  misturadorChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  misturadorChipTextSelected: { color: Colors.textLight },

  // Resumo
  resumoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  resumoRow: { flexDirection: 'row', alignItems: 'center' },
  resumoItem: { flex: 1, alignItems: 'center' },
  resumoDivider: { width: 1, height: 32, backgroundColor: Colors.borderLight },
  resumoLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
  resumoValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.text },

  // Itens Header
  itensHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addLoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  addLoteBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },

  // Item Card
  itemCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  itemStatusBar: { width: 4 },
  itemContent: { flex: 1, padding: Spacing.md },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xs },
  itemLote: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  itemReceita: { fontSize: FontSize.xs, color: Colors.textSecondary },
  itemPeso: { fontSize: FontSize.lg, fontWeight: FontWeight.extrabold, color: Colors.primary },
  itemPesosRow: { flexDirection: 'row', gap: Spacing.md },
  itemPesoDetail: { fontSize: FontSize.xxs, color: Colors.textTertiary, fontWeight: FontWeight.medium },

  // Empty
  emptyContainer: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm },
  emptyText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textTertiary },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textTertiary },

  // Bottom Actions
  bottomActions: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.surface,
  },
  bottomActionsRow: { flexDirection: 'row', gap: Spacing.sm },
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
  actionButtonSecondary: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  actionButtonDanger: { backgroundColor: Colors.success },
  actionButtonText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textLight },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.md,
    maxHeight: '75%',
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

  // Fab Card
  fabCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  fabCardDisabled: { opacity: 0.5 },
  fabCardLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fabIcon: {
    width: 40, height: 40, borderRadius: BorderRadius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  fabLote: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  fabReceita: { fontSize: FontSize.xs, color: Colors.textSecondary },
  fabCardRight: { alignItems: 'flex-end', gap: Spacing.xs },
  fabPeso: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary },
});
