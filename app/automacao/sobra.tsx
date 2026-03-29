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

  // TODO: pegar fazenda_id do contexto/store global
  const fazenda_id = '';

  const carregarSobras = useCallback(async () => {
    if (!fazenda_id) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('vet_auto_fabricacoes')
        .select(`
          id,
          lote_fabricacao,
          total_sobra_carregado_kg,
          data_registro,
          lote_fabricacao_sobra,
          receita:receita_id ( id, nome )
        `)
        .eq('fazenda_id', fazenda_id)
        .gt('total_sobra_carregado_kg', 0)
        .order('data_registro', { ascending: false });

      if (error) throw new Error(error.message);
      setFabricacoes((data ?? []) as FabricacaoComSobra[]);
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

  const handleRedistribuir = (fab: FabricacaoComSobra) => {
    Alert.alert(
      'Redistribuir Sobra',
      `Deseja redistribuir ${fab.total_sobra_carregado_kg.toFixed(1)} kg da sobra do lote ${fab.lote_fabricacao}?\n\nIsso criara uma nova fabricacao vinculada.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Redistribuir',
          onPress: async () => {
            try {
              // Criar nova fabricacao com referencia ao lote de sobra
              const { error } = await supabase
                .from('vet_auto_fabricacoes')
                .update({
                  lote_fabricacao_sobra: fab.lote_fabricacao + '-SOBRA',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', fab.id);

              if (error) throw new Error(error.message);

              Alert.alert('Sucesso', 'Sobra redistribuida com sucesso');
              carregarSobras();
            } catch (err: any) {
              Alert.alert('Erro', err.message);
            }
          },
        },
      ]
    );
  };

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
});
