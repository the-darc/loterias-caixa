export type LotteryCode =
  | 'megasena'
  | 'quina'
  | 'lotofacil'
  | 'lotomania'
  | 'timemania'
  | 'duplasena'
  | 'federal'
  | 'loteca'
  | 'diadesorte'
  | 'supersete'
  | 'maismilionaria';

/** Dia da semana, na sigla de três letras usada por `drawDaysOfWeek`. */
export type Weekday = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';

export interface Lottery {
  code: LotteryCode;
  name: string;
}

/**
 * Resultado de um sorteio. Datas são `Date` nativo e valores são `number` em
 * reais — a conversão para tipos de persistência (ex: Firestore Timestamp) é
 * responsabilidade de quem consome a lib.
 */
export interface Draw {
  lotteryCode: LotteryCode;
  lotteryName: string;
  contestNumber: number;
  isAccumulated: boolean;
  prizeValue: number;
  drawDate: Date;
  nextDrawDate?: Date;
  nextContestAccumulatedValue: number;
  nextDrawPrizeEstimate: number;
  nextSpecialDrawAccumulatedValue?: number;
  /**
   * Data prevista do próximo concurso especial. Só vem quando a modalidade
   * acumula para concursos de final 0/5 e há valor acumulado — é uma projeção
   * sobre o calendário, não um dado da Caixa. Veja `src/calendar.ts`.
   */
  nextSpecialDrawDate?: Date;
  /**
   * Dias da semana em que a modalidade sorteia. Não vem da API: é juntado a
   * partir do calendário estático de `src/calendar.ts`.
   */
  drawDaysOfWeek: Weekday[];
  drawnNumbers: string[];
}
