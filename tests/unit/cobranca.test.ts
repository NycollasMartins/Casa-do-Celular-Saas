import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as script from '../../scripts/compartilhado.mjs';
import { CARENCIA_DIAS, limiteDoPagamento } from '@/lib/cobranca';

/**
 * O ciclo de cobranca da assinatura.
 *
 * O QUE ESTE TESTE PROTEGE
 * A carencia aparece em TRES lugares: no default da funcao SQL que lista
 * quem suspender, na constante que a rotina passa como argumento, e na tela
 * que promete ao operador a data do corte. Divergir e facil e o efeito e
 * caro nos dois sentidos — cortar antes do prazo prometido, ou prometer um
 * corte que nunca acontece.
 */

const migration = readFileSync('supabase/migrations/20250101000016_cobranca.sql', 'utf8');

describe('a carencia e a mesma em todo lugar', () => {
  it('a tela e a rotina concordam', () => {
    expect(CARENCIA_DIAS).toBe(script.CARENCIA_DIAS);
  });

  it('e o banco tambem', () => {
    // Quem de fato filtra e a funcao SQL. Se o default dela mudar sem os
    // outros dois, a tela passa a mentir sobre a data do corte.
    const m = migration.match(/franqueados_a_suspender\(p_hoje date, p_carencia int default (\d+)\)/);

    expect(m?.[1]).toBe(String(CARENCIA_DIAS));
  });
});

describe('a conta do prazo', () => {
  it('avisado no dia D, suspende em D+3', () => {
    // O cliente tem D, D+1 e D+2 para pagar: tres dias.
    expect(limiteDoPagamento('2026-09-10')).toBe('2026-09-13');
  });

  it('atravessa virada de mes e de ano', () => {
    expect(limiteDoPagamento('2026-09-29')).toBe('2026-10-02');
    expect(limiteDoPagamento('2026-12-30')).toBe('2027-01-02');
  });

  it('atravessa 29 de fevereiro em ano bissexto', () => {
    expect(limiteDoPagamento('2028-02-27')).toBe('2028-03-01');
  });

  it('aceita timestamp e usa so a data', () => {
    // `assinatura_avisado_em` e `date` no banco, mas o PostgREST ja devolveu
    // timestamp em coluna date noutras tabelas deste projeto.
    expect(limiteDoPagamento('2026-09-10T23:30:00Z')).toBe('2026-09-13');
  });
});

describe('as mensagens que o cliente recebe', () => {
  const aviso = script.montarAvisoDeCobranca({
    nome: 'Casa do Celular Goiania',
    vencimento: '2026-09-10',
    limite: '2026-09-13',
  });

  it('o aviso traz a data limite, e nao "em 3 dias"', () => {
    // Quem le dois dias depois faria a conta errada a partir de "em 3 dias".
    expect(aviso.texto).toContain('13/09/2026');
    expect(aviso.texto).not.toMatch(/em 3 dias/i);
  });

  it('o aviso diz que nada e apagado', () => {
    // E a duvida imediata de quem le, e a que gera o telefonema.
    expect(aviso.texto).toMatch(/nenhum dado e apagado/i);
  });

  it('o assunto nao ameaca', () => {
    // Assunto alarmante em caixa corporativa costuma ir para o lixo
    // eletronico — e ai o aviso nao cumpre a unica funcao que tem.
    expect(aviso.assunto).not.toMatch(/urgente|bloqueio|ultimo aviso|suspens/i);
  });

  it('o aviso de suspensao explica como voltar', () => {
    const corte = script.montarAvisoDeSuspensao({
      nome: 'Casa do Celular Goiania',
      vencimento: '2026-09-10',
    });

    expect(corte.texto).toMatch(/nada foi apagado/i);
    expect(corte.texto).toMatch(/o acesso volta/i);
  });
});

describe('a rotina nao corta quem nunca foi avisado', () => {
  const fonte = readFileSync('scripts/cobranca.mjs', 'utf8');

  it('marca o aviso SO depois do envio', () => {
    // Marcar antes faria a carencia correr para quem nunca recebeu nada. A
    // ordem no arquivo e a garantia: o `marcar_aviso_enviado` vem depois do
    // `await enviarEmail`, dentro do mesmo try.
    const envio = fonte.indexOf('await enviarEmail(rede.email_contato');
    const marca = fonte.indexOf("marcar_aviso_enviado");

    expect(envio).toBeGreaterThan(-1);
    expect(marca).toBeGreaterThan(envio);
  });

  it('rede sem e-mail de contato nao entra em carencia', () => {
    expect(fonte).toMatch(/SEM E-MAIL DE CONTATO/);
  });
});
