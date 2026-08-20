import { z } from 'zod';

export const lojaSchema = z.object({
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
  data_inicio: z.string().optional().or(z.literal('')),
});

/** Transferencia: a origem vem pelo id, aqui vai so o destino. */
export const transferenciaSchema = z.object({
  loja_id: z.string().uuid('Escolha a loja de destino'),
  percentual_participacao: z.coerce.number().min(0.01).max(100).optional(),
  data_inicio: z.string().optional().or(z.literal('')),
});

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
export type FranqueadoInput = z.infer<typeof franqueadoSchema>;
