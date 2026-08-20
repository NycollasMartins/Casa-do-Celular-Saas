import Link from 'next/link';
import { MESES_RETENCAO_PADRAO } from '@/lib/lgpd';

export const metadata = {
  title: 'Politica de Privacidade · Casa do Celular',
  description: 'Como tratamos os dados pessoais coletados no agendamento de visitas.',
};

/**
 * Politica de privacidade publica, alcancavel pelo titular dos dados — que
 * normalmente nao tem conta no sistema. Por isso a rota e aberta no
 * middleware, sem exigir sessao e sem redirecionar quem ja entrou.
 *
 * ATENCAO: este texto e um ponto de partida tecnico, escrito a partir do que
 * o sistema de fato coleta e faz. Os campos entre colchetes precisam ser
 * preenchidos pelo controlador, e o conjunto precisa de revisao juridica
 * antes de valer como documento oficial.
 */
export default function PoliticaPrivacidadePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-10 border-b border-slate-200 pb-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            CC
          </span>
          <div>
            <p className="text-base font-semibold text-ink">Casa do Celular</p>
            <p className="text-sm text-slate-500">Performance de agendadores</p>
          </div>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-ink">Politica de Privacidade</h1>
        <p className="mt-2 text-sm text-slate-500">
          Lei Geral de Protecao de Dados (Lei 13.709/2018)
        </p>
      </header>

      <div className="space-y-8 text-[15px] leading-relaxed text-slate-700">
        <section className="rounded-lg border border-warning/40 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-medium">Documento em elaboracao.</strong> Os campos entre
          colchetes precisam ser preenchidos pelo controlador e o texto revisado juridicamente antes
          de ser publicado como politica oficial.
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">Quem trata seus dados</h2>
          <p>
            O controlador dos dados e <strong>[razao social do franqueado]</strong>, CNPJ{' '}
            <strong>[CNPJ]</strong>, com sede em <strong>[endereco]</strong>. Para qualquer questao
            sobre seus dados, escreva para <strong>[e-mail do encarregado]</strong>.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">Que dados coletamos</h2>
          <p className="mb-3">
            Quando voce agenda uma visita a uma de nossas lojas, registramos:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>Nome completo</li>
            <li>CPF</li>
            <li>Telefone</li>
            <li>E-mail, quando informado</li>
            <li>Loja, data e situacao do agendamento</li>
          </ul>
          <p className="mt-3">
            Nao coletamos dados sensiveis, nao usamos cookies de rastreamento e nao registramos sua
            navegacao. Os dados vem exclusivamente do que voce informa ao nosso atendente.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">Por que coletamos</h2>
          <p className="mb-3">
            A finalidade e organizar o atendimento e medir o desempenho das nossas lojas. Em termos
            da LGPD:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              <strong>Nome e telefone</strong> — para confirmar e lembrar do seu agendamento
              (art. 7, V: execucao de procedimentos preliminares a pedido do titular).
            </li>
            <li>
              <strong>CPF</strong> — para identificar voce com seguranca no balcao e evitar
              agendamentos duplicados (art. 7, IX: legitimo interesse).
            </li>
            <li>
              <strong>Dados do agendamento</strong> — para analise interna de desempenho, sempre de
              forma agregada.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">Com quem compartilhamos</h2>
          <p>
            Com ninguem para fins comerciais. Nao vendemos, alugamos nem cedemos seus dados. O
            acesso e restrito a funcionarios da rede, e cada um enxerga somente os agendamentos da
            loja em que atua. Os dados ficam hospedados na infraestrutura do{' '}
            <strong>Supabase</strong>, nosso operador, que os processa apenas para nos prestar o
            servico.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">Por quanto tempo guardamos</h2>
          <p>
            Seus dados pessoais permanecem por <strong>{MESES_RETENCAO_PADRAO} meses</strong> a
            contar do agendamento. Passado esse prazo, nome, CPF, telefone e e-mail sao apagados de
            forma permanente. Continuam apenas os dados que nao identificam ninguem — loja, data e
            situacao — usados para estatistica.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">Seus direitos</h2>
          <p className="mb-3">
            O artigo 18 da LGPD garante a voce, a qualquer momento e sem custo:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>Saber se tratamos dados seus e quais sao</li>
            <li>Corrigir dados incompletos ou desatualizados</li>
            <li>Pedir a eliminacao dos seus dados</li>
            <li>Saber com quem compartilhamos</li>
            <li>Revogar consentimento</li>
          </ul>
          <p className="mt-3">
            Para exercer qualquer um deles, escreva para{' '}
            <strong>[e-mail do encarregado]</strong>. Respondemos em ate 15 dias. Ao pedir a
            eliminacao, apagamos nome, CPF, telefone, e-mail e observacoes de todos os seus
            registros; a contagem estatistica do atendimento permanece, ja sem qualquer ligacao com
            voce.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">Seguranca</h2>
          <p>
            O acesso exige senha individual e e segmentado por loja no proprio banco de dados, de
            modo que ninguem alcance dados fora do seu escopo de trabalho. O trafego e cifrado. Em
            caso de incidente que possa trazer risco a voce, comunicamos voce e a ANPD.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">Mudancas nesta politica</h2>
          <p>
            Se algo mudar, atualizamos esta pagina e a data abaixo. Alteracoes relevantes serao
            comunicadas pelos canais de contato que voce nos informou.
          </p>
        </section>

        <footer className="border-t border-slate-200 pt-6 text-sm text-slate-500">
          <p>Ultima atualizacao: [data]</p>
          <p className="mt-3">
            <Link href="/auth/login" className="text-brand hover:underline">
              Acessar o sistema
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
