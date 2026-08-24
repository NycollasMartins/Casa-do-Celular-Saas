'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Pencil, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UsuarioEdicaoForm } from '@/components/forms/usuario-edicao-form';
import { definirStatusUsuario, gerarSenhaProvisoria } from '@/app/actions/cadastros';
import { CredencialProvisoria } from '@/components/forms/credencial-provisoria';
import type { Usuario } from '@/lib/types/database';

interface Props {
  usuario: Usuario;
  lojas: { id: string; nome: string }[];
  lojaAtualId?: string;
  /** Conta do proprio gestor: nao pode desativar a si mesmo. */
  ehVoce: boolean;
}

export function AcoesUsuario({ usuario, lojas, lojaAtualId, ehVoce }: Props) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [credencial, setCredencial] = useState<string | null>(null);
  const [processando, iniciar] = useTransition();

  const inativo = usuario.status === 'inativo';

  function alternarStatus() {
    iniciar(async () => {
      const resultado = await definirStatusUsuario(usuario.id, inativo ? 'ativo' : 'inativo');

      if (!resultado.sucesso) {
        toast.error(resultado.mensagem ?? 'Nao foi possivel alterar o acesso.');
        return;
      }

      toast.success(resultado.mensagem ?? 'Acesso alterado.');
      setConfirmando(false);
      router.refresh();
    });
  }

  function redefinirSenha() {
    iniciar(async () => {
      const resultado = await gerarSenhaProvisoria(usuario.id);

      if (!resultado.sucesso || !resultado.senhaProvisoria) {
        toast.error(resultado.mensagem ?? 'Nao foi possivel redefinir a senha.');
        return;
      }

      setCredencial(resultado.senhaProvisoria);
      router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" aria-label={`Editar ${usuario.nome}`} onClick={() => setEditando(true)}>
        <Pencil className="h-4 w-4" aria-hidden />
      </Button>

      {/* Sem isto, perder a senha do cadastro so se resolvia apagando e
          recriando a pessoa — o que descarta o vinculo com a loja. Fica
          escondido para quem esta desligado: senha nova nao daria acesso. */}
      {!inativo ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Gerar nova senha de acesso para ${usuario.nome}`}
          onClick={redefinirSenha}
          loading={processando}
        >
          <KeyRound className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}

      <CredencialProvisoria
        email={usuario.email}
        senha={credencial}
        aoFechar={() => setCredencial(null)}
      />

      {!ehVoce ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={inativo ? `Reativar ${usuario.nome}` : `Encerrar acesso de ${usuario.nome}`}
          onClick={() => (inativo ? alternarStatus() : setConfirmando(true))}
          loading={processando && inativo}
        >
          {inativo ? (
            <UserCheck className="h-4 w-4 text-success" aria-hidden />
          ) : (
            <UserX className="h-4 w-4 text-danger" aria-hidden />
          )}
        </Button>
      ) : null}

      <Dialog open={editando} onOpenChange={setEditando}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>
              Alteracoes de perfil e loja valem a partir de hoje. O historico anterior fica preservado.
            </DialogDescription>
          </DialogHeader>
          <UsuarioEdicaoForm
            usuario={usuario}
            lojas={lojas}
            lojaAtualId={lojaAtualId}
            onSalvo={() => setEditando(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Encerrar o acesso de {usuario.nome}?</DialogTitle>
            <DialogDescription>
              A pessoa e desconectada na hora e deixa de enxergar qualquer dado. Os agendamentos que
              ela registrou continuam no historico e nos relatorios. Da para reativar depois.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={alternarStatus} loading={processando}>
              Encerrar acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
