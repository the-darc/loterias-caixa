/**
 * As três funções de consulta da lib: client + mapper costurados.
 *
 * É a camada mais fina do projeto de propósito — busca, converte, devolve.
 * Quem faz rede é o `client.ts`, quem entende o payload é o `mapper.ts`.
 */
import { fetchDraw, fetchLatestDraw } from './client.ts';
import type { RequestOptions } from './client.ts';
import { LotteryError } from './errors.ts';
import { getSupportedLotteries } from './lotteries.ts';
import { mapDraw } from './mapper.ts';
import type { AllLatestDrawsResult, Draw, LotteryCode, LotteryFailure } from './types/public.ts';

/**
 * Resultado do último concurso de uma modalidade.
 *
 * É a única consulta que projeta `nextSpecialDrawDate`: a projeção usa o
 * calendário de hoje, que não vale para concurso antigo.
 */
export async function getLatestDraw(
  code: LotteryCode,
  options: RequestOptions = {},
): Promise<Draw> {
  const payload = await fetchLatestDraw(code, options);
  return mapDraw(code, payload, { projectSpecialDraw: true });
}

/**
 * Resultado de um concurso específico.
 *
 * Não traz `nextSpecialDrawDate`: projetar a data de um concurso especial com
 * o calendário atual daria data errada para concurso antigo — a Mega sorteava
 * às quartas e sábados até 2024, e aos sábados até julho de 2026.
 */
export async function getDraw(
  code: LotteryCode,
  contestNumber: number,
  options: RequestOptions = {},
): Promise<Draw> {
  const payload = await fetchDraw(code, contestNumber, options);
  return mapDraw(code, payload);
}

/**
 * Último concurso de todas as modalidades suportadas, em paralelo.
 *
 * Tolerante a falha parcial: modalidade que falhar entra em `failures` com o
 * erro correspondente, e as demais são devolvidas normalmente. `draws` sai na
 * ordem do catálogo.
 *
 * Erro que não seja da hierarquia da lib **não** é tratado como falha parcial
 * — é bug, e sobe.
 */
export async function getAllLatestDraws(
  options: RequestOptions = {},
): Promise<AllLatestDrawsResult> {
  const codes = getSupportedLotteries().map((lottery) => lottery.code);
  const settled = await Promise.allSettled(codes.map((code) => getLatestDraw(code, options)));

  const draws: Draw[] = [];
  const failures: LotteryFailure[] = [];

  for (const [index, result] of settled.entries()) {
    if (result.status === 'fulfilled') {
      draws.push(result.value);
      continue;
    }
    if (!(result.reason instanceof LotteryError)) {
      throw result.reason;
    }
    failures.push({ code: codes[index]!, error: result.reason });
  }

  return { draws, failures };
}
