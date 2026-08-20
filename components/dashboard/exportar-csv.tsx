'use client';

import { useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  tipo: 'lojas' | 'agendadores';
  /** Desabilita quando a tabela esta vazia: baixar CSV so com cabecalho confunde. */
  vazio?: boolean;
}

/**
 * Link para a rota de exportacao carregando os filtros que estao na URL.
 * E um <a> de verdade, nao fetch: o navegador cuida do download a partir do
 * Content-Disposition, sem precisar montar Blob nem revogar object URL.
 */
export function ExportarCsv({ tipo, vazio = false }: Props) {
  const searchParams = useSearchParams();

  const params = new URLSearchParams(searchParams.toString());
  params.set('tipo', tipo);

  if (vazio) {
    return (
      <Button variant="secondary" size="sm" disabled title="Sem dados no periodo">
        <Download className="h-4 w-4" aria-hidden />
        Exportar CSV
      </Button>
    );
  }

  return (
    <Button asChild variant="secondary" size="sm">
      <a href={`/api/relatorios/export?${params.toString()}`} download>
        <Download className="h-4 w-4" aria-hidden />
        Exportar CSV
      </a>
    </Button>
  );
}
