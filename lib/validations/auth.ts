import { z } from 'zod';

/**
 * Senha definida pelo proprio usuario (primeiro acesso ou recuperacao).
 * O minimo de 8 caracteres acompanha o default do Supabase Auth; subir aqui
 * sem subir la deixa o servidor aceitando o que o formulario rejeita.
 */
export const novaSenhaSchema = z
  .object({
    senha: z
      .string()
      .min(8, 'Use ao menos 8 caracteres')
      .max(72, 'Maximo de 72 caracteres')
      .regex(/[A-Za-z]/, 'Inclua ao menos uma letra')
      .regex(/[0-9]/, 'Inclua ao menos um numero'),
    confirmacao: z.string(),
  })
  .refine((dados) => dados.senha === dados.confirmacao, {
    path: ['confirmacao'],
    message: 'As senhas nao conferem',
  });

export type NovaSenhaInput = z.infer<typeof novaSenhaSchema>;

/**
 * Cadastro feito pelo proprio cliente, a partir de um convite.
 *
 * Reaproveita as regras de senha acima em vez de escrever outras: duas
 * politicas de senha no mesmo sistema divergem, e a que ficar mais frouxa
 * passa a valer.
 *
 * CNPJ e opcional porque a venda acontece antes da papelada, e travar o
 * cadastro por um documento que o cliente busca depois so empurra ele para
 * inventar um numero.
 */
export const convitePrimeiroAcessoSchema = z
  .object({
    razao_social: z.string().trim().min(3, 'Informe o nome da empresa'),
    cnpj: z
      .string()
      .trim()
      .regex(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, 'Use o formato 00.000.000/0001-00')
      .optional()
      .or(z.literal('')),
    nome: z.string().trim().min(3, 'Informe seu nome'),
    email: z.string().trim().email('E-mail invalido'),
    senha: z
      .string()
      .min(8, 'Use ao menos 8 caracteres')
      .max(72, 'Maximo de 72 caracteres')
      .regex(/[A-Za-z]/, 'Inclua ao menos uma letra')
      .regex(/[0-9]/, 'Inclua ao menos um numero'),
    confirmacao: z.string(),
  })
  .refine((dados) => dados.senha === dados.confirmacao, {
    path: ['confirmacao'],
    message: 'As senhas nao conferem',
  });

export type ConvitePrimeiroAcessoInput = z.infer<typeof convitePrimeiroAcessoSchema>;
