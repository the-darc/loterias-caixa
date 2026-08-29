/**
 * Shape bruto da resposta da API interna do Portal de Loterias da Caixa.
 *
 * **Interno.** Nada daqui sai por `src/index.ts` — quem consome a lib vê os
 * tipos de `./public.ts`. A conversão acontece em `src/mapper.ts`.
 *
 * Estes tipos descrevem o que a Caixa **de fato devolveu** nas fixtures de
 * `test/fixtures/` (capturadas em 29/08/2026, 11 modalidades). Como o endpoint
 * não é documentado nem versionado, o shape é uma **observação, não um
 * contrato**: nenhum campo pode ser consumido sem validação em runtime. Por
 * isso `src/client.ts` devolve `unknown` e o mapper é quem estreita.
 */

/** Uma faixa de premiação (`listaRateioPremio`). A faixa 1 é a principal. */
export interface CaixaPrizeTier {
  /** Ex: `"6 acertos"`, `"1º (14 acertos)"`, `"6 acertos + 2 trevos"`. */
  descricaoFaixa: string;
  faixa: number;
  numeroDeGanhadores: number;
  /** Em reais, já como number (ex: `586962.11`). Vem `0` quando não houve ganhador. */
  valorPremio: number;
}

/**
 * Cidade de um ganhador (`listaMunicipioUFGanhadores`). Vem lista vazia na
 * maioria das modalidades; só Federal e Loteca trouxeram itens.
 */
export interface CaixaWinnerCity {
  ganhadores: number;
  municipio: string;
  /** Nome fantasia da lotérica. O erro de digitação é da Caixa; pode vir `""`. */
  nomeFatansiaUL: string;
  posicao: number;
  /** Série do bilhete (Federal). Vem `""` quando não se aplica. */
  serie: string;
  uf: string;
}

/**
 * Jogo de uma rodada da Loteca (`listaResultadoEquipeEsportiva`). `null` em
 * todas as outras modalidades.
 */
export interface CaixaMatchResult {
  diaSemana: string;
  /** `dd/MM/yyyy`, como todas as datas da Caixa. */
  dtJogo: string;
  icSorteioResultado: number;
  nomeCampeonato: string;
  nomeEquipeUm: string;
  nomeEquipeDois: string;
  nuConcurso: number;
  nuGolEquipeUm: number;
  nuGolEquipeDois: number;
  nuJogo: number;
  nuSequencial: number;
  /** Observado sempre `null`; tipo real desconhecido. */
  resultado: unknown;
  siglaPaisUm: string;
  siglaPaisDois: string;
  siglaUFUm: string;
  siglaUFDois: string;
}

/**
 * Resposta de um concurso — idêntica para o endpoint do último concurso
 * (`/api/{code}`) e o de concurso específico (`/api/{code}/{numero}`).
 *
 * Armadilhas confirmadas nas fixtures:
 *
 * - Datas são `dd/MM/yyyy`, **não** ISO. `dataProximoConcurso` vem `""`
 *   (string vazia, não `null`) quando não há próximo concurso agendado —
 *   é o caso da Federal.
 * - `listaDezenas` é `null` na Loteca (não há dezenas sorteadas).
 * - `nomeTimeCoracaoMesSorte` vem preenchido com 17 bytes NUL nas modalidades
 *   em que não se aplica, `null` em outras, e com padding de espaços quando
 *   real (`"ATHLETICO        /PR"`). Precisa de limpeza antes de usar.
 * - `observacao` vem `""` quase sempre e `null` na Federal.
 * - `id` e `premiacaoContingencia` vieram `null` em todas as 11 modalidades;
 *   ficam `unknown` porque o tipo real é desconhecido.
 */
