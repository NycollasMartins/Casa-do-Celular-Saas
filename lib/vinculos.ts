/**
 * Decide o que fazer com os vinculos quando um usuario e editado.
 *
 * A logica vive aqui, fora da server action, porque envolve casos que so
 * aparecem com dados reais — diretor com varias participacoes, troca de
 * papel, volta para uma loja antiga — e que precisam ser testaveis sem
 * banco.
 *
 * DUAS TABELAS, DOIS REGIMES
 * `agendadores_lojas` guarda a lotacao do operacional: uma loja por pessoa.
 * `participacoes_societarias` guarda sociedade: um diretor pode ter varias.
 * Tratar as duas igual foi a origem dos defeitos que este modulo corrige.
 */

export type PapelEditado = 'franqueado' | 'diretor' | 'agendador';

export interface VinculoAtivo {
  id: string;
  loja_id: string;
}

export interface PlanoVinculos {
  /** Vinculos de agendador a encerrar (data_fim = hoje). */
  encerrarAgendador: string[];
  /** Participacoes a encerrar. */
  encerrarParticipacao: string[];
  /** Loja onde abrir lotacao de agendador, se houver. */
  abrirAgendador?: string;
  /** Loja onde abrir participacao, se houver. */
  abrirParticipacao?: string;
  /**
   * Quando preenchido, a operacao NAO deve ser executada: o pedido e
   * ambiguo e o gestor precisa resolver na tela propria.
   */
  recusa?: string;
}

interface Entrada {
  papel: PapelEditado;
  lojaEscolhida?: string;
  agendadorAtivos: VinculoAtivo[];
  participacaoAtivas: VinculoAtivo[];
}

export function planejarVinculos({
  papel,
  lojaEscolhida,
  agendadorAtivos,
  participacaoAtivas,
}: Entrada): PlanoVinculos {
  const plano: PlanoVinculos = { encerrarAgendador: [], encerrarParticipacao: [] };

  if (papel === 'agendador') {
    // Virou operacional: a sociedade que porventura tinha deixa de valer.
    // Sem isto, a pessoa aparecia no Societario como socia ativa depois de
    // ter virado agendador, e entrava na soma que alerta acima de 100%.
    plano.encerrarParticipacao = participacaoAtivas.map((item) => item.id);

    if (!lojaEscolhida) return plano;

    const jaEstaNaLoja = agendadorAtivos.some((item) => item.loja_id === lojaEscolhida);
    if (jaEstaNaLoja) {
      // Encerra qualquer lotacao paralela, mantendo so a escolhida.
      plano.encerrarAgendador = agendadorAtivos
        .filter((item) => item.loja_id !== lojaEscolhida)
        .map((item) => item.id);
      return plano;
    }

    plano.encerrarAgendador = agendadorAtivos.map((item) => item.id);
    plano.abrirAgendador = lojaEscolhida;
    return plano;
  }

  // Virou gestor: a lotacao operacional deixa de fazer sentido.
  plano.encerrarAgendador = agendadorAtivos.map((item) => item.id);

  if (!lojaEscolhida) return plano;

  const jaParticipa = participacaoAtivas.some((item) => item.loja_id === lojaEscolhida);
  if (jaParticipa) return plano;

  /**
   * Com mais de uma participacao ativa, "trocar de loja" por um unico
   * dropdown e ambiguo: nao da para saber qual delas o gestor quis mover, e
   * encerrar todas seria destrutivo. A tela Societario trata transferencia
   * de forma explicita — melhor recusar do que adivinhar errado num
   * registro societario.
   */
  if (participacaoAtivas.length > 1) {
    return {
      ...plano,
      encerrarAgendador: [],
      recusa:
        'Esta pessoa participa de mais de uma loja. Use a tela Societario para transferir ou encerrar participacoes.',
    };
  }

  plano.encerrarParticipacao = participacaoAtivas.map((item) => item.id);
  plano.abrirParticipacao = lojaEscolhida;
  return plano;
}

/* ------------------------- Reativacao de acesso ------------------------ */

export interface VinculoEncerrado {
  id: string;
  data_fim: string;
}

/**
 * Quais vinculos reabrir ao reativar um acesso.
 *
 * DEFEITO QUE ISTO CORRIGE
 * O desligamento encerra TODOS os vinculos de uma vez. A reativacao reabria
 * so o mais recente — um diretor com cinco participacoes voltava com uma, e
 * perdia quatro lojas em silencio.
 *
 * O criterio e a data: reabre o lote encerrado na ultima data, que e
 * exatamente o conjunto que o desligamento fechou junto. Vinculos
 * encerrados antes disso foram encerrados de proposito, por transferencia
 * ou saida da sociedade, e nao devem voltar.
 */
export function selecionarParaReabrir(encerrados: VinculoEncerrado[]): string[] {
  if (encerrados.length === 0) return [];

  const ultimaData = encerrados.reduce(
    (maior, item) => (item.data_fim > maior ? item.data_fim : maior),
    encerrados[0].data_fim
  );

  return encerrados.filter((item) => item.data_fim === ultimaData).map((item) => item.id);
}

/**
 * Qual tabela de vinculo corresponde ao papel.
 *
 * Reabrir sem olhar o papel ressuscitaria a lotacao de agendador de quem
 * hoje e diretor — o mesmo defeito que `planejarVinculos` corrige na edicao.
 */
export function tabelaDoVinculo(papel: PapelEditado | 'super_admin'): 'agendadores_lojas' | 'participacoes_societarias' | null {
  if (papel === 'agendador') return 'agendadores_lojas';
  if (papel === 'diretor' || papel === 'franqueado') return 'participacoes_societarias';
  return null;
}
