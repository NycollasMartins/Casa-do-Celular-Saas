import { TableCell, TableRow } from '@/components/ui/table';

/**
 * Linha unica que ocupa a tabela inteira quando nao ha o que listar.
 *
 * POR QUE EXISTE
 * Tabela vazia sem texto e um cabecalho flutuando sobre o nada — indistinguivel
 * de erro de carregamento. Quem abre nao sabe se o sistema quebrou ou se ainda
 * nao ha dados, e a duvida custa um chamado.
 *
 * O idioma ja estava em seis lugares, copiado; aqui vira um. `colunas` precisa
 * bater com o numero de <TableHead> da tabela: menos que isso e a celula nao
 * atravessa, e a linha desalinha.
 *
 * PREFIRA dizer a proxima acao, nao so o vazio. 'Nenhuma loja ainda. Crie a
 * primeira para comecar a medir' resolve; 'Nenhuma loja' deixa a pessoa parada.
 */
export function LinhaVazia({
  colunas,
  children,
}: {
  colunas: number;
  children: React.ReactNode;
}) {
  return (
    <TableRow>
      <TableCell
        colSpan={colunas}
        className='py-12 text-center text-sm text-slate-500'
      >
        {children}
      </TableCell>
    </TableRow>
  );
}
