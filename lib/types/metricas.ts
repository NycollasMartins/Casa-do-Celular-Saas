export type Periodo = '7d' | '30d' | '90d' | 'personalizado';

export interface FiltroMetricas {
  lojaId?: string;
  periodo?: Periodo;
  dataInicio?: string;
  dataFim?: string;
}

export interface PontoDiario {
  data: string;
  label: string;
  contatos: number;
  agendados: number;
  compareceram: number;
}

export interface DesempenhoAgendador {
  agendadorId: string;
  nome: string;
  contatos: number;
  agendados: number;
  compareceram: number;
  taxaConversao: number;
}

export interface FatiaStatus {
  status: string;
  label: string;
  total: number;
}

export interface ResumoMetricas {
  totalContatos: number;
  totalAgendados: number;
  totalCompareceram: number;
  taxaConversao: number;
  taxaComparecimento: number;
  /** Fecha o funil: de quem compareceu, quantos compraram e quanto. */
  totalVendas: number;
  receita: number;
  ticketMedio: number;
  taxaFechamento: number;
  dadosDiarios: PontoDiario[];
  dadosPorAgendador: DesempenhoAgendador[];
  distribuicaoStatus: FatiaStatus[];
}
