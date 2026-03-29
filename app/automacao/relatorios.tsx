import React, { useState, useEffect, useCallback } from 'react';
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
  Platform,
  ActivityIndicator,
  Share,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontWeight } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAutomacaoStore } from '@/stores/automacaoStore';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// ============================================
// Types
// ============================================
type ReportType = 'fornecimento' | 'fabricacao' | 'previsto_realizado' | 'resumo_diario';

interface ReportConfig {
  id: ReportType;
  label: string;
  icon: string;
  color: string;
}

interface FornecimentoReport {
  curral: string;
  previsto_kg: number;
  realizado_kg: number;
  diferenca_kg: number;
  diferenca_perc: number;
}

interface FabricacaoReport {
  receita: string;
  lote: string;
  previsto_kg: number;
  fabricado_kg: number;
  diferenca_perc: number;
  data: string;
}

interface ResumoStats {
  total_fabricado_kg: number;
  total_fornecido_kg: number;
  total_previsto_kg: number;
  eficiencia_perc: number;
  total_descartes: number;
  total_lotes: number;
}

// ============================================
// Report Types
// ============================================
const REPORT_TYPES: ReportConfig[] = [
  { id: 'fornecimento', label: 'Fornecimento', icon: 'car-outline', color: Colors.primary },
  { id: 'fabricacao', label: 'Fabricacao', icon: 'flask-outline', color: Colors.info },
  { id: 'previsto_realizado', label: 'Previsto vs Realizado', icon: 'bar-chart-outline', color: Colors.warning },
  { id: 'resumo_diario', label: 'Resumo Diario', icon: 'stats-chart-outline', color: Colors.success },
];

