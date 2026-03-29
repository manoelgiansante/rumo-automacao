import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadows } from '@/constants/theme';
import type { StatusConexao } from '@/types/automacao';

// ============================================
// Types
// ============================================
interface StatusHardwareProps {
  statusBalanca: StatusConexao;
  statusRFID: StatusConexao;
  statusDisplay: StatusConexao;
}

// ============================================
// Helpers
// ============================================
const STATUS_COLOR: Record<StatusConexao, string> = {
  conectado: Colors.success,
  conectando: Colors.warning,
  reconectando: Colors.warning,
  desconectado: Colors.error,
  erro: Colors.error,
};

const STATUS_LABEL: Record<StatusConexao, string> = {
  conectado: 'Conectado',
  conectando: 'Conectando...',
  reconectando: 'Reconectando...',
  desconectado: 'Desconectado',
  erro: 'Erro',
};

function StatusDot({ label, status }: { label: string; status: StatusConexao }) {
  return (
    <View style={styles.dotItem}>
      <View style={[styles.dot, { backgroundColor: STATUS_COLOR[status] }]} />
      <Text style={styles.dotLabel}>{label}</Text>
    </View>
  );
}

// ============================================
// Detail Modal
// ============================================
function DetailModal({
  visible,
  onClose,
  statusBalanca,
  statusRFID,
  statusDisplay,
}: StatusHardwareProps & { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  const items = [
    { label: 'Balanca', status: statusBalanca, icon: 'speedometer-outline' as const },
    { label: 'RFID', status: statusRFID, icon: 'radio-outline' as const },
    { label: 'Display', status: statusDisplay, icon: 'tv-outline' as const },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Status dos Dispositivos</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {items.map((item) => (
            <View key={item.label} style={[styles.detailRow, Shadows.xs]}>
              <View style={styles.detailLeft}>
                <View style={[styles.detailIcon, { backgroundColor: STATUS_COLOR[item.status] + '20' }]}>
                  <Ionicons name={item.icon} size={22} color={STATUS_COLOR[item.status]} />
                </View>
                <View>
                  <Text style={styles.detailLabel}>{item.label}</Text>
                  <Text style={[styles.detailStatus, { color: STATUS_COLOR[item.status] }]}>
                    {STATUS_LABEL[item.status]}
                  </Text>
                </View>
              </View>
              <View style={[styles.detailDot, { backgroundColor: STATUS_COLOR[item.status] }]} />
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ============================================
// Component
// ============================================
export function StatusHardware({ statusBalanca, statusRFID, statusDisplay }: StatusHardwareProps) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.container, Shadows.xs]}
        onPress={() => setShowDetail(true)}
        activeOpacity={0.7}
      >
        <StatusDot label="Balanca" status={statusBalanca} />
        <View style={styles.separator} />
        <StatusDot label="RFID" status={statusRFID} />
        <View style={styles.separator} />
        <StatusDot label="Display" status={statusDisplay} />
      </TouchableOpacity>

      <DetailModal
        visible={showDetail}
        onClose={() => setShowDetail(false)}
        statusBalanca={statusBalanca}
        statusRFID={statusRFID}
        statusDisplay={statusDisplay}
      />
    </>
  );
}

// ============================================
// Styles
// ============================================
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  dotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  separator: {
    width: 1,
    height: 16,
    backgroundColor: Colors.borderLight,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    padding: Spacing.md,
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

  // Detail rows
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  detailIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  detailStatus: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  detailDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
