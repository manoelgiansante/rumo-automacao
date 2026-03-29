import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Colors, Spacing, FontSize, BorderRadius, Shadows, FontWeight } from '@/constants/theme';
import { getOperadoresAtivos, autenticarOperador } from '@/services/usuarioService';
import type { VetAutoUsuario, UsuarioAutenticado } from '@/services/usuarioService';

// ============================================
// Main Screen
// ============================================
export default function LoginOperadorScreen() {
  const insets = useSafeAreaInsets();
  const [operadores, setOperadores] = useState<VetAutoUsuario[]>([]);
  const [selectedOperador, setSelectedOperador] = useState<VetAutoUsuario | null>(null);
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // TODO: pegar fazenda_id do contexto/store global
  const fazenda_id = '';

  const carregarOperadores = useCallback(async () => {
    if (!fazenda_id) {
      setLoadingList(false);
      return;
    }
    try {
      setLoadingList(true);
      const lista = await getOperadoresAtivos(fazenda_id);
      setOperadores(lista);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Erro ao carregar operadores');
    } finally {
      setLoadingList(false);
    }
  }, [fazenda_id]);

  useEffect(() => {
    carregarOperadores();
  }, [carregarOperadores]);

  const handleLogin = async () => {
    if (!selectedOperador) {
      Alert.alert('Atencao', 'Selecione um operador');
      return;
    }
    if (!senha.trim()) {
      Alert.alert('Atencao', 'Digite a senha');
      return;
    }

    try {
      setLoading(true);
      const resultado: UsuarioAutenticado = await autenticarOperador(
        fazenda_id,
        selectedOperador.login,
        senha
      );

      // TODO: salvar operador autenticado no automacaoStore
      // automacaoStore.setState({ operadorAtual: resultado });

      Alert.alert('Sucesso', `Bem-vindo, ${resultado.nome}!`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Login ou senha invalidos');
    } finally {
      setLoading(false);
    }
  };

  const renderOperadorItem = ({ item, index }: { item: VetAutoUsuario; index: number }) => {
    const isSelected = selectedOperador?.id === item.id;
    return (
      <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
        <TouchableOpacity
          style={[
            styles.operadorCard,
            Shadows.xs,
            isSelected && styles.operadorCardSelected,
          ]}
          onPress={() => {
            setSelectedOperador(item);
            setSenha('');
          }}
          activeOpacity={0.7}
        >
          <View style={[
            styles.operadorAvatar,
            isSelected && styles.operadorAvatarSelected,
          ]}>
            <Ionicons
              name="person"
              size={22}
              color={isSelected ? Colors.textLight : Colors.textTertiary}
            />
          </View>
          <View style={styles.operadorInfo}>
            <Text style={[
              styles.operadorNome,
              isSelected && styles.operadorNomeSelected,
            ]}>
              {item.nome}
            </Text>
            <Text style={styles.operadorTipo}>
              {item.tipo_usuario === 'operador' ? 'Operador' :
               item.tipo_usuario === 'supervisor' ? 'Supervisor' : 'Admin'}
            </Text>
          </View>
          {isSelected && (
            <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={22} color={Colors.textLight} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Login Operador</Text>
            <Text style={styles.headerSubtitle}>Identificacao do operador</Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Operator Selection */}
        <Animated.View entering={FadeIn.delay(100)}>
          <Text style={styles.sectionTitle}>Selecione o Operador</Text>
        </Animated.View>

        {loadingList ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Carregando operadores...</Text>
          </View>
        ) : operadores.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>Nenhum operador cadastrado</Text>
            <Text style={styles.emptySubtext}>Cadastre operadores em Configuracoes</Text>
          </View>
        ) : (
          <View style={styles.operadorList}>
            {operadores.map((op, index) => (
              <React.Fragment key={op.id}>
                {renderOperadorItem({ item: op, index })}
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Password Input */}
        {selectedOperador && (
          <Animated.View entering={FadeInDown.springify()} style={styles.loginSection}>
            <Text style={styles.sectionTitle}>Senha</Text>
            <View style={[styles.passwordContainer, Shadows.xs]}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.textTertiary} />
              <TextInput
                style={styles.passwordInput}
                placeholder="Digite a senha"
                placeholderTextColor={Colors.textTertiary}
                value={senha}
                onChangeText={setSenha}
                secureTextEntry={!showPassword}
                autoFocus
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.textTertiary}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.loginButton,
                (!senha.trim() || loading) && styles.loginButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={!senha.trim() || loading}
              activeOpacity={0.7}
            >
              {loading ? (
                <ActivityIndicator color={Colors.textLight} />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={20} color={Colors.textLight} />
                  <Text style={styles.loginButtonText}>Entrar</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// ============================================
// Styles
// ============================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },

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

  // Loading / Empty
  loadingContainer: { alignItems: 'center', paddingVertical: Spacing.xxl },
  loadingText: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: Spacing.sm },
  emptyContainer: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginTop: Spacing.sm },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: Spacing.xs },

  // Operator List
  operadorList: { gap: Spacing.sm },
  operadorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  operadorCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  operadorAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.surfaceSubtle,
    justifyContent: 'center', alignItems: 'center',
  },
  operadorAvatarSelected: {
    backgroundColor: Colors.primary,
  },
  operadorInfo: { flex: 1 },
  operadorNome: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  operadorNomeSelected: { color: Colors.primary },
  operadorTipo: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium, marginTop: 2 },

  // Login Section
  loginSection: { marginTop: Spacing.md },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  passwordInput: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    paddingVertical: Spacing.xs,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  loginButtonDisabled: { opacity: 0.5 },
  loginButtonText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textLight },
});
