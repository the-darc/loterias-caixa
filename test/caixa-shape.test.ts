/**
 * Trava o shape declarado em `src/types/caixa.ts` contra as respostas reais
 * guardadas em `test/fixtures/`.
 *
 * Se a Caixa adicionar, remover ou mudar o tipo de um campo, este teste falha
 * assim que as fixtures forem recapturadas — é o alarme de que o endpoint
 * (que não é documentado nem versionado) mudou debaixo da lib.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFixture, readLatestFixtures } from './fixtures.ts';
import type {
  CaixaDrawResponse,
  CaixaErrorResponse,
  CaixaExceptionEnvelope,
  CaixaMatchResult,
  CaixaPrizeTier,
  CaixaWinnerCity,
} from '../src/types/caixa.ts';

type Check = (value: unknown) => boolean;

const isString: Check = (v) => typeof v === 'string';
const isNumber: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const isBoolean: Check = (v) => typeof v === 'boolean';
const isUnknown: Check = () => true;
const arrayOf = (item: Check): Check => (v) => Array.isArray(v) && v.every(item);
const nullable = (check: Check): Check => (v) => v === null || check(v);
const objectWith =
  (schema: Record<string, Check>): Check =>
  (v) =>
    typeof v === 'object' && v !== null && !Array.isArray(v) && matches(v, schema).length === 0;

/** Devolve as divergências entre um objeto e um schema; vazio significa conforme. */
function matches(value: object, schema: Record<string, Check>, optional: string[] = []): string[] {
  const problems: string[] = [];
  const record = value as Record<string, unknown>;

  for (const [field, check] of Object.entries(schema)) {
    if (!(field in record)) {
      if (!optional.includes(field)) problems.push(`campo ausente: ${field}`);
      continue;
    }
    if (!check(record[field])) {
      problems.push(`tipo inesperado em ${field}: ${JSON.stringify(record[field])?.slice(0, 60)}`);
    }
  }

  for (const field of Object.keys(record)) {
    if (!(field in schema)) problems.push(`campo novo, fora do tipo declarado: ${field}`);
  }

  return problems;
}

// `Record<keyof …>` obriga a tabela a cobrir todos os campos do tipo: incluir
// um campo no tipo sem validá-lo aqui quebra o typecheck.
const PRIZE_TIER: Record<keyof CaixaPrizeTier, Check> = {
  descricaoFaixa: isString,
  faixa: isNumber,
  numeroDeGanhadores: isNumber,
  valorPremio: isNumber,
};

const WINNER_CITY: Record<keyof CaixaWinnerCity, Check> = {
  ganhadores: isNumber,
  municipio: isString,
  nomeFatansiaUL: isString,
  posicao: isNumber,
  serie: isString,
  uf: isString,
};

const MATCH_RESULT: Record<keyof CaixaMatchResult, Check> = {
  diaSemana: isString,
  dtJogo: isString,
  icSorteioResultado: isNumber,
  nomeCampeonato: isString,
  nomeEquipeUm: isString,
  nomeEquipeDois: isString,
  nuConcurso: isNumber,
  nuGolEquipeUm: isNumber,
  nuGolEquipeDois: isNumber,
  nuJogo: isNumber,
  nuSequencial: isNumber,
  resultado: isUnknown,
  siglaPaisUm: isString,
  siglaPaisDois: isString,
  siglaUFUm: isString,
  siglaUFDois: isString,
};

const DRAW: Record<keyof CaixaDrawResponse, Check> = {
  acumulado: isBoolean,
  dataApuracao: isString,
  dataProximoConcurso: isString,
  dezenasSorteadasOrdemSorteio: nullable(arrayOf(isString)),
  exibirDetalhamentoPorCidade: isBoolean,
  id: isUnknown,
  indicadorConcursoEspecial: isNumber,
  listaDezenas: nullable(arrayOf(isString)),
  listaDezenasSegundoSorteio: nullable(arrayOf(isString)),
  listaMunicipioUFGanhadores: arrayOf(objectWith(WINNER_CITY)),
  listaRateioPremio: arrayOf(objectWith(PRIZE_TIER)),
  listaResultadoEquipeEsportiva: nullable(arrayOf(objectWith(MATCH_RESULT))),
  localSorteio: isString,
  nomeMunicipioUFSorteio: isString,
  nomeTimeCoracaoMesSorte: nullable(isString),
  numero: isNumber,
  numeroConcursoAnterior: isNumber,
  numeroConcursoFinal_0_5: isNumber,
  numeroConcursoProximo: isNumber,
  numeroJogo: isNumber,
  observacao: nullable(isString),
  premiacaoContingencia: isUnknown,
  tipoJogo: isString,
  tipoPublicacao: isNumber,
  ultimoConcurso: isBoolean,
  valorArrecadado: isNumber,
  valorAcumuladoConcurso_0_5: isNumber,
  valorAcumuladoConcursoEspecial: isNumber,
  valorAcumuladoProximoConcurso: isNumber,
  valorEstimadoProximoConcurso: isNumber,
  valorSaldoReservaGarantidora: isNumber,
  valorTotalPremioFaixaUm: isNumber,
  trevosSorteados: arrayOf(isString),
};

/** Único campo que legitimamente não vem em toda modalidade. */
const DRAW_OPTIONAL = ['trevosSorteados'];

const latest = readLatestFixtures();

test('há fixture das 11 modalidades suportadas', () => {
  assert.deepEqual(
    latest.map((fixture) => fixture.code).sort(),
    [
      'diadesorte', 'duplasena', 'federal', 'loteca', 'lotofacil', 'lotomania',
      'maismilionaria', 'megasena', 'quina', 'supersete', 'timemania',
    ],
  );
});

