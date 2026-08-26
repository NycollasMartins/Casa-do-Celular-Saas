'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MensagemErro, propsDeValidacao } from '@/components/ui/campo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usuarioSchema, type UsuarioInput } from '@/lib/validations/cadastros';
import { criarUsuario } from '@/app/actions/cadastros';

interface Props {
  lojas: { id: string; nome: string; franqueado_id: string }[];
  /**
   * So o super admin recebe esta lista.
   *
   * Ele nao pertence a rede nenhuma, entao sem escolher o franqueado nao ha
   * como saber de quem e a conta que esta sendo criada — e a action recusa,
   * porque adivinhar o tenant e como se criam contas na rede errada. Para
   * franqueado a lista nao vem: o tenant sai da sessao.
   */
  franqueados?: { id: string; nome: string }[];
  /** Recebe a credencial gerada: quem exibe e o pai, num dialogo que fica. */
  onSalvo?: (credencial?: { email: string; senha: string }) => void;
}

/** Cria um usuario e ja monta o vinculo com a loja (agendador) ou a participacao (diretor). */
export function UsuarioForm({ lojas, franqueados, onSalvo }: Props) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UsuarioInput>({
    resolver: zodResolver(usuarioSchema),
    defaultValues: {
      nome: '',
      email: '',
      role: 'agendador',
      // Sem franqueado escolhido nao ha loja para sugerir: a primeira da lista
      // pode ser de outra rede.
      loja_id: franqueados ? undefined : lojas[0]?.id,
      percentual_participacao: 30,
    },
  });

  const role = watch('role');
  const franqueadoId = watch('franqueado_id');

  // O super admin ve as lojas de todas as redes. Oferecer as do tenant errado
  // so produziria a recusa "a loja escolhida nao pertence a este franqueado"
  // depois de preencher o formulario inteiro.
  const lojasVisiveis = franqueados
    ? lojas.filter((loja) => loja.franqueado_id === franqueadoId)
    : lojas;

  async function aoEnviar(valores: UsuarioInput) {
    const formData = new FormData();
    Object.entries(valores).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== null) formData.append(chave, String(valor));
    });

    const resultado = await criarUsuario(formData);
    if (!resultado.sucesso) {
      toast.error(resultado.mensagem ?? 'Nao foi possivel criar o usuario.');
      return;
    }

    toast.success(resultado.mensagem ?? 'Usuario criado.');
    // A senha nao vai para o toast: some antes de ser anotada, e some para
    // sempre — nao ha onde consulta-la depois.
    onSalvo?.(
      resultado.senhaProvisoria
        ? { email: valores.email, senha: resultado.senhaProvisoria }
        : undefined
    );
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(aoEnviar)} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      {franqueados ? (
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="franqueado_id">Franqueado</Label>
          <Select
            value={franqueadoId ?? ''}
            onValueChange={(valor) => {
              setValue('franqueado_id', valor);
              // A loja escolhida antes pertencia a outra rede.
              setValue('loja_id', undefined);
            }}
          >
            <SelectTrigger
              id="franqueado_id"
              {...propsDeValidacao('franqueado_id', errors.franqueado_id?.message)}
            >
              <SelectValue placeholder="Escolha a rede desta pessoa" />
            </SelectTrigger>
            <SelectContent>
              {franqueados.map((franqueado) => (
                <SelectItem key={franqueado.id} value={franqueado.id}>
                  {franqueado.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <MensagemErro id="franqueado_id" mensagem={errors.franqueado_id?.message} />
          <p className="text-xs text-slate-400">
            Voce enxerga todas as redes, entao precisa dizer de qual e esta conta.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input
          id="nome" placeholder="Ana Souza" {...register('nome')}
          {...propsDeValidacao('nome', errors.nome?.message)}
        />
        <MensagemErro id="nome" mensagem={errors.nome?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail de acesso</Label>
        <Input
          id="email" type="email" placeholder="ana@franqueado.com.br" {...register('email')}
          {...propsDeValidacao('email', errors.email?.message)}
        />
        <MensagemErro id="email" mensagem={errors.email?.message} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="role">Perfil</Label>
        <Select value={role} onValueChange={(valor) => setValue('role', valor as UsuarioInput['role'])}>
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="agendador">Agendador</SelectItem>
            <SelectItem value="diretor">Diretor</SelectItem>
            <SelectItem value="franqueado">Franqueado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="loja_id">{role === 'agendador' ? 'Loja de atuacao' : 'Loja da participacao'}</Label>
        <Select value={watch('loja_id') ?? ''} onValueChange={(valor) => setValue('loja_id', valor)}>
          <SelectTrigger id="loja_id" {...propsDeValidacao('loja_id', errors.loja_id?.message)}>
            <SelectValue
              placeholder={
                franqueados && !franqueadoId ? 'Escolha o franqueado primeiro' : 'Escolha a loja'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {lojasVisiveis.map((loja) => (
              <SelectItem key={loja.id} value={loja.id}>
                {loja.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MensagemErro id="loja_id" mensagem={errors.loja_id?.message} />
        {franqueados && franqueadoId && lojasVisiveis.length === 0 ? (
          <p className="text-xs text-slate-400">
            Esta rede ainda nao tem loja. Para o dono da franquia isso nao impede nada — ele
            enxerga as lojas que cadastrar depois.
          </p>
        ) : null}
      </div>

      {role !== 'agendador' ? (
        <div className="space-y-1.5">
          <Label htmlFor="percentual_participacao">Participacao (%)</Label>
          <Input
            id="percentual_participacao"
            type="number"
            step="0.01"
            min="0.01"
            max="100"
            {...register('percentual_participacao')}
          />
          <p className="text-xs text-slate-400">Define quais lojas o diretor enxerga no dashboard.</p>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="submit" loading={isSubmitting}>
          Criar usuario
        </Button>
      </div>
    </form>
  );
}
