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
import {
  registrarParada,
  addItemParada,
  getParadasDia,
} from '@/services/ocorrenciaParadaService';
import type { OcorrenciaParadaComItens } from '@/services/ocorrenciaParadaService';
import { useAutomacaoStore } from '@/stores/automacaoStore';

// ============================================
// Main Screen
// ============================================
export default function OcorrenciaParadaScreen() {
  const insets = useSafeAreaInsets();
  const [paradas, setParadas] = useState<OcorrenciaParadaComItens[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [motivo, setMotivo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { fazendaAtiva } = useAutomacaoStore();
  const fazenda_id = fazendaAtiva?.fazenda_id ?? '';
  const operadorNome = 'Operador';
  const receitaAtual = '';
  const pesoBalanca = 0;

  const hoje = new Date().toISOString().split('T')[0];

  const carregarParadas = useCallback(async () => {
    if (!fazenda_id) {
      setLoading(false);
      return;
    }
    try {
      const lista = await getParadasDia(fazenda_id, hoje);
      setParadas(lista);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao carregar paradas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fazenda_id, hoje]);

  useEffect(() => {
    carregarParadas();
  }, [carregarParadas]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    carregarParadas();
  }, [carregarParadas]);

  const handleRegistrar = async () => {
    if (!motivo.trim()) {
      Alert.alert('Atencao', 'Informe o motivo da parada');
      return;
    }

    try {
      setSaving(true);

      // Criar a ocorrencia
      const parada = await registrarParada(fazenda_id, motivo.trim());

      // Adicionar item com dados da operacao atual
      await addItemParada(
        parada.id,
        motivo.trim(),
        observacao.trim() || null,
        operadorNome,
        receitaAtual || null,
        pesoBalanca || null
      );

      setMotivo('');
      setObservacao('');
      setShowForm(false);
      Alert.alert('Sucesso', 'Parada registrada com sucesso');
      carregarParadas();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao registrar parada');
    } finally {
      setSaving(false);
    }
  };

  const MOTIVOS_COMUNS = [
    'Falta de ingrediente',
    'Manutencao equipamento',
    'Troca de receita',
    'Limpeza',
    'Intervalo',
    'Problema eletrico',
    'Outro',
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Ocorrencias de Parada</Text>
            <Text style={styles.headerSubtitle}>Registro de paradas</Text>
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
        {/* Quick Registration Form */}
        {showForm && (
          <Animated.View entering={FadeInDown.springify()}>
            <View style={[styles.formCard, Shadows.sm]}>
              <Text style={styles.formTitle}>Nova Parada</Text>

              {/* Quick Motivo Selection */}
              <Text style={styles.fieldLabel}>Motivo</Text>
              <View style={styles.motivoGrid}>
                {MOTIVOS_COMUNS.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.motivoChip,
                      motivo === m && styles.motivoChipSelected,
                    ]}
                    onPress={() => setMotivo(m)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.motivoChipText,
                      motivo === m && styles.motivoChipTextSelected,
                    ]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Custom Motivo */}
              <TextInput
                style={[styles.input, Shadows.xs]}
                placeholder="Ou digite um motivo personalizado"
                placeholderTextColor={Colors.textTertiary}
                value={motivo}
                onChangeText={setMotivo}
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

              {/* Auto-filled info */}
              <View style={styles.autoInfo}>
                <View style={styles.autoInfoItem}>
                  <Ionicons name="person-outline" size={14} color={Colors.textTertiary} />
                  <Text style={styles.autoInfoText}>Operador: {operadorNome}</Text>
                </View>
                {receitaAtual ? (
                  <View style={styles.autoInfoItem}>
                    <Ionicons name="flask-outline" size={14} color={Colors.textTertiary} />
                    <Text style={styles.autoInfoText}>Receita: {receitaAtual}</Text>
                  </View>
                ) : null}
                {pesoBalanca > 0 && (
                  <View style={styles.autoInfoItem}>
                    <Ionicons name="scale-outline" size={14} color={Colors.textTertiary} />
                    <Text style={styles.autoInfoText}>Peso Balanca: {pesoBalanca.toFixed(1)} kg</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.registrarBtn, (!motivo.trim() || saving) && { opacity: 0.5 }]}
                onPress={handleRegistrar}
                disabled={!motivo.trim() || saving}
                activeOpacity={0.7}
              >
                {saving ? (
                  <ActivityIndicator color={Colors.textLight} />
                ) : (
                  <>
                    <Ionicons name="alert-circle-outline" size={20} color={Colors.textLight} />
                    <Text style={styles.registrarBtnText}>Registrar Parada</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Recent Paradas */}
        <Text style={styles.sectionTitle}>Paradas de Hoje</Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : paradas.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={48} color={Colors.success} />
            <Text style={styles.emptyText}>Nenhuma parada registrada hoje</Text>
          </View>
        ) : (
          <View style={styles.paradaList}>
            {paradas.map((parada, index) => (
              <Animated.View key={parada.id} entering={FadeInDown.delay(index * 60).springify()}>
                <View style={[styles.paradaCard, Shadows.xs]}>
                  <View style={[styles.paradaStripe, { backgroundColor: Colors.error }]} />
                  <View style={styles.paradaContent}>
                    <View style={styles.paradaHeader}>
                      <View style={styles.paradaIcon}>
                        <Ionicons name="pause-circle-outline" size={20} color={Colors.error} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.paradaNome}>{parada.nome}</Text>
                        <Text style={styles.paradaHora}>
                          {new Date(parada.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      {parada.itens && parada.itens.length > 0 && (
                        <View style={styles.itensBadge}>
                          <Text style={styles.itensBadgeText}>{parada.itens.length} item(ns)</Text>
                        </View>
                      )}
                    </View>

                    {/* Items */}
                    {parada.itens?.map((item) => (
                      <View key={item.id} style={styles.itemRow}>
                        <View style={styles.itemDot} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemNome}>{item.nome}</Text>
                          {item.observacao && (
                            <Text style={styles.itemObs}>{item.observacao}</Text>
                          )}
                          <View style={styles.itemMeta}>
                            {item.operador && (
                              <Text style={styles.itemMetaText}>{item.operador}</Text>
                            )}
                            {item.receita && (
                              <Text style={styles.itemMetaText}>{item.receita}</Text>
                            )}
                            {item.peso_balanca != null && item.peso_balanca > 0 && (
                              <Text style={styles.itemMetaText}>{item.peso_balanca.toFixed(1)} kg</Text>
                            )}
                          </View>
                        </View>
                      </View>
                    ))}
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

  // Form
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  formTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.extrabold, color: Colors.text, marginBottom: Spacing.md },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
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
  autoInfo: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  autoInfoItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  autoInfoText: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium },
  registrarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  registrarBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textLight },

  // Loading / Empty
  loadingContainer: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyContainer: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginTop: Spacing.sm },

  // Parada List
  paradaList: { gap: Spacing.sm },
  paradaCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  paradaStripe: { width: 4 },
  paradaContent: { flex: 1, padding: Spacing.md },
  paradaHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  paradaIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.error + '10',
    justifyContent: 'center', alignItems: 'center',
  },
  paradaNome: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  paradaHora: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium },
  itensBadge: {
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  itensBadgeText: { fontSize: FontSize.xxs, color: Colors.textTertiary, fontWeight: FontWeight.bold },

  // Items
  itemRow: { flexDirection: 'row', gap: Spacing.sm, paddingLeft: Spacing.sm, marginTop: Spacing.xs },
  itemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.textTertiary, marginTop: 6 },
  itemNome: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },
  itemObs: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  itemMeta: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  itemMetaText: { fontSize: FontSize.xxs, color: Colors.textTertiary, fontWeight: FontWeight.medium },
});
