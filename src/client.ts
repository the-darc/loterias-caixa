/**
 * Único ponto de acesso à rede da lib.
 *
 * Nenhum outro módulo chama `fetch`: concentrar aqui é o que mantém timeout,
 * retry, `User-Agent` e tradução de erro num lugar só — e é o que torna a
 * suíte de testes possível sem rede, já que o `fetch` é injetável.
 *
 * O client **não interpreta o conteúdo** da resposta: devolve `unknown`, e
 * quem estreita é o `mapper.ts`. Ele só decide se houve resposta útil e, se
 * não houve, qual erro da hierarquia descreve a falha.
 *
 * ## O erro disfarçado da Caixa
 *
 * Concurso inexistente não vem como 404: vem **HTTP 500** com o status
 * verdadeiro (412 ou 404) escondido no JSON de `exceptionMessage`. Por isso o
 * envelope é aberto antes de decidir o erro — sem isso, "esse concurso não
 * existe" seria indistinguível de "a Caixa caiu", e o retry gastaria as três
 * tentativas num erro que nunca vai passar.
 */
import { setTimeout as sleep } from 'node:timers/promises';

import {
  DrawNotFoundError,
  HttpError,
  InvalidResponseError,
  NetworkError,
  TimeoutError,
  UnsupportedLotteryError,
} from './errors.ts';
import { isSupportedLottery } from './lotteries.ts';
import type { CaixaErrorResponse, CaixaExceptionEnvelope } from './types/caixa.ts';
import type { LotteryCode } from './types/public.ts';

const BASE_URL = 'https://servicebus2.caixa.gov.br/portaldeloterias/api';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 300;

/** Identifica a lib para a Caixa em vez de fingir ser um navegador. */
const USER_AGENT = 'loterias-caixa (+https://www.npmjs.com/package/loterias-caixa)';

/**
 * O mínimo de `fetch` que a lib usa. O `fetch` global satisfaz este tipo, e um
 * dublê de teste não precisa implementar a assinatura inteira.
 */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>;

export interface RequestOptions {
  /** Tempo limite de cada tentativa, em ms. Padrão: 10000. */
  timeoutMs?: number;
  /** Tentativas **extras** após a primeira falhar. Padrão: 2. Negativo vira 0. */
  retries?: number;
  /** Espera antes da primeira retentativa, em ms; dobra a cada tentativa. Padrão: 300. */
  retryDelayMs?: number;
  /** `fetch` alternativo. Existe para teste — em produção use o global. */
  fetch?: FetchLike;
}

/** O que estava sendo pedido, para o erro saber se dizer "concurso X". */
interface Target {
  code: LotteryCode;
  contestNumber?: number;
}

/**
 * Último concurso de uma modalidade. Devolve o JSON cru, sem interpretar.
 *
 * É `async` de propósito, mesmo só delegando: função que devolve `Promise` não
 * pode lançar de forma síncrona na validação, ou quem usa `.catch()` leva uma
 * exceção não capturada.
 */
export async function fetchLatestDraw(
  code: LotteryCode,
  options: RequestOptions = {},
): Promise<unknown> {
  assertSupported(code);
  return request(`${BASE_URL}/${code}`, { code }, options);
}

/** Concurso específico de uma modalidade. Devolve o JSON cru, sem interpretar. */
export async function fetchDraw(
  code: LotteryCode,
  contestNumber: number,
  options: RequestOptions = {},
): Promise<unknown> {
  assertSupported(code);
  if (!Number.isInteger(contestNumber) || contestNumber < 1) {
    // Curto-circuito: a Caixa responderia o mesmo com um 500 disfarçado, e não
    // vale gastar uma requisição para descobrir que 0 não é concurso.
    throw new DrawNotFoundError(code, contestNumber);
  }
  return request(`${BASE_URL}/${code}/${contestNumber}`, { code, contestNumber }, options);
}

function assertSupported(code: LotteryCode): void {
  if (!isSupportedLottery(code)) {
    throw new UnsupportedLotteryError(code);
  }
}

async function request(url: string, target: Target, options: RequestOptions): Promise<unknown> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    fetch: fetchImpl = globalThis.fetch,
  } = options;

  return attemptWithRetry(url, target, {
    fetchImpl,
    timeoutMs,
    lastAttempt: Math.max(0, retries),
    retryDelayMs,
  });
}

interface RetryConfig {
  fetchImpl: FetchLike;
  timeoutMs: number;
  /** Índice da última tentativa permitida; 0 significa "sem retentativa". */
  lastAttempt: number;
  retryDelayMs: number;
}

/** Tenta, e em falha retentável espera o backoff e tenta de novo. */
async function attemptWithRetry(
  url: string,
  target: Target,
  config: RetryConfig,
  attempt = 0,
): Promise<unknown> {
  try {
    return await attemptRequest(url, target, config.fetchImpl, config.timeoutMs);
  } catch (error) {
    if (attempt >= config.lastAttempt || !isRetryable(error)) {
      throw error;
    }
    await sleep(config.retryDelayMs * 2 ** attempt);
    return attemptWithRetry(url, target, config, attempt + 1);
  }
}

async function attemptRequest(
  url: string,
  target: Target,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response;
  let body: string;

  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    body = await response.text();
  } catch (error) {
    // `AbortSignal.timeout()` aborta com uma DOMException chamada TimeoutError.
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new TimeoutError(url, timeoutMs, { cause: error });
    }
    throw new NetworkError(url, { cause: error });
  }

  if (!response.ok) {
    throw translateErrorResponse(response, body, url, target);
  }

  const payload = parseJson(body, url);
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new InvalidResponseError(`${url} não devolveu um objeto JSON`);
  }
  return payload;
}

/**
 * Decide qual erro descreve uma resposta não-2xx, abrindo o envelope de
 * exceção da Caixa quando ele existe.
 */
function translateErrorResponse(
  response: Response,
  body: string,
  url: string,
  target: Target,
): Error {
  const httpError = new HttpError(response.status, url, response.statusText);
  const envelope = readExceptionEnvelope(body);

  if (envelope?.StatusCode === 404 || envelope?.StatusCode === 412) {
    return new DrawNotFoundError(target.code, target.contestNumber, { cause: httpError });
  }
  return httpError;
}

/** Extrai o `CaixaExceptionEnvelope` de dentro de `exceptionMessage`, se houver. */
function readExceptionEnvelope(body: string): CaixaExceptionEnvelope | null {
  const payload = tryParseJson(body) as CaixaErrorResponse | null;
  if (typeof payload?.exceptionMessage !== 'string') {
    return null;
  }
  return tryParseJson(payload.exceptionMessage) as CaixaExceptionEnvelope | null;
}

function parseJson(body: string, url: string): unknown {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new InvalidResponseError(`JSON malformado em ${url}`, { cause: error });
  }
}

/** Como `parseJson`, mas para quando corpo ilegível não é motivo de erro. */
function tryParseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * Vale tentar de novo? Falha de rede e timeout sim; 429 e 5xx reais também.
 * `DrawNotFoundError` e `InvalidResponseError` não — o primeiro é resposta
 * definitiva da Caixa, o segundo indica que o formato mudou, e repetir só
 * atrasa o erro.
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return true;
  }
  if (error instanceof HttpError) {
    return error.status === 429 || error.status >= 500;
  }
  return false;
}
