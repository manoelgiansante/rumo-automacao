import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadows } from '@/constants/theme';

// ============================================
// Types
// ============================================
interface FornecimentoCardProps {
  curral_nome: string;
  curral_numero: number | null;
  previsto_kg: number;
  fornecido_kg: number;
  hora: string | null;
  tag_inicial?: string | null;
  tag_final?: string | null;
}

// ============================================
// Component
// ============================================
export function FornecimentoCard({
  curral_nome,
  curral_numero,
  previsto_kg,
  fornecido_kg,
  hora,
  tag_inicial,
  tag_final,
}: FornecimentoCardProps) {
  const progresso = previsto_kg > 0 ? (fornecido_kg / previsto_kg) * 100 : 0;
  const diferenca = fornecido_kg - previsto_kg;
  const difPerc = previsto_kg > 0 ? (diferenca / previsto_kg) * 100 : 0;

  // Color logic: green if within 5%, red if over/under
  const isOk = Math.abs(difPerc) <= 5;
  const progressColor = fornecido_kg === 0
    ? Colors.textTertiary
    : isOk
      ? Colors.success
      : Colors.error;

  return (
    <View style={[styles.container, Shadows.xs]}>
      <View style={[styles.statusBar, { backgroundColor: progressColor }]} />
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.curralIcon, { backgroundColor: progressColor + '20' }]}>
              <Ionicons name="grid-outline" size={18} color={progressColor} />
            </View>
            <View>
              <Text style={styles.curralNome}>{curral_nome}</Text>
              {curral_numero != null && (
                <Text style={styles.curralNumero}>Curral {curral_numero}</Text>
              )}
            </View>
          </View>
          {hora && (
            <Text style={styles.hora}>{hora}</Text>
          )}
        </View>

        {/* Progress */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(100, progresso)}%`,
                  backgroundColor: progressColor,
                },
              ]}
            />
          </View>
        </View>

        {/* Pesos row */}
        <View style={styles.pesosRow}>
          <View style={styles.pesoItem}>
            <Text style={styles.pesoLabel}>Previsto</Text>
            <Text style={styles.pesoValue}>{previsto_kg.toFixed(1)} kg</Text>
          </View>
          <View style={styles.pesoItem}>
            <Text style={styles.pesoLabel}>Fornecido</Text>
            <Text style={[styles.pesoValue, { color: progressColor }]}>
              {fornecido_kg > 0 ? `${fornecido_kg.toFixed(1)} kg` : '-'}
            </Text>
          </View>
          <View style={styles.pesoItem}>
            <Text style={styles.pesoLabel}>Diferenca</Text>
            <Text style={[styles.pesoValue, { color: fornecido_kg === 0 ? Colors.textTertiary : progressColor }]}>
              {fornecido_kg === 0 ? '-' : `${diferenca >= 0 ? '+' : ''}${diferenca.toFixed(1)} kg`}
            </Text>
          </View>
        </View>

        {/* Tags */}
        {(tag_inicial || tag_final) && (
          <View style={styles.tagsRow}>
            {tag_inicial && (
              <View style={styles.tagItem}>
                <Ionicons name="radio-button-on" size={10} color={Colors.info} />
                <Text style={styles.tagValue}>{tag_inicial}</Text>
              </View>
            )}
            {tag_final && (
              <View style={styles.tagItem}>
                <Ionicons name="radio-button-on" size={10} color={Colors.purple} />
                <Text style={styles.tagValue}>{tag_final}</Text>
              </View>
            )}
          </View>
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
  },
  curralIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  curralNome: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  curralNumero: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  hora: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
  progressContainer: {
    marginBottom: Spacing.sm,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
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
  tagsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagValue: {
    fontSize: FontSize.xxs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
});
