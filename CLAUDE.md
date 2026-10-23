# CLAUDE.md — loterias-caixa

Instruções para trabalhar neste sub-projeto. Veja o
[CLAUDE.md da raiz](../CLAUDE.md) para o contexto geral do monorepo
`acumulou-app`.

## O que é este projeto

Biblioteca Node.js (`loterias-caixa` no npm) que consulta os resultados
oficiais das loterias da Caixa. É **open source, pública e reaproveitável** —
não conhece o Acumulou nem o Firebase. O backend (`loterias-app-backend`) é
apenas o primeiro consumidor.

Consequência prática: **nada específico do Acumulou entra aqui.** Sem
Firestore, sem `firebase-admin`, sem `Timestamp`, sem regra de negócio de
notificação. A lib devolve dados brutos normalizados; quem consome decide o
que fazer com eles.

## Princípio central: zero dependências de runtime

`package.json` **não deve ter o campo `dependencies`**. Use o que o Node já
oferece: `fetch` global, `URL`, `AbortSignal.timeout()`, `node:test`.

Antes de adicionar qualquer dependência (mesmo dev), pare e justifique. Hoje
são duas devDependencies: `typescript` e `@types/node` (só tipos, não vai para
o pacote — `files` publica apenas `dist/`; é o que dá tipo a `fetch`,
`node:test` e afins). Um parser de HTML, um cliente HTTP ou um framework de
teste seriam regressões — o Node 22+ já resolve os três casos.

O TypeScript 7 **não inclui `@types` automaticamente**: sem `"types": ["node"]`
no `tsconfig.json`, todo import de `node:*` falha com "Cannot find name".

## Fonte de dados

A Caixa não publica API oficial. A lib usa a **API interna do Portal de
Loterias**, que é pública e devolve JSON:

```
https://servicebus2.caixa.gov.br/portaldeloterias/api/{code}          # último concurso
https://servicebus2.caixa.gov.br/portaldeloterias/api/{code}/{numero} # concurso específico
```

Os 11 códigos aceitos são exatamente os de `src/lotteries.ts` (`megasena`,
`quina`, `lotofacil`, `lotomania`, `timemania`, `duplasena`, `federal`,
`loteca`, `diadesorte`, `supersete`, `maismilionaria`).

Por ser endpoint não documentado, trate-o como **instável**:

- Todo acesso à rede passa por um único módulo (`src/client.ts`). Nenhuma
  outra parte da lib chama `fetch` direto — isso mantém timeout, retry,
  `User-Agent` e tradução de erro em um lugar só, e é o que torna os testes
  possíveis sem rede.
- O shape da resposta da Caixa fica isolado em `src/types/caixa.ts` e nunca
  vaza para a superfície pública. A conversão acontece em `src/mapper.ts`.
- Nunca confie em campo do payload sem validar. A resposta traz lixo real
  (ex: `nomeTimeCoracaoMesSorte` vem preenchido com bytes NUL, `id` vem
  `null`), e campos mudam sem aviso.

### Formato dos dados da Caixa (armadilhas conhecidas)

- Datas vêm como string `dd/MM/yyyy` (ex: `"25/08/2026"`), **não** ISO.
  Parsear manualmente; `new Date("25/08/2026")` produz `Invalid Date`.
- Valores monetários já vêm como `number` em reais (ex: `18908975.38`), não
  em centavos.
- `numero` é o número do concurso; `acumulado` é o booleano de acúmulo.
- `dataProximoConcurso` vem `""` (string vazia, **não** `null`) quando não há
  próximo concurso agendado — é o caso da Federal.
- **`valorTotalPremioFaixaUm` não é confiável.** As fixtures desmentem os dois
  sentidos: a Federal não acumulou, teve ganhador de R$ 500 mil, e o campo veio
  `0`; a +Milionária e a Super Sete acumularam com zero ganhadores e o campo
  veio preenchido. A fonte do prêmio é a **faixa 1 de `listaRateioPremio`**
  (`valorPremio`), que é coerente em todas as 11 modalidades.
