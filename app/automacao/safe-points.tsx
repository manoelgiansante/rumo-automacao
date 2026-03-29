import React, { useState, useCallback } from 'react';
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
type TipoSafePoint = 'entrada' | 'saida' | 'checkpoint';

interface SafePointItem {
  id: string;
  nome: string;
  tag: string;
  tipo: TipoSafePoint;
  ativo: boolean;
}

interface LeituraRecente {
  id: string;
  safe_point_nome: string;
  peso_kg: number;
  data_registro: string;
}

// ============================================
// Helpers
// ============================================
const TIPO_CONFIG: Record<TipoSafePoint, { label: string; color: string; icon: string }> = {
  entrada: { label: 'Entrada', color: Colors.success, icon: 'log-in-outline' },
  saida: { label: 'Saida', color: Colors.error, icon: 'log-out-outline' },
  checkpoint: { label: 'Checkpoint', color: Colors.info, icon: 'flag-outline' },
};

// ============================================
// Safe Point Card
// ============================================
function SafePointCard({
  item,
  index,
  onEdit,
  onDelete,
  onTest,
}: {
  item: SafePointItem;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  const tipoConf = TIPO_CONFIG[item.tipo];

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <TouchableOpacity
        style={[styles.spCard, Shadows.xs]}
        onPress={onEdit}
        activeOpacity={0.7}
      >
        <View style={[styles.spStatusBar, { backgroundColor: tipoConf.color }]} />
        <View style={styles.spContent}>
          <View style={styles.spHeader}>
            <View style={styles.spHeaderLeft}>
              <View style={[styles.spIcon, { backgroundColor: tipoConf.color + '20' }]}>
                <Ionicons name={tipoConf.icon as any} size={20} color={tipoConf.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.spNome}>{item.nome}</Text>
                <View style={styles.spBadgeRow}>
                  <Badge label={tipoConf.label} color={item.tipo === 'entrada' ? 'success' : item.tipo === 'saida' ? 'error' : 'info'} size="sm" />
                </View>
              </View>
            </View>
            <View style={styles.spActions}>
              <TouchableOpacity
                style={[styles.spActionBtn, { backgroundColor: Colors.infoSubtle }]}
                onPress={onTest}
                activeOpacity={0.7}
              >
                <Ionicons name="pulse-outline" size={16} color={Colors.info} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.spActionBtn, { backgroundColor: Colors.errorSubtle }]}
                onPress={onDelete}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={16} color={Colors.error} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.spTagRow}>
            <Ionicons name="radio-button-on" size={12} color={tipoConf.color} />
            <Text style={styles.spTagLabel}>Tag:</Text>
            <Text style={styles.spTagValue}>{item.tag}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================
