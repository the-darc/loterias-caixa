import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getLotteryName, getSupportedLotteries, isSupportedLottery } from '../src/lotteries.ts';

test('getSupportedLotteries retorna as 11 modalidades da Caixa', () => {
  const lotteries = getSupportedLotteries();
  assert.equal(lotteries.length, 11);
  assert.deepEqual(
    lotteries.map((lottery) => lottery.code),
    [
      'megasena', 'quina', 'lotofacil', 'lotomania', 'timemania', 'duplasena',
      'federal', 'loteca', 'diadesorte', 'supersete', 'maismilionaria',
    ],
  );
});

test('getSupportedLotteries devolve cópias, sem vazar o catálogo interno', () => {
  const first = getSupportedLotteries();
  first[0]!.name = 'alterado';
  assert.equal(getSupportedLotteries()[0]!.name, 'Mega-Sena');
});

test('todas as loterias têm code e name preenchidos', () => {
  for (const lottery of getSupportedLotteries()) {
    assert.ok(lottery.code.length > 0, `code vazio em ${JSON.stringify(lottery)}`);
    assert.ok(lottery.name.length > 0, `name vazio em ${lottery.code}`);
  }
});

test('isSupportedLottery aceita códigos válidos e rejeita inválidos', () => {
  assert.equal(isSupportedLottery('megasena'), true);
  assert.equal(isSupportedLottery('maismilionaria'), true);
  assert.equal(isSupportedLottery('Megasena'), false);
  assert.equal(isSupportedLottery('raspadinha'), false);
  assert.equal(isSupportedLottery(''), false);
});

test('getLotteryName resolve o nome de exibição', () => {
  assert.equal(getLotteryName('megasena'), 'Mega-Sena');
  assert.equal(getLotteryName('lotofacil'), 'Lotofácil');
  assert.equal(getLotteryName('maismilionaria'), '+Milionária');
});

test('getLotteryName lança para código não suportado', () => {
  assert.throws(
    () => getLotteryName('inexistente' as never),
    /Loteria não suportada: inexistente/,
  );
});
