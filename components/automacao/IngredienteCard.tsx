import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadows } from '@/constants/theme';
import type { StatusIngrediente } from '@/types/automacao';
import { ToleranciaBar } from './ToleranciaBar';

// ============================================
// Types
// ============================================
interface IngredienteCardProps {
  nome: string;
  ordem: number;
  peso_previsto: number;
  peso_fabricado: number | null;
  tolerancia: number;
  status: StatusIngrediente;
}

// ============================================
// Helpers
// ============================================
const STATUS_CONFIG: Record<StatusIngrediente, { label: string; color: string; bg: string }> = {
  espera: { label: 'ESPERA', color: Colors.textTertiary, bg: Colors.surfaceSubtle },
  processando: { label: 'PROCESSANDO', color: Colors.info, bg: Colors.infoSubtle },
  processado: { label: 'PROCESSADO', color: Colors.success, bg: Colors.successSubtle },
  cancelado: { label: 'CANCELADO', color: Colors.error, bg: Colors.errorSubtle },
};

// ============================================
// Component
// ============================================
export function IngredienteCard({
  nome,
  ordem,
  peso_previsto,
  peso_fabricado,
  tolerancia,
  status,
}: IngredienteCardProps) {
  const statusConf = STATUS_CONFIG[status];
  const fabricado = peso_fabricado ?? 0;
  const progresso = peso_previsto > 0 ? Math.min(100, (fabricado / peso_previsto) * 100) : 0;
  const isCompleto = status === 'processado';

  return (
    <View style={[styles.container, Shadows.xs]}>
      {/* Status bar lateral */}
      <View style={[styles.statusBar, { backgroundColor: statusConf.color }]} />

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.ordemBadge}>
              <Text style={styles.ordemText}>{ordem}</Text>
            </View>
            <Text style={styles.nome} numberOfLines={1}>{nome}</Text>
          </View>

          <View style={styles.headerRight}>
            {isCompleto && (
              <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
            )}
            <View style={[styles.statusBadge, { backgroundColor: statusConf.bg }]}>
              <Text style={[styles.statusText, { color: statusConf.color }]}>
                {statusConf.label}
              </Text>
            </View>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progresso}%`,
                  backgroundColor: isCompleto ? Colors.success : Colors.primary,
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{progresso.toFixed(0)}%</Text>
        </View>

        {/* Pesos */}
        <View style={styles.pesosRow}>
          <View style={styles.pesoItem}>
            <Text style={styles.pesoLabel}>Previsto</Text>
            <Text style={styles.pesoValue}>{peso_previsto.toFixed(1)} kg</Text>
          </View>
          <View style={styles.pesoItem}>
            <Text style={styles.pesoLabel}>Fabricado</Text>
            <Text style={[styles.pesoValue, { color: isCompleto ? Colors.success : Colors.text }]}>
              {fabricado.toFixed(1)} kg
            </Text>
          </View>
          <View style={styles.pesoItem}>
            <Text style={styles.pesoLabel}>Diferenca</Text>
            <Text
              style={[
                styles.pesoValue,
                {
                  color:
                    fabricado === 0
                      ? Colors.textTertiary
                      : Math.abs(fabricado - peso_previsto) <= (peso_previsto * tolerancia) / 100
                        ? Colors.success
                        : Colors.error,
                },
              ]}
            >
              {fabricado === 0 ? '-' : `${(fabricado - peso_previsto).toFixed(1)} kg`}
            </Text>
          </View>
        </View>

        {/* Tolerancia bar (only when processando) */}
        {status === 'processando' && (
          <ToleranciaBar
            pesoAtual={fabricado}
            pesoPrevisto={peso_previsto}
            toleranciaPerc={tolerancia}
          />
        )}
      </View>
    </View>
  );
}

// ============================================
// Styles
// ============================================
const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  statusBar: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  ordemBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordemText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  nome: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs + 1,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: FontSize.xxs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    minWidth: 36,
    textAlign: 'right',
  },
  pesosRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  pesoItem: {
    flex: 1,
    alignItems: 'center',
  },
  pesoLabel: {
    fontSize: FontSize.xxs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  pesoValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
});
