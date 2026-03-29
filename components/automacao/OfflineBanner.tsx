import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { useOffline } from '@/hooks/useOffline';

// ============================================
// OfflineBanner Component
// Shows connectivity status at top of screens
// Yellow = offline, Green = online, Blue = syncing
// ============================================

interface OfflineBannerProps {
  /** Optional fazenda_id for manual sync */
  fazendaId?: string;
  /** Whether to show the sync button */
  showSyncButton?: boolean;
}

export function OfflineBanner({ fazendaId, showSyncButton = true }: OfflineBannerProps) {
  const { isOnline, pendingCount, syncing, forceSync, lastSync } = useOffline();
  const [visible, setVisible] = useState(false);
  const [showOnlineMessage, setShowOnlineMessage] = useState(false);
  const opacity = useState(new Animated.Value(0))[0];

  useEffect(() => {
    if (!isOnline) {
      // Offline: show yellow banner
      setVisible(true);
      setShowOnlineMessage(false);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (syncing) {
      // Syncing: show blue banner
      setVisible(true);
      setShowOnlineMessage(false);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (visible && isOnline && !syncing) {
      // Just came back online: show green message briefly
      setShowOnlineMessage(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      const timer = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => {
          setVisible(false);
          setShowOnlineMessage(false);
        });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [isOnline, syncing]);

  // Also show if there are pending records
  useEffect(() => {
    if (pendingCount > 0 && !visible) {
      setVisible(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [pendingCount]);

  if (!visible && pendingCount === 0) return null;

  const getBackgroundColor = () => {
    if (syncing) return styles.syncingBanner;
    if (showOnlineMessage) return styles.onlineBanner;
    if (!isOnline) return styles.offlineBanner;
    if (pendingCount > 0) return styles.pendingBanner;
    return styles.onlineBanner;
  };

  const getMessage = () => {
    if (syncing) {
      return `Sincronizando... (${pendingCount} pendente${pendingCount !== 1 ? 's' : ''})`;
    }
    if (showOnlineMessage) {
      return 'Online - dados sincronizados';
    }
    if (!isOnline) {
      return 'Modo Offline - dados salvos localmente';
    }
    if (pendingCount > 0) {
      return `${pendingCount} registro${pendingCount !== 1 ? 's' : ''} pendente${pendingCount !== 1 ? 's' : ''} de sincronizacao`;
    }
    return 'Online - dados sincronizados';
  };

  const formatLastSync = () => {
    if (!lastSync) return '';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSync.getTime()) / 1000);

    if (diff < 60) return `${diff}s atras`;
    if (diff < 3600) return `${Math.floor(diff / 60)}min atras`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atras`;
    return lastSync.toLocaleDateString('pt-BR');
  };

  const handleSync = () => {
    if (!syncing && isOnline) {
      forceSync(fazendaId);
    }
  };

  return (
    <Animated.View style={[styles.container, getBackgroundColor(), { opacity }]}>
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <Text style={styles.message}>{getMessage()}</Text>
          {lastSync && !syncing && (
            <Text style={styles.lastSync}>
              Ultima sync: {formatLastSync()}
            </Text>
          )}
        </View>

        <View style={styles.rightSection}>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount}</Text>
            </View>
          )}

          {showSyncButton && isOnline && !syncing && pendingCount > 0 && (
            <TouchableOpacity
              style={styles.syncButton}
              onPress={handleSync}
              activeOpacity={0.7}
            >
              <Text style={styles.syncButtonText}>Sincronizar</Text>
            </TouchableOpacity>
          )}

          {syncing && (
            <View style={styles.syncingIndicator}>
              <Text style={styles.syncingDots}>...</Text>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 16,
    zIndex: 999,
  },
  offlineBanner: {
    backgroundColor: '#F59E0B',
  },
  onlineBanner: {
    backgroundColor: '#10B981',
  },
  syncingBanner: {
    backgroundColor: '#3B82F6',
  },
  pendingBanner: {
    backgroundColor: '#F97316',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textContainer: {
    flex: 1,
  },
  message: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  lastSync: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
    marginTop: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  syncButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  syncingIndicator: {
    marginLeft: 4,
  },
  syncingDots: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