export interface CaixaDrawResponse {
  /** Se o prêmio principal acumulou. */
  acumulado: boolean;
  /** Data do sorteio, `dd/MM/yyyy`. */
  dataApuracao: string;
  /** Data do próximo concurso, `dd/MM/yyyy`, ou `""` quando não há. */
  dataProximoConcurso: string;
  /** Dezenas na ordem em que saíram. `null` na Loteca. */
  dezenasSorteadasOrdemSorteio: string[] | null;
  exibirDetalhamentoPorCidade: boolean;
  /** Sempre `null` nas fixtures. */
  id: unknown;
  indicadorConcursoEspecial: number;
  /** Dezenas em ordem crescente, como strings com zero à esquerda. `null` na Loteca. */
  listaDezenas: string[] | null;
  /** Só a Dupla Sena preenche; `null` nas demais. */
  listaDezenasSegundoSorteio: string[] | null;
  listaMunicipioUFGanhadores: CaixaWinnerCity[];
  listaRateioPremio: CaixaPrizeTier[];
  /** Só a Loteca preenche; `null` nas demais. */
  listaResultadoEquipeEsportiva: CaixaMatchResult[] | null;
  localSorteio: string;
  nomeMunicipioUFSorteio: string;
  /** Time do coração (Timemania) ou mês da sorte (Dia de Sorte). Vem sujo — veja o doc do tipo. */
  nomeTimeCoracaoMesSorte: string | null;
  /** Número do concurso. */
  numero: number;
  numeroConcursoAnterior: number;
  /** Número do concurso final do ciclo 0-5 (específico da Lotofácil). */
  numeroConcursoFinal_0_5: number;
  numeroConcursoProximo: number;
  numeroJogo: number;
  observacao: string | null;
  /** Sempre `null` nas fixtures. */
  premiacaoContingencia: unknown;
  /** Nome da modalidade em caixa alta, ex: `"MEGA-SENA"`. */
  tipoJogo: string;
  tipoPublicacao: number;
  /** Se este é o concurso mais recente da modalidade. */
  ultimoConcurso: boolean;
  valorArrecadado: number;
  valorAcumuladoConcurso_0_5: number;
  /** Acumulado do concurso especial (ex: Mega da Virada). Não vem a data dele. */
  valorAcumuladoConcursoEspecial: number;
  valorAcumuladoProximoConcurso: number;
  valorEstimadoProximoConcurso: number;
  valorSaldoReservaGarantidora: number;
  /** Prêmio da faixa principal, em reais. Vem `0` quando acumulou. */
  valorTotalPremioFaixaUm: number;
  /** Só a +Milionária tem trevos; o campo nem existe nas outras modalidades. */
  trevosSorteados?: string[];
}

/**
 * Envelope de exceção do backend .NET da Caixa, serializado dentro de
 * `exceptionMessage`. Só `StatusCode` interessa — é ele que diz o motivo real
 * da falha.
 */
export interface CaixaExceptionEnvelope {
  /** Status **real** da falha: `412` para concurso além do último, `404` para concurso 0. */
  StatusCode: number;
  ReasonPhrase: string;
}

/**
 * Resposta de erro. Existem duas formas, e nenhuma delas usa o status HTTP
 * externo de maneira útil:
 *
 * 1. **Concurso inexistente** — a Caixa responde **HTTP 500** com
 *    `message: "Ocorreu um erro inesperado."` e o status verdadeiro escondido
 *    no JSON de `exceptionMessage` (`StatusCode` 412 ou 404). Ou seja: não dá
 *    para distinguir "concurso não existe" de "a Caixa caiu" pelo status —
 *    é preciso abrir o envelope. E um 500 desses **não deve ser retentado**.
 * 2. **Rota/modalidade inexistente** — HTTP 404 com `Message`/`MessageDetail`
 *    (maiúsculas, formato padrão do ASP.NET Web API).
 */
export interface CaixaErrorResponse {
  /** JSON serializado de um `CaixaExceptionEnvelope`. Precisa de um segundo parse. */
  exceptionMessage?: string;
  innerMessage?: string;
  /** Sempre `"Ocorreu um erro inesperado."`; não diz nada de útil. */
  message?: string;
  stackTrace?: string;
  /** Forma 2: rota inexistente. */
  Message?: string;
  MessageDetail?: string;
}
