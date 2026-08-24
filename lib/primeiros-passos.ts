import type { UserRole } from '@/lib/types/database';

/**
 * O que mostrar para quem abre o sistema e nao tem loja alcancavel.
 *
 * POR QUE
 * Sem loja, o dashboard exibia zeros em toda parte e, embaixo, "Nenhum
 * agendamento com esses filtros. Ajuste o periodo ou registre um novo
 * contato." A mensagem aponta para o lugar errado duas vezes: o problema nao
 * e o periodo, e registrar contato exige uma loja que ainda nao existe.
 *
 * Zero e um numero honesto e inutil aqui. Quem acabou de instalar precisa
 * saber qual e o proximo passo, e o passo depende do papel: o franqueado
 * cadastra a loja, o agendador espera ser lotado por alguem.
 */
export interface PrimeiroPasso {
  titulo: string;
  descricao: string;
  /** Ausente quando a pessoa nao pode resolver sozinha. */
  acao?: { rotulo: string; href: string };
  passos?: string[];
}

export function primeiroPasso(role: UserRole): PrimeiroPasso {
  if (role === 'super_admin') {
    return {
      titulo: 'Nenhuma loja na rede ainda',
      descricao:
        'Cadastre o primeiro franqueado; as lojas dele aparecem aqui assim que forem criadas.',
      acao: { rotulo: 'Ir para Franqueados', href: '/admin/franqueados' },
    };
  }

  if (role === 'franqueado') {
    return {
      titulo: 'Comece cadastrando sua primeira loja',
      descricao:
        'O sistema mede o trabalho dos agendadores por loja, entao ela e o primeiro cadastro. Leva menos de um minuto.',
      acao: { rotulo: 'Cadastrar loja', href: '/dashboard/lojas' },
      passos: [
        'Cadastre a loja em Lojas.',
        'Cadastre a equipe em Equipe — a senha de primeiro acesso aparece na hora.',
        'Os agendadores registram os atendimentos, e os numeros comecam a aparecer aqui.',
      ],
    };
  }

  // Diretor e agendador dependem de alguem: mandar para uma tela que eles nao
  // podem usar seria pior que nao oferecer acao nenhuma.
  return {
    titulo: 'Voce ainda nao esta vinculado a nenhuma loja',
    descricao:
      role === 'diretor'
        ? 'Peca ao franqueado para registrar sua participacao na loja. Assim que isso for feito, os numeros aparecem aqui.'
        : 'Peca ao seu gestor para lotar voce numa loja. Assim que isso for feito, voce podera registrar atendimentos.',
  };
}
