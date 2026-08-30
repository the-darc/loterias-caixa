/**
 * Nenhum teste aqui toca a rede: o `fetch` é injetado. Os corpos de resposta
 * saem das fixtures reais de `test/fixtures/`, para que o client seja exercido
 * contra o que a Caixa de fato devolve — inclusive os erros disfarçados.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchDraw, fetchLatestDraw } from '../src/client.ts';
import type { FetchLike } from '../src/client.ts';
import {
  DrawNotFoundError,
  HttpError,
  InvalidResponseError,
  NetworkError,
  TimeoutError,
  UnsupportedLotteryError,
} from '../src/errors.ts';
import { readFixture } from './fixtures.ts';
import type { LotteryCode } from '../src/types/public.ts';

const MEGASENA = readFixture('latest/megasena.json');
const ERRO_CONCURSO_FUTURO = JSON.stringify(readFixture('error/concurso-futuro.json'));
const ERRO_CONCURSO_ZERO = JSON.stringify(readFixture('error/concurso-zero.json'));
const ERRO_MODALIDADE = JSON.stringify(readFixture('error/modalidade-inexistente.json'));

/** Sem espera entre tentativas — a suíte não deve pagar o backoff. */
const SEM_ESPERA = { retryDelayMs: 0 } as const;

interface Chamada {
  url: string;
  init: { method: string; headers: Record<string, string>; signal: AbortSignal };
}

/** Dublê que responde uma sequência de respostas e registra o que recebeu. */
function fakeFetch(...respostas: (Response | Error | (() => Response))[]) {
  const chamadas: Chamada[] = [];
  const impl: FetchLike = async (url, init) => {
    chamadas.push({ url, init });
    const resposta = respostas[Math.min(chamadas.length - 1, respostas.length - 1)]!;
    if (resposta instanceof Error) throw resposta;
    return typeof resposta === 'function' ? resposta() : resposta.clone();
  };
  return { impl, chamadas };
}

const json = (corpo: unknown, status = 200, statusText = '') =>
  new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, statusText });

test('fetchLatestDraw devolve o JSON cru do último concurso', async () => {
  const { impl, chamadas } = fakeFetch(json(MEGASENA));

  const payload = await fetchLatestDraw('megasena', { fetch: impl });

  assert.deepEqual(payload, MEGASENA);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0]!.url, 'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena');
});

test('a requisição se identifica e pede JSON', async () => {
  const { impl, chamadas } = fakeFetch(json(MEGASENA));

  await fetchLatestDraw('megasena', { fetch: impl });

  const { init } = chamadas[0]!;
  assert.equal(init.method, 'GET');
  assert.equal(init.headers['accept'], 'application/json');
  assert.match(init.headers['user-agent'] ?? '', /^loterias-caixa/);
  assert.ok(init.signal instanceof AbortSignal, 'requisição sem signal de timeout');
});

test('fetchDraw monta a URL com o número do concurso', async () => {
  const { impl, chamadas } = fakeFetch(json(readFixture('contest/megasena-2500.json')));

  await fetchDraw('megasena', 2500, { fetch: impl });

  assert.equal(
    chamadas[0]!.url,
    'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/2500',
  );
});

test('código não suportado nem chega a fazer requisição', async () => {
  const { impl, chamadas } = fakeFetch(json(MEGASENA));

  await assert.rejects(
    () => fetchLatestDraw('raspadinha' as LotteryCode, { fetch: impl }),
    UnsupportedLotteryError,
  );
  await assert.rejects(
    () => fetchDraw('raspadinha' as LotteryCode, 1, { fetch: impl }),
    UnsupportedLotteryError,
  );
  assert.equal(chamadas.length, 0, 'gastou requisição com código inválido');
});

test('número de concurso inválido é recusado antes da rede', async () => {
  const { impl, chamadas } = fakeFetch(json(MEGASENA));

  for (const invalido of [0, -1, 1.5, Number.NaN]) {
    await assert.rejects(
      () => fetchDraw('megasena', invalido, { fetch: impl }),
      DrawNotFoundError,
      `aceitou concurso ${invalido}`,
    );
  }
  assert.equal(chamadas.length, 0);
});

