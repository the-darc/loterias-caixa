/**
 * Calendário de sorteios da Caixa — **dado estático, mantido à mão**.
 *
 * A API da Caixa não informa em que dias nem a que horas cada modalidade
 * sorteia: o payload só traz a data do próximo concurso. Este arquivo existe
 * para preencher essa lacuna e é, deliberadamente, o único lugar do código
 * onde essa informação mora. Quando a Caixa mudar a agenda, **só este arquivo
 * precisa mudar** — nenhuma lógica depende dos valores, apenas os lê.
 *
 * Última conferência: **29/08/2026**. Em julho de 2026 a Caixa moveu todos os
 * sorteios de sábado para a manhã de domingo; a tabela abaixo já reflete isso.
 *
 * ## Como manter
 *
 * 1. Confira a agenda na fonte oficial (portal de loterias da Caixa).
 * 2. Atualize a entrada da modalidade e a data de conferência acima.
 * 3. Rode `npm test` — `calendar.test.ts` confere a tabela contra o dia da
 *    semana real das fixtures e acusa incoerência interna.
 * 4. Mudança de agenda é mudança de comportamento observável: sobe versão.
 *
 * ## Sobre o horário
 *
 * `time` é **documentação**, não sai na superfície pública da lib: um horário
 * de parede sem timezone é fonte garantida de bug em quem roda em UTC (o
 * padrão das Cloud Functions). Fica aqui registrado, em horário de Brasília,
 * porque é o que permite conferir a tabela contra a fonte oficial.
 */
import { UnsupportedLotteryError } from './errors.ts';
import type { LotteryCode, Weekday } from './types/public.ts';

/** Um sorteio recorrente na semana de uma modalidade. Interno. */
export interface ScheduledDraw {
  weekday: Weekday;
  /** `HH:mm` no horário de Brasília. Só documentação — veja o doc do módulo. */
  time: string;
}

/**
 * Índice de cada dia como `Date.prototype.getDay()` devolve — domingo é 0.
 * É por ele que as listas abaixo são ordenadas.
 */
export const WEEKDAY_INDEX: Readonly<Record<Weekday, number>> = Object.freeze({
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
});

const atNight = (weekday: Weekday): ScheduledDraw => ({ weekday, time: '21:00' });
const sundayMorning: ScheduledDraw = { weekday: 'SUN', time: '11:00' };
const weekdaysAtNight = (['MON', 'TUE', 'WED', 'THU', 'FRI'] as const).map(atNight);

/**
 * Dias e horários de sorteio de cada modalidade, em ordem de `WEEKDAY_INDEX`.
 *
 * A Loteca é a exceção do conjunto: o que está aqui é a **apuração**
 * (segunda-feira), não a data dos jogos da rodada. Por isso o
 * `dataProximoConcurso` dela pode cair em outro dia da semana.
 */
export const DRAW_CALENDAR: Readonly<Record<LotteryCode, readonly ScheduledDraw[]>> = Object.freeze({
  megasena: [sundayMorning, atNight('TUE'), atNight('THU')],
  quina: [sundayMorning, ...weekdaysAtNight],
  lotofacil: [sundayMorning, ...weekdaysAtNight],
  lotomania: [atNight('MON'), atNight('WED'), atNight('FRI')],
  timemania: [sundayMorning, atNight('TUE'), atNight('THU')],
  duplasena: [atNight('MON'), atNight('WED'), atNight('FRI')],
  federal: [sundayMorning, { weekday: 'WED', time: '20:00' }],
  loteca: [{ weekday: 'MON', time: '17:00' }],
  diadesorte: [sundayMorning, ...weekdaysAtNight],
  supersete: [atNight('MON'), atNight('WED'), atNight('FRI')],
  maismilionaria: [sundayMorning, atNight('WED')],
});

/** Agenda completa de uma modalidade, incluindo horário. Interno. */
export function getDrawSchedule(code: LotteryCode): readonly ScheduledDraw[] {
  const schedule = DRAW_CALENDAR[code];
  if (!schedule) {
    throw new UnsupportedLotteryError(code);
  }
  return schedule;
}

/**
 * Dias da semana em que a modalidade sorteia, ordenados como
 * `Date.prototype.getDay()`. É o valor que a lib junta à resposta da Caixa
 * para preencher `Draw.drawDaysOfWeek`.
 */
export function getDrawDaysOfWeek(code: LotteryCode): Weekday[] {
  return getDrawSchedule(code).map((draw) => draw.weekday);
}
