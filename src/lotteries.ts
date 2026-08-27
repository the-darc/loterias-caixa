import type { Lottery, LotteryCode } from './types/public.ts';

const LOTTERIES: readonly Lottery[] = Object.freeze([
  { code: 'megasena', name: 'Mega-Sena' },
  { code: 'quina', name: 'Quina' },
  { code: 'lotofacil', name: 'Lotofácil' },
  { code: 'lotomania', name: 'Lotomania' },
  { code: 'timemania', name: 'Timemania' },
  { code: 'duplasena', name: 'Dupla Sena' },
  { code: 'federal', name: 'Federal' },
  { code: 'loteca', name: 'Loteca' },
  { code: 'diadesorte', name: 'Dia de Sorte' },
  { code: 'supersete', name: 'Super Sete' },
  { code: 'maismilionaria', name: '+Milionária' },
] satisfies Lottery[]);

export function getSupportedLotteries(): Lottery[] {
  return LOTTERIES.map((lottery) => ({ ...lottery }));
}

export function isSupportedLottery(code: string): code is LotteryCode {
  return LOTTERIES.some((lottery) => lottery.code === code);
}

export function getLotteryName(code: LotteryCode): string {
  const lottery = LOTTERIES.find((item) => item.code === code);
  if (!lottery) {
    throw new Error(`Loteria não suportada: ${code}`);
  }
  return lottery.name;
}
