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
  drawnNumbers: string[];
}
