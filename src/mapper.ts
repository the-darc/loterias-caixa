/**
 * Conversão da resposta bruta da Caixa para o tipo público `Draw`.
 *
 * O client entrega `unknown` de propósito: é aqui que o payload é estreitado,
 * **campo a campo**. Nada é lido sem checar tipo — a resposta traz lixo real e
 * campos mudam sem aviso, então um `as CaixaDrawResponse` seria só uma mentira
 * bem-tipada. Campo obrigatório ausente ou com tipo errado vira
 * `InvalidResponseError`; campo opcional ausente simplesmente não entra.
 *
 * Alguns campos vêm com formatação de origem — `nomeTimeCoracaoMesSorte` é um
 * campo de largura fixa, preenchido com bytes NUL quando não se aplica e com
 * padding de espaço quando se aplica. Normalizar isso é trabalho daqui: quem
 * consome não deveria precisar saber que a Caixa usa COBOL por baixo.
 *
 * Sobre datas: a Caixa manda `dd/MM/yyyy` sem horário. O `Date` devolvido é
 * **meia-noite UTC** do dia informado — assim o dia não escorrega conforme o
 * fuso de quem lê. Quem precisa de horário local converte.
 */
import { addDrawDays, getDrawDaysOfWeek, getDrawTime } from './calendar.ts';
import { InvalidResponseError } from './errors.ts';
import { getLotteryName } from './lotteries.ts';
import type { Draw, LotteryCode } from './types/public.ts';

/**
 * Teto de sanidade para a projeção do concurso especial. O alvo de final 0/5
 * está sempre a poucos concursos de distância; um número muito maior é dado
 * incoerente, e projetar em cima dele daria uma data inventada.
 */
const MAX_CONTESTS_AHEAD = 30;

export interface MapDrawOptions {
  /**
   * Projetar `nextSpecialDrawDate` a partir do calendário. Só faz sentido para
   * o último concurso: a projeção usa o calendário de **hoje**, que não vale
   * para concurso antigo. Padrão: `false`.
   */
  projectSpecialDraw?: boolean;
}

export function mapDraw(
  code: LotteryCode,
  payload: unknown,
  options: MapDrawOptions = {},
): Draw {
  const source = asRecord(payload);

  const drawDate = parseDate(readString(source, 'dataApuracao'), 'dataApuracao');
  const nextDrawDate = parseOptionalDate(
    readString(source, 'dataProximoConcurso'),
    'dataProximoConcurso',
  );
  const nextDrawTime = nextDrawDate ? getDrawTime(code, nextDrawDate) : undefined;
  const specialAccumulated = readNumber(source, 'valorAcumuladoConcursoEspecial');
  const secondDrawNumbers = readStringList(source, 'listaDezenasSegundoSorteio');
  const bonusNumbers = readStringList(source, 'trevosSorteados');
  const bonusName = cleanFixedWidthLabel(readOptionalString(source, 'nomeTimeCoracaoMesSorte'));
  const specialDrawDate = options.projectSpecialDraw
    ? projectSpecialDrawDate(code, source, nextDrawDate)
    : undefined;

  return {
    lotteryCode: code,
    lotteryName: getLotteryName(code),
    contestNumber: readNumber(source, 'numero'),
    isAccumulated: readBoolean(source, 'acumulado'),
    prizeValue: readFirstTierPrize(source),
    drawDate,
    ...(nextDrawDate ? { nextDrawDate } : {}),
    ...(nextDrawTime ? { nextDrawTime } : {}),
    nextContestAccumulatedValue: readNumber(source, 'valorAcumuladoProximoConcurso'),
    nextDrawPrizeEstimate: readNumber(source, 'valorEstimadoProximoConcurso'),
    ...(specialAccumulated > 0 ? { nextSpecialDrawAccumulatedValue: specialAccumulated } : {}),
    ...(specialDrawDate ? { nextSpecialDrawDate: specialDrawDate } : {}),
    drawDaysOfWeek: getDrawDaysOfWeek(code),
    drawnNumbers: readStringList(source, 'listaDezenas'),
    ...(secondDrawNumbers.length > 0 ? { secondDrawNumbers } : {}),
    ...(bonusNumbers.length > 0 ? { bonusNumbers } : {}),
    ...(bonusName ? { bonusName } : {}),
  };
}

/**
 * Data prevista do próximo concurso especial, ou `undefined` quando não há o
 * que projetar. O algoritmo e suas ressalvas estão no README.
 */
