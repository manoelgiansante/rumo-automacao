import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
} from 'react-native-reanimated';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadows } from '@/constants/theme';

// ============================================
// Types
// ============================================
type PesoStatus = 'estavel' | 'movimento' | 'desconectado';
type PesoTamanho = 'grande' | 'medio' | 'pequeno';

interface PesoDisplayProps {
  peso: number;
  unidade?: string;
  status: PesoStatus;
  tamanho?: PesoTamanho;
}

// ============================================
// Helpers
// ============================================
const STATUS_CONFIG: Record<PesoStatus, { color: string; label: string; icon: string }> = {
  estavel: { color: Colors.success, label: 'Estavel', icon: 'checkmark-circle' },
  movimento: { color: Colors.warning, label: 'Movimento', icon: 'refresh-circle' },
  desconectado: { color: Colors.error, label: 'Desconectado', icon: 'close-circle' },
};

const TAMANHO_CONFIG: Record<PesoTamanho, { fontSize: number; unitSize: number; height: number }> = {
  grande: { fontSize: 64, unitSize: FontSize.xxl, height: 140 },
  medio: { fontSize: 42, unitSize: FontSize.lg, height: 100 },
  pequeno: { fontSize: 28, unitSize: FontSize.md, height: 72 },
};

// ============================================
// Component
// ============================================
export function PesoDisplay({ peso, unidade = 'kg', status, tamanho = 'grande' }: PesoDisplayProps) {
  const statusConf = STATUS_CONFIG[status];
  const tamanhoConf = TAMANHO_CONFIG[tamanho];

  // Animated pulse when peso is changing (movimento)
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (status === 'movimento') {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulseOpacity);
      pulseOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [status]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const pesoFormatado = status === 'desconectado' ? '---' : peso.toFixed(1);

  return (
    <View style={[styles.container, { minHeight: tamanhoConf.height }, Shadows.sm]}>
      {/* Status indicator */}
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: statusConf.color }]} />
        <Text style={[styles.statusLabel, { color: statusConf.color }]}>
          {statusConf.label}
        </Text>
      </View>

      {/* Peso display */}
      <Animated.View style={[styles.pesoRow, pulseStyle]}>
        <Text
          style={[
            styles.pesoText,
            {
              fontSize: tamanhoConf.fontSize,
              color: status === 'desconectado' ? Colors.disabled : Colors.text,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {pesoFormatado}
        </Text>
        <Text
          style={[
            styles.unidadeText,
            {
              fontSize: tamanhoConf.unitSize,
              color: status === 'desconectado' ? Colors.disabled : Colors.textSecondary,
            },
          ]}
        >
          {unidade}
        </Text>
      </Animated.View>
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
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pesoRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
  },
  pesoText: {
    fontWeight: FontWeight.extrabold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  unidadeText: {
    fontWeight: FontWeight.medium,
  },
});
