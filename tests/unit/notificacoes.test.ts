import { describe, expect, it } from 'vitest';
import {
  canalDisponivel,
  dataDeAmanha,
  montarMensagem,
  type DestinatarioLembrete,
} from '@/lib/notificacoes';

const BASE: DestinatarioLembrete = {
  id: '11111111-1111-4111-8111-111111111111',
  cliente_nome: 'Ana Souza Lima',
  cliente_email: 'ana@exemplo.com',
  cliente_telefone: '(61) 99999-0001',
  data_agendamento: '2026-09-01',
  loja_nome: 'Casa do Celular Loja 1',
};

describe('dataDeAmanha', () => {
  it('devolve o dia seguinte em horario comercial', () => {
    expect(dataDeAmanha(new Date('2026-08-20T17:00:00Z'))).toBe('2026-08-21');
  });

  /**
   * O erro classico desta rotina: as 21h em Brasilia ja e 00h do dia
   * seguinte em UTC. Uma rotina noturna calculando por UTC notificaria
   * depois de amanha, e ninguem receberia o lembrete de amanha.
   */
  it('nao pula um dia quando roda a noite, com o UTC ja virado', () => {
    // 21h em Brasilia (BRT = UTC-3) = 00h do dia seguinte em UTC.
    const noite = new Date('2026-08-21T00:30:00Z'); // 20/08 21:30 em Brasilia
    expect(dataDeAmanha(noite)).toBe('2026-08-21');
  });

  it('funciona na virada de mes', () => {
    expect(dataDeAmanha(new Date('2026-08-31T15:00:00Z'))).toBe('2026-09-01');
  });

  it('funciona na virada de ano', () => {
    expect(dataDeAmanha(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
  });

  it('atravessa 29 de fevereiro em ano bissexto', () => {
    expect(dataDeAmanha(new Date('2028-02-28T15:00:00Z'))).toBe('2028-02-29');
  });

  it('respeita o fuso informado', () => {
    // 03h UTC = 22h do dia anterior em Nova York.
    const instante = new Date('2026-08-21T03:00:00Z');
    expect(dataDeAmanha(instante, 'America/New_York')).toBe('2026-08-21');
    expect(dataDeAmanha(instante, 'UTC')).toBe('2026-08-22');
  });
});

describe('montarMensagem', () => {
  it('chama a pessoa pelo primeiro nome', () => {
    expect(montarMensagem(BASE).texto).toContain('Ola, Ana!');
  });

  it('mostra a data como dia/mes', () => {
    expect(montarMensagem(BASE).texto).toContain('(01/09)');
  });

  it('cita a loja no assunto e no corpo', () => {
    const mensagem = montarMensagem(BASE);
    expect(mensagem.assunto).toContain('Casa do Celular Loja 1');
    expect(mensagem.texto).toContain('Casa do Celular Loja 1');
  });

  /** Lembrete nao e lugar de repetir dado pessoal alem do necessario. */
  it('nao inclui CPF nem telefone', () => {
    const mensagem = montarMensagem({ ...BASE, cliente_nome: 'Ana Souza' });
    expect(mensagem.texto).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    expect(mensagem.texto).not.toContain('99999-0001');
  });

  it('aguenta nome com espacos sobrando', () => {
    expect(montarMensagem({ ...BASE, cliente_nome: '  Joao  Pedro ' }).texto).toContain('Ola, Joao!');
  });

  it('aguenta nome de uma palavra so', () => {
    expect(montarMensagem({ ...BASE, cliente_nome: 'Madonna' }).texto).toContain('Ola, Madonna!');
  });
});

describe('canalDisponivel', () => {
  it('usa e-mail quando ha provedor e endereco', () => {
    expect(canalDisponivel(BASE, true)).toBe('email');
  });

  it('cai para registro quando nao ha provedor contratado', () => {
    expect(canalDisponivel(BASE, false)).toBe('registro');
  });

  it('cai para registro quando o cliente nao deixou e-mail', () => {
    expect(canalDisponivel({ ...BASE, cliente_email: null }, true)).toBe('registro');
  });
});
