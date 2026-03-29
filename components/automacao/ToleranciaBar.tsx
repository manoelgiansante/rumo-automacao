import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '@/constants/theme';

// ============================================
// Types
// ============================================
interface ToleranciaBarProps {
  pesoAtual: number;
  pesoPrevisto: number;
  toleranciaPerc: number;
}

// ============================================
// Component
// ============================================
export function ToleranciaBar({ pesoAtual, pesoPrevisto, toleranciaPerc }: ToleranciaBarProps) {
  const toleranciaKg = (pesoPrevisto * toleranciaPerc) / 100;
  const pesoMinimo = pesoPrevisto - toleranciaKg;
  const pesoMaximo = pesoPrevisto + toleranciaKg;

  // Range total da barra: 0 ate pesoMaximo + toleranciaKg (para dar margem visual)
  const rangeTotal = pesoMaximo + toleranciaKg * 0.5;

  // Posicoes percentuais na barra
  const posMinimo = Math.max(0, (pesoMinimo / rangeTotal) * 100);
  const posMaximo = Math.min(100, (pesoMaximo / rangeTotal) * 100);
  const posAtual = Math.min(100, Math.max(0, (pesoAtual / rangeTotal) * 100));

  // Determinar cor do marcador
  const dentroTolerancia = pesoAtual >= pesoMinimo && pesoAtual <= pesoMaximo;
  const markerColor = dentroTolerancia ? Colors.success : Colors.error;

  return (
    <View style={styles.container}>
      {/* Labels superiores */}
      <View style={styles.labelsRow}>
        <Text style={styles.labelMin}>{pesoMinimo.toFixed(0)} kg</Text>
        <Text style={[styles.labelAtual, { color: markerColor }]}>
          {pesoAtual.toFixed(1)} kg
        </Text>
        <Text style={styles.labelMax}>{pesoMaximo.toFixed(0)} kg</Text>
      </View>

      {/* Barra */}
      <View style={styles.barContainer}>
        {/* Zona vermelha esquerda (abaixo) */}
        <View style={[styles.zoneBelow, { width: `${posMinimo}%` }]} />

        {/* Zona verde (ok) */}
        <View
          style={[
            styles.zoneOk,
            { left: `${posMinimo}%`, width: `${posMaximo - posMinimo}%` },
          ]}
        />

        {/* Zona vermelha direita (acima) */}
        <View
          style={[
            styles.zoneAbove,
            { left: `${posMaximo}%`, width: `${100 - posMaximo}%` },
          ]}
        />

        {/* Marcador de posicao atual */}
        {pesoAtual > 0 && (
          <View style={[styles.marker, { left: `${posAtual}%`, backgroundColor: markerColor }]}>
            <View style={[styles.markerDot, { backgroundColor: markerColor }]} />
          </View>
        )}
      </View>

      {/* Label do previsto */}
      <View style={styles.previstoRow}>
        <Text style={styles.previstoLabel}>Previsto:</Text>
        <Text style={styles.previstoValue}>{pesoPrevisto.toFixed(1)} kg</Text>
        <Text style={styles.toleranciaLabel}>({toleranciaPerc}%)</Text>
      </View>
    </View>
  );
}

// ============================================
// Styles
// ============================================
const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.xs,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  labelMin: {
    fontSize: FontSize.xxs,
    color: Colors.error,
    fontWeight: FontWeight.medium,
  },
  labelAtual: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  labelMax: {
    fontSize: FontSize.xxs,
    color: Colors.error,
    fontWeight: FontWeight.medium,
  },
  barContainer: {
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.borderLight,
    overflow: 'hidden',
    position: 'relative',
  },
  zoneBelow: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    backgroundColor: '#FEE2E2',
  },
  zoneOk: {
    position: 'absolute',
    top: 0,
    height: '100%',
    backgroundColor: '#C3E8CF',
  },
  zoneAbove: {
    position: 'absolute',
    top: 0,
    height: '100%',
    backgroundColor: '#FEE2E2',
  },
  marker: {
    position: 'absolute',
    top: -2,
    width: 4,
    height: 16,
    borderRadius: 2,
    marginLeft: -2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  previstoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  previstoLabel: {
    fontSize: FontSize.xxs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
  previstoValue: {
    fontSize: FontSize.xxs,
    color: Colors.text,
    fontWeight: FontWeight.bold,
  },
  toleranciaLabel: {
    fontSize: FontSize.xxs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
});
