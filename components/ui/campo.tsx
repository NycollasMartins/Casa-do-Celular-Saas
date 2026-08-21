/**
 * Liga a mensagem de erro ao campo que a causou.
 *
 * Sem isso, o erro aparece como um texto vermelho solto abaixo do input:
 * quem enxerga a tela entende pela proximidade, e quem usa leitor de tela
 * tabula ate o campo e nao ouve nada. `aria-describedby` faz o leitor
 * anunciar a mensagem junto do rotulo, e `aria-invalid` marca o campo como
 * invalido para a navegacao por formulario.
 *
 * `role="alert"` cobre o outro momento: quando o erro APARECE apos o envio,
 * sem o foco estar no campo, ele e anunciado na hora.
 */

/** Espalhe no Input/Select. O id precisa ser o mesmo do MensagemErro. */
export function propsDeValidacao(id: string, mensagem?: string) {
  if (!mensagem) return {};
  return {
    'aria-invalid': true as const,
    'aria-describedby': `${id}-erro`,
  };
}

export function MensagemErro({ id, mensagem }: { id: string; mensagem?: string }) {
  if (!mensagem) return null;

  return (
    <p id={`${id}-erro`} role="alert" className="text-xs text-danger">
      {mensagem}
    </p>
  );
}