// ============================================
// Date Range Selector
// ============================================
function DateRangeSelector({
  startDate,
  endDate,
  onChangeStart,
  onChangeEnd,
}: {
  startDate: string;
  endDate: string;
  onChangeStart: (date: string) => void;
  onChangeEnd: (date: string) => void;
}) {
  const quickRanges = [
    { label: 'Hoje', days: 0 },
    { label: '7 dias', days: 7 },
    { label: '15 dias', days: 15 },
    { label: '30 dias', days: 30 },
  ];

  const setQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    onChangeStart(start.toISOString().split('T')[0]);
    onChangeEnd(end.toISOString().split('T')[0]);
  };

  return (
    <View style={styles.dateRangeContainer}>
      <View style={styles.dateRow}>
        <View style={styles.dateField}>
          <Text style={styles.dateLabel}>De</Text>
          <TouchableOpacity style={[styles.dateInput, Shadows.xs]}>
            <Ionicons name="calendar-outline" size={16} color={Colors.textTertiary} />
            <Text style={styles.dateValue}>{startDate}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.dateField}>
          <Text style={styles.dateLabel}>Ate</Text>
          <TouchableOpacity style={[styles.dateInput, Shadows.xs]}>
            <Ionicons name="calendar-outline" size={16} color={Colors.textTertiary} />
            <Text style={styles.dateValue}>{endDate}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.quickRangeRow}>
        {quickRanges.map((range) => (
          <TouchableOpacity
            key={range.label}
            style={styles.quickRangeChip}
            onPress={() => setQuickRange(range.days)}
            activeOpacity={0.7}
          >
            <Text style={styles.quickRangeText}>{range.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ============================================
// Bar Chart (simple)
// ============================================
function SimpleBarChart({
  data,
}: {
  data: { label: string; previsto: number; realizado: number }[];
}) {
  const maxValue = Math.max(...data.flatMap((d) => [d.previsto, d.realizado]));

  return (
    <View style={[styles.chartContainer, Shadows.sm]}>
      <Text style={styles.chartTitle}>Previsto vs Realizado por Curral</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chartContent}>
          {data.map((item, index) => (
            <View key={index} style={styles.chartBarGroup}>
              <View style={styles.chartBarsRow}>
                <View
                  style={[
                    styles.chartBar,
                    {
                      height: maxValue > 0 ? (item.previsto / maxValue) * 120 : 0,
                      backgroundColor: Colors.info + '60',
                    },
                  ]}
                />
                <View
                  style={[
                    styles.chartBar,
                    {
                      height: maxValue > 0 ? (item.realizado / maxValue) * 120 : 0,
                      backgroundColor: Colors.primary,
                    },
                  ]}
                />
              </View>
              <Text style={styles.chartLabel} numberOfLines={1}>{item.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.info + '60' }]} />
          <Text style={styles.legendText}>Previsto</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
          <Text style={styles.legendText}>Realizado</Text>
        </View>
      </View>
    </View>
  );
}

// ============================================
// Main Screen
// ============================================
export default function RelatoriosScreen() {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ReportType>('resumo_diario');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const { fazendaAtiva } = useAutomacaoStore();
  const fazenda_id = fazendaAtiva?.fazenda_id ?? '';

  // Real data state
  const [resumoStats, setResumoStats] = useState<ResumoStats>({
    total_fabricado_kg: 0,
    total_fornecido_kg: 0,
    total_previsto_kg: 0,
    eficiencia_perc: 0,
    total_descartes: 0,
    total_lotes: 0,
  });

  const [fornecimentoData, setFornecimentoData] = useState<FornecimentoReport[]>([]);
  const [fabricacaoData, setFabricacaoData] = useState<FabricacaoReport[]>([]);

  const chartData = fornecimentoData.map((f) => ({
    label: f.curral,
    previsto: f.previsto_kg,
    realizado: f.realizado_kg,
  }));

  // ---- Fetch real data from Supabase ----

  const fetchFornecimentoReport = useCallback(async () => {
    if (!fazenda_id) return;
    try {
      const { data, error } = await supabase
        .from('view_auto_previsto_vs_realizado')
        .select('*')
        .eq('fazenda_id', fazenda_id)
        .gte('data_registro', startDate)
        .lte('data_registro', endDate);

      if (error) throw error;

      const rows: FornecimentoReport[] = (data ?? []).map((r: any) => ({
        curral: r.curral_codigo || r.curral_nome || 'N/A',
        previsto_kg: r.previsto_kg ?? 0,
        realizado_kg: r.realizado_kg ?? 0,
        diferenca_kg: (r.realizado_kg ?? 0) - (r.previsto_kg ?? 0),
        diferenca_perc: r.previsto_kg > 0
          ? (((r.realizado_kg ?? 0) - (r.previsto_kg ?? 0)) / r.previsto_kg) * 100
          : 0,
      }));

      setFornecimentoData(rows);
    } catch (err: any) {
      console.error('Erro fornecimento report:', err.message);
    }
  }, [fazenda_id, startDate, endDate]);

  const fetchFabricacaoReport = useCallback(async () => {
    if (!fazenda_id) return;
    try {
      const { data, error } = await supabase
        .from('vet_auto_fabricacoes')
        .select(`
          id,
          lote_fabricacao,
          total_kg_mn_previsto,
          total_kg_mn_fabricada,
          data_registro,
          receita:receita_id ( id, nome )
        `)
        .eq('fazenda_id', fazenda_id)
        .gte('data_registro', startDate)
        .lte('data_registro', endDate)
        .in('status', ['processado', 'processando'])
        .order('data_registro', { ascending: false });

      if (error) throw error;

      const rows: FabricacaoReport[] = (data ?? []).map((r: any) => {
        const previsto = r.total_kg_mn_previsto ?? 0;
        const fabricado = r.total_kg_mn_fabricada ?? 0;
        return {
          receita: r.receita?.nome || 'N/A',
          lote: r.lote_fabricacao,
          previsto_kg: previsto,
          fabricado_kg: fabricado,
          diferenca_perc: previsto > 0 ? ((fabricado - previsto) / previsto) * 100 : 0,
          data: r.data_registro,
        };
      });

      setFabricacaoData(rows);
    } catch (err: any) {
      console.error('Erro fabricacao report:', err.message);
    }
  }, [fazenda_id, startDate, endDate]);

  const fetchResumo = useCallback(async () => {
    if (!fazenda_id) return;
    try {
      // Try using the view first
      const { data: viewData, error: viewError } = await supabase
        .from('view_auto_resumo_diario')
        .select('*')
        .eq('fazenda_id', fazenda_id)
        .gte('data_registro', startDate)
        .lte('data_registro', endDate);

      if (!viewError && viewData && viewData.length > 0) {
        // Aggregate from view rows
        const totals = viewData.reduce(
          (acc: any, r: any) => ({
            total_fabricado_kg: acc.total_fabricado_kg + (r.total_fabricado_kg ?? 0),
            total_fornecido_kg: acc.total_fornecido_kg + (r.total_fornecido_kg ?? 0),
            total_previsto_kg: acc.total_previsto_kg + (r.total_previsto_kg ?? 0),
            total_descartes: acc.total_descartes + (r.total_descartes_kg ?? 0),
            total_lotes: acc.total_lotes + (r.total_lotes ?? 0),
          }),
          { total_fabricado_kg: 0, total_fornecido_kg: 0, total_previsto_kg: 0, total_descartes: 0, total_lotes: 0 }
        );

        setResumoStats({
          ...totals,
          eficiencia_perc: totals.total_previsto_kg > 0
            ? (totals.total_fornecido_kg / totals.total_previsto_kg) * 100
            : 0,
        });
        return;
      }

      // Fallback: aggregate manually from tables
      const [fabRes, fornRes, descRes] = await Promise.all([
        supabase
          .from('vet_auto_fabricacoes')
          .select('total_kg_mn_fabricada, total_kg_mn_previsto')
          .eq('fazenda_id', fazenda_id)
          .gte('data_registro', startDate)
          .lte('data_registro', endDate)
          .in('status', ['processado', 'processando']),
        supabase
          .from('vet_auto_fornecimentos')
          .select('fornecido_kg')
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59'),
        supabase
          .from('vet_auto_descartes')
          .select('quantidade_kg')
          .gte('created_at', startDate)
          .lte('created_at', endDate + 'T23:59:59'),
      ]);

      const fabs = fabRes.data ?? [];
      const forns = fornRes.data ?? [];
      const descs = descRes.data ?? [];

      const total_fabricado = fabs.reduce((s: number, f: any) => s + (f.total_kg_mn_fabricada ?? 0), 0);
      const total_previsto = fabs.reduce((s: number, f: any) => s + (f.total_kg_mn_previsto ?? 0), 0);
      const total_fornecido = forns.reduce((s: number, f: any) => s + (f.fornecido_kg ?? 0), 0);
      const total_descartes = descs.reduce((s: number, d: any) => s + (d.quantidade_kg ?? 0), 0);

      setResumoStats({
        total_fabricado_kg: total_fabricado,
        total_fornecido_kg: total_fornecido,
        total_previsto_kg: total_previsto,
        eficiencia_perc: total_previsto > 0 ? (total_fornecido / total_previsto) * 100 : 0,
        total_descartes,
        total_lotes: fabs.length,
      });
    } catch (err: any) {
      console.error('Erro resumo report:', err.message);
    }
  }, [fazenda_id, startDate, endDate]);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchResumo(),
      fetchFornecimentoReport(),
      fetchFabricacaoReport(),
    ]);
    setLoading(false);
  }, [fetchResumo, fetchFornecimentoReport, fetchFabricacaoReport]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  }, [fetchAllData]);

  const handleExport = async () => {
    try {
      // Build CSV content based on selected report
      let csvContent = '';
      let filename = '';

      switch (selectedReport) {
        case 'fornecimento':
          csvContent = 'Curral;Previsto (kg);Realizado (kg);Diferenca (kg);Diferenca (%)\n';
          fornecimentoData.forEach((r) => {
            csvContent += `${r.curral};${r.previsto_kg.toFixed(0)};${r.realizado_kg.toFixed(0)};${r.diferenca_kg.toFixed(0)};${r.diferenca_perc.toFixed(1)}\n`;
          });
          filename = `relatorio_fornecimento_${startDate}_${endDate}.csv`;
          break;
        case 'fabricacao':
          csvContent = 'Receita;Lote;Previsto (kg);Fabricado (kg);Diferenca (%);Data\n';
          fabricacaoData.forEach((r) => {
            csvContent += `${r.receita};${r.lote};${r.previsto_kg.toFixed(0)};${r.fabricado_kg.toFixed(0)};${r.diferenca_perc.toFixed(1)};${r.data}\n`;
          });
          filename = `relatorio_fabricacao_${startDate}_${endDate}.csv`;
          break;
        case 'previsto_realizado':
          csvContent = 'Curral;Previsto (kg);Realizado (kg);Diferenca (%)\n';
          fornecimentoData.forEach((r) => {
            csvContent += `${r.curral};${r.previsto_kg.toFixed(0)};${r.realizado_kg.toFixed(0)};${r.diferenca_perc.toFixed(1)}\n`;
          });
          filename = `relatorio_previsto_vs_realizado_${startDate}_${endDate}.csv`;
          break;
        case 'resumo_diario':
          csvContent = 'Metrica;Valor\n';
          csvContent += `Total Fabricado (kg);${resumoStats.total_fabricado_kg.toFixed(0)}\n`;
          csvContent += `Total Fornecido (kg);${resumoStats.total_fornecido_kg.toFixed(0)}\n`;
          csvContent += `Total Previsto (kg);${resumoStats.total_previsto_kg.toFixed(0)}\n`;
          csvContent += `Eficiencia (%);${resumoStats.eficiencia_perc.toFixed(1)}\n`;
          csvContent += `Total Descartes (kg);${resumoStats.total_descartes.toFixed(0)}\n`;
          csvContent += `Total Lotes;${resumoStats.total_lotes}\n`;
          filename = `relatorio_resumo_${startDate}_${endDate}.csv`;
          break;
      }

      if (FileSystem && FileSystem.documentDirectory) {
        const filePath = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(filePath, csvContent, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(filePath, {
            mimeType: 'text/csv',
            dialogTitle: 'Exportar Relatorio',
          });
        } else {
          Alert.alert('Sucesso', `Arquivo salvo em: ${filePath}`);
        }
      } else {
        // Fallback: share as text
        await Share.share({
          message: csvContent,
          title: filename,
        });
      }
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao exportar relatorio');
    }
  };

  const renderResumo = () => (
    <Animated.View entering={FadeInDown.delay(100)}>
      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, Shadows.xs]}>
          <Ionicons name="flask-outline" size={22} color={Colors.info} />
          <Text style={styles.statValue}>{(resumoStats.total_fabricado_kg / 1000).toFixed(1)} t</Text>
          <Text style={styles.statLabel}>Fabricado</Text>
        </View>
        <View style={[styles.statCard, Shadows.xs]}>
          <Ionicons name="car-outline" size={22} color={Colors.primary} />
          <Text style={styles.statValue}>{(resumoStats.total_fornecido_kg / 1000).toFixed(1)} t</Text>
          <Text style={styles.statLabel}>Fornecido</Text>
        </View>
        <View style={[styles.statCard, Shadows.xs]}>
          <Ionicons name="trending-up-outline" size={22} color={Colors.success} />
          <Text style={styles.statValue}>{resumoStats.eficiencia_perc}%</Text>
          <Text style={styles.statLabel}>Eficiencia</Text>
        </View>
        <View style={[styles.statCard, Shadows.xs]}>
          <Ionicons name="trash-outline" size={22} color={Colors.error} />
          <Text style={styles.statValue}>{resumoStats.total_descartes} kg</Text>
          <Text style={styles.statLabel}>Descartes</Text>
        </View>
      </View>

      {/* Chart */}
      <SimpleBarChart data={chartData} />
    </Animated.View>
  );

  const renderFornecimento = () => (
    <Animated.View entering={FadeInDown.delay(100)}>
      {fornecimentoData.map((item, index) => {
        const isOk = Math.abs(item.diferenca_perc) <= 3;
        return (
          <View key={index} style={[styles.reportRow, Shadows.xs]}>
            <View style={[styles.reportRowStatus, { backgroundColor: isOk ? Colors.success : Colors.error }]} />
            <View style={styles.reportRowContent}>
              <View style={styles.reportRowHeader}>
                <Text style={styles.reportRowTitle}>{item.curral}</Text>
                <Text
                  style={[
                    styles.reportRowDif,
                    { color: isOk ? Colors.success : Colors.error },
                  ]}
                >
                  {item.diferenca_perc >= 0 ? '+' : ''}{item.diferenca_perc.toFixed(1)}%
                </Text>
              </View>
              <View style={styles.reportRowValues}>
                <Text style={styles.reportRowDetail}>
                  Previsto: {item.previsto_kg.toFixed(0)} kg
                </Text>
                <Text style={styles.reportRowDetail}>
                  Realizado: {item.realizado_kg.toFixed(0)} kg
                </Text>
                <Text style={styles.reportRowDetail}>
                  Dif: {item.diferenca_kg >= 0 ? '+' : ''}{item.diferenca_kg.toFixed(0)} kg
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </Animated.View>
  );

  const renderFabricacao = () => (
    <Animated.View entering={FadeInDown.delay(100)}>
      {fabricacaoData.map((item, index) => {
        const isOk = Math.abs(item.diferenca_perc) <= 3;
        return (
          <View key={index} style={[styles.reportRow, Shadows.xs]}>
            <View style={[styles.reportRowStatus, { backgroundColor: isOk ? Colors.success : Colors.warning }]} />
            <View style={styles.reportRowContent}>
              <View style={styles.reportRowHeader}>
                <View>
                  <Text style={styles.reportRowTitle}>{item.receita}</Text>
                  <Text style={styles.reportRowSubtitle}>{item.lote}</Text>
                </View>
                <Text
                  style={[
                    styles.reportRowDif,
                    { color: isOk ? Colors.success : Colors.warning },
                  ]}
                >
                  {item.diferenca_perc >= 0 ? '+' : ''}{item.diferenca_perc.toFixed(1)}%
                </Text>
              </View>
              <View style={styles.reportRowValues}>
                <Text style={styles.reportRowDetail}>
                  Previsto: {item.previsto_kg.toFixed(0)} kg
                </Text>
                <Text style={styles.reportRowDetail}>
                  Fabricado: {item.fabricado_kg.toFixed(0)} kg
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </Animated.View>
  );

  const renderPrevistoRealizado = () => (
    <Animated.View entering={FadeInDown.delay(100)}>
      <SimpleBarChart data={chartData} />

      {/* Table */}
      <View style={[styles.tableContainer, Shadows.sm]}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Curral</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Previsto</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Realizado</Text>
          <Text style={[styles.tableHeaderCell, { flex: 0.7 }]}>Dif %</Text>
        </View>
        {fornecimentoData.map((item, index) => {
          const isOk = Math.abs(item.diferenca_perc) <= 3;
          return (
            <View
              key={index}
              style={[
                styles.tableRow,
                index % 2 === 0 && styles.tableRowAlt,
              ]}
            >
              <Text style={[styles.tableCell, { flex: 1, fontWeight: FontWeight.bold }]}>
                {item.curral}
              </Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>
                {item.previsto_kg.toFixed(0)}
              </Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>
                {item.realizado_kg.toFixed(0)}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { flex: 0.7, color: isOk ? Colors.success : Colors.error, fontWeight: FontWeight.bold },
                ]}
              >
                {item.diferenca_perc >= 0 ? '+' : ''}{item.diferenca_perc.toFixed(1)}%
              </Text>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );

  const renderReport = () => {
    switch (selectedReport) {
      case 'resumo_diario':
        return renderResumo();
      case 'fornecimento':
        return renderFornecimento();
      case 'fabricacao':
        return renderFabricacao();
      case 'previsto_realizado':
        return renderPrevistoRealizado();
    }
  };

  const renderHeader = () => (
    <Animated.View entering={FadeIn.delay(100)}>
      {/* Date Range */}
      <DateRangeSelector
        startDate={startDate}
        endDate={endDate}
        onChangeStart={setStartDate}
        onChangeEnd={setEndDate}
      />

      {/* Report Type Selector */}
      <Text style={styles.sectionTitle}>Tipo de Relatorio</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reportTypeScroll}>
        {REPORT_TYPES.map((rt) => {
          const isSelected = selectedReport === rt.id;
          return (
            <TouchableOpacity
              key={rt.id}
              style={[
                styles.reportTypeChip,
                isSelected && { backgroundColor: rt.color, borderColor: rt.color },
              ]}
              onPress={() => setSelectedReport(rt.id)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={rt.icon as any}
                size={16}
                color={isSelected ? Colors.textLight : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.reportTypeText,
                  isSelected && { color: Colors.textLight },
                ]}
              >
                {rt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Report Content */}
      {renderReport()}
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
            <Text style={styles.headerTitle}>Relatorios</Text>
            <Text style={styles.headerSubtitle}>Analise de dados</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.exportButton}
          onPress={handleExport}
          activeOpacity={0.7}
        >
          <Ionicons name="download-outline" size={20} color={Colors.textLight} />
          <Text style={styles.exportButtonText}>Excel</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
      >
        {renderHeader()}
      </ScrollView>
    </View>
  );
}

// ============================================
// Styles
// ============================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  listContent: { padding: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xxl },

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
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  exportButtonText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textLight },

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

  // Date Range
  dateRangeContainer: {
    marginBottom: Spacing.sm,
  },
  dateRow: { flexDirection: 'row', gap: Spacing.sm },
  dateField: { flex: 1 },
  dateLabel: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: Spacing.xs,
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  dateValue: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  quickRangeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  quickRangeChip: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickRangeText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },

  // Report Type
  reportTypeScroll: { marginBottom: Spacing.md },
  reportTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginRight: Spacing.sm,
  },
  reportTypeText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    alignItems: 'center',
    width: '48%',
    flexGrow: 1,
  },
  statValue: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 2,
  },

  // Chart
  chartContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  chartTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  chartContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.md,
    height: 140,
    paddingBottom: 20,
  },
  chartBarGroup: {
    alignItems: 'center',
    minWidth: 50,
  },
  chartBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  chartBar: {
    width: 18,
    borderRadius: 4,
    minHeight: 4,
  },
  chartLabel: {
    fontSize: FontSize.xxs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
    marginTop: Spacing.xs,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },

  // Report Rows
  reportRow: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  reportRowStatus: { width: 4 },
  reportRowContent: { flex: 1, padding: Spacing.md },
  reportRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  reportRowTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  reportRowSubtitle: { fontSize: FontSize.xs, color: Colors.textSecondary },
  reportRowDif: { fontSize: FontSize.lg, fontWeight: FontWeight.extrabold },
  reportRowValues: { flexDirection: 'row', gap: Spacing.md },
  reportRowDetail: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium },

  // Table
  tableContainer: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  tableHeaderCell: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  tableRowAlt: {
    backgroundColor: Colors.surfaceSubtle,
  },
  tableCell: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: FontWeight.medium,
  },
});
