import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Como conseguir acesso · Casa do Celular' };

/**
 * Nao ha auto-cadastro: cada conta pertence a um franqueado e precisa de
 * loja e papel definidos.
 *
 * POR QUE A PAGINA SEPARA DOIS CASOS
 * Antes ela respondia uma coisa so — "peca ao seu franqueado" —, que serve
 * para quem e da equipe de uma loja e e um beco sem saida para quem recebeu
 * um convite de rede.
 *
 * Isso aconteceu de verdade, com o primeiro cliente: ele tinha o convite,
 * mas foi pelo endereco do site, clicou em "Nao tenho acesso" e leu que
 * devia pedir ao franqueado — sendo que O FRANQUEADO E ELE. Parou ali.
 *
 * O convite continua sem aparecer aqui, e isso e proposital: um botao de
 * "criar conta" nesta tela seria auto-cadastro aberto, e qualquer um criaria
 * uma rede. O que a pagina faz agora e so parar de mandar embora quem ja tem
 * o link, dizendo onde ele esta.
 */
export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Como conseguir acesso</CardTitle>
        <CardDescription>
          Depende de quem voce e no sistema. Veja qual dos dois casos e o seu.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 text-sm text-slate-600">
        <section className="space-y-1.5">
          <h2 className="font-medium text-ink">Recebeu um convite para criar sua rede?</h2>
          <p>
            O convite chega por um <strong>link proprio</strong>, com um endereco que contem{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">/convite/</code>.
            Procure a mensagem de quem lhe passou o acesso e abra esse link — e nele que voce
            cadastra sua empresa e escolhe sua senha.
          </p>
          <p className="text-slate-500">
            Esta tela de entrada nao substitui o link, e o convite nao pode ser aberto por aqui.
          </p>
        </section>

        <section className="space-y-1.5 border-t border-slate-200 pt-4">
          <h2 className="font-medium text-ink">E da equipe de uma loja?</h2>
          <p>
            Peca ao franqueado responsavel para cadastrar seu e-mail em <strong>Equipe</strong>.
            Voce recebe uma senha provisoria e troca no primeiro acesso.
          </p>
        </section>

        <Link
          href="/auth/login"
          className="inline-block border-t border-slate-200 pt-4 text-brand hover:underline"
        >
          Ja tenho acesso
        </Link>
      </CardContent>
    </Card>
  );
}
