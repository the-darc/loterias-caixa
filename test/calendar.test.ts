/**
 * O calendário é dado digitado à mão — o teste existe para que um erro de
 * digitação não vire dado errado na resposta da lib. Duas frentes: coerência
 * interna da tabela e confronto com o dia da semana real das fixtures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DRAW_CALENDAR,
  WEEKDAY_INDEX,
  getDrawDaysOfWeek,
  getDrawSchedule,
} from '../src/calendar.ts';
import { UnsupportedLotteryError } from '../src/errors.ts';
import { getSupportedLotteries } from '../src/lotteries.ts';
import { readFixture, readLatestFixtures } from './fixtures.ts';
import type { CaixaDrawResponse } from '../src/types/caixa.ts';
import type { LotteryCode, Weekday } from '../src/types/public.ts';

/** `dd/MM/yyyy` -> sigla do dia da semana, em UTC para não sofrer com timezone. */
function weekdayOf(date: string): Weekday {
  const [day, month, year] = date.split('/').map(Number) as [number, number, number];
  const index = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekday = (Object.keys(WEEKDAY_INDEX) as Weekday[]).find(
    (candidate) => WEEKDAY_INDEX[candidate] === index,
  );
  assert.ok(weekday, `dia da semana desconhecido para ${date}`);
  return weekday;
}

test('o calendário cobre exatamente as modalidades suportadas', () => {
  assert.deepEqual(
    Object.keys(DRAW_CALENDAR).sort(),
    getSupportedLotteries()
      .map((lottery) => lottery.code)
      .sort(),
  );
});

test('toda modalidade sorteia em pelo menos um dia', () => {
  for (const [code, schedule] of Object.entries(DRAW_CALENDAR)) {
    assert.ok(schedule.length > 0, `${code} está sem nenhum sorteio no calendário`);
  }
});

test('nenhuma modalidade repete dia da semana', () => {
  for (const [code, schedule] of Object.entries(DRAW_CALENDAR)) {
    const dias = schedule.map((draw) => draw.weekday);
    assert.equal(new Set(dias).size, dias.length, `${code} tem dia repetido: ${dias.join(',')}`);
  }
});

test('os dias vêm ordenados por WEEKDAY_INDEX, com domingo primeiro', () => {
  for (const [code, schedule] of Object.entries(DRAW_CALENDAR)) {
    const indices = schedule.map((draw) => WEEKDAY_INDEX[draw.weekday]);
    assert.deepEqual(indices, [...indices].sort((a, b) => a - b), `${code} fora de ordem`);
  }
});

test('todo horário está em HH:mm válido', () => {
  for (const [code, schedule] of Object.entries(DRAW_CALENDAR)) {
    for (const { weekday, time } of schedule) {
      assert.match(time, /^([01]\d|2[0-3]):[0-5]\d$/, `${code}/${weekday}: horário ${time}`);
    }
  }
});

test('getDrawDaysOfWeek devolve só os dias, sem vazar horário', () => {
  assert.deepEqual(getDrawDaysOfWeek('megasena'), ['SUN', 'TUE', 'THU']);
  assert.deepEqual(getDrawDaysOfWeek('loteca'), ['MON']);
  assert.deepEqual(getDrawDaysOfWeek('quina'), ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI']);
});

test('getDrawDaysOfWeek devolve cópia, sem vazar o calendário interno', () => {
  const dias = getDrawDaysOfWeek('megasena');
  dias.push('SAT');
  assert.deepEqual(getDrawDaysOfWeek('megasena'), ['SUN', 'TUE', 'THU']);
});

test('código não suportado lança UnsupportedLotteryError', () => {
  assert.throws(() => getDrawSchedule('raspadinha' as LotteryCode), UnsupportedLotteryError);
  assert.throws(() => getDrawDaysOfWeek('raspadinha' as LotteryCode), UnsupportedLotteryError);
});

test('o dia da apuração de cada fixture está no calendário da modalidade', () => {
  for (const { code, payload } of readLatestFixtures()) {
    const { dataApuracao } = payload as CaixaDrawResponse;
    const dia = weekdayOf(dataApuracao);
    assert.ok(
      getDrawDaysOfWeek(code).includes(dia),
      `${code}: apurou em ${dataApuracao} (${dia}), fora do calendário ${getDrawDaysOfWeek(code).join(',')}`,
    );
  }
});

test('na Loteca o calendário é da apuração — dataProximoConcurso cai fora dele', () => {
  const loteca = readLatestFixtures().find((fixture) => fixture.code === 'loteca');
  const { dataApuracao, dataProximoConcurso } = loteca!.payload as CaixaDrawResponse;

  assert.equal(weekdayOf(dataApuracao), 'MON');
  assert.equal(weekdayOf(dataProximoConcurso), 'SAT');
  assert.ok(!getDrawDaysOfWeek('loteca').includes('SAT'));
});

test('o calendário é o de hoje: concurso de 2022 não bate com ele', () => {
  // Em 2022 a Mega sorteava às quartas e sábados. Serve de lembrete de que
  // projetar data de concurso antigo com o calendário atual dá resultado errado.
  const antigo = readFixture('contest/megasena-2500.json') as CaixaDrawResponse;
  assert.equal(weekdayOf(antigo.dataApuracao), 'WED');
  assert.ok(!getDrawDaysOfWeek('megasena').includes('WED'));
});
