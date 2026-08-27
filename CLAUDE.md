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
a única devDependency é o `typescript`. Um parser de HTML, um cliente HTTP ou
um framework de teste seriam regressões — o Node 22+ já resolve os três
casos.

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
- `valorTotalPremioFaixaUm` é o prêmio da faixa principal — vem `0` quando
  acumulou.

### Lacunas conhecidas do payload

Nem tudo que o backend precisa existe na resposta. Não invente valor nem
finja que o campo existe; deixe opcional e documente:

- `nextSpecialDrawDate` — não vem no payload (só o valor acumulado do
  concurso especial, em `valorAcumuladoConcursoEspecial`).
- `drawDaysOfWeek` e `drawTime` — não vêm no payload. São metadados estáveis
  por modalidade; se forem necessários, entram como dados estáticos no
  catálogo de `src/lotteries.ts`, não como campo do resultado.

## Estrutura

```
src/
  index.ts          superfície pública (barrel) — o único ponto de exportação
  lotteries.ts      catálogo estático das modalidades suportadas
  client.ts         acesso HTTP à Caixa (timeout, retry, erros)
  mapper.ts         resposta da Caixa -> tipos públicos
  errors.ts         hierarquia de erros da lib
  types/
    public.ts       tipos exportados (Draw, Lottery, LotteryCode)
    caixa.ts        shape bruto da resposta da Caixa (interno)
test/               testes de unidade (node:test, arquivos *.test.ts)
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

```bash
npm test              # roda a suíte
npm run test:coverage # roda com relatório de cobertura
npm run typecheck     # valida os tipos sem emitir
npm run build         # emite dist/
```

Antes de considerar uma implementação pronta: `npm run typecheck`,
`npm test` com `fail 0`, e cobertura sem queda.

## Publicação no npm

- `prepublishOnly` já roda clean + build + test; não publique contornando ele.
- Só o `dist/` (mais README e LICENSE) vai no pacote — controlado por `files`.
- Versionamento semântico. Enquanto estiver em `0.x`, breaking change sobe a
  minor. Mudança na superfície de `src/index.ts` é breaking change.
