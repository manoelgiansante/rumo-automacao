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
interface CurralRfidItem {
  id: string;
  nome: string;
  numero: number | null;
  linha: number | null;
  tag_inicial: string | null;
  tag_final: string | null;
  ordem_trato: number | null;
  configurado: boolean;
}

// ============================================
// Curral RFID Card
// ============================================
function CurralRfidCard({
  item,
  index,
  onEdit,
}: {
  item: CurralRfidItem;
  index: number;
  onEdit: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <TouchableOpacity
        style={[styles.rfidCard, Shadows.xs]}
        onPress={onEdit}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.rfidCardStatusBar,
            { backgroundColor: item.configurado ? Colors.success : Colors.border },
          ]}
        />
        <View style={styles.rfidCardContent}>
          <View style={styles.rfidCardHeader}>
            <View style={styles.rfidCardHeaderLeft}>
              <View
                style={[
                  styles.rfidCardIcon,
                  {
                    backgroundColor: item.configurado
                      ? Colors.successSubtle
                      : Colors.surfaceSubtle,
                  },
                ]}
              >
                <Ionicons
                  name={item.configurado ? 'radio' : 'radio-outline'}
                  size={20}
                  color={item.configurado ? Colors.success : Colors.textTertiary}
                />
              </View>
              <View>
                <Text style={styles.rfidCardTitle}>{item.nome}</Text>
                <Text style={styles.rfidCardSubtitle}>
                  {item.linha != null ? `Linha ${item.linha} | ` : ''}
                  Ordem {item.ordem_trato ?? '-'}
                </Text>
              </View>
            </View>
            <Badge
              label={item.configurado ? 'Configurado' : 'Pendente'}
              color={item.configurado ? 'success' : 'default'}
              size="sm"
            />
          </View>

          {item.configurado && (
            <View style={styles.rfidTagsRow}>
              <View style={styles.rfidTagItem}>
                <Text style={styles.rfidTagLabel}>Tag Inicial</Text>
                <View style={styles.rfidTagValueContainer}>
                  <Ionicons name="radio-button-on" size={12} color={Colors.info} />
                  <Text style={styles.rfidTagValue}>{item.tag_inicial}</Text>
                </View>
              </View>
              <View style={styles.rfidTagDivider} />
              <View style={styles.rfidTagItem}>
                <Text style={styles.rfidTagLabel}>Tag Final</Text>
                <View style={styles.rfidTagValueContainer}>
                  <Ionicons name="radio-button-on" size={12} color={Colors.purple} />
                  <Text style={styles.rfidTagValue}>{item.tag_final}</Text>
                </View>
              </View>
            </View>
          )}

          {!item.configurado && (
            <View style={styles.rfidPendingRow}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.textTertiary} />
              <Text style={styles.rfidPendingText}>
                Toque para configurar as tags RFID
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================
// Edit Modal
// ============================================
function EditRfidModal({
  visible,
  onClose,
  onSubmit,
  item,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: {
    id: string;
    tag_inicial: string;
    tag_final: string;
    ordem_trato: number;
  }) => void;
  item: CurralRfidItem | null;
}) {
  const insets = useSafeAreaInsets();
  const [tagInicial, setTagInicial] = useState('');
  const [tagFinal, setTagFinal] = useState('');
  const [ordem, setOrdem] = useState('');

  React.useEffect(() => {
    if (item) {
      setTagInicial(item.tag_inicial ?? '');
      setTagFinal(item.tag_final ?? '');
      setOrdem(item.ordem_trato?.toString() ?? '');
    }
  }, [item, visible]);

  const canSubmit = tagInicial.trim() && tagFinal.trim() && parseInt(ordem) >= 0;

  const handleSubmit = () => {
    if (!canSubmit || !item) return;
    onSubmit({
      id: item.id,
      tag_inicial: tagInicial.trim(),
      tag_final: tagFinal.trim(),
      ordem_trato: parseInt(ordem) || 0,
    });
    onClose();
  };

  const handleLerTag = (field: 'inicial' | 'final') => {
    Alert.alert(
      'Ler Tag RFID',
      `Aproxime o leitor RFID da tag ${field === 'inicial' ? 'inicial' : 'final'} do curral.\n\n(Funcionalidade requer hardware RFID conectado)`,
    );
  };

  const handleTestarTag = (tag: string) => {
    if (!tag.trim()) {
      Alert.alert('Atencao', 'Informe a tag antes de testar.');
      return;
    }
    Alert.alert(
      'Teste de Tag',
      `Verificando leitura da tag: ${tag}\n\nAguardando resposta do leitor RFID...\n\n(Funcionalidade requer hardware RFID conectado)`,
    );
  };

  if (!item) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Configurar {item.nome}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Tag Inicial */}
            <Text style={styles.inputLabel}>Tag Inicial</Text>
            <View style={styles.tagInputRow}>
              <TextInput
                style={[styles.input, styles.tagInput]}
                value={tagInicial}
                onChangeText={setTagInicial}
                placeholder="Ex: RFID-0001-A"
                placeholderTextColor={Colors.placeholder}
              />
              <TouchableOpacity
                style={styles.lerTagBtn}
                onPress={() => handleLerTag('inicial')}
                activeOpacity={0.7}
              >
                <Ionicons name="radio" size={20} color={Colors.textLight} />
                <Text style={styles.lerTagBtnText}>Ler</Text>
              </TouchableOpacity>
            </View>

            {/* Test Tag Inicial */}
            {tagInicial.trim().length > 0 && (
              <TouchableOpacity
                style={styles.testTagBtn}
                onPress={() => handleTestarTag(tagInicial)}
                activeOpacity={0.7}
              >
                <Ionicons name="pulse-outline" size={16} color={Colors.info} />
                <Text style={styles.testTagBtnText}>Testar tag inicial</Text>
              </TouchableOpacity>
            )}

            {/* Tag Final */}
            <Text style={styles.inputLabel}>Tag Final</Text>
            <View style={styles.tagInputRow}>
              <TextInput
                style={[styles.input, styles.tagInput]}
                value={tagFinal}
                onChangeText={setTagFinal}
                placeholder="Ex: RFID-0001-B"
                placeholderTextColor={Colors.placeholder}
              />
              <TouchableOpacity
                style={styles.lerTagBtn}
                onPress={() => handleLerTag('final')}
                activeOpacity={0.7}
              >
                <Ionicons name="radio" size={20} color={Colors.textLight} />
                <Text style={styles.lerTagBtnText}>Ler</Text>
              </TouchableOpacity>
            </View>

            {/* Test Tag Final */}
            {tagFinal.trim().length > 0 && (
              <TouchableOpacity
                style={styles.testTagBtn}
                onPress={() => handleTestarTag(tagFinal)}
                activeOpacity={0.7}
              >
                <Ionicons name="pulse-outline" size={16} color={Colors.info} />
                <Text style={styles.testTagBtnText}>Testar tag final</Text>
              </TouchableOpacity>
            )}

            {/* Ordem de Trato */}
            <Text style={styles.inputLabel}>Ordem de Trato</Text>
            <TextInput
              style={styles.input}
              value={ordem}
              onChangeText={setOrdem}
              placeholder="Ex: 1"
              placeholderTextColor={Colors.placeholder}
              keyboardType="numeric"
            />

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-circle" size={22} color={Colors.textLight} />
              <Text style={styles.submitButtonText}>Salvar Configuracao</Text>
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
export default function CurraisRfidScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CurralRfidItem | null>(null);

  // Mock data
  const [curraisRfid, setCurraisRfid] = useState<CurralRfidItem[]>([
    { id: '1', nome: 'C-01', numero: 1, linha: 1, tag_inicial: 'RFID-0001-A', tag_final: 'RFID-0001-B', ordem_trato: 1, configurado: true },
    { id: '2', nome: 'C-02', numero: 2, linha: 1, tag_inicial: 'RFID-0002-A', tag_final: 'RFID-0002-B', ordem_trato: 2, configurado: true },
    { id: '3', nome: 'C-03', numero: 3, linha: 1, tag_inicial: 'RFID-0003-A', tag_final: 'RFID-0003-B', ordem_trato: 3, configurado: true },
    { id: '4', nome: 'C-04', numero: 4, linha: 1, tag_inicial: null, tag_final: null, ordem_trato: 4, configurado: false },
    { id: '5', nome: 'C-05', numero: 5, linha: 2, tag_inicial: null, tag_final: null, ordem_trato: 5, configurado: false },
    { id: '6', nome: 'C-06', numero: 6, linha: 2, tag_inicial: 'RFID-0006-A', tag_final: 'RFID-0006-B', ordem_trato: 6, configurado: true },
    { id: '7', nome: 'C-07', numero: 7, linha: 2, tag_inicial: 'RFID-0007-A', tag_final: 'RFID-0007-B', ordem_trato: 7, configurado: true },
    { id: '8', nome: 'C-08', numero: 8, linha: 2, tag_inicial: null, tag_final: null, ordem_trato: 8, configurado: false },
  ]);

  const configurados = curraisRfid.filter((c) => c.configurado).length;
  const total = curraisRfid.length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setRefreshing(false);
  }, []);

  const handleEdit = (item: CurralRfidItem) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleSubmit = (data: {
    id: string;
    tag_inicial: string;
    tag_final: string;
    ordem_trato: number;
  }) => {
    setCurraisRfid((prev) =>
      prev.map((c) =>
        c.id === data.id
          ? {
              ...c,
              tag_inicial: data.tag_inicial,
              tag_final: data.tag_final,
              ordem_trato: data.ordem_trato,
              configurado: true,
            }
          : c,
      ),
    );
  };

  const renderHeader = () => (
    <Animated.View entering={FadeIn.delay(100)}>
      <View style={[styles.summaryCard, Shadows.sm]}>
        <View style={styles.summaryInfo}>
          <Text style={styles.summaryLabel}>Progresso da configuracao</Text>
          <Text style={styles.summaryValue}>
            <Text style={styles.summaryValueBold}>{configurados}</Text>/{total} currais
          </Text>
        </View>
        <View style={styles.summaryProgress}>
          <View
            style={[
              styles.summaryProgressFill,
              { width: `${(configurados / total) * 100}%` },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>RFID Currais</Text>
            <Text style={styles.headerSubtitle}>Mapeamento de tags</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={curraisRfid}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <CurralRfidCard item={item} index={index} onEdit={() => handleEdit(item)} />
        )}
        ListHeaderComponent={renderHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />

      <EditRfidModal
        visible={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingItem(null);
        }}
        onSubmit={handleSubmit}
        item={editingItem}
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
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extrabold,
    color: Colors.textLight,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: FontWeight.medium,
  },

  // Summary
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  summaryInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  summaryLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  summaryValue: { fontSize: FontSize.sm, color: Colors.textSecondary },
  summaryValueBold: {
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    fontSize: FontSize.md,
  },
  summaryProgress: {
    height: 6,
    backgroundColor: Colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  summaryProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },

  // RFID Card
  rfidCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    minHeight: 48,
  },
  rfidCardStatusBar: { width: 4 },
  rfidCardContent: { flex: 1, padding: Spacing.md },
  rfidCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rfidCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rfidCardIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rfidCardTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  rfidCardSubtitle: { fontSize: FontSize.xs, color: Colors.textSecondary },

  rfidTagsRow: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm + 2,
  },
  rfidTagItem: { flex: 1, alignItems: 'center' },
  rfidTagLabel: {
    fontSize: FontSize.xxs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  rfidTagValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rfidTagValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  rfidTagDivider: { width: 1, backgroundColor: Colors.borderLight },

  rfidPendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  rfidPendingText: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
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
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
  },
  modalCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
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
  lerTagBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textLight,
  },
  testTagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.xs,
  },
  testTagBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.info,
  },

  // Submit
  submitButton: {
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
  submitButtonDisabled: { backgroundColor: Colors.disabled },
  submitButtonText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textLight,
  },
});
