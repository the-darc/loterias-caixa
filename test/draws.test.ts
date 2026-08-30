/**
 * As três funções públicas, com o `fetch` injetado — nenhuma requisição real.
 * O dublê roteia por URL, então `getAllLatestDraws` é exercitada como em
 * produção: 11 modalidades, em paralelo, com falha parcial.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getAllLatestDraws, getDraw, getLatestDraw } from '../src/draws.ts';
import type { FetchLike } from '../src/client.ts';
import { DrawNotFoundError, HttpError, LotteryError } from '../src/errors.ts';
import { getSupportedLotteries } from '../src/lotteries.ts';
import { readFixture, readLatestFixtures } from './fixtures.ts';
import type { LotteryCode } from '../src/types/public.ts';

const SEM_ESPERA = { retryDelayMs: 0 } as const;
const CODIGOS = getSupportedLotteries().map((lottery) => lottery.code);

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status });

/** Extrai o código da modalidade de uma URL da Caixa. */
const codigoDaUrl = (url: string) => url.split('/').slice(-1)[0] as LotteryCode;

/**
 * Dublê que responde cada modalidade com a fixture dela. `problemas` permite
 * trocar a resposta de uma modalidade específica por uma falha.
 */
function fetchDoCatalogo(problemas: Partial<Record<LotteryCode, () => Response>> = {}) {
  const fixtures = new Map(readLatestFixtures().map(({ code, payload }) => [code, payload]));
  const emVoo: string[] = [];
  let concorrenciaMaxima = 0;

  const impl: FetchLike = async (url) => {
    const code = codigoDaUrl(url);
    emVoo.push(code);
    concorrenciaMaxima = Math.max(concorrenciaMaxima, emVoo.length);
    // Cede o event loop para que as 11 requisições se sobreponham de verdade.
    await Promise.resolve();
    emVoo.splice(emVoo.indexOf(code), 1);

    const problema = problemas[code];
    return problema ? problema() : json(fixtures.get(code));
  };

  return { impl, concorrencia: () => concorrenciaMaxima };
}

test('getLatestDraw devolve o Draw já convertido', async () => {
  const impl: FetchLike = async () => json(readFixture('latest/megasena.json'));

  const draw = await getLatestDraw('megasena', { fetch: impl });

  assert.equal(draw.lotteryCode, 'megasena');
  assert.equal(draw.lotteryName, 'Mega-Sena');
  assert.equal(draw.contestNumber, 3050);
  assert.deepEqual(draw.drawDate, new Date('2026-08-27T00:00:00.000Z'));
  assert.deepEqual(draw.drawDaysOfWeek, ['SUN', 'TUE', 'THU']);
});

test('getLatestDraw projeta a data do próximo concurso especial', async () => {
  const impl: FetchLike = async () => json(readFixture('latest/megasena.json'));

  const draw = await getLatestDraw('megasena', { fetch: impl });

  assert.deepEqual(draw.nextSpecialDrawDate, new Date('2026-09-08T00:00:00.000Z'));
});

test('getDraw busca o concurso pedido e não projeta especial', async () => {
  const chamadas: string[] = [];
  const impl: FetchLike = async (url) => {
    chamadas.push(url);
    return json(readFixture('contest/megasena-2500.json'));
  };

  const draw = await getDraw('megasena', 2500, { fetch: impl });

  assert.equal(draw.contestNumber, 2500);
  assert.deepEqual(draw.drawDate, new Date('2022-07-13T00:00:00.000Z'));
  assert.ok(chamadas[0]!.endsWith('/megasena/2500'));
  assert.ok(
    !('nextSpecialDrawDate' in draw),
    'projetou data especial de concurso antigo com o calendário de hoje',
  );
});

test('os erros do client sobem sem tradução', async () => {
  const impl: FetchLike = async () => json(readFixture('error/concurso-futuro.json'), 500);

  await assert.rejects(
    () => getDraw('megasena', 99999, { fetch: impl, ...SEM_ESPERA }),
    DrawNotFoundError,
  );
  await assert.rejects(
    () => getLatestDraw('megasena', { fetch: impl, ...SEM_ESPERA }),
    DrawNotFoundError,
  );
});

test('getAllLatestDraws devolve as 11 modalidades, na ordem do catálogo', async () => {
  const { impl } = fetchDoCatalogo();

  const { draws, failures } = await getAllLatestDraws({ fetch: impl });

  assert.equal(draws.length, 11);
  assert.deepEqual(failures, []);
  assert.deepEqual(
    draws.map((draw) => draw.lotteryCode),
    CODIGOS,
  );
});

test('getAllLatestDraws consulta as modalidades em paralelo', async () => {
  const { impl, concorrencia } = fetchDoCatalogo();

  await getAllLatestDraws({ fetch: impl });

  assert.equal(concorrencia(), 11, 'as requisições não se sobrepuseram');
});

test('uma modalidade fora do ar não derruba as outras', async () => {
  const { impl } = fetchDoCatalogo({
    quina: () => json({ erro: 'indisponível' }, 503),
  });

  const { draws, failures } = await getAllLatestDraws({ fetch: impl, ...SEM_ESPERA });

  assert.equal(draws.length, 10);
  assert.ok(!draws.some((draw) => draw.lotteryCode === 'quina'));
  assert.equal(failures.length, 1);
  assert.equal(failures[0]!.code, 'quina');
  assert.ok(failures[0]!.error instanceof HttpError);
  assert.equal(failures[0]!.error.status, 503);
});

test('todas falhando devolve resultado vazio, não exceção', async () => {
  const problemas = Object.fromEntries(
    CODIGOS.map((code) => [code, () => json({}, 500)]),
  ) as Partial<Record<LotteryCode, () => Response>>;
  const { impl } = fetchDoCatalogo(problemas);

  const { draws, failures } = await getAllLatestDraws({ fetch: impl, ...SEM_ESPERA });

  assert.deepEqual(draws, []);
  assert.equal(failures.length, 11);
  assert.ok(failures.every((falha) => falha.error instanceof LotteryError));
});

test('erro inesperado é bug, não falha parcial: sobe', async () => {
  // `response.ok` é lido fora do try do client, então um objeto hostil escapa
  // da tradução de erros — é o que separa "a Caixa falhou" de "a lib quebrou".
  const impl: FetchLike = async () =>
    ({
      get ok(): boolean {
        throw new TypeError('resposta hostil');
      },
      text: async () => '{}',
    }) as unknown as Response;

  await assert.rejects(() => getAllLatestDraws({ fetch: impl, ...SEM_ESPERA }), TypeError);
});