- **`ultimoConcurso` vem `true` até em concurso antigo** (confirmado em
  `megasena/2500`). Não serve para saber se o concurso é o mais recente.
- `nomeTimeCoracaoMesSorte` vem com 17 bytes NUL onde não se aplica, `null` em
  outras, e com padding de largura fixa quando real (`"ATHLETICO        /PR"`,
  `"BARRA FC         /SC"`). O mapper normaliza para `"ATHLETICO/PR"` e
  `"BARRA FC/SC"` — junta o padding e cola o `/` da UF, mas preserva o espaço
  entre palavras do nome. Quem consome não deveria saber que a origem é um
  campo de tamanho fixo.
- `listaDezenas` é `null` na Loteca; `listaDezenasSegundoSorteio` só a Dupla
  Sena preenche; `trevosSorteados` só existe na +Milionária.

### Como a Caixa reporta erro (importa para o client)

Concurso inexistente **não** devolve 404. A Caixa responde **HTTP 500** com
`message: "Ocorreu um erro inesperado."` e esconde o status verdadeiro dentro
de `exceptionMessage`, que é um JSON serializado com `StatusCode` — `412` para
concurso além do último, `404` para concurso `0`. Duas consequências:

- Não dá para distinguir "concurso não existe" de "a Caixa caiu" pelo status
  externo; o client precisa abrir o envelope antes de decidir entre
  `DrawNotFoundError` e `HttpError`.
- Retry cego em 500 desperdiça tentativas num erro que nunca vai passar.

Modalidade/rota inexistente é o outro formato: HTTP 404 com `Message` e
`MessageDetail` (maiúsculas, padrão do ASP.NET Web API).

### Lacunas conhecidas do payload

Nem tudo que o backend precisa existe na resposta. Não invente valor nem
finja que o campo existe; deixe opcional e documente:

Decidido em 29/08/2026 (antes era questão aberta):

- `drawDaysOfWeek` — vem do calendário estático de `src/calendar.ts`, que o
  mapper junta à resposta da API. Não é campo da Caixa.
- `drawTime` — **não entra na superfície pública.** Fica registrado no
  calendário como documentação: horário de parede sem timezone vira bug em
  quem roda em UTC (o padrão das Cloud Functions).
- `nextSpecialDrawDate` — não vem no payload, é **projetado** sobre o
  calendário para as modalidades que acumulam em concurso de final 0/5. O
  algoritmo e as ressalvas estão no TODO do README. É estimativa declarada,
  não dado da Caixa.

### O calendário é dado mantido à mão

`src/calendar.ts` é a única tabela estática do projeto, e é assim de
propósito: sem lógica dentro, para que atualizar a agenda seja um PR de uma
linha quando a Caixa mudar (como mudou em julho de 2026, movendo os sorteios
de sábado para domingo de manhã).

- Nada de espalhar dia de sorteio ou horário por outros arquivos.
- Toda mudança na tabela sobe versão — é comportamento observável.
- `calendar.test.ts` confere a tabela contra o dia da semana real das fixtures.
  Se ele quebrar, ou a tabela está errada ou a Caixa mudou a agenda.
- A Loteca é a exceção do conjunto: o calendário dela é o da **apuração**
  (segunda), e o `dataProximoConcurso` que a API devolve cai em outro dia.

## Estrutura

```
src/
  index.ts          superfície pública (barrel) — o único ponto de exportação
  lotteries.ts      catálogo estático das modalidades suportadas
  calendar.ts       dias e horários de sorteio (dado estático, mantido à mão)
  client.ts         acesso HTTP à Caixa (timeout, retry, erros)
  mapper.ts         resposta da Caixa -> tipos públicos (valida campo a campo)
  draws.ts          as três funções de consulta (client + mapper costurados)
  errors.ts         hierarquia de erros da lib
  types/
    public.ts       tipos exportados (Draw, Lottery, LotteryCode)
    caixa.ts        shape bruto da resposta da Caixa (interno)
test/
  *.test.ts         testes de unidade (node:test)
  fixtures.ts       helpers de leitura das fixtures (não é arquivo de teste)
  fixtures/         respostas reais da Caixa, verbatim — veja o README de lá
```