test('erro de validação chega como rejeição, nunca como throw síncrono', () => {
  const { impl } = fakeFetch(json(MEGASENA));

  assert.doesNotThrow(() => {
    void fetchLatestDraw('raspadinha' as LotteryCode, { fetch: impl }).catch(() => {});
    void fetchDraw('megasena', 0, { fetch: impl }).catch(() => {});
  });
});

test('falha de rede vira NetworkError com a causa original', async () => {
  const causa = new TypeError('fetch failed');
  const { impl, chamadas } = fakeFetch(causa);

  await assert.rejects(
    () => fetchLatestDraw('megasena', { fetch: impl, ...SEM_ESPERA }),
    (erro: unknown) => {
      assert.ok(erro instanceof NetworkError);
      assert.ok(!(erro instanceof TimeoutError));
      assert.equal(erro.cause, causa);
      assert.match(erro.url, /megasena$/);
      return true;
    },
  );
  assert.equal(chamadas.length, 3, 'falha de rede deveria ser retentada');
});

test('abort por tempo esgotado vira TimeoutError', async () => {
  const abortada = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  const { impl } = fakeFetch(abortada);

  await assert.rejects(
    () => fetchLatestDraw('megasena', { fetch: impl, timeoutMs: 25, ...SEM_ESPERA }),
    (erro: unknown) => {
      assert.ok(erro instanceof TimeoutError);
      assert.equal(erro.timeoutMs, 25);
      assert.equal(erro.cause, abortada);
      return true;
    },
  );
});

test('o timeout é real: o signal enviado aborta sozinho', async () => {
  const impl: FetchLike = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });

  await assert.rejects(
    () => fetchLatestDraw('megasena', { fetch: impl, timeoutMs: 20, retries: 0 }),
    TimeoutError,
  );
});

test('concurso além do último vira DrawNotFoundError, apesar do HTTP 500', async () => {
  const { impl, chamadas } = fakeFetch(json(ERRO_CONCURSO_FUTURO, 500, 'Internal Server Error'));

  await assert.rejects(
    () => fetchDraw('megasena', 99999, { fetch: impl, ...SEM_ESPERA }),
    (erro: unknown) => {
      assert.ok(erro instanceof DrawNotFoundError);
      assert.equal(erro.lotteryCode, 'megasena');
      assert.equal(erro.contestNumber, 99999);
      assert.ok(erro.cause instanceof HttpError, 'perdeu o detalhe do transporte');
      assert.equal(erro.cause.status, 500);
      return true;
    },
  );
  assert.equal(chamadas.length, 1, 'retentou um erro que nunca vai passar');
});

test('o envelope com StatusCode 404 também vira DrawNotFoundError', async () => {
  const { impl, chamadas } = fakeFetch(json(ERRO_CONCURSO_ZERO, 500, 'Internal Server Error'));

  await assert.rejects(
    () => fetchLatestDraw('megasena', { fetch: impl, ...SEM_ESPERA }),
    (erro: unknown) => {
      assert.ok(erro instanceof DrawNotFoundError);
      assert.equal(erro.contestNumber, undefined, 'último concurso não tem número a informar');
      return true;
    },
  );
  assert.equal(chamadas.length, 1);
});

test('500 com envelope de outro status continua sendo HttpError, e é retentado', async () => {
  const envelope = JSON.stringify({
    message: 'Ocorreu um erro inesperado.',
    exceptionMessage: JSON.stringify({ StatusCode: 503, ReasonPhrase: '' }),
  });
  const { impl, chamadas } = fakeFetch(json(envelope, 500, 'Internal Server Error'));

  await assert.rejects(
    () => fetchLatestDraw('megasena', { fetch: impl, ...SEM_ESPERA }),
    HttpError,
  );
  assert.equal(chamadas.length, 3);
});

test('500 sem envelope legível é tratado como falha de servidor', async () => {
  const { impl, chamadas } = fakeFetch(json('<html>Bad Gateway</html>', 500, 'Server Error'));

  await assert.rejects(
    () => fetchLatestDraw('megasena', { fetch: impl, ...SEM_ESPERA }),
    (erro: unknown) => {
      assert.ok(erro instanceof HttpError);
      assert.equal(erro.status, 500);
      assert.match(erro.message, /Server Error/);
      return true;
    },
  );
  assert.equal(chamadas.length, 3);
});

