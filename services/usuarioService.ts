import { supabase } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export type TipoUsuario = 'operador' | 'supervisor' | 'admin';

export interface VetAutoUsuario {
  id: string;
  fazenda_id: string;
  nome: string;
  login: string;
  tipo_usuario: TipoUsuario;
  ativo: boolean;
  ultimo_acesso: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  tipo_usuario: TipoUsuario;
}

// ============================================
// USUARIOS / OPERADORES
// ============================================

/**
 * Lista todos os usuarios de uma fazenda
 */
export async function getUsuarios(
  fazenda_id: string
): Promise<VetAutoUsuario[]> {
  const { data, error } = await supabase
    .from('vet_auto_usuarios')
    .select('*')
    .eq('fazenda_id', fazenda_id)
    .order('nome');

  if (error) throw new Error(`Erro ao buscar usuarios: ${error.message}`);
  return (data ?? []) as VetAutoUsuario[];
}

/**
 * Autentica um operador por login e senha
 * A senha armazenada usa bcrypt hash - a validacao ocorre via RPC no Supabase
 */
export async function autenticarOperador(
  fazenda_id: string,
  login: string,
  senha: string
): Promise<UsuarioAutenticado> {
  // Usa RPC para validar bcrypt hash no servidor
  const { data, error } = await supabase
    .rpc('autenticar_operador', {
      p_fazenda_id: fazenda_id,
      p_login: login,
      p_senha: senha,
    });

  if (error) throw new Error(`Erro na autenticacao: ${error.message}`);
  if (!data || (Array.isArray(data) && data.length === 0)) {
    throw new Error('Login ou senha invalidos');
  }

  const usuario = Array.isArray(data) ? data[0] : data;

  // Atualizar ultimo acesso
  await supabase
    .from('vet_auto_usuarios')
    .update({ ultimo_acesso: new Date().toISOString() })
    .eq('id', usuario.id);

  return {
    id: usuario.id,
    nome: usuario.nome,
    tipo_usuario: usuario.tipo_usuario,
  } as UsuarioAutenticado;
}

/**
 * Cria um novo usuario
 */
export async function createUsuario(
  fazenda_id: string,
  nome: string,
  login: string,
  senha: string,
  tipo_usuario: TipoUsuario
): Promise<VetAutoUsuario> {
  // Usa RPC para hash bcrypt no servidor
  const { data, error } = await supabase
    .rpc('criar_usuario_operador', {
      p_fazenda_id: fazenda_id,
      p_nome: nome,
      p_login: login,
      p_senha: senha,
      p_tipo_usuario: tipo_usuario,
    });

  if (error) throw new Error(`Erro ao criar usuario: ${error.message}`);

  const usuario = Array.isArray(data) ? data[0] : data;
  return usuario as VetAutoUsuario;
}

/**
 * Atualiza dados de um usuario
 */
export async function updateUsuario(
  id: string,
  updates: Partial<Pick<VetAutoUsuario, 'nome' | 'login' | 'tipo_usuario' | 'ativo'>>
): Promise<VetAutoUsuario> {
  const { data, error } = await supabase
    .from('vet_auto_usuarios')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Erro ao atualizar usuario: ${error.message}`);
  return data as VetAutoUsuario;
}

/**
 * Busca operadores ativos
 */
export async function getOperadoresAtivos(
  fazenda_id: string
): Promise<VetAutoUsuario[]> {
  const { data, error } = await supabase
    .from('vet_auto_usuarios')
    .select('*')
    .eq('fazenda_id', fazenda_id)
    .eq('ativo', true)
    .order('nome');

  if (error) throw new Error(`Erro ao buscar operadores ativos: ${error.message}`);
  return (data ?? []) as VetAutoUsuario[];
}
