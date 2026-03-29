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
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontWeight } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================
type TipoDescarte = 'fabricacao' | 'fornecimento';

interface DescarteRecord {
  id: string;
  tipo: TipoDescarte;
  referencia_id: string;
  misturador_id: string | null;
  motivo: string | null;
  quantidade_kg: number;
  observacao: string | null;
  created_at: string;
}

interface ReferenciaOption {
  id: string;
  label: string;
}

const MOTIVOS_DESCARTE = [
  'Contaminacao',
  'Vencimento',
  'Erro de formulacao',
  'Queda no chao',
  'Problema no equipamento',
  'Sobra inaproveitavel',
  'Outro',
];

// ============================================
// Main Screen
// ============================================
export default function DescarteScreen() {
  const insets = useSafeAreaInsets();
  const [descartes, setDescartes] = useState<DescarteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [tipo, setTipo] = useState<TipoDescarte>('fabricacao');
  const [referenciaId, setReferenciaId] = useState('');
  const [referencias, setReferencias] = useState<ReferenciaOption[]>([]);
  const [motivo, setMotivo] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [observacao, setObservacao] = useState('');

  // TODO: pegar fazenda_id do contexto/store global
  const fazenda_id = '';

  const carregarDescartes = useCallback(async () => {
    if (!fazenda_id) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('vet_auto_descartes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw new Error(error.message);
      setDescartes((data ?? []) as DescarteRecord[]);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao carregar descartes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fazenda_id]);

  const carregarReferencias = useCallback(async () => {
    if (!fazenda_id) return;
    try {
      if (tipo === 'fabricacao') {
        const { data } = await supabase
          .from('vet_auto_fabricacoes')
          .select('id, lote_fabricacao')
          .eq('fazenda_id', fazenda_id)
          .in('status', ['espera', 'processando'])
          .order('created_at', { ascending: false })
          .limit(20);
        setReferencias((data ?? []).map((d: any) => ({ id: d.id, label: d.lote_fabricacao })));
      } else {
        const { data } = await supabase
          .from('vet_auto_carregamentos')
          .select('id, data_registro')
          .eq('fazenda_id', fazenda_id)
          .eq('status', 'em_andamento')
          .order('created_at', { ascending: false })
          .limit(20);
        setReferencias((data ?? []).map((d: any) => ({
          id: d.id,
          label: `Carreg. ${new Date(d.data_registro).toLocaleDateString('pt-BR')}`,
        })));
      }
    } catch (_) {}
  }, [fazenda_id, tipo]);

  useEffect(() => {
    carregarDescartes();
  }, [carregarDescartes]);

  useEffect(() => {
    carregarReferencias();
  }, [carregarReferencias]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    carregarDescartes();
  }, [carregarDescartes]);

  const handleSalvar = async () => {
    if (!referenciaId) {
      Alert.alert('Atencao', 'Selecione a referencia');
      return;
    }
    if (!motivo.trim()) {
      Alert.alert('Atencao', 'Selecione o motivo');
      return;
    }
    const kg = parseFloat(quantidade);
    if (isNaN(kg) || kg <= 0) {
      Alert.alert('Atencao', 'Informe a quantidade em kg');
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('vet_auto_descartes')
        .insert({
          tipo,
          referencia_id: referenciaId,
          motivo: motivo.trim(),
          quantidade_kg: kg,
          observacao: observacao.trim() || null,
        });

      if (error) throw new Error(error.message);

      setShowForm(false);
      setReferenciaId('');
      setMotivo('');
      setQuantidade('');
      setObservacao('');
      Alert.alert('Sucesso', 'Descarte registrado');
      carregarDescartes();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao registrar descarte');
    } finally {
      setSaving(false);
    }
  };

  const totalDescartes = descartes.reduce((acc, d) => acc + d.quantidade_kg, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Descartes</Text>
            <Text style={styles.headerSubtitle}>Registro de descartes</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowForm(!showForm)}
          activeOpacity={0.7}
        >
          <Ionicons name={showForm ? 'close' : 'add'} size={22} color={Colors.textLight} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
      >
        {/* Summary */}
        <Animated.View entering={FadeIn.delay(100)}>
          <View style={[styles.summaryCard, Shadows.sm]}>
            <View style={styles.summaryIcon}>
              <Ionicons name="trash-outline" size={28} color={Colors.error} />
            </View>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>Total Descartado</Text>
              <Text style={styles.summaryValue}>{totalDescartes.toFixed(1)} kg</Text>
            </View>
            <View style={styles.summaryBadge}>
              <Text style={styles.summaryBadgeText}>{descartes.length} registros</Text>
            </View>
          </View>
        </Animated.View>

        {/* Form */}
        {showForm && (
          <Animated.View entering={FadeInDown.springify()}>
            <View style={[styles.formCard, Shadows.sm]}>
              <Text style={styles.formTitle}>Novo Descarte</Text>

              {/* Tipo */}
              <Text style={styles.fieldLabel}>Tipo</Text>
              <View style={styles.tipoRow}>
                <TouchableOpacity
                  style={[styles.tipoBtn, tipo === 'fabricacao' && styles.tipoBtnSelected]}
                  onPress={() => { setTipo('fabricacao'); setReferenciaId(''); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="flask-outline" size={18} color={tipo === 'fabricacao' ? Colors.textLight : Colors.text} />
                  <Text style={[styles.tipoBtnText, tipo === 'fabricacao' && styles.tipoBtnTextSelected]}>Fabricacao</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tipoBtn, tipo === 'fornecimento' && styles.tipoBtnSelected]}
                  onPress={() => { setTipo('fornecimento'); setReferenciaId(''); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="car-outline" size={18} color={tipo === 'fornecimento' ? Colors.textLight : Colors.text} />
                  <Text style={[styles.tipoBtnText, tipo === 'fornecimento' && styles.tipoBtnTextSelected]}>Fornecimento</Text>
                </TouchableOpacity>
              </View>

              {/* Referencia */}
              <Text style={styles.fieldLabel}>Referencia</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.refScroll}>
                {referencias.map((ref) => (
                  <TouchableOpacity
                    key={ref.id}
                    style={[styles.refChip, referenciaId === ref.id && styles.refChipSelected]}
                    onPress={() => setReferenciaId(ref.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.refChipText, referenciaId === ref.id && styles.refChipTextSelected]}>
                      {ref.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                {referencias.length === 0 && (
                  <Text style={styles.noRefText}>Nenhuma referencia disponivel</Text>
                )}
              </ScrollView>

              {/* Motivo */}
              <Text style={styles.fieldLabel}>Motivo</Text>
              <View style={styles.motivoGrid}>
                {MOTIVOS_DESCARTE.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.motivoChip, motivo === m && styles.motivoChipSelected]}
                    onPress={() => setMotivo(m)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.motivoChipText, motivo === m && styles.motivoChipTextSelected]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Quantidade */}
              <Text style={styles.fieldLabel}>Quantidade (kg)</Text>
              <TextInput
                style={[styles.input, Shadows.xs]}
                placeholder="Ex: 150"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numeric"
                value={quantidade}
                onChangeText={setQuantidade}
              />

              {/* Observacao */}
              <Text style={styles.fieldLabel}>Observacao</Text>
              <TextInput
                style={[styles.input, styles.textArea, Shadows.xs]}
                placeholder="Detalhes adicionais (opcional)"
                placeholderTextColor={Colors.textTertiary}
                value={observacao}
                onChangeText={setObservacao}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.5 }]}
                onPress={handleSalvar}
                disabled={saving}
                activeOpacity={0.7}
              >
                {saving ? (
                  <ActivityIndicator color={Colors.textLight} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={20} color={Colors.textLight} />
                    <Text style={styles.saveBtnText}>Registrar Descarte</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* List */}
        <Text style={styles.sectionTitle}>Descartes Recentes</Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : descartes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={48} color={Colors.success} />
            <Text style={styles.emptyText}>Nenhum descarte registrado</Text>
          </View>
        ) : (
          <View style={styles.descarteList}>
            {descartes.map((desc, index) => (
              <Animated.View key={desc.id} entering={FadeInDown.delay(index * 60).springify()}>
                <View style={[styles.descarteCard, Shadows.xs]}>
                  <View style={[styles.descarteStripe, { backgroundColor: Colors.error }]} />
                  <View style={styles.descarteContent}>
                    <View style={styles.descarteHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.descarteTipoRow}>
                          <View style={[styles.descarteTipoBadge, { backgroundColor: desc.tipo === 'fabricacao' ? Colors.info + '15' : Colors.primary + '15' }]}>
                            <Ionicons
                              name={desc.tipo === 'fabricacao' ? 'flask-outline' : 'car-outline'}
                              size={12}
                              color={desc.tipo === 'fabricacao' ? Colors.info : Colors.primary}
                            />
                            <Text style={[styles.descarteTipoBadgeText, { color: desc.tipo === 'fabricacao' ? Colors.info : Colors.primary }]}>
                              {desc.tipo === 'fabricacao' ? 'Fabricacao' : 'Fornecimento'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.descarteMotivo}>{desc.motivo || 'Sem motivo'}</Text>
                        {desc.observacao && (
                          <Text style={styles.descarteObs}>{desc.observacao}</Text>
                        )}
                      </View>
                      <View style={styles.descartePeso}>
                        <Text style={styles.descartePesoValue}>{desc.quantidade_kg.toFixed(1)}</Text>
                        <Text style={styles.descartePesoUnit}>kg</Text>
                      </View>
                    </View>
                    <Text style={styles.descarteData}>
                      {new Date(desc.created_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            ))}
          </View>
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
  addButton: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  summaryIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.error + '15',
    justifyContent: 'center', alignItems: 'center',
  },
  summaryInfo: { flex: 1 },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, textTransform: 'uppercase', letterSpacing: 0.3 },
  summaryValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.text, marginTop: 2 },
  summaryBadge: {
    backgroundColor: Colors.error + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  summaryBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.error },

  // Form
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  formTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.extrabold, color: Colors.text, marginBottom: Spacing.sm },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  tipoRow: { flexDirection: 'row', gap: Spacing.sm },
  tipoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSubtle,
  },
  tipoBtnSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  tipoBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  tipoBtnTextSelected: { color: Colors.textLight },
  refScroll: { marginBottom: Spacing.xs },
  refChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSubtle,
    marginRight: Spacing.sm,
  },
  refChipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  refChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  refChipTextSelected: { color: Colors.primary },
  noRefText: { fontSize: FontSize.sm, color: Colors.textTertiary, fontStyle: 'italic', paddingVertical: Spacing.sm },
  motivoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  motivoChip: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  motivoChipSelected: { borderColor: Colors.error, backgroundColor: Colors.error + '10' },
  motivoChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  motivoChipTextSelected: { color: Colors.error, fontWeight: FontWeight.bold },
  input: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  textArea: { minHeight: 80 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  saveBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textLight },

  // Loading / Empty
  loadingContainer: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyContainer: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginTop: Spacing.sm },

  // Descarte List
  descarteList: { gap: Spacing.sm },
  descarteCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  descarteStripe: { width: 4 },
  descarteContent: { flex: 1, padding: Spacing.md },
  descarteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  descarteTipoRow: { flexDirection: 'row', marginBottom: 4 },
  descarteTipoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  descarteTipoBadgeText: { fontSize: FontSize.xxs, fontWeight: FontWeight.bold },
  descarteMotivo: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  descarteObs: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  descartePeso: { alignItems: 'flex-end' },
  descartePesoValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.extrabold, color: Colors.error },
  descartePesoUnit: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium },
  descarteData: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, marginTop: Spacing.sm },
});
