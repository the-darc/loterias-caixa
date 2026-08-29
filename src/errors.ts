/**
 * Hierarquia de erros da lib.
 *
 * Toda falha lançada por `loterias-caixa` é instância de {@link LotteryError},
 * para que quem consome consiga distinguir "a Caixa caiu" de "esse concurso não
 * existe" sem inspecionar mensagem.
 *
 *     LotteryError
 *       ├── UnsupportedLotteryError   código de loteria fora do catálogo
 *       ├── NetworkError              falha de comunicação com a Caixa
 *       │     └── TimeoutError        a requisição estourou o tempo limite
 *       ├── HttpError                 a Caixa respondeu com status não-2xx
 *       ├── DrawNotFoundError         o concurso pedido não existe
 *       └── InvalidResponseError      resposta ilegível ou fora do formato
 */
export class LotteryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LotteryError';
  }
}

/** Código de loteria que não está no catálogo de modalidades suportadas. */
export class UnsupportedLotteryError extends LotteryError {
  readonly code: string;

  constructor(code: string, options?: ErrorOptions) {
    super(`Loteria não suportada: ${code}`, options);
    this.name = 'UnsupportedLotteryError';
    this.code = code;
  }
}

/**
 * Falha de comunicação com a Caixa (DNS, conexão recusada, socket derrubado).
 * A causa original vem em `cause`.
 */
export class NetworkError extends LotteryError {
  readonly url: string;

  constructor(url: string, options?: ErrorOptions) {
    super(`Falha de rede ao consultar ${url}`, options);
    this.name = 'NetworkError';
    this.url = url;
  }
}

/**
 * A requisição estourou o tempo limite. É um {@link NetworkError} — quem só
 * quer saber se houve problema de comunicação pode capturar a classe pai.
 */
export class TimeoutError extends NetworkError {
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number, options?: ErrorOptions) {
    super(url, options);
    this.name = 'TimeoutError';
    this.message = `Tempo esgotado após ${timeoutMs}ms ao consultar ${url}`;
    this.timeoutMs = timeoutMs;
  }
}

/** A Caixa respondeu, mas com status fora da faixa 2xx. */
export class HttpError extends LotteryError {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string, statusText?: string, options?: ErrorOptions) {
    const suffix = statusText ? ` (${statusText})` : '';
    super(`A Caixa respondeu HTTP ${status}${suffix} em ${url}`, options);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

/**
 * O concurso pedido não existe. `contestNumber` fica ausente quando nem o
 * último concurso da modalidade pôde ser obtido.
 */
export class DrawNotFoundError extends LotteryError {
  readonly lotteryCode: string;
  readonly contestNumber: number | undefined;

  constructor(lotteryCode: string, contestNumber?: number, options?: ErrorOptions) {
    const alvo =
      contestNumber === undefined
        ? `Nenhum concurso encontrado para a loteria ${lotteryCode}`
        : `Concurso ${contestNumber} da loteria ${lotteryCode} não encontrado`;
    super(alvo, options);
    this.name = 'DrawNotFoundError';
    this.lotteryCode = lotteryCode;
    this.contestNumber = contestNumber;
  }
}

/**
 * A resposta da Caixa não pôde ser interpretada: JSON malformado, campo
 * obrigatório ausente ou com tipo inesperado.
 */
export class InvalidResponseError extends LotteryError {
  readonly detail: string;

  constructor(detail: string, options?: ErrorOptions) {
    super(`Resposta inválida da Caixa: ${detail}`, options);
    this.name = 'InvalidResponseError';
    this.detail = detail;
  }
}
