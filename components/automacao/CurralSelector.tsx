import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadows } from '@/constants/theme';

// ============================================
// Types
// ============================================
interface CurralItem {
  id: string;
  nome: string;
  numero: number | null;
  receita_nome?: string;
  previsto_kg?: number;
}

interface CurralSelectorProps {
  currais: CurralItem[];
  selectedId: string | null;
  onSelect: (curral: CurralItem) => void;
  placeholder?: string;
}

// ============================================
// Component
// ============================================
export function CurralSelector({
  currais,
  selectedId,
  onSelect,
  placeholder = 'Buscar curral...',
}: CurralSelectorProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return currais;
    const q = search.toLowerCase();
    return currais.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        (c.numero != null && c.numero.toString().includes(q)),
    );
  }, [currais, search]);

  const renderItem = ({ item, index }: { item: CurralItem; index: number }) => {
    const isSelected = item.id === selectedId;

    return (
      <Animated.View entering={FadeInDown.delay(index * 30).springify()}>
        <TouchableOpacity
          style={[
            styles.curralItem,
            Shadows.xs,
            isSelected && styles.curralItemSelected,
          ]}
          onPress={() => onSelect(item)}
          activeOpacity={0.7}
        >
          <View style={styles.curralItemLeft}>
            <View
              style={[
                styles.curralIcon,
                { backgroundColor: isSelected ? Colors.primarySubtle : Colors.surfaceSubtle },
              ]}
            >
              <Ionicons
                name="grid-outline"
                size={18}
                color={isSelected ? Colors.primary : Colors.textTertiary}
              />
            </View>
            <View style={styles.curralInfo}>
              <Text style={styles.curralNome}>{item.nome}</Text>
              {item.numero != null && (
                <Text style={styles.curralNumero}>Curral {item.numero}</Text>
              )}
            </View>
          </View>

          <View style={styles.curralItemRight}>
            {item.receita_nome && (
              <Text style={styles.receitaText} numberOfLines={1}>{item.receita_nome}</Text>
            )}
            {item.previsto_kg != null && item.previsto_kg > 0 && (
              <Text style={styles.previstoText}>{item.previsto_kg.toFixed(0)} kg</Text>
            )}
            {isSelected && (
              <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={[styles.searchContainer, Shadows.xs]}>
        <Ionicons name="search" size={18} color={Colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={placeholder}
          placeholderTextColor={Colors.placeholder}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Count */}
      <Text style={styles.countText}>
        {filtered.length} currai{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
      </Text>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={32} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>Nenhum curral encontrado</Text>
          </View>
        }
      />
    </View>
  );
}

// ============================================
// Styles
// ============================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: FontWeight.medium,
    paddingVertical: 0,
  },
  countText: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  curralItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  curralItemSelected: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  curralItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  curralIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  curralInfo: {
    flex: 1,
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
  curralItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  receitaText: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
    maxWidth: 80,
  },
  previstoText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
});
