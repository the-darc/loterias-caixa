/**
 * O mapper é onde o lixo da Caixa vira dado. Os testes rodam sobre as fixtures
 * reais das 11 modalidades e sobre payloads deformados de propósito, para
 * garantir que campo ausente ou com tipo errado vire erro em vez de `NaN`,
 * `Invalid Date` ou `undefined` vazando para quem consome.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InvalidResponseError } from '../src/errors.ts';
import { mapDraw } from '../src/mapper.ts';
import { readFixture, readLatestFixtures } from './fixtures.ts';
import type { Draw } from '../src/types/public.ts';

const MEGASENA = readFixture('latest/megasena.json') as Record<string, unknown>;

/** Data em UTC, para comparar sem depender do fuso de quem roda o teste. */
const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Fixture da Mega com um campo alterado, para exercitar o caminho de erro. */
const megasenaCom = (mudancas: Record<string, unknown>) => ({ ...MEGASENA, ...mudancas });

test('mapeia a fixture da Mega-Sena inteira', () => {
  const draw = mapDraw('megasena', MEGASENA, { projectSpecialDraw: true });

  assert.deepEqual(draw, {
    lotteryCode: 'megasena',
    lotteryName: 'Mega-Sena',
    contestNumber: 3050,
    isAccumulated: true,
    prizeValue: 0,
    drawDate: utc('2026-08-27'),
    nextDrawDate: utc('2026-08-30'),
    nextContestAccumulatedValue: 23351895.74,
    nextDrawPrizeEstimate: 30000000,
    nextSpecialDrawAccumulatedValue: 59155478.85,
    nextSpecialDrawDate: utc('2026-09-08'),
    drawDaysOfWeek: ['SUN', 'TUE', 'THU'],
    drawnNumbers: ['11', '14', '30', '38', '49', '55'],
  } satisfies Draw);
});

test('as 11 modalidades mapeiam sem erro', () => {
  for (const { code, payload } of readLatestFixtures()) {
    const draw = mapDraw(code, payload, { projectSpecialDraw: true });

    assert.equal(draw.lotteryCode, code);
    assert.ok(draw.lotteryName.length > 0);
    assert.ok(Number.isInteger(draw.contestNumber) && draw.contestNumber > 0);
    assert.ok(draw.drawDate instanceof Date && !Number.isNaN(draw.drawDate.getTime()));
    assert.ok(draw.drawDaysOfWeek.length > 0);
  }
});

test('prizeValue sai da faixa 1 do rateio, não de valorTotalPremioFaixaUm', () => {
  // A Federal é o caso que separa as duas fontes: pagou R$ 500 mil na faixa 1
  // e mesmo assim trouxe valorTotalPremioFaixaUm zerado.
  const federal = readFixture('latest/federal.json') as Record<string, unknown>;
  assert.equal(federal['valorTotalPremioFaixaUm'], 0);
  assert.equal(mapDraw('federal', federal).prizeValue, 500000);
});

test('Loteca sem dezenas vira lista vazia, não null', () => {
  const draw = mapDraw('loteca', readFixture('latest/loteca.json'));
  assert.deepEqual(draw.drawnNumbers, []);
});

test('Federal sem próximo concurso não inventa data', () => {
  const draw = mapDraw('federal', readFixture('latest/federal.json'));
  assert.ok(!('nextDrawDate' in draw), 'criou nextDrawDate a partir de string vazia');
});

test('campo opcional ausente não aparece no objeto', () => {
  const draw = mapDraw('supersete', readFixture('latest/supersete.json'), {
    projectSpecialDraw: true,
  });
  assert.ok(!('nextSpecialDrawAccumulatedValue' in draw));
  assert.ok(!('nextSpecialDrawDate' in draw));
});

test('datas viram meia-noite UTC, sem escorregar de dia', () => {
  const draw = mapDraw('megasena', MEGASENA);
  assert.equal(draw.drawDate.toISOString(), '2026-08-27T00:00:00.000Z');
  assert.equal(draw.drawDate.getUTCDate(), 27);
});

