import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface BadgeProps {
  label: string;
  color?: 'success' | 'error' | 'info' | 'default' | 'warning';
  size?: 'sm' | 'md';
}

const COLOR_MAP = {
  success: { bg: '#E8F5E9', text: '#2E7D32' },
  error: { bg: '#FFEBEE', text: '#C62828' },
  info: { bg: '#E3F2FD', text: '#1565C0' },
  warning: { bg: '#FFF3E0', text: '#E65100' },
  default: { bg: '#F5F5F5', text: '#616161' },
};

export function Badge({ label, color = 'default', size = 'md' }: BadgeProps) {
  const colors = COLOR_MAP[color];
  const isSmall = size === 'sm';
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, isSmall && styles.badgeSm]}>
      <Text style={[styles.text, { color: colors.text }, isSmall && styles.textSm]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  badgeSm: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  text: { fontSize: 12, fontWeight: '600' },
  textSm: { fontSize: 10 },
});
