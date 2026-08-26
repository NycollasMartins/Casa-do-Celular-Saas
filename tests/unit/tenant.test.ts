import { describe, expect, it } from 'vitest';
import { resolverTenant } from '@/lib/tenant';

/**
 * De quem e o registro criado.
 *
 * O QUE ESTE TESTE PEGA
 * Duas coisas que ja aconteceram neste projeto, em direcoes opostas.
 *
 * A primeira: o super admin nao conseguia criar NADA pela tela. Nenhum
 * formulario enviava o tenant, entao Equipe respondia "Franqueado nao
 * identificado" e Lojas violava a coluna obrigatoria. Como ele e quem cria a
 * primeira conta de uma rede nova, o cliente simplesmente nunca entrava — e
 * o README anunciava que ele "gerencia tudo".
 *
 * A segunda, oposta: a versao de loja aceitava o tenant do formulario vindo
 * de QUALQUER papel. O banco salvava (lojas_insert exige o proprio tenant),
 * mas `criarUsuario` escreve com service role, onde policy nenhuma alcanca.
 * Uma regra aplicada num lugar e esquecida no vizinho e o defeito que mais
 * se repetiu por aqui.
 */

const SUPER = { role: 'super_admin' as const, franqueado_id: null };
const DONO = { role: 'franqueado' as const, franqueado_id: 'rede-a' };

describe('de quem e o registro', () => {
  it('super admin usa a rede que escolheu', () => {
    expect(resolverTenant(SUPER, 'rede-b')).toBe('rede-b');
  });

  it('super admin sem escolha nao ganha palpite', () => {
    // Devolver null e o que faz a tela pedir a escolha. Chutar a primeira
    // rede da lista criaria a conta na empresa errada, calado.
    expect(resolverTenant(SUPER, undefined)).toBeNull();
    expect(resolverTenant(SUPER, '')).toBeNull();
    expect(resolverTenant(SUPER, null)).toBeNull();
  });

  it('franqueado usa a propria rede, mesmo pedindo outra', () => {
    // A parte que importa: o campo do formulario e IGNORADO, nao conferido.
    // `criarUsuario` escreve com service role — sem esta linha, um franqueado
    // criaria conta dentro do tenant de outro sem nada no caminho.
    expect(resolverTenant(DONO, 'rede-b')).toBe('rede-a');
  });

  it('franqueado sem rede vinculada nao escreve em lugar nenhum', () => {
    expect(resolverTenant({ role: 'franqueado', franqueado_id: null }, 'rede-b')).toBeNull();
  });

  it('diretor e agendador tambem ficam presos a propria rede', () => {
    for (const role of ['diretor', 'agendador'] as const) {
      expect(resolverTenant({ role, franqueado_id: 'rede-a' }, 'rede-b')).toBe('rede-a');
    }
  });
});
