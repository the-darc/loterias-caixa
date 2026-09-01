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
 * Os horários são de **Brasília** (`DRAW_TIME_ZONE`), e é assim que saem na
 * superfície pública: `Draw.nextDrawTime` traz o horário do próximo sorteio,
 * sempre acompanhado do fuso na documentação. Horário de parede sem fuso
 * declarado é bug garantido em quem roda em UTC — o padrão das Cloud
 * Functions —, então o fuso nunca fica implícito.
 *
 * O horário varia por dia da semana (21h de segunda a sexta, 11h aos
 * domingos), e por isso a lib devolve o horário **do próximo sorteio**, não um
 * horário fixo por modalidade: para a maioria das modalidades esse valor único
 * simplesmente não existe.
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
 * Fuso a que todos os horários deste calendário se referem. Exportado para
 * que quem consome consiga converter corretamente em vez de adivinhar.
 */
export const DRAW_TIME_ZONE = 'America/Sao_Paulo';

/** Os dias na ordem de `Date.prototype.getDay()` — domingo é 0. */
export const WEEKDAYS: readonly Weekday[] = Object.freeze([
  'SUN',
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
]);

/**
 * Índice de cada dia como `Date.prototype.getDay()` devolve. É por ele que as
 * listas abaixo são ordenadas.
 */
export const WEEKDAY_INDEX: Readonly<Record<Weekday, number>> = Object.freeze(
  Object.fromEntries(WEEKDAYS.map((weekday, index) => [weekday, index])),
) as Readonly<Record<Weekday, number>>;

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

/**
 * Data do concurso que acontece `drawsAhead` sorteios depois de `from`,
 * andando pelo calendário da modalidade.
 *
 * A data de partida **não precisa** ser dia de sorteio — a caminhada só conta
 * os dias que estão no calendário, a partir do dia seguinte. Isso é o que faz
 * a Loteca funcionar: o `dataProximoConcurso` dela cai no sábado, enquanto a
 * apuração é na segunda.
 *
 * É projeção sobre a cadência semanal: ignora feriado, concurso especial que
 * quebra a sequência e mudança futura de calendário. Só use para datas
 * próximas, e só a partir do último concurso — o calendário aqui é o de hoje.
 */
export function addDrawDays(code: LotteryCode, from: Date, drawsAhead: number): Date {
  const drawDays = new Set(getDrawDaysOfWeek(code));
  const date = new Date(from.getTime());

  for (let remaining = drawsAhead; remaining > 0; ) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (drawDays.has(WEEKDAYS[date.getUTCDay()]!)) {
      remaining--;
    }
  }

  return date;
}

/**
 * Horário do sorteio da modalidade na data informada, em `HH:mm` no fuso
 * `DRAW_TIME_ZONE`.
 *
 * Devolve `undefined` quando a data não cai em dia de sorteio da modalidade —
 * caso real da Loteca, cujo `dataProximoConcurso` é a data da rodada de jogos
 * (sábado) enquanto o calendário registra a apuração (segunda). Sem saber o
 * horário, a lib não inventa um.
 *
 * O dia da semana é lido em UTC, coerente com as datas que a lib devolve
 * (meia-noite UTC do dia do sorteio).
 */
export function getDrawTime(code: LotteryCode, date: Date): string | undefined {
  const weekday = WEEKDAYS[date.getUTCDay()];
  return getDrawSchedule(code).find((draw) => draw.weekday === weekday)?.time;
}
