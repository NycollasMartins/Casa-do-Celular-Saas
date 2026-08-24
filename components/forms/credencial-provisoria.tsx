'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  email: string;
  senha: string | null;
  aoFechar: () => void;
}

/**
 * Mostra a senha de primeiro acesso ate alguem fecha-la.
 *
 * POR QUE NAO SERVE UM AVISO QUE SOME
 * A senha e gerada no servidor e nao fica guardada em lugar nenhum. Antes ela
 * aparecia num toast de doze segundos: quem se distraia perdia a unica copia,
 * e a pessoa cadastrada ficava sem entrada — "esqueci a senha" depende do
 * SMTP do Supabase, que pode nao estar configurado.
 *
 * O botao de copiar existe pelo mesmo motivo pratico: sao quinze caracteres
 * aleatorios, e transcrever a mao erra. Erro de transcricao vira "nao
 * consigo entrar", que ninguem relaciona com o cadastro feito dias antes.
 */
export function CredencialProvisoria({ email, senha, aoFechar }: Props) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`E-mail: ${email}\nSenha: ${senha}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissao de area de transferencia (http, navegador antigo): o
      // texto continua na tela para ser selecionado a mao.
      setCopiado(false);
    }
  }

  return (
    <Dialog open={senha !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Senha de primeiro acesso</DialogTitle>
          <DialogDescription>
            Anote ou copie agora e entregue a pessoa. Ela nao fica guardada e nao da para consultar
            depois — se perder, gere outra pelo menu da Equipe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">E-mail</p>
            <p className="font-mono text-sm text-ink">{email}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Senha</p>
            {/* `select-all` para um clique pegar a senha inteira quando a
                area de transferencia nao estiver disponivel. */}
            <p className="select-all font-mono text-base font-medium text-ink">{senha}</p>
          </div>
        </div>

        <p className="text-sm text-slate-500">
          No primeiro acesso o sistema exige a troca desta senha antes de liberar qualquer tela.
        </p>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="secondary" onClick={copiar}>
            {copiado ? (
              <>
                <Check className="h-4 w-4" aria-hidden /> Copiado
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden /> Copiar
              </>
            )}
          </Button>
          <Button onClick={aoFechar}>Ja anotei</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
