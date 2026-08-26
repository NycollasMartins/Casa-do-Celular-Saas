import { z } from 'zod';
import { ehDataIso } from '@/lib/semana';

export const lojaSchema = z.object({
  // So o super admin preenche: ele nao pertence a tenant nenhum, entao
  // precisa dizer de quem e a loja. Para os demais o campo e ignorado pela
  // action, que usa o tenant da sessao.
  franqueado_id: z.string().uuid('Escolha o franqueado').optional(),
  nome: z.string().trim().min(3, 'Informe o nome da loja'),
  codigo_loja: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{3,20}$/, 'Use letras maiusculas, numeros e hifen. Ex.: LOJA-001'),
  estado: z.string().trim().length(2, 'Use a sigla do estado. Ex.: DF'),
  cidade: z.string().trim().min(2, 'Informe a cidade'),
  endereco: z.string().trim().max(200).optional().or(z.literal('')),
  telefone: z.string().trim().max(20).optional().or(z.literal('')),
  gerente_nome: z.string().trim().max(120).optional().or(z.literal('')),
  status: z.enum(['ativo', 'inativo']).default('ativo'),
});

export const usuarioSchema = z.object({
  // Idem lojaSchema: presente so no formulario do super admin.
  franqueado_id: z.string().uuid('Escolha o franqueado').optional(),
  nome: z.string().trim().min(3, 'Informe o nome'),
  email: z.string().trim().email('E-mail invalido'),
  role: z.enum(['franqueado', 'diretor', 'agendador']),
  // Obrigatorio para agendador; para diretor a loja vira participacao societaria.
  loja_id: z.string().uuid().optional(),
  percentual_participacao: z.coerce.number().min(0.01).max(100).optional(),
});

/**
 * Edicao de usuario. Sem `email`: trocar o e-mail mexe em auth.users e
 * dispara reconfirmacao — e um fluxo proprio, nao um campo de formulario.
 */
export const usuarioEdicaoSchema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome'),
  role: z.enum(['franqueado', 'diretor', 'agendador']),
  loja_id: z.string().uuid().optional(),
  percentual_participacao: z.coerce.number().min(0.01).max(100).optional(),
});

/** Abertura de participacao societaria. */
export const participacaoSchema = z.object({
  usuario_id: z.string().uuid('Escolha a pessoa'),
  loja_id: z.string().uuid('Escolha a loja'),
  percentual_participacao: z.coerce
    .number()
    .min(0.01, 'Informe um percentual maior que zero')
    .max(100, 'O percentual nao pode passar de 100'),
  cargo: z.enum(['franqueado', 'diretor']),
  // Sem conferencia nenhuma antes: a string ia inteira para o banco. Alem do
  // erro cru de Postgres, um carimbo de tempo seria truncado em UTC e a
  // sociedade comecaria no dia errado.
  data_inicio: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((valor) => !valor || ehDataIso(valor), 'Use uma data no formato AAAA-MM-DD'),
});

/** Transferencia: a origem vem pelo id, aqui vai so o destino. */
export const transferenciaSchema = z.object({
  loja_id: z.string().uuid('Escolha a loja de destino'),
  percentual_participacao: z.coerce.number().min(0.01).max(100).optional(),
  // Sem conferencia nenhuma antes: a string ia inteira para o banco. Alem do
  // erro cru de Postgres, um carimbo de tempo seria truncado em UTC e a
  // sociedade comecaria no dia errado.
  data_inicio: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((valor) => !valor || ehDataIso(valor), 'Use uma data no formato AAAA-MM-DD'),
});

/**
 * Meta mensal. Todos os alvos sao opcionais — cada rede acompanha o que
 * importa para ela —, mas ao menos um precisa vir preenchido, senao a meta
 * nao significa nada. O banco tem a mesma regra em meta_precisa_de_alvo.
 */
const alvoOpcional = z
  .union([z.literal(''), z.coerce.number().positive()])
  .optional()
  .transform((valor) => (valor === '' || valor === undefined ? null : Number(valor)));

export const metaSchema = z
  .object({
    usuario_id: z.string().uuid('Escolha o agendador'),
    // A regex sozinha aceitava 2026-13-01: mes 13 casa com \d{2}.
    competencia: z
      .string()
      .regex(/^\d{4}-\d{2}-01$/, 'Competencia invalida')
      .refine(ehDataIso, 'Competencia invalida'),
    meta_agendamentos: alvoOpcional,
    meta_taxa_conversao: alvoOpcional,
    meta_vendas: alvoOpcional,
    meta_receita: alvoOpcional,
  })
  .refine(
    (dados) =>
      dados.meta_agendamentos !== null ||
      dados.meta_taxa_conversao !== null ||
      dados.meta_vendas !== null ||
      dados.meta_receita !== null,
    { path: ['meta_agendamentos'], message: 'Defina ao menos um alvo' }
  )
  .refine(
    (dados) => dados.meta_taxa_conversao === null || dados.meta_taxa_conversao <= 100,
    { path: ['meta_taxa_conversao'], message: 'A taxa nao pode passar de 100%' }
  );

export const franqueadoSchema = z.object({
  nome: z.string().trim().min(3, 'Informe a razao social'),
  cnpj: z
    .string()
    .trim()
    .regex(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, 'Use o formato 00.000.000/0001-00')
    .optional()
    .or(z.literal('')),
  email_contato: z.string().trim().email('E-mail invalido').optional().or(z.literal('')),
  telefone_contato: z.string().trim().max(20).optional().or(z.literal('')),
  status: z.enum(['ativo', 'inativo', 'pendente']).default('ativo'),
  data_contrato: z.string().optional().or(z.literal('')),
});

export type LojaInput = z.infer<typeof lojaSchema>;
export type UsuarioInput = z.infer<typeof usuarioSchema>;
export type UsuarioEdicaoInput = z.infer<typeof usuarioEdicaoSchema>;
export type ParticipacaoInput = z.infer<typeof participacaoSchema>;
export type TransferenciaInput = z.infer<typeof transferenciaSchema>;
export type MetaInput = z.infer<typeof metaSchema>;
export type FranqueadoInput = z.infer<typeof franqueadoSchema>;
