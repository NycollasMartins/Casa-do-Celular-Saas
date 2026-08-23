import { z } from 'zod';
import { validarCpf } from '@/lib/utils';
import { hojeNaLoja } from '@/lib/semana';
import { ehDataIso } from '@/lib/semana';

export const STATUS_AGENDAMENTO = [
  'contatado',
  'agendado',
  'nao_agendado',
  'compareceu',
  'nao_compareceu',
] as const;

const REGEX_CPF = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
const REGEX_TELEFONE = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;

/** Data de hoje as 00:00 no fuso local, para comparar com o input date. */

export const agendamentoSchema = z.object({
  cliente_nome: z
    .string()
    .trim()
    .min(3, 'Informe o nome completo do cliente (minimo 3 caracteres)'),

  cliente_email: z
    .string()
    .trim()
    .email('E-mail invalido')
    .optional()
    .or(z.literal('').transform(() => undefined)),

  cliente_cpf: z
    .string()
    .regex(REGEX_CPF, 'Use o formato 000.000.000-00')
    // Regex garante o formato; o algoritmo garante que o CPF existe.
    .refine(validarCpf, 'CPF invalido'),

  cliente_telefone: z.string().regex(REGEX_TELEFONE, 'Use o formato (00) 00000-0000'),

  // `Date.parse` aceitava 2026-02-31, 08/25/2026 e ate carimbo de tempo. O
  // ultimo custava caro: 2026-08-26T01:00:00Z e 25 de agosto as 22h em
  // Brasilia, e gravar o dia 26 desloca todo relatorio que conte o
  // atendimento.
  data_agendamento: z
    .string()
    .min(1, 'Escolha a data da visita')
    .refine(ehDataIso, 'Use uma data no formato AAAA-MM-DD'),

  status: z.enum(STATUS_AGENDAMENTO, { errorMap: () => ({ message: 'Status invalido' }) }),

  observacoes: z
    .string()
    .max(500, 'Maximo de 500 caracteres')
    .optional()
    .or(z.literal('').transform(() => undefined)),

  loja_id: z.string().uuid('Selecione a loja'),
});

/**
 * No cadastro a visita precisa ser hoje ou no futuro. Na edicao isso nao
 * vale: um agendamento antigo continua sendo editado para marcar
 * comparecimento, entao a regra fica so no schema de criacao.
 */
export const novoAgendamentoSchema = agendamentoSchema.refine(
  // Comparacao de string: AAAA-MM-DD ordena igual a data, e nao passa por
  // Date nenhum — que e onde o fuso se intromete.
  (dados) => dados.data_agendamento.slice(0, 10) >= hojeNaLoja(),
  { path: ['data_agendamento'], message: 'A data da visita deve ser hoje ou no futuro' }
);

export type AgendamentoInput = z.infer<typeof agendamentoSchema>;

export const filtroMetricasSchema = z.object({
  lojaId: z.string().uuid().optional(),
  periodo: z.enum(['7d', '30d', '90d', 'personalizado']).default('30d'),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
});

/**
 * Registro de venda. `valor` chega como string do formulario e ja passou
 * por lerValorBrl no cliente; aqui o coerce cobre o caminho direto (API,
 * teste) sem depender dessa etapa.
 */
export const vendaSchema = z.object({
  valor: z.coerce
    .number({ invalid_type_error: 'Informe o valor da venda' })
    .positive('O valor precisa ser maior que zero')
    .max(9_999_999_999.99, 'Valor acima do limite'),
  descricao: z.string().trim().max(300, 'Maximo de 300 caracteres').optional().or(z.literal('')),
  // O formato sozinho deixava passar 2026-02-31, que so falha no banco — e
  // a mensagem que chega a tela e do Postgres.
  data_venda: z.string().refine(ehDataIso, 'Use uma data no formato AAAA-MM-DD'),
});

export type VendaInput = z.infer<typeof vendaSchema>;
