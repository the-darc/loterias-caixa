# Fixtures

Respostas **reais e verbatim** da API interna do Portal de Loterias da Caixa,
usadas pelos testes para que a suíte rode offline e determinística. Nenhum
teste da lib pode bater na rede — estas fixtures são a única fonte de payload.

Capturadas em **29/08/2026**.

```
latest/{code}.json      GET /portaldeloterias/api/{code}          (11 modalidades)
contest/megasena-2500.json  GET /portaldeloterias/api/megasena/2500
error/concurso-futuro.json  GET /portaldeloterias/api/megasena/99999  -> HTTP 500
error/concurso-zero.json    GET /portaldeloterias/api/megasena/0      -> HTTP 500
error/modalidade-inexistente.json  GET /portaldeloterias/api/naoexiste -> HTTP 404
```

Para recapturar:

```bash
for c in megasena quina lotofacil lotomania timemania duplasena \
         federal loteca diadesorte supersete maismilionaria; do
  curl -s "https://servicebus2.caixa.gov.br/portaldeloterias/api/$c" \
    | node -e 'process.stdin.toArray().then(c=>console.log(JSON.stringify(JSON.parse(c.join("")),null,2)))' \
    > "latest/$c.json"
done
```

Depois de recapturar, rode `npm test`: `caixa-fixtures.test.ts` compara cada
fixture com o shape declarado em `src/types/caixa.ts` e falha se a Caixa tiver
adicionado, removido ou mudado o tipo de algum campo — é assim que a gente
descobre que o endpoint mudou.

## Por que estas fixtures em particular

- **As 11 modalidades**, porque o payload varia bastante entre elas: a Loteca
  não tem `listaDezenas`, a Dupla Sena é a única com segundo sorteio, a
  +Milionária é a única com `trevosSorteados`, e a Federal é a única sem
  `dataProximoConcurso` e com `observacao: null`.
- **Um concurso específico** (`megasena/2500`), para provar que o endpoint de
  concurso antigo devolve o mesmo shape do endpoint de último concurso.
- **Os erros**, porque a Caixa responde **HTTP 500** para concurso inexistente
  e esconde o status verdadeiro (412/404) dentro de `exceptionMessage`. O
  client precisa abrir esse envelope para distinguir "concurso não existe" de
  "a Caixa caiu" — e para não retentar um 500 que nunca vai passar.
