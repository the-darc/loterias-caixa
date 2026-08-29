import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { LotteryCode } from '../src/types/public.ts';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

/** Lê uma fixture crua, sem tipar — quem chama decide o que fazer com ela. */
export function readFixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, relativePath), 'utf8'));
}

/** Todas as fixtures de último concurso, na ordem alfabética do arquivo. */
export function readLatestFixtures(): { code: LotteryCode; payload: unknown }[] {
  return readdirSync(join(FIXTURES_DIR, 'latest'))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      code: file.replace('.json', '') as LotteryCode,
      payload: readFixture(join('latest', file)),
    }));
}