test('payload que não é objeto é recusado', () => {
  for (const invalido of [null, undefined, 'texto', 42, []]) {
    assert.throws(
      () => mapDraw('megasena', invalido),
      InvalidResponseError,
      `aceitou ${JSON.stringify(invalido)}`,
    );
  }
});

test('campo obrigatório ausente ou com tipo errado vira InvalidResponseError', () => {
  const casos: Record<string, unknown>[] = [
    { numero: '3050' },
    { numero: Number.NaN },
    { acumulado: 'sim' },
    { dataApuracao: 20260827 },
    { dataProximoConcurso: null },
    { valorAcumuladoProximoConcurso: null },
    { valorEstimadoProximoConcurso: undefined },
    { valorAcumuladoConcursoEspecial: '0' },
    { listaDezenas: [11, 14] },
    { listaDezenas: 'onze' },
    { listaRateioPremio: null },
    { listaRateioPremio: [] },
    { listaRateioPremio: [{ faixa: 2, valorPremio: 10 }] },
    { listaRateioPremio: [{ faixa: 1, valorPremio: 'zero' }] },
  ];

  for (const mudanca of casos) {
    assert.throws(
      () => mapDraw('megasena', megasenaCom(mudanca)),
      (erro: unknown) => {
        assert.ok(erro instanceof InvalidResponseError, `não foi InvalidResponseError`);
        assert.match(erro.message, /Resposta inválida da Caixa/);
        return true;
      },
      `aceitou ${JSON.stringify(mudanca)}`,
    );
  }
});

test('data fora do formato ou impossível é recusada', () => {
  for (const data of ['2026-08-27', '27-08-2026', '7/8/2026', '31/02/2026', '00/08/2026', '27/13/2026']) {
    assert.throws(
      () => mapDraw('megasena', megasenaCom({ dataApuracao: data })),
      InvalidResponseError,
      `aceitou a data ${data}`,
    );
  }
});

test('faixa 1 é procurada pelo número da faixa, não pela posição', () => {
  const foraDeOrdem = megasenaCom({
    listaRateioPremio: [
      { faixa: 3, valorPremio: 100 },
      { faixa: 1, valorPremio: 999 },
    ],
  });
  assert.equal(mapDraw('megasena', foraDeOrdem).prizeValue, 999);
});

test('item não-objeto no rateio não derruba a busca pela faixa 1', () => {
  const comLixo = megasenaCom({
    listaRateioPremio: [null, 'lixo', { faixa: 1, valorPremio: 42 }],
  });
  assert.equal(mapDraw('megasena', comLixo).prizeValue, 42);
});

test('a projeção do concurso especial segue o calendário da modalidade', () => {
  // Mega no 3050: próximo é o 3051 em 30/08 (dom), alvo é o 3055.
  // Caminhando pelo calendário: ter 01/09, qui 03/09, dom 06/09, ter 08/09.
  const draw = mapDraw('megasena', MEGASENA, { projectSpecialDraw: true });
  assert.deepEqual(draw.nextSpecialDrawDate, utc('2026-09-08'));
});

test('a projeção parte de data fora do calendário — o caso da Loteca', () => {
  // A Loteca apura na segunda, mas o dataProximoConcurso dela cai no sábado
  // 29/08. Do sábado, dois sorteios à frente: seg 31/08 e seg 07/09.
  const draw = mapDraw('loteca', readFixture('latest/loteca.json'), {
    projectSpecialDraw: true,
  });
  assert.deepEqual(draw.nextSpecialDrawDate, utc('2026-09-07'));
});

test('sem projeção quando a modalidade não acumula em final 0/5', () => {
  for (const code of ['diadesorte', 'duplasena', 'federal', 'lotomania', 'maismilionaria', 'supersete'] as const) {
    const draw = mapDraw(code, readFixture(`latest/${code}.json`), { projectSpecialDraw: true });
    assert.ok(!('nextSpecialDrawDate' in draw), `${code} projetou sem ter ciclo 0/5`);
  }
});

test('sem projeção quando o alvo é o próprio próximo concurso... que é a data dele', () => {
  const mesmoConcurso = megasenaCom({ numeroConcursoFinal_0_5: 3051, numeroConcursoProximo: 3051 });
  const draw = mapDraw('megasena', mesmoConcurso, { projectSpecialDraw: true });
  assert.deepEqual(draw.nextSpecialDrawDate, utc('2026-08-30'));
});

