/**
 * Busca da tabela de agendamentos.
 *
 * O PROBLEMA
 * CPF e telefone sao gravados FORMATADOS — '529.982.247-25' e
 * '(11) 99999-9999'. A busca comparava o texto digitado direto com esse
 * valor, entao so encontrava quem reproduzisse a pontuacao exata:
 *
 *   529982          -> nao encontrava  (o ponto cai na quarta posicao)
 *   52998224725     -> nao encontrava
 *   529.982.247-25  -> encontrava
 *   11999999999     -> nao encontrava
 *
 * Quem atende digita o numero, nao a mascara. Na pratica a busca por CPF e
 * por telefone nao funcionava — e e a tela que os agendadores usam todo dia.
 *
 * A SAIDA
 * Comparar so os digitos dos dois lados. `lib/lgpd.ts` ja fazia isso na busca
 * por titular, com `normalizarCpfParaBusca`; a tabela nao aproveitava.
 */

export interface CamposDeBusca {
  cliente_nome: string;
  cliente_cpf: string;
  cliente_telefone: string;
}

const soDigitos = (texto: string) => texto.replace(/\D/g, '');

export function combinaComBusca(item: CamposDeBusca, termo: string): boolean {
  const limpo = termo.trim().toLowerCase();
  if (!limpo) return true;

  if (item.cliente_nome.toLowerCase().includes(limpo)) return true;

  const digitos = soDigitos(limpo);

  // Termo sem digito nenhum ja foi decidido pelo nome. Sem esta saida, um
  // termo puramente textual viraria busca vazia e casaria com todo mundo.
  if (!digitos) return false;

  return (
    soDigitos(item.cliente_cpf).includes(digitos) ||
    soDigitos(item.cliente_telefone).includes(digitos)
  );
}
