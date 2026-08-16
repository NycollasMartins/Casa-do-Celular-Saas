import { z } from 'zod';
import { validarCpf } from '@/lib/utils';

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
function hojeLocal(): Date {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

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

  data_agendamento: z
    .string()
    .min(1, 'Escolha a data da visita')
    .refine((valor) => !Number.isNaN(Date.parse(valor)), 'Data invalida'),

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
  (dados) => {
    const [ano, mes, dia] = dados.data_agendamento.slice(0, 10).split('-').map(Number);
    return new Date(ano, mes - 1, dia) >= hojeLocal();
  },
  { path: ['data_agendamento'], message: 'A data da visita deve ser hoje ou no futuro' }
);

export type AgendamentoInput = z.infer<typeof agendamentoSchema>;

export const filtroMetricasSchema = z.object({
  lojaId: z.string().uuid().optional(),
  periodo: z.enum(['7d', '30d', '90d', 'personalizado']).default('30d'),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
});
