import type { LotteryError } from '../errors.ts';

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
/**
 * O maior prêmio que o concurso **de fato pagou**.
 *
 * Não é a faixa principal: quando ela acumula, o maior prêmio distribuído é o
 * da faixa seguinte que teve ganhador. Na Mega-Sena acumulada, por exemplo, é
 * a quina — e é esse o número que interessa a quem quer saber se valeu a pena.
 */
export interface PrizeTier {
  /** Descrição da faixa, como a Caixa escreve: `"5 acertos"`. */
  tier: string;
  /** Quantas apostas ganharam essa faixa. Pode ser `0`: a faixa acumulou. */
  winners: number;
  /** Quanto **cada** aposta ganhadora recebeu, em reais. `0` sem ganhador. */
  valuePerWinner: number;
}

/**
 * @deprecated Use {@link PrizeTier}. Mantido como apelido para não quebrar
 * quem já depende do nome na 0.2.x.
 */
export type TopPrize = PrizeTier;

export interface Draw {
  lotteryCode: LotteryCode;
  lotteryName: string;
  contestNumber: number;
  isAccumulated: boolean;
  prizeValue: number;
  drawDate: Date;
  nextDrawDate?: Date;
  /**
   * Horário do próximo sorteio em `HH:mm`, no fuso de Brasília
   * (`America/Sao_Paulo`). Não vem da API: sai do calendário estático, e o
   * valor depende do dia da semana em que o próximo concurso cai — 21h de
   * segunda a sexta, 11h aos domingos, com exceções por modalidade.
   *
   * Ausente quando não há próximo concurso agendado, ou quando a data dele
   * não cai em dia de sorteio conhecido (o caso da Loteca, cujo calendário é
   * o da apuração).
   */
  nextDrawTime?: string;
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
  /**
   * Maior prêmio efetivamente pago no concurso.
   *
   * **Ausente quando ninguém ganhou nada** — acontece em concurso totalmente
   * acumulado. Não confunda com `prizeValue`, que é a faixa principal e vem
   * `0` justamente nesse caso.
   */
  topPrize?: PrizeTier;
  /**
   * Todas as faixas de premiação do concurso, **na ordem da Caixa** — a
   * primeira é o prêmio principal.
   *
   * Diferente de `topPrize`, aqui entram as faixas **sem ganhador**, com
   * `winners: 0`. É o que permite dizer "1º prêmio: acumulou" em vez de
   * omitir a linha, e omitir seria pior: o leitor não saberia se a faixa não
   * existe ou se ninguém ganhou.
   *
   * Ausente quando a Caixa não devolve faixa alguma utilizável.
   */
  prizeTiers?: PrizeTier[];
  /**
   * Dezenas do segundo sorteio. Só a Dupla Sena tem dois sorteios por
   * concurso; nas demais modalidades o campo não vem.
   */
  secondDrawNumbers?: string[];
  /** Trevos sorteados. Só a +Milionária tem; nas demais o campo não vem. */
  bonusNumbers?: string[];
  /**
   * Time do coração (Timemania) ou mês da sorte (Dia de Sorte) — a Caixa
   * manda os dois no mesmo campo. Vem limpo do padding de largura fixa da
   * origem (`"ATHLETICO        /PR"` -> `"ATHLETICO/PR"`). Nas demais
   * modalidades o campo não vem.
   */
  bonusName?: string;
}

/** Uma modalidade cuja consulta falhou, dentro de um resultado parcial. */
export interface LotteryFailure {
  code: LotteryCode;
  error: LotteryError;
}

/**
 * Resultado de `getAllLatestDraws()`. A consulta é tolerante a falha parcial:
 * uma modalidade fora do ar não derruba as outras, e quem chama decide o que
 * fazer com `failures` — ignorar, logar ou tentar de novo só as que falharam.
 */
export interface AllLatestDrawsResult {
  draws: Draw[];
  failures: LotteryFailure[];
}
