import { NextResponse } from 'next/server';
import { ambienteSaudavel, conferirAmbiente } from '@/lib/ambiente';

export const dynamic = 'force-dynamic';

/**
 * Diz se o deploy esta configurado. Aberta de proposito.
 *
 * O momento em que esta resposta e mais necessaria e justamente quando
 * ninguem consegue entrar — se exigisse sessao, so responderia quando ja
 * nao fosse precisa.
 *
 * NAO devolve valor de variavel nenhuma: so o nome da que falta e o que
 * deixa de funcionar sem ela. Saber que `SUPABASE_SERVICE_ROLE_KEY` esta
 * ausente nao ajuda um atacante; ajuda quem acabou de publicar.
 */
export async function GET() {
  const problemas = conferirAmbiente();
  const saudavel = ambienteSaudavel(problemas);

  return NextResponse.json(
    {
      status: saudavel ? 'ok' : 'configuracao incompleta',
      problemas: problemas.map((p) => ({
        variavel: p.variavel,
        gravidade: p.gravidade,
        consequencia: p.consequencia,
      })),
    },
    {
      // 503 quando falta algo que impede o sistema de funcionar: assim um
      // monitor externo acusa sem precisar interpretar o corpo.
      status: saudavel ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