test('dado incoerente não vira data inventada', () => {
  const casos = [
    { rotulo: 'alvo no passado', mudanca: { numeroConcursoFinal_0_5: 3000 } },
    { rotulo: 'alvo absurdamente distante', mudanca: { numeroConcursoFinal_0_5: 999999 } },
    { rotulo: 'acumulado zerado', mudanca: { valorAcumuladoConcurso_0_5: 0 } },
    { rotulo: 'sem próximo concurso', mudanca: { dataProximoConcurso: '' } },
  ];

  for (const { rotulo, mudanca } of casos) {
    const draw = mapDraw('megasena', megasenaCom(mudanca), { projectSpecialDraw: true });
    assert.ok(!('nextSpecialDrawDate' in draw), `projetou com ${rotulo}`);
  }
});

test('a projeção é opt-in: por padrão não acontece', () => {
  const draw = mapDraw('megasena', MEGASENA);
  assert.ok(!('nextSpecialDrawDate' in draw));
  assert.ok('nextSpecialDrawAccumulatedValue' in draw, 'o valor acumulado é dado real, deve vir');
});

test('Dupla Sena entrega os dois sorteios', () => {
  const draw = mapDraw('duplasena', readFixture('latest/duplasena.json'));
  assert.deepEqual(draw.drawnNumbers, ['06', '19', '22', '27', '41', '46']);
  assert.deepEqual(draw.secondDrawNumbers, ['07', '11', '12', '13', '25', '28']);
});

test('+Milionária entrega os trevos junto das dezenas', () => {
  const draw = mapDraw('maismilionaria', readFixture('latest/maismilionaria.json'));
  assert.deepEqual(draw.drawnNumbers, ['01', '14', '19', '29', '31', '46']);
  assert.deepEqual(draw.bonusNumbers, ['1', '6']);
});

test('time do coração e mês da sorte saem limpos do padding da Caixa', () => {
  assert.equal(
    mapDraw('timemania', readFixture('latest/timemania.json')).bonusName,
    'ATHLETICO/PR',
  );
  assert.equal(mapDraw('diadesorte', readFixture('latest/diadesorte.json')).bonusName, 'Abril');
});

test('a limpeza preserva o espaço entre palavras do nome do time', () => {
  const bruto = readFixture('contest/timemania-2430.json') as Record<string, unknown>;
  assert.equal(bruto['nomeTimeCoracaoMesSorte'], 'BARRA FC         /SC');
  assert.equal(mapDraw('timemania', bruto).bonusName, 'BARRA FC/SC');
});

test('campo de largura fixa cheio de NUL não vira texto vazio', () => {
  const bruto = readFixture('latest/megasena.json') as Record<string, unknown>;
  assert.match(String(bruto['nomeTimeCoracaoMesSorte']), /\0/, 'a fixture perdeu o lixo original');

  const draw = mapDraw('megasena', bruto);
  assert.ok(!('bonusName' in draw), 'lixo da Caixa vazou como bonusName');
});

test('modalidade sem sorteio extra não ganha campo vazio', () => {
  const draw = mapDraw('megasena', MEGASENA);
  assert.ok(!('secondDrawNumbers' in draw));
  assert.ok(!('bonusNumbers' in draw));
  assert.ok(!('bonusName' in draw));
});

test('lista extra vazia não vira campo', () => {
  const draw = mapDraw('maismilionaria', megasenaCom({ trevosSorteados: [] }));
  assert.ok(!('bonusNumbers' in draw));
});

test('os campos extras também são validados', () => {
  const casos: Record<string, unknown>[] = [
    { listaDezenasSegundoSorteio: [7, 11] },
    { listaDezenasSegundoSorteio: 'sete' },
    { trevosSorteados: '16' },
    { trevosSorteados: [1, 6] },
    { nomeTimeCoracaoMesSorte: 42 },
  ];

  for (const mudanca of casos) {
    assert.throws(
      () => mapDraw('megasena', megasenaCom(mudanca)),
      InvalidResponseError,
      `aceitou ${JSON.stringify(mudanca)}`,
    );
  }
});
