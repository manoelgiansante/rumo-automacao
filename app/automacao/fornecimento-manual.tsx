import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontWeight } from '@/constants/theme';
import { useFornecimento } from '@/hooks/useFornecimento';

// ============================================
// Types
// ============================================
interface CarregamentoOption {
  id: string;
  label: string;
  vagao_nome: string;
  numero_trato: number;
}

interface CurralOption {
  id: string;
  nome: string;
  tag_rfid: string;
  previsto_kg: number;
}

// ============================================
// Main Screen
// ============================================
export default function FornecimentoManualScreen() {
  const insets = useSafeAreaInsets();

  const forn = useFornecimento({
    autoCapturaInicial: false,
    autoCapturaFinal: false,
    vibrarAlerta: false,
  });

  const [selectedCarregamento, setSelectedCarregamento] = useState<string>('');
  const [selectedCurral, setSelectedCurral] = useState<string>('');
  const [searchCurral, setSearchCurral] = useState('');
  const [pesoInicial, setPesoInicial] = useState('');
  const [pesoFinal, setPesoFinal] = useState('');
  const [usarBalanca, setUsarBalanca] = useState(false);

  // Mock data - replace with real store data
  const carregamentos: CarregamentoOption[] = [
    { id: 'c1', label: 'Vagao 01 - Trato 1', vagao_nome: 'Vagao 01', numero_trato: 1 },
    { id: 'c2', label: 'Vagao 02 - Trato 1', vagao_nome: 'Vagao 02', numero_trato: 1 },
    { id: 'c3', label: 'Vagao 01 - Trato 2', vagao_nome: 'Vagao 01', numero_trato: 2 },
  ];

  const allCurrais: CurralOption[] = [
    { id: 'cur1', nome: 'C-01', tag_rfid: 'RFID-0001', previsto_kg: 2800 },
    { id: 'cur2', nome: 'C-02', tag_rfid: 'RFID-0002', previsto_kg: 2700 },
    { id: 'cur3', nome: 'C-03', tag_rfid: 'RFID-0003', previsto_kg: 3000 },
    { id: 'cur4', nome: 'C-04', tag_rfid: 'RFID-0004', previsto_kg: 2200 },
    { id: 'cur5', nome: 'C-05', tag_rfid: 'RFID-0005', previsto_kg: 1800 },
    { id: 'cur6', nome: 'C-06', tag_rfid: 'RFID-0006', previsto_kg: 1600 },
    { id: 'cur7', nome: 'C-07', tag_rfid: 'RFID-0007', previsto_kg: 1600 },
    { id: 'cur8', nome: 'C-08', tag_rfid: 'RFID-0008', previsto_kg: 2500 },
  ];

  // Filter currais by search
  const currais = useMemo(() => {
    if (!searchCurral.trim()) return allCurrais;
    const search = searchCurral.toLowerCase();
    return allCurrais.filter(
      (c) => c.nome.toLowerCase().includes(search) || c.tag_rfid.toLowerCase().includes(search)
    );
  }, [searchCurral]);

  const pesoInicialNum = usarBalanca ? (forn.pesoDisplay ?? 0) : (parseFloat(pesoInicial) || 0);
  const pesoFinalNum = parseFloat(pesoFinal) || 0;
  const realizadoKg = pesoInicialNum > pesoFinalNum ? pesoInicialNum - pesoFinalNum : 0;

  const selectedCurralObj = allCurrais.find((c) => c.id === selectedCurral);
  const previstoKg = selectedCurralObj?.previsto_kg ?? 0;

  const diferenca = realizadoKg - previstoKg;
  const diferencaPct = previstoKg > 0 ? (diferenca / previstoKg) * 100 : 0;

  const comparisonColor = useMemo(() => {
    if (realizadoKg === 0) return Colors.textTertiary;
    const absPct = Math.abs(diferencaPct);
    if (absPct <= 5) return Colors.success;
    if (absPct <= 15) return Colors.warning;
    return Colors.error;
  }, [realizadoKg, diferencaPct]);

  const canSubmit =
    selectedCarregamento &&
    selectedCurral &&
    (usarBalanca || pesoInicialNum > 0) &&
    pesoFinalNum >= 0 &&
    realizadoKg > 0 &&
    !forn.loadingSalvar;

  const handleRegistrar = useCallback(() => {
    if (!canSubmit) return;

    const curralNome = allCurrais.find((c) => c.id === selectedCurral)?.nome ?? '';
    const carrLabel = carregamentos.find((c) => c.id === selectedCarregamento)?.label ?? '';

    Alert.alert(
      'Fornecimento Registrado',
      `Carregamento: ${carrLabel}\nCurral: ${curralNome}\nRealizado: ${realizadoKg.toLocaleString('pt-BR')} kg\nPrevisto: ${previstoKg.toLocaleString('pt-BR')} kg\nDiferenca: ${diferenca > 0 ? '+' : ''}${diferenca.toLocaleString('pt-BR')} kg (${diferencaPct.toFixed(1)}%)`,
      [
        {
          text: 'OK',
          onPress: () => {
            // Reset for next entry
            setSelectedCurral('');
            setPesoInicial('');
            setPesoFinal('');
          },
        },
      ]
    );
  }, [canSubmit, selectedCarregamento, selectedCurral, realizadoKg, previstoKg, diferenca, diferencaPct]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Fornecimento Manual</Text>
            <Text style={styles.headerSubtitle}>Registro sem automacao</Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xxl }]}
      >
        {/* Carregamento */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={styles.inputLabel}>Carregamento</Text>
          <View style={styles.chipsRow}>
            {carregamentos.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.carregamentoChip,
                  selectedCarregamento === c.id && styles.chipSelected,
                  selectedCarregamento === c.id && Shadows.sm,
                ]}
                onPress={() => setSelectedCarregamento(c.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="cube-outline"
                  size={16}
                  color={selectedCarregamento === c.id ? Colors.textLight : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.carregamentoChipText,
                    selectedCarregamento === c.id && styles.chipTextSelected,
                  ]}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* Curral Search & Selection */}
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Text style={styles.inputLabel}>Curral</Text>

          {/* Search input */}
          <View style={styles.searchContainer}>
            <Ionicons name="search-outline" size={18} color={Colors.textTertiary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={searchCurral}
              onChangeText={setSearchCurral}
              placeholder="Buscar curral..."
              placeholderTextColor={Colors.placeholder}
            />
            {searchCurral.length > 0 && (
              <TouchableOpacity onPress={() => setSearchCurral('')}>
                <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.chipsRow}>
            {currais.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.curralChip,
                  selectedCurral === c.id && styles.chipSelected,
                  selectedCurral === c.id && Shadows.sm,
                ]}
                onPress={() => setSelectedCurral(c.id)}
                activeOpacity={0.7}
              >
                <View style={styles.curralChipContent}>
                  <Text
                    style={[
                      styles.curralChipName,
                      selectedCurral === c.id && styles.chipTextSelected,
                    ]}
                  >
                    {c.nome}
                  </Text>
                  <Text
                    style={[
                      styles.curralChipTag,
                      selectedCurral === c.id && { color: 'rgba(255,255,255,0.7)' },
                    ]}
                  >
                    {c.previsto_kg.toLocaleString('pt-BR')} kg
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* Previsto info */}
        {selectedCurralObj && (
          <Animated.View entering={FadeIn.duration(200)} style={[styles.previstoCard, Shadows.xs]}>
            <Ionicons name="clipboard-outline" size={18} color={Colors.info} />
            <Text style={styles.previstoText}>
              Previsto para {selectedCurralObj.nome}:{' '}
              <Text style={styles.previstoValue}>
                {selectedCurralObj.previsto_kg.toLocaleString('pt-BR')} kg
              </Text>
            </Text>
          </Animated.View>
        )}

        {/* Peso Mode Toggle */}
        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <View style={styles.pesoModeRow}>
            <TouchableOpacity
              style={[styles.pesoModeBtn, !usarBalanca && styles.pesoModeBtnActive]}
              onPress={() => setUsarBalanca(false)}
              activeOpacity={0.7}
            >
              <Ionicons name="keypad-outline" size={16} color={!usarBalanca ? Colors.textLight : Colors.textSecondary} />
              <Text style={[styles.pesoModeBtnText, !usarBalanca && { color: Colors.textLight }]}>Manual</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pesoModeBtn, usarBalanca && styles.pesoModeBtnActive]}
              onPress={() => setUsarBalanca(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="scale-outline" size={16} color={usarBalanca ? Colors.textLight : Colors.textSecondary} />
              <Text style={[styles.pesoModeBtnText, usarBalanca && { color: Colors.textLight }]}>Balanca</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Peso Inicial */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <Text style={styles.inputLabel}>Peso Inicial (kg)</Text>
          {usarBalanca ? (
            <View style={[styles.pesoBalancaDisplay, Shadows.xs]}>
              <Ionicons name="scale-outline" size={20} color={Colors.primary} />
              <Text style={styles.pesoBalancaValue}>
                {(forn.pesoDisplay ?? 0).toFixed(1).replace('.', ',')} kg
              </Text>
              <Text style={styles.pesoBalancaHint}>Leitura da balanca</Text>
            </View>
          ) : (
            <View style={styles.inputContainer}>
              <Ionicons name="arrow-up-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={pesoInicial}
                onChangeText={setPesoInicial}
                placeholder="Peso antes do fornecimento"
                placeholderTextColor={Colors.placeholder}
                keyboardType="numeric"
              />
              <Text style={styles.inputSuffix}>kg</Text>
            </View>
          )}
        </Animated.View>

        {/* Peso Final */}
        <Animated.View entering={FadeInDown.delay(400).springify()}>
          <Text style={styles.inputLabel}>Peso Final (kg)</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="arrow-down-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={pesoFinal}
              onChangeText={setPesoFinal}
              placeholder="Peso apos o fornecimento"
              placeholderTextColor={Colors.placeholder}
              keyboardType="numeric"
            />
            <Text style={styles.inputSuffix}>kg</Text>
          </View>
        </Animated.View>

        {/* Auto calculation result */}
        {realizadoKg > 0 && (
          <Animated.View entering={FadeIn.duration(200)} style={[styles.resultCard, Shadows.sm]}>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Realizado</Text>
              <Text style={styles.resultValue}>{realizadoKg.toLocaleString('pt-BR')} kg</Text>
            </View>
            {previstoKg > 0 && (
              <>
                <View style={styles.resultSeparator} />
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Previsto</Text>
                  <Text style={styles.resultValue}>{previstoKg.toLocaleString('pt-BR')} kg</Text>
                </View>
                <View style={styles.resultSeparator} />
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Diferenca</Text>
                  <View style={styles.resultDiffRow}>
                    <View style={[styles.resultDiffBadge, { backgroundColor: comparisonColor + '15' }]}>
                      <Text style={[styles.resultDiffText, { color: comparisonColor }]}>
                        {diferenca > 0 ? '+' : ''}
                        {diferenca.toLocaleString('pt-BR')} kg ({diferencaPct.toFixed(1)}%)
                      </Text>
                    </View>
                  </View>
                </View>
                {/* Visual bar */}
                <View style={styles.comparisonBar}>
                  <View style={styles.comparisonBarBg}>
                    <View
                      style={[
                        styles.comparisonBarFill,
                        {
                          width: `${Math.min((realizadoKg / previstoKg) * 100, 100)}%`,
                          backgroundColor: comparisonColor,
                        },
                      ]}
                    />
                  </View>
                  <View style={[styles.comparisonTarget, { left: '100%' }]}>
                    <View style={styles.comparisonTargetLine} />
                  </View>
                </View>
              </>
            )}
          </Animated.View>
        )}

        {/* Submit */}
        <Animated.View entering={FadeInDown.delay(500).springify()} style={styles.submitContainer}>
          <TouchableOpacity
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled, canSubmit && Shadows.md]}
            onPress={handleRegistrar}
            disabled={!canSubmit}
            activeOpacity={0.7}
          >
            {forn.loadingSalvar ? (
              <ActivityIndicator color={Colors.textLight} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color={Colors.textLight} />
                <Text style={styles.submitButtonText}>Registrar</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ============================================
// Styles
// ============================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.md },

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

  // Form
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    minHeight: 44,
  },
  searchIcon: { marginRight: Spacing.sm },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    paddingVertical: Spacing.sm,
  },

  // Carregamento chips
  carregamentoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    minHeight: 48,
  },
  carregamentoChipText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },

  // Curral chips
  curralChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    minHeight: 48,
    justifyContent: 'center',
  },
  curralChipContent: { alignItems: 'center' },
  curralChipName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  curralChipTag: { fontSize: FontSize.xxs, color: Colors.textTertiary, marginTop: 1 },

  // Shared chip styles
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTextSelected: { color: Colors.textLight },

  // Previsto info
  previstoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.infoSubtle,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  previstoText: { fontSize: FontSize.md, color: Colors.text },
  previstoValue: { fontWeight: FontWeight.extrabold, color: Colors.info },

  // Peso mode toggle
  pesoModeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  pesoModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  pesoModeBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pesoModeBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },

  // Peso balanca display
  pesoBalancaDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primarySubtle,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  pesoBalancaValue: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.primary },
  pesoBalancaHint: { fontSize: FontSize.xs, color: Colors.textTertiary, marginLeft: 'auto' },

  // Input
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 56,
    paddingHorizontal: Spacing.md,
  },
  inputIcon: { marginRight: Spacing.sm },
  input: {
    flex: 1,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    paddingVertical: Spacing.sm + 4,
  },
  inputSuffix: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary },

  // Result card
  resultCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  resultLabel: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  resultValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  resultSeparator: { height: 1, backgroundColor: Colors.borderLight },
  resultDiffRow: { flexDirection: 'row', alignItems: 'center' },
  resultDiffBadge: { paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  resultDiffText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  // Comparison bar
  comparisonBar: { marginTop: Spacing.sm, position: 'relative' },
  comparisonBarBg: { height: 8, backgroundColor: Colors.borderLight, borderRadius: 4, overflow: 'hidden' },
  comparisonBarFill: { height: '100%', borderRadius: 4 },
  comparisonTarget: { position: 'absolute', top: -2, marginLeft: -1 },
  comparisonTargetLine: { width: 2, height: 12, backgroundColor: Colors.text, borderRadius: 1 },

  // Submit
  submitContainer: { marginTop: Spacing.xl },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md + 4,
    minHeight: 60,
  },
  submitButtonDisabled: { backgroundColor: Colors.disabled },
  submitButtonText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textLight },
});
