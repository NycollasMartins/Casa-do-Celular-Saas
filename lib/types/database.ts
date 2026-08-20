/**
 * Tipos do banco. Espelha as migrations em supabase/migrations.
 * Em producao voce pode regerar com:
 *   npx supabase gen types typescript --project-id <id> > lib/types/database.ts
 */

export type UserRole = 'super_admin' | 'franqueado' | 'diretor' | 'agendador';

export type AgendamentoStatus =
  | 'contatado'
  | 'agendado'
  | 'nao_agendado'
  | 'compareceu'
  | 'nao_compareceu';

export type Franqueado = {
  id: string;
  nome: string;
  cnpj: string | null;
  email_contato: string | null;
  telefone_contato: string | null;
  status: 'ativo' | 'inativo' | 'pendente';
  data_contrato: string | null;
  created_at: string;
  updated_at: string;
};

export type Usuario = {
  id: string;
  email: string;
  nome: string;
  role: UserRole;
  franqueado_id: string | null;
  /** Desligamento sem apagar historico. Inativo perde acesso via RLS. */
  status: 'ativo' | 'inativo';
  created_at: string;
  updated_at: string;
};

export type Loja = {
  id: string;
  franqueado_id: string;
  nome: string;
  codigo_loja: string;
  estado: string;
  cidade: string;
  endereco: string | null;
  telefone: string | null;
  gerente_nome: string | null;
  status: 'ativo' | 'inativo';
  created_at: string;
  updated_at: string;
};

export type ParticipacaoSocietaria = {
  id: string;
  usuario_id: string;
  loja_id: string;
  percentual_participacao: number;
  cargo: 'franqueado' | 'diretor';
  data_inicio: string;
  data_fim: string | null;
  created_at: string;
};

export type AgendadorLoja = {
  id: string;
  usuario_id: string;
  loja_id: string;
  data_inicio: string;
  data_fim: string | null;
  created_at: string;
};

export type Agendamento = {
  id: string;
  franqueado_id: string;
  loja_id: string;
  agendador_id: string;
  cliente_nome: string;
  cliente_email: string | null;
  cliente_cpf: string;
  cliente_telefone: string;
  data_agendamento: string;
  status: AgendamentoStatus;
  observacoes: string | null;
  /** Quando os dados pessoais foram removidos (LGPD). Nulo = dados presentes. */
  anonimizado_em: string | null;
  created_at: string;
  updated_at: string;
}

/** Agendamento com os joins usados na tabela do dashboard. */
export type AgendamentoComRelacoes = Agendamento & {
  loja: Pick<Loja, 'id' | 'nome' | 'codigo_loja'> | null;
  agendador: Pick<Usuario, 'id' | 'nome'> | null;
};

/**
 * Shape que o supabase-js espera por tabela. `Relationships: []` mantem a
 * tipagem valida sem descrever cada foreign key a mao - os joins sao
 * tipados no ponto de uso (ver AgendamentoComRelacoes).
 */
type Tabela<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      franqueados: Tabela<Franqueado>;
      usuarios: Tabela<Usuario>;
      lojas: Tabela<Loja>;
      participacoes_societarias: Tabela<ParticipacaoSocietaria>;
      agendadores_lojas: Tabela<AgendadorLoja>;
      agendamentos: Tabela<Agendamento>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { user_role: UserRole };
    CompositeTypes: Record<string, never>;
  };
};
