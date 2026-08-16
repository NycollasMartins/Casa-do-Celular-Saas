import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { AgendamentoStatus } from '@/lib/types/database';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ------------------------------------------------------------------ */
/* Mascaras de input                                                   */
/* ------------------------------------------------------------------ */

/** 000.000.000-00 */
export function mascararCpf(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 11);
  return digitos
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

/** (00) 00000-0000 */
export function mascararTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 11);
  if (digitos.length <= 10) {
    return digitos.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return digitos.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

/* ------------------------------------------------------------------ */
/* Validacao de CPF (algoritmo oficial dos digitos verificadores)      */
/* ------------------------------------------------------------------ */
export function validarCpf(cpf: string): boolean {
  const digitos = cpf.replace(/\D/g, '');
  if (digitos.length !== 11) return false;
  // Sequencias repetidas (111.111.111-11) passam no calculo mas sao invalidas.
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  const calcularDigito = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (pesoInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const primeiro = calcularDigito(digitos.slice(0, 9), 10);
  if (primeiro !== Number(digitos[9])) return false;

  const segundo = calcularDigito(digitos.slice(0, 10), 11);
  return segundo === Number(digitos[10]);
}

/* ------------------------------------------------------------------ */
/* Apresentacao                                                        */
/* ------------------------------------------------------------------ */

export const STATUS_LABEL: Record<AgendamentoStatus, string> = {
  contatado: 'Contatado',
  agendado: 'Agendado',
  nao_agendado: 'Nao agendou',
  compareceu: 'Compareceu',
  nao_compareceu: 'Nao compareceu',
};

export const STATUS_CORES: Record<AgendamentoStatus, string> = {
  contatado: '#0066CC',
  agendado: '#F59E0B',
  nao_agendado: '#94A3B8',
  compareceu: '#10B981',
  nao_compareceu: '#EF4444',
};

export const ROLE_LABEL = {
  super_admin: 'Super admin',
  franqueado: 'Franqueado',
  diretor: 'Diretor',
  agendador: 'Agendador',
} as const;

export function formatarNumero(valor: number): string {
  return new Intl.NumberFormat('pt-BR').format(valor);
}

export function formatarPercentual(valor: number): string {
  return `${valor.toFixed(1).replace('.', ',')}%`;
}

/** '2025-01-31' -> '31/01/2025' sem sofrer com fuso horario. */
export function formatarDataIso(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}
