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