for (const { code, payload } of latest) {
  test(`fixture de ${code} confere com CaixaDrawResponse`, () => {
    assert.deepEqual(matches(payload as object, DRAW, DRAW_OPTIONAL), []);
  });
}

test('endpoint de concurso específico devolve o mesmo shape do último concurso', () => {
  const payload = readFixture('contest/megasena-2500.json') as CaixaDrawResponse;
  assert.deepEqual(matches(payload, DRAW, DRAW_OPTIONAL), []);
  assert.equal(payload.numero, 2500);
});

test('ultimoConcurso vem true até em concurso antigo — não serve para nada', () => {
  const antigo = readFixture('contest/megasena-2500.json') as CaixaDrawResponse;
  assert.equal(antigo.numero, 2500);
  assert.equal(
    antigo.ultimoConcurso,
    true,
    'a Caixa passou a marcar concurso antigo como não-último; o campo virou confiável',
  );
});

test('só a +Milionária traz trevosSorteados', () => {
  for (const { code, payload } of latest) {
    const temTrevos = 'trevosSorteados' in (payload as object);
    assert.equal(temTrevos, code === 'maismilionaria', `${code} divergiu em trevosSorteados`);
  }
});

test('dataApuracao vem sempre em dd/MM/yyyy, nunca em ISO', () => {
  for (const { code, payload } of latest) {
    const { dataApuracao } = payload as CaixaDrawResponse;
    assert.match(dataApuracao, /^\d{2}\/\d{2}\/\d{4}$/, `${code}: ${dataApuracao}`);
    assert.ok(
      Number.isNaN(new Date(dataApuracao).getTime()),
      `${code}: new Date() passou a aceitar o formato — o mapper pode ter deixado de precisar do parse manual`,
    );
  }
});

test('dataProximoConcurso é dd/MM/yyyy ou string vazia — nunca null', () => {
  for (const { code, payload } of latest) {
    const { dataProximoConcurso } = payload as CaixaDrawResponse;
    assert.ok(
      dataProximoConcurso === '' || /^\d{2}\/\d{2}\/\d{4}$/.test(dataProximoConcurso),
      `${code}: ${JSON.stringify(dataProximoConcurso)}`,
    );
  }
});

test('nomeTimeCoracaoMesSorte vem sujo e precisa de limpeza no mapper', () => {
  const sujeira = latest.filter(({ payload }) => {
    const valor = (payload as CaixaDrawResponse).nomeTimeCoracaoMesSorte;
    return valor !== null && valor.trim().replace(/\0/g, '') === '';
  });
  assert.ok(sujeira.length > 0, 'nenhuma fixture com lixo — o campo pode ter sido saneado na origem');
});

test('valorTotalPremioFaixaUm não é confiável — a faixa 1 do rateio é a fonte', () => {
  const porCodigo = new Map(latest.map(({ code, payload }) => [code, payload as CaixaDrawResponse]));

  // Federal: NÃO acumulou, teve ganhador de R$ 500 mil na faixa 1 — e mesmo
  // assim valorTotalPremioFaixaUm veio 0.
  const federal = porCodigo.get('federal')!;
  assert.equal(federal.acumulado, false);
  assert.equal(federal.valorTotalPremioFaixaUm, 0);
  assert.ok(federal.listaRateioPremio[0]!.numeroDeGanhadores > 0);
  assert.ok(federal.listaRateioPremio[0]!.valorPremio > 0);

  // +Milionária: acumulou, zero ganhadores na faixa 1 — e ainda assim
  // valorTotalPremioFaixaUm veio preenchido.
  const maisMilionaria = porCodigo.get('maismilionaria')!;
  assert.equal(maisMilionaria.acumulado, true);
  assert.equal(maisMilionaria.listaRateioPremio[0]!.numeroDeGanhadores, 0);
  assert.ok(maisMilionaria.valorTotalPremioFaixaUm > 0);
});

test('a faixa 1 do rateio é coerente em todas as modalidades', () => {
  for (const { code, payload } of latest) {
    const { acumulado, listaRateioPremio } = payload as CaixaDrawResponse;
    const faixaUm = listaRateioPremio[0]!;
    assert.equal(faixaUm.faixa, 1, `${code}: a primeira faixa do rateio não é a faixa 1`);
    if (acumulado) {
      assert.equal(faixaUm.numeroDeGanhadores, 0, `${code} acumulou mas tem ganhador na faixa 1`);
      assert.equal(faixaUm.valorPremio, 0, `${code} acumulou mas pagou a faixa 1`);
    } else {
      assert.ok(faixaUm.numeroDeGanhadores > 0, `${code} não acumulou mas não tem ganhador`);
    }
  }
});

test('erro de concurso inexistente esconde o status real dentro de exceptionMessage', () => {
  const casos: [string, number][] = [
    ['error/concurso-futuro.json', 412],
    ['error/concurso-zero.json', 404],
  ];

  for (const [arquivo, statusEsperado] of casos) {
    const erro = readFixture(arquivo) as CaixaErrorResponse;
    assert.equal(erro.message, 'Ocorreu um erro inesperado.');
    assert.ok(erro.exceptionMessage, `${arquivo} sem exceptionMessage`);

    const envelope = JSON.parse(erro.exceptionMessage) as CaixaExceptionEnvelope;
    assert.equal(envelope.StatusCode, statusEsperado, `${arquivo} mudou de status`);
  }
});

test('modalidade inexistente usa o outro formato de erro, com Message maiúsculo', () => {
  const erro = readFixture('error/modalidade-inexistente.json') as CaixaErrorResponse;
  assert.equal(erro.exceptionMessage, undefined);
  assert.match(erro.Message ?? '', /No HTTP resource was found/);
  assert.ok(erro.MessageDetail);
});
