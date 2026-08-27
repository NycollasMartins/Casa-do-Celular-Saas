'use client';

import { useTransition } from 'react';
import { BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { registrarPagamento } from '@/app/actions/cadastros';
import { limiteDoPagamento } from '@/lib/cobranca';
import { formatarDataIso } from '@/lib/utils';
import type { Franqueado } from '@/lib/types/database';

/**
 * Situacao da assinatura, em uma linha, e o botao que a resolve.
 *
 * O estado nao sai de uma coluna so: `vence_em` diz quando, `avisado_em` diz
 * se o relogio da carencia ja comecou, e `status` diz se o corte aconteceu.
 * Mostrar as tres separadas obrigaria quem le a fazer a conta de cabeca.
 */
export function SituacaoDaAssinatura({
  franqueado,
  carenciaDias,
}: {
  franqueado: Franqueado;
  carenciaDias: number;
}) {
  const [pendente, iniciar] = useTransition();

  function pagar() {
    iniciar(async () => {
      const resultado = await registrarPagamento(franqueado.id);
      toast[resultado.sucesso ? 'success' : 'error'](resultado.mensagem ?? '');
    });
  }

  const naoCobrada = !franqueado.assinatura_vence_em;

  return (
    <div className="flex items-center justify-end gap-3">
      <span className="text-sm text-slate-500">
        {naoCobrada ? (
          'Nao cobrada'
        ) : (
          <Prazo franqueado={franqueado} carenciaDias={carenciaDias} />
        )}
      </span>

      {naoCobrada ? null : (
        <Button variant="secondary" size="sm" onClick={pagar} loading={pendente}>
          <BadgeCheck className="h-4 w-4" aria-hidden />
          Registrar pagamento
        </Button>
      )}
    </div>
  );
}

function Prazo({ franqueado, carenciaDias }: { franqueado: Franqueado; carenciaDias: number }) {
  const vence = franqueado.assinatura_vence_em!;

  if (franqueado.status === 'inativo') {
    return <span className="font-medium text-danger">Suspensa por falta de pagamento</span>;
  }

  if (franqueado.assinatura_avisado_em) {
    // A conta da carencia sai de lib/cobranca, nao daqui: repetida na tela,
    // ela divergiria do que a rotina de fato faz.
    return (
      <span className="font-medium text-warning">
        Avisada — suspende em{' '}
        {formatarDataIso(limiteDoPagamento(franqueado.assinatura_avisado_em, carenciaDias))}
      </span>
    );
  }

  return <>Vence em {formatarDataIso(vence)}</>;
}
