import { describe, expect, it } from 'vitest';
import * as script from '../../scripts/compartilhado.mjs';
import { diaEMes, hojeNaLoja, segundaFeiraDa, semanaAnterior } from '@/lib/semana';
import { canalDisponivel, dataDeAmanha, montarMensagem } from '@/lib/notificacoes';
import { formatarBrl } from '@/lib/dinheiro';
import { subtrairMeses } from '@/lib/lgpd';
import { normalizarTelefoneBr } from '@/lib/whatsapp';

/**
 * Contrato entre `scripts/compartilhado.mjs` e `lib/`.
 *
 * Os scripts rodam com node puro, sem build, e por isso nao importam de
 * lib/, que e TypeScript. A duplicacao e inevitavel; a divergencia nao
 * precisa ser. Estes testes executam as duas implementacoes nos mesmos
 * casos e comparam.
 *
 * Nao e teoria: a copia da retencao ja tinha divergido — usava `setMonth`,
 * que transborda, enquanto o banco gruda no ultimo dia do mes.
 */

const INSTANTES = [
  '2026-08-20T15:00:00Z', // horario comercial
  '2026-08-21T01:00:00Z', // 22h do dia anterior em Brasilia
  '2026-08-21T02:59:00Z', // ultimo minuto antes da virada
  '2026-08-21T03:00:00Z', // meia-noite em Brasilia
  '2026-01-01T01:00:00Z', // virada de ano
  '2028-03-01T01:00:00Z', // logo depois de 29 de fevereiro
].map((iso) => new Date(iso));

const DATAS = [
  '2026-08-17', // segunda
  '2026-08-23', // domingo
  '2026-01-01',
  '2026-12-31',
  '2028-02-29',
  '2026-03-31',
  '2026-05-31',
];

describe('hojeNaLoja', () => {
  it('script e lib concordam em todos os instantes', () => {
    for (const instante of INSTANTES) {
      expect(script.hojeNaLoja(instante)).toBe(hojeNaLoja(instante));
    }
  });
});

describe('dataDeAmanha', () => {
  it('script e lib concordam', () => {
    for (const instante of INSTANTES) {
      expect(script.dataDeAmanha(instante)).toBe(dataDeAmanha(instante));
    }
  });
});

describe('semana', () => {
  it('segundaFeiraDa concorda', () => {
    for (const data of DATAS) {
      expect(script.segundaFeiraDa(data)).toBe(segundaFeiraDa(data));
    }
  });

  it('semanaAnterior concorda', () => {
    for (const instante of INSTANTES) {
      expect(script.semanaAnterior(instante)).toEqual(semanaAnterior(instante));
    }
  });

  it('diaEMes concorda', () => {
    for (const data of DATAS) {
      expect(script.diaEMes(data)).toBe(diaEMes(data));
    }
  });
});

describe('subtrairMeses', () => {
  /**
   * Foi aqui que a divergencia aconteceu de verdade: o script usava
   * `setMonth`, que devolve 2026-03-03 para "31/03 menos 1 mes".
   */
  it('script e lib concordam, inclusive nos meses curtos', () => {
    for (const data of DATAS) {
      for (const meses of [0, 1, 2, 13, 24]) {
        expect(script.subtrairMeses(data, meses)).toBe(subtrairMeses(data, meses));
      }
    }
  });
});

describe('normalizarTelefoneBr', () => {
  const TELEFONES = [
    '(61) 99999-0001',
    '61999990001',
    '+55 61 99999-0001',
    '005561999990001',
    '061999990001',
    '(61) 3333-0001',
    '+55 55 3333-0001', // DDD 55 com codigo do pais: o caso que confunde
    '20999990001', // DDD que nao existe
    '61899990001', // celular sem o nono digito
    '6193330001', // fixo comecando com 9
    'nao informado',
    '',
  ];

  it('script e lib concordam em todos os formatos', () => {
    for (const telefone of TELEFONES) {
      expect(script.normalizarTelefoneBr(telefone)).toBe(normalizarTelefoneBr(telefone));
    }
  });
});

describe('mensagem do lembrete', () => {
  it('script e lib produzem o mesmo texto', () => {
    const destinatario = {
      id: 'ag-1',
      cliente_nome: 'Ana Souza Lima',
      cliente_email: 'ana@exemplo.com',
      cliente_telefone: '(61) 99999-0001',
      data_agendamento: '2026-09-01',
      loja_nome: 'Casa do Celular Loja 1',
    };

    expect(script.montarMensagemLembrete(destinatario)).toEqual(montarMensagem(destinatario));
  });
});

describe('formatacao de moeda', () => {
  it('script e lib produzem o mesmo texto', () => {
    for (const valor of [0, 1, 99.9, 1234.56, 12345678.9]) {
      expect(script.formatarBrl(valor)).toBe(formatarBrl(valor));
    }
  });
});

describe('precedencia de canal', () => {
  const base = {
    id: 'ag-1',
    cliente_nome: 'Ana',
    cliente_email: 'ana@exemplo.com',
    cliente_telefone: '(61) 99999-0001',
    data_agendamento: '2026-09-01',
    loja_nome: 'Loja 1',
  };

  const CASOS = [
    [base, { whatsapp: true, email: true }],
    [base, { whatsapp: false, email: true }],
    [base, { whatsapp: true, email: false }],
    [base, { whatsapp: false, email: false }],
    [{ ...base, cliente_email: null }, { whatsapp: false, email: true }],
    [{ ...base, cliente_email: null }, { whatsapp: true, email: true }],
    [{ ...base, cliente_telefone: '' }, { whatsapp: true, email: true }],
  ] as const;

  it('script e lib escolhem o mesmo canal', () => {
    for (const [destinatario, provedores] of CASOS) {
      expect(script.canalDisponivel(destinatario, provedores)).toBe(
        canalDisponivel(destinatario, provedores)
      );
    }
  });
});
