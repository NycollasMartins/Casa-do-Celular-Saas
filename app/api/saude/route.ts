import { NextResponse } from 'next/server';
import { ambienteSaudavel, conferirAmbiente } from '@/lib/ambiente';
import { conferirSchema, schemaCompleto } from '@/lib/prontidao';
import { verificarRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Diz se o deploy esta pronto para uso. Aberta de proposito.
 *
 * O momento em que esta resposta e mais necessaria e justamente quando
 * ninguem consegue entrar — se exigisse sessao, so responderia quando ja
 * nao fosse precisa. O middleware sai antes de tocar no Supabase para que
 * ela funcione tambem sem configuracao nenhuma.
 *
 * NAO devolve valor de variavel nenhuma: so o nome da que falta e o que
 * deixa de funcionar sem ela.
 */
export async function GET(request: Request) {
  // Rota aberta que consulta o banco precisa de teto. O identificador e o IP
  // porque nao ha sessao — e sem sessao o `usuario.id` do resto da API nao
  // existe. Doze por minuto sobra para quem esta conferindo um deploy e
  // corta o laco de curl.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'desconhecido';

  const limite = await verificarRateLimit(`saude:${ip}`, 12);
  if (!limite.permitido) {
    return NextResponse.json(
      { erro: 'Muitas conferencias seguidas. Tente de novo em instantes.' },
      { status: 429, headers: { 'Retry-After': String(limite.resetEmSegundos) } }
    );
  }

  const problemas = conferirAmbiente();
  const ambienteOk = ambienteSaudavel(problemas);

  // Sem as chaves nao da para perguntar nada ao banco. Tentar produziria um
  // erro de conexao no lugar do diagnostico util que ja temos.
  const schema = ambienteOk ? await conferirSchema() : [];
  const faltando = schema.filter((item) => !item.presente);
  const bancoOk = ambienteOk && schemaCompleto(schema);

  const pronto = ambienteOk && bancoOk;

  return NextResponse.json(
    {
      status: pronto ? 'ok' : 'incompleto',
      ambiente: {
        ok: ambienteOk,
        problemas: problemas.map((p) => ({
          variavel: p.variavel,
          gravidade: p.gravidade,
          consequencia: p.consequencia,
        })),
      },
      banco: ambienteOk
        ? {
            ok: bancoOk,
            faltando: faltando.map((item) => ({
              item: item.item,
              migration: item.migration,
            })),
            ...(faltando.length > 0 && {
              comoResolver:
                'Rode supabase/APLICAR-PENDENTES.sql no SQL Editor. Se o item existir no ' +
                'banco e ainda aparecer aqui, o cache do PostgREST nao recarregou: ' +
                "execute `notify pgrst, 'reload schema';`.",
            }),
          }
        : { ok: false, motivo: 'sem configuracao para consultar o banco' },
    },
    {
      // 503 quando falta algo que impede o sistema de funcionar: um monitor
      // externo acusa sem precisar interpretar o corpo.
      status: pronto ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
