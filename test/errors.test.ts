import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DrawNotFoundError,
  HttpError,
  InvalidResponseError,
  LotteryError,
  NetworkError,
  TimeoutError,
  UnsupportedLotteryError,
} from '../src/errors.ts';

const URL_EXEMPLO = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena';

test('todo erro da lib é Error e LotteryError', () => {
  const erros = [
    new LotteryError('falhou'),
    new UnsupportedLotteryError('raspadinha'),
    new NetworkError(URL_EXEMPLO),
    new TimeoutError(URL_EXEMPLO, 5000),
    new HttpError(503, URL_EXEMPLO),
    new DrawNotFoundError('megasena', 9999),
    new InvalidResponseError('campo ausente'),
  ];

  for (const erro of erros) {
    assert.ok(erro instanceof Error, `${erro.name} não é Error`);
    assert.ok(erro instanceof LotteryError, `${erro.name} não é LotteryError`);
    assert.ok(erro.message.length > 0, `${erro.name} sem mensagem`);
    assert.ok(erro.stack, `${erro.name} sem stack`);
  }
});

test('cada erro carrega o próprio name, útil em log e serialização', () => {
  assert.equal(new LotteryError('x').name, 'LotteryError');
  assert.equal(new UnsupportedLotteryError('x').name, 'UnsupportedLotteryError');
  assert.equal(new NetworkError(URL_EXEMPLO).name, 'NetworkError');
  assert.equal(new TimeoutError(URL_EXEMPLO, 1).name, 'TimeoutError');
  assert.equal(new HttpError(500, URL_EXEMPLO).name, 'HttpError');
  assert.equal(new DrawNotFoundError('quina').name, 'DrawNotFoundError');
  assert.equal(new InvalidResponseError('x').name, 'InvalidResponseError');
});

test('LotteryError preserva a causa original', () => {
  const causa = new Error('ECONNRESET');
  assert.equal(new LotteryError('falhou', { cause: causa }).cause, causa);
  assert.equal(new LotteryError('falhou').cause, undefined);
});

test('UnsupportedLotteryError expõe o código recusado', () => {
  const erro = new UnsupportedLotteryError('raspadinha');
  assert.equal(erro.code, 'raspadinha');
  assert.equal(erro.message, 'Loteria não suportada: raspadinha');
});

test('NetworkError guarda a url e a causa de baixo nível', () => {
  const causa = new TypeError('fetch failed');
  const erro = new NetworkError(URL_EXEMPLO, { cause: causa });
  assert.equal(erro.url, URL_EXEMPLO);
  assert.equal(erro.cause, causa);
  assert.equal(erro.message, `Falha de rede ao consultar ${URL_EXEMPLO}`);
});

test('TimeoutError é um NetworkError, mas distinguível', () => {
  const erro = new TimeoutError(URL_EXEMPLO, 5000);
  assert.ok(erro instanceof NetworkError);
  assert.equal(erro.timeoutMs, 5000);
  assert.equal(erro.url, URL_EXEMPLO);
  assert.equal(erro.message, `Tempo esgotado após 5000ms ao consultar ${URL_EXEMPLO}`);
  assert.ok(!(new NetworkError(URL_EXEMPLO) instanceof TimeoutError));
});

test('TimeoutError também preserva a causa', () => {
  const causa = new Error('The operation was aborted due to timeout');
  assert.equal(new TimeoutError(URL_EXEMPLO, 5000, { cause: causa }).cause, causa);
});

test('HttpError expõe status e url, com statusText opcional', () => {
  const comTexto = new HttpError(503, URL_EXEMPLO, 'Service Unavailable');
  assert.equal(comTexto.status, 503);
  assert.equal(comTexto.url, URL_EXEMPLO);
  assert.equal(
    comTexto.message,
    `A Caixa respondeu HTTP 503 (Service Unavailable) em ${URL_EXEMPLO}`,
  );

  const semTexto = new HttpError(500, URL_EXEMPLO);
  assert.equal(semTexto.message, `A Caixa respondeu HTTP 500 em ${URL_EXEMPLO}`);
  assert.equal(
    new HttpError(500, URL_EXEMPLO, '').message,
    `A Caixa respondeu HTTP 500 em ${URL_EXEMPLO}`,
  );
});

test('HttpError aceita causa', () => {
  const causa = new Error('corpo da resposta');
  assert.equal(new HttpError(404, URL_EXEMPLO, 'Not Found', { cause: causa }).cause, causa);
});

test('DrawNotFoundError distingue concurso específico de modalidade vazia', () => {
  const especifico = new DrawNotFoundError('megasena', 9999);
  assert.equal(especifico.lotteryCode, 'megasena');
  assert.equal(especifico.contestNumber, 9999);
  assert.equal(especifico.message, 'Concurso 9999 da loteria megasena não encontrado');

  const semConcurso = new DrawNotFoundError('loteca');
  assert.equal(semConcurso.contestNumber, undefined);
  assert.equal(semConcurso.message, 'Nenhum concurso encontrado para a loteria loteca');
});

test('DrawNotFoundError trata concurso 0 como número, não como ausente', () => {
  const erro = new DrawNotFoundError('federal', 0);
  assert.equal(erro.contestNumber, 0);
  assert.equal(erro.message, 'Concurso 0 da loteria federal não encontrado');
});

test('DrawNotFoundError aceita causa', () => {
  const causa = new HttpError(404, URL_EXEMPLO);
  assert.equal(new DrawNotFoundError('quina', 1, { cause: causa }).cause, causa);
});

test('InvalidResponseError prefixa o detalhe e o mantém acessível', () => {
  const causa = new SyntaxError('Unexpected token < in JSON');
  const erro = new InvalidResponseError('JSON malformado', { cause: causa });
  assert.equal(erro.detail, 'JSON malformado');
  assert.equal(erro.message, 'Resposta inválida da Caixa: JSON malformado');
  assert.equal(erro.cause, causa);
  assert.equal(new InvalidResponseError('campo "numero" ausente').cause, undefined);
});