Regra: **tudo que é público sai por `src/index.ts`.** Se um tipo ou função
não está exportado lá, é interno e pode mudar sem major version.

## Convenções de código

- **ESM puro.** `"type": "module"`, sem build CommonJS. Consumidores CJS
  (como as Cloud Functions do backend) usam `require()` de ESM, suportado
  nativamente a partir do Node 22.12 — por isso `engines.node` é `>=22.12.0`.
- **Imports relativos usam extensão `.ts`** (ex: `from './lotteries.ts'`).
  Isso é o que permite rodar os testes direto no fonte TypeScript sem build.
  O `tsc` reescreve para `.js` no emit via `rewriteRelativeImportExtensions`.
  Não escreva `.js` no fonte e não omita a extensão.
- **`import type` para tipos** — `verbatimModuleSyntax` está ligado e o build
  quebra sem isso.
- Sem `enum` e sem `namespace`. O Node roda o TypeScript por type stripping,
  que não suporta sintaxe com semântica em runtime. Use union de string
  literal (como `LotteryCode`) em vez de enum.
- Tipos públicos usam **primitivos do Node**: `Date` para datas, `number`
  para valores. Nada de tipo de biblioteca externa na superfície pública.
- Erros lançados pela lib devem ser instâncias das classes de `src/errors.ts`,
  nunca `Error` cru ou string — quem consome precisa distinguir "concurso não
  existe" de "a Caixa caiu".
- **Função que devolve `Promise` nunca lança de forma síncrona.** Validação de
  argumento também tem que virar rejeição, senão quem usa `.catch()` leva uma
  exceção não capturada. Na prática: marque `async`, mesmo que o corpo só
  delegue.
- **Datas públicas são meia-noite UTC.** A Caixa manda `dd/MM/yyyy` sem
  horário; fixar em UTC evita que o dia escorregue conforme o fuso de quem lê.
- Campo opcional ausente **não entra no objeto** (nada de `{ campo: undefined }`):
  `'campo' in draw` é o teste que quem consome vai fazer, e Firestore recusa
  `undefined` por padrão.
- Erro que não seja `LotteryError` é bug da lib, não falha de consulta:
  `getAllLatestDraws` deixa subir em vez de embrulhar em `failures`.
- Mensagens de erro e comentários em português; identificadores em inglês
  (mesma convenção do backend).

## Testes de unidade são obrigatórios

**Toda função nova ou mudança de comportamento vem com teste.** A meta é a
maior cobertura possível — a lib é pequena e sem dependências, então 100% de
linhas e branches é alcançável e é o alvo.

- `node:test` + `node:assert/strict`, nativos. Arquivos em `test/*.test.ts`.
- Os testes importam **direto do fonte** (`../src/lotteries.ts`), sem build.
- **Nenhum teste pode bater na rede.** A suíte tem que passar offline e ser
  determinística. Para cobrir `client.ts` e `mapper.ts`, injete um `fetch`
  falso (a função de acesso deve aceitar o `fetch` como opção) e use payloads
  fixos guardados como fixtures. Um teste que chama a Caixa de verdade é
  flaky por definição e não entra na suíte.
- Cobrir significa: caminho feliz, erro de rede/timeout, HTTP não-2xx, JSON
  malformado, código de loteria inválido, e cada campo opcional ausente.
- As fixtures de `test/fixtures/` são respostas **reais e verbatim** da Caixa
  (11 modalidades, um concurso antigo e os três formatos de erro). Use-as em
  vez de inventar payload — payload inventado esconde exatamente as
  irregularidades que quebram a lib em produção.
- `caixa-shape.test.ts` compara cada fixture com `src/types/caixa.ts` e falha
  se aparecer campo novo, sumir campo ou mudar tipo. Se ele quebrar depois de
  recapturar fixtures, o endpoint mudou — atualize o tipo, não o teste.