// Add/Edit Modal
// ============================================
function SafePointModal({
  visible,
  onClose,
  item,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  item: SafePointItem | null;
  onSave: (data: { nome: string; tag: string; tipo: TipoSafePoint }) => void;
}) {
  const insets = useSafeAreaInsets();
  const [nome, setNome] = useState('');
  const [tag, setTag] = useState('');
  const [tipo, setTipo] = useState<TipoSafePoint>('entrada');

  React.useEffect(() => {
    if (item) {
      setNome(item.nome);
      setTag(item.tag);
      setTipo(item.tipo);
    } else {
      setNome('');
      setTag('');
      setTipo('entrada');
    }
  }, [item, visible]);

  const handleLerTag = () => {
    Alert.alert(
      'Ler Tag RFID',
      'Aproxime o leitor RFID do ponto de referencia.\n\n(Funcionalidade requer hardware RFID conectado)',
    );
  };

  const handleTestTag = () => {
    if (!tag.trim()) {
      Alert.alert('Atencao', 'Informe a tag antes de testar.');
      return;
    }
    Alert.alert(
      'Teste de Tag',
      `Verificando leitura da tag: ${tag}\n\nAguardando resposta do leitor RFID...`,
    );
  };

  const handleSave = () => {
    if (!nome.trim()) {
      Alert.alert('Atencao', 'Informe o nome do safe point.');
      return;
    }
    if (!tag.trim()) {
      Alert.alert('Atencao', 'Informe a tag RFID.');
      return;
    }
    onSave({ nome: nome.trim(), tag: tag.trim(), tipo });
    onClose();
  };

  const tipoOptions: TipoSafePoint[] = ['entrada', 'saida', 'checkpoint'];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {item ? 'Editar Safe Point' : 'Novo Safe Point'}
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
              placeholder="Ex: Entrada Confinamento"
              placeholderTextColor={Colors.placeholder}
            />

            {/* Tipo */}
            <Text style={styles.inputLabel}>Tipo</Text>
            <View style={styles.tipoRow}>
              {tipoOptions.map((t) => {
                const conf = TIPO_CONFIG[t];
                const isSelected = tipo === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.tipoChip,
                      isSelected && { backgroundColor: conf.color, borderColor: conf.color },
                    ]}
                    onPress={() => setTipo(t)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={conf.icon as any}
                      size={16}
                      color={isSelected ? Colors.textLight : Colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.tipoChipText,
                        isSelected && { color: Colors.textLight },
                      ]}
                    >
                      {conf.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Tag */}
            <Text style={styles.inputLabel}>Tag RFID</Text>
            <View style={styles.tagInputRow}>
              <TextInput
                style={[styles.input, styles.tagInput]}
                value={tag}
                onChangeText={setTag}
                placeholder="Ex: SP-ENTRADA-001"
                placeholderTextColor={Colors.placeholder}
              />
              <TouchableOpacity
                style={styles.lerTagBtn}
                onPress={handleLerTag}
                activeOpacity={0.7}
              >
                <Ionicons name="radio" size={20} color={Colors.textLight} />
                <Text style={styles.lerTagBtnText}>Ler</Text>
              </TouchableOpacity>
            </View>

            {/* Test tag */}
            {tag.trim().length > 0 && (
              <TouchableOpacity
                style={styles.testTagBtn}
                onPress={handleTestTag}
                activeOpacity={0.7}
              >
                <Ionicons name="pulse-outline" size={16} color={Colors.info} />
                <Text style={styles.testTagBtnText}>Testar leitura da tag</Text>
              </TouchableOpacity>
            )}

            {/* Save */}
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={22} color={Colors.textLight} />
              <Text style={styles.saveButtonText}>Salvar Safe Point</Text>
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
export default function SafePointsScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<SafePointItem | null>(null);

  // Mock data
  const [safePoints, setSafePoints] = useState<SafePointItem[]>([
    { id: '1', nome: 'Entrada Confinamento', tag: 'SP-ENT-001', tipo: 'entrada', ativo: true },
    { id: '2', nome: 'Saida Confinamento', tag: 'SP-SAI-001', tipo: 'saida', ativo: true },
    { id: '3', nome: 'Checkpoint Linha 1', tag: 'SP-CHK-001', tipo: 'checkpoint', ativo: true },
    { id: '4', nome: 'Checkpoint Linha 2', tag: 'SP-CHK-002', tipo: 'checkpoint', ativo: true },
  ]);

  const [leiturasRecentes] = useState<LeituraRecente[]>([
    { id: 'l1', safe_point_nome: 'Entrada Confinamento', peso_kg: 4200, data_registro: '2026-03-27 08:15' },
    { id: 'l2', safe_point_nome: 'Checkpoint Linha 1', peso_kg: 3850, data_registro: '2026-03-27 08:22' },
    { id: 'l3', safe_point_nome: 'Checkpoint Linha 2', peso_kg: 3100, data_registro: '2026-03-27 08:35' },
    { id: 'l4', safe_point_nome: 'Saida Confinamento', peso_kg: 520, data_registro: '2026-03-27 08:50' },
  ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setRefreshing(false);
  }, []);

  const handleEdit = (item: SafePointItem) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleNew = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const handleDelete = (item: SafePointItem) => {
    Alert.alert(
      'Excluir Safe Point',
      `Deseja excluir "${item.nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => setSafePoints((prev) => prev.filter((sp) => sp.id !== item.id)),
        },
      ],
    );
  };

  const handleTest = (item: SafePointItem) => {
    Alert.alert(
      'Teste de Tag',
      `Testando leitura da tag: ${item.tag}\n\nSafe Point: ${item.nome}\n\nAguardando resposta do leitor RFID...`,
    );
  };

  const handleSave = (data: { nome: string; tag: string; tipo: TipoSafePoint }) => {
    if (editingItem) {
      setSafePoints((prev) =>
        prev.map((sp) => (sp.id === editingItem.id ? { ...sp, ...data } : sp)),
      );
    } else {
      setSafePoints((prev) => [
        ...prev,
        { id: Date.now().toString(), ...data, ativo: true },
      ]);
    }
  };

  const renderHeader = () => (
    <Animated.View entering={FadeIn.delay(100)}>
      {/* Summary */}
      <View style={[styles.summaryCard, Shadows.sm]}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Pontos</Text>
            <Text style={styles.summaryValue}>{safePoints.length}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Entradas</Text>
            <Text style={[styles.summaryValue, { color: Colors.success }]}>
              {safePoints.filter((sp) => sp.tipo === 'entrada').length}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Saidas</Text>
            <Text style={[styles.summaryValue, { color: Colors.error }]}>
              {safePoints.filter((sp) => sp.tipo === 'saida').length}
            </Text>
          </View>
        </View>
      </View>

      {/* Leituras Recentes */}
      <Text style={styles.sectionTitle}>Leituras Recentes</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.leiturasScroll}>
        {leiturasRecentes.map((leitura) => (
          <View key={leitura.id} style={[styles.leituraCard, Shadows.xs]}>
            <Text style={styles.leituraNome} numberOfLines={1}>{leitura.safe_point_nome}</Text>
            <Text style={styles.leituraPeso}>{leitura.peso_kg.toFixed(0)} kg</Text>
            <Text style={styles.leituraHora}>
              {leitura.data_registro.split(' ')[1]}
            </Text>
          </View>
        ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>Safe Points</Text>
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
            <Text style={styles.headerTitle}>Safe Points</Text>
            <Text style={styles.headerSubtitle}>Pontos de referencia RFID</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={safePoints}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <SafePointCard
            item={item}
            index={index}
            onEdit={() => handleEdit(item)}
            onDelete={() => handleDelete(item)}
            onTest={() => handleTest(item)}
          />
        )}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, Shadows.md, { bottom: insets.bottom + Spacing.md }]}
        onPress={handleNew}
        activeOpacity={0.7}
      >
        <Ionicons name="add" size={28} color={Colors.textLight} />
      </TouchableOpacity>

      <SafePointModal
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

  // Section
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },

  // Summary
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 32, backgroundColor: Colors.borderLight },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
  summaryValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.text },

  // Leituras
  leiturasScroll: { marginBottom: Spacing.sm },
  leituraCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm + 2,
    marginRight: Spacing.sm,
    minWidth: 140,
    alignItems: 'center',
  },
  leituraNome: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium, marginBottom: 4 },
  leituraPeso: { fontSize: FontSize.lg, fontWeight: FontWeight.extrabold, color: Colors.text },
  leituraHora: { fontSize: FontSize.xxs, color: Colors.textTertiary, marginTop: 2 },

  // Safe Point Card
  spCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  spStatusBar: { width: 4 },
  spContent: { flex: 1, padding: Spacing.md },
  spHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  spHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  spIcon: {
    width: 40, height: 40, borderRadius: BorderRadius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  spNome: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  spBadgeRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: 4 },
  spActions: { flexDirection: 'row', gap: Spacing.xs },
  spActionBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  spTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
  },
  spTagLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium },
  spTagValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },

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

  // Modal
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.md,
    maxHeight: '85%',
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
  tipoRow: { flexDirection: 'row', gap: Spacing.sm },
  tipoChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm + 4,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  tipoChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  tagInputRow: { flexDirection: 'row', gap: Spacing.sm },
  tagInput: { flex: 1 },
  lerTagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.info,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    minHeight: 52,
    minWidth: 80,
    justifyContent: 'center',
  },
  lerTagBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textLight },
  testTagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.xs,
  },
  testTagBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.info },

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