test('exceptionMessage que não é string é ignorado', async () => {
  const { impl } = fakeFetch(json({ exceptionMessage: { StatusCode: 404 } }, 500));

  await assert.rejects(
    () => fetchLatestDraw('megasena', { fetch: impl, ...SEM_ESPERA }),
    HttpError,
  );
});

test('exceptionMessage com JSON quebrado dentro é ignorado', async () => {
  const { impl } = fakeFetch(json({ exceptionMessage: '{quebrado' }, 500));

  await assert.rejects(
    () => fetchLatestDraw('megasena', { fetch: impl, ...SEM_ESPERA }),
    HttpError,
  );
});

test('modalidade inexistente (404 do ASP.NET) vira HttpError, sem retry', async () => {
  const { impl, chamadas } = fakeFetch(json(ERRO_MODALIDADE, 404, 'Not Found'));

  await assert.rejects(
    () => fetchLatestDraw('megasena', { fetch: impl, ...SEM_ESPERA }),
    (erro: unknown) => {
      assert.ok(erro instanceof HttpError);
      assert.equal(erro.status, 404);
      return true;
    },
  );
  assert.equal(chamadas.length, 1, '4xx não deve ser retentado');
});

test('429 é retentado e a resposta boa seguinte é aceita', async () => {
  const { impl, chamadas } = fakeFetch(json({ erro: 'devagar' }, 429), json(MEGASENA));

  const payload = await fetchLatestDraw('megasena', { fetch: impl, ...SEM_ESPERA });

  assert.deepEqual(payload, MEGASENA);
  assert.equal(chamadas.length, 2);
});

test('503 transitório é superado na segunda tentativa', async () => {
  const { impl, chamadas } = fakeFetch(json({}, 503, 'Service Unavailable'), json(MEGASENA));

  await fetchLatestDraw('megasena', { fetch: impl, ...SEM_ESPERA });

  assert.equal(chamadas.length, 2);
});

test('retries controla o número de tentativas', async () => {
  const semRetry = fakeFetch(new TypeError('fetch failed'));
  await assert.rejects(
    () => fetchLatestDraw('megasena', { fetch: semRetry.impl, retries: 0 }),
    NetworkError,
  );
  assert.equal(semRetry.chamadas.length, 1);

  const cincoTentativas = fakeFetch(new TypeError('fetch failed'));
  await assert.rejects(
    () => fetchLatestDraw('megasena', { fetch: cincoTentativas.impl, retries: 4, ...SEM_ESPERA }),
    NetworkError,
  );
  assert.equal(cincoTentativas.chamadas.length, 5);

  const negativo = fakeFetch(new TypeError('fetch failed'));
  await assert.rejects(
    () => fetchLatestDraw('megasena', { fetch: negativo.impl, retries: -3 }),
    NetworkError,
  );
  assert.equal(negativo.chamadas.length, 1, 'retries negativo deveria virar zero');
});

test('JSON malformado vira InvalidResponseError e não é retentado', async () => {
  const { impl, chamadas } = fakeFetch(json('{"numero": 3050', 200));

  await assert.rejects(
    () => fetchLatestDraw('megasena', { fetch: impl, ...SEM_ESPERA }),
    (erro: unknown) => {
      assert.ok(erro instanceof InvalidResponseError);
      assert.ok(erro.cause instanceof SyntaxError);
      assert.match(erro.message, /JSON malformado/);
      return true;
    },
  );
  assert.equal(chamadas.length, 1);
});

test('corpo que não é objeto JSON é recusado', async () => {
  for (const corpo of ['null', '"texto"', '42', '[]']) {
    const { impl } = fakeFetch(json(corpo, 200));
    await assert.rejects(
      () => fetchLatestDraw('megasena', { fetch: impl, ...SEM_ESPERA }),
      InvalidResponseError,
      `aceitou corpo ${corpo}`,
    );
  }
});

test('sem a opção fetch, usa o global', async () => {
  const original = globalThis.fetch;
  let chamou = false;
  globalThis.fetch = (async () => {
    chamou = true;
    return json(MEGASENA);
  }) as typeof globalThis.fetch;

  try {
    const payload = await fetchLatestDraw('megasena');
    assert.ok(chamou, 'não usou o fetch global');
    assert.deepEqual(payload, MEGASENA);
  } finally {
    globalThis.fetch = original;
  }
});