- A descoberta de testes é por glob (`test/**/*.test.ts`), não a padrão do
  Node: só assim dá para ter helper (`test/fixtures.ts`) dentro de `test/`
  sem o runner tentar executá-lo como suíte.
- `npm run typecheck` valida `src` **e** `test` (via `tsconfig.test.json`). É o
  que faz valer truques de tipo nos testes, como a tabela
  `Record<keyof CaixaDrawResponse, Check>`, que quebra o build se um campo
  entrar no tipo sem validação correspondente.

```bash
npm test              # roda a suíte
npm run test:coverage # roda com relatório de cobertura
npm run typecheck     # valida os tipos sem emitir
npm run build         # emite dist/
```

Antes de considerar uma implementação pronta: `npm run typecheck`,
`npm test` com `fail 0`, e `npm run test:coverage:strict` — que é o gate do CI
e falha abaixo de 100% de linhas, branches e funções.

### Duas armadilhas do gate de cobertura

Ambas custaram um CI vermelho; não desfaça nenhuma das duas achando que é
redundância.

1. **`test/source-files.test.ts` carrega todo arquivo de `src/`.** A cobertura
   do Node só mede arquivo **carregado**, então um módulo que nenhum teste
   importa ficaria invisível e o gate passaria com 100% falso.
2. **O gate usa `--test-coverage-include="src/**/*.ts`".** Sem isso, o Node 22
   inclui os próprios arquivos de teste na conta (o Node 24 os exclui por
   padrão) e o limite de 100% nunca é atingido — o `src/` inteiro pode estar
   coberto e o CI reprovar mesmo assim. O `include` **filtra** o que foi
   carregado; quem garante que tudo de `src/` foi carregado é o item 1. Os dois
   juntos é que fazem o gate medir a coisa certa.

### Teste que espera timeout precisa segurar o event loop

O timer de `AbortSignal.timeout()` é *unref*: sozinho, ele não impede o Node de
encerrar. Um `fetch` real segura o loop porque tem socket aberto; um dublê que
só devolve uma `Promise` pendente não segura nada. No Node 24 o runner disfarça
o problema, no Node 22 a suíte inteira morre com "Promise resolution is still
pending but the event loop has already resolved" — e os testes seguintes caem
como `cancelledByParent`, o que faz o log apontar para o lugar errado.

Dublê de `fetch` que espera abort precisa de um `setTimeout` segurando o loop,
limpo no `abort`.

### O verificador da API é outra coisa, e mora fora de `test/`

`smoke/caixa.ts` (`npm run smoke`) consulta a **Caixa de verdade** e conta
quantas das onze modalidades responderam. Ele existe porque a regra de não
bater na rede, que é certa, tem um custo: pane do lado da Caixa passa
despercebida pela suíte. Em outubro de 2026 o serviço da Super Sete respondeu
erro por dias com os testes todos verdes.

Três decisões que não são preferência:

- **Fica fora de `test/`** para não entrar no glob `test/**/*.test.ts`. Assim
  `npm test` continua sem tocar a rede, por construção e não por disciplina.
- **Não entra no CI.** Roda em agenda própria (`.github/workflows/caixa.yml`),
  e por isso instabilidade da Caixa nunca reprova um pull request. CI que fica
  vermelho por culpa de terceiro é CI que ninguém mais lê.
- **Publica um selo separado** no README, com a contagem de modalidades fora
  do ar. O workflow escreve `smoke-report.json` no formato do shields.io e o
  empurra para a branch órfã `badges` — órfã para guardar só o JSON, sem
  arrastar histórico nem encher a `master` de commit diário.

### Rode a suíte nas duas versões antes de mexer em CI

`nvm exec 22` e `nvm exec 24`. As diferenças acima não aparecem em nenhuma
versão isolada — só na comparação.

## Publicação no npm

- `prepublishOnly` já roda clean + build + test; não publique contornando ele.
- Só o `dist/` (mais README e LICENSE) vai no pacote — controlado por `files`.
- Versionamento semântico. Enquanto estiver em `0.x`, breaking change sobe a
  minor. Mudança na superfície de `src/index.ts` é breaking change.