function projectSpecialDrawDate(
  code: LotteryCode,
  source: Record<string, unknown>,
  nextDrawDate: Date | undefined,
): Date | undefined {
  const accumulated = readNumber(source, 'valorAcumuladoConcurso_0_5');
  const target = readNumber(source, 'numeroConcursoFinal_0_5');

  // `0` é o sentinela de "esta modalidade não acumula em final 0/5".
  if (accumulated <= 0 || target === 0) {
    return undefined;
  }
  // Sem data de partida não há como caminhar pelo calendário.
  if (!nextDrawDate) {
    return undefined;
  }

  const contestsAhead = target - readNumber(source, 'numeroConcursoProximo');
  if (contestsAhead < 0 || contestsAhead > MAX_CONTESTS_AHEAD) {
    return undefined;
  }
  if (contestsAhead === 0) {
    return nextDrawDate;
  }
  return addDrawDays(code, nextDrawDate, contestsAhead);
}

/**
 * Prêmio da faixa principal. Sai da faixa 1 de `listaRateioPremio`, e **não**
 * de `valorTotalPremioFaixaUm`, que é incoerente nos dois sentidos (veja o
 * CLAUDE.md).
 */
function readFirstTierPrize(source: Record<string, unknown>): number {
  const tiers = source['listaRateioPremio'];
  if (!Array.isArray(tiers)) {
    throw invalid('listaRateioPremio', tiers, 'esperava uma lista de faixas');
  }

  const firstTier = tiers.find(
    (tier): tier is Record<string, unknown> =>
      typeof tier === 'object' && tier !== null && (tier as Record<string, unknown>)['faixa'] === 1,
  );
  if (!firstTier) {
    throw invalid('listaRateioPremio', tiers, 'sem a faixa 1');
  }
  return readNumber(firstTier, 'valorPremio');
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new InvalidResponseError(
      `esperava um objeto, recebeu ${JSON.stringify(payload)?.slice(0, 40) ?? typeof payload}`,
    );
  }
  return payload as Record<string, unknown>;
}

function readNumber(source: Record<string, unknown>, field: string): number {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalid(field, value, 'esperava um número');
  }
  return value;
}

function readString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== 'string') {
    throw invalid(field, value, 'esperava um texto');
  }
  return value;
}

function readBoolean(source: Record<string, unknown>, field: string): boolean {
  const value = source[field];
  if (typeof value !== 'boolean') {
    throw invalid(field, value, 'esperava um booleano');
  }
  return value;
}

/** Lista de textos; `null` vira lista vazia (é o caso da Loteca, sem dezenas). */
function readStringList(source: Record<string, unknown>, field: string): string[] {
  const value = source[field];
  if (value === null || value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw invalid(field, value, 'esperava uma lista de textos');
  }
  return [...value];
}

/** Texto opcional: `null` e ausente viram `undefined`; tipo errado vira erro. */
function readOptionalString(source: Record<string, unknown>, field: string): string | undefined {
  const value = source[field];
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw invalid(field, value, 'esperava um texto');
  }
  return value;
}

/**
 * Tira o enchimento de um campo de largura fixa da Caixa.
 *
 * Remove os bytes NUL, junta as sequências de espaço e cola o `/` da UF, mas
 * **preserva o espaço entre palavras** — `"BARRA FC         /SC"` vira
 * `"BARRA FC/SC"`, não `"BARRAFC/SC"`. Texto que sobra vazio (o campo cheio de
 * NUL das modalidades em que não se aplica) vira `undefined`.
 */
function cleanFixedWidthLabel(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const cleaned = value
    .replaceAll('\0', '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim();
  return cleaned === '' ? undefined : cleaned;
}

/** `dd/MM/yyyy` -> meia-noite UTC. Recusa formato errado e data impossível. */
function parseDate(value: string, field: string): Date {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) {
    throw invalid(field, value, 'esperava uma data em dd/MM/yyyy');
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  // `Date.UTC` normaliza 31/02 para 03/03 em vez de recusar — comparar de
  // volta é o que separa data real de data impossível.
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) {
    throw invalid(field, value, 'a data não existe no calendário');
  }
  return date;
}

/** Como `parseDate`, mas string vazia significa "não há" (o caso da Federal). */
function parseOptionalDate(value: string, field: string): Date | undefined {
  return value === '' ? undefined : parseDate(value, field);
}

function invalid(field: string, value: unknown, reason: string): InvalidResponseError {
  return new InvalidResponseError(
    `campo "${field}" ${reason}, recebeu ${JSON.stringify(value)?.slice(0, 40) ?? typeof value}`,
  );
}
