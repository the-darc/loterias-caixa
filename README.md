# loterias-caixa

[![CI](https://github.com/the-darc/loterias-caixa/actions/workflows/ci.yml/badge.svg)](https://github.com/the-darc/loterias-caixa/actions/workflows/ci.yml)

Biblioteca Node.js para consultar os resultados das loterias da Caixa
Econômica Federal (Mega-Sena, Quina, Lotofácil e outras 8 modalidades).

A Caixa não publica uma API oficial de consulta. Esta lib encapsula o acesso
à API interna do Portal de Loterias e devolve os dados já normalizados em
tipos TypeScript estáveis, para que aplicações não precisem lidar com o
formato bruto da Caixa (datas `dd/MM/yyyy`, campos com lixo, nomes de campo
em português).

**Zero dependências de runtime.** Só usa o que já vem no Node.

Escrita em TypeScript, distribuída como ESM. Consumidores CommonJS podem usar
`require()` normalmente (Node 22.12+).

## Instalação

```bash
npm install loterias-caixa
```

Requer Node.js >= 22.12.0.

## Uso

```ts
import { getLatestDraw, getDraw, getAllLatestDraws } from 'loterias-caixa';

// Último resultado de uma loteria
const draw = await getLatestDraw('megasena');
draw.contestNumber;         // 3050
draw.isAccumulated;         // true
draw.drawDate;              // Date (meia-noite UTC do dia do sorteio)
draw.drawnNumbers;          // ['11', '14', '30', '38', '49', '55']
draw.drawDaysOfWeek;        // ['SUN', 'TUE', 'THU']
draw.nextDrawPrizeEstimate; // 30000000
draw.nextDrawTime;          // '11:00' — horário de Brasília (DRAW_TIME_ZONE)
draw.nextSpecialDrawDate;   // Date — projeção do próximo concurso especial

// Modalidades com resultado além das dezenas
(await getLatestDraw('duplasena')).secondDrawNumbers;   // ['07', '11', ...] 2º sorteio
(await getLatestDraw('maismilionaria')).bonusNumbers;   // ['1', '6'] trevos
(await getLatestDraw('timemania')).bonusName;           // 'ATHLETICO/PR' time do coração
(await getLatestDraw('diadesorte')).bonusName;          // 'Abril' mês da sorte

// Um concurso específico
const antigo = await getDraw('quina', 7000);

// Todas as modalidades de uma vez, em paralelo e tolerante a falha parcial
const { draws, failures } = await getAllLatestDraws();
for (const falha of failures) {
  console.warn(falha.code, falha.error.message);
}
```

## API

| Função | Descrição |
| --- | --- |
| `getLatestDraw(code, options?)` | Resultado do último concurso de uma loteria. |
| `getDraw(code, contestNumber, options?)` | Resultado de um concurso específico. |
| `getAllLatestDraws(options?)` | Último resultado de todas as modalidades, em paralelo. |
| `getSupportedLotteries()` | Lista as modalidades suportadas (código + nome). |
| `isSupportedLottery(code)` | Type guard para código de modalidade. |
| `getLotteryName(code)` | Nome de exibição de uma modalidade. |

`options` aceita `timeoutMs` (10s), `retries` (2), `retryDelayMs` (300ms, com
backoff exponencial) e `fetch` — este último existe para teste, não para uso
em produção.

**`getAllLatestDraws` nunca rejeita por falha de uma modalidade.** Ela devolve
`{ draws, failures }`: quem falhou entra em `failures` com o erro, quem
respondeu entra em `draws`, na ordem do catálogo. Um cronjob que atualiza 11
loterias não deve perder as 10 boas porque uma caiu.

Quatro modalidades têm resultado além das dezenas, e a lib devolve todos:
`secondDrawNumbers` (o segundo sorteio da Dupla Sena), `bonusNumbers` (os
trevos da +Milionária) e `bonusName` (o time do coração da Timemania e o mês
da sorte do Dia de Sorte, que a Caixa manda no mesmo campo). Os campos só
existem nas modalidades a que se aplicam — nas outras não vêm.

**Só `getLatestDraw` projeta `nextSpecialDrawDate`.** A projeção usa o
calendário de hoje, que não vale para concurso antigo — a Mega sorteava às
quartas e sábados até 2024.

## Tratamento de erros

Toda falha lançada pela lib é instância de `LotteryError`, para que dê para
distinguir "a Caixa caiu" de "esse concurso não existe" sem inspecionar a
mensagem:

```
LotteryError
  ├── UnsupportedLotteryError   código de loteria fora do catálogo
  ├── NetworkError              falha de comunicação com a Caixa
  │     └── TimeoutError        a requisição estourou o tempo limite
  ├── HttpError                 a Caixa respondeu com status não-2xx
  ├── DrawNotFoundError         o concurso pedido não existe
  └── InvalidResponseError      resposta ilegível ou fora do formato
```

```ts
import { getDraw, DrawNotFoundError, NetworkError } from 'loterias-caixa';

try {
  await getDraw('megasena', 9999);
} catch (error) {
  if (error instanceof DrawNotFoundError) return null; // concurso ainda não sorteado
  if (error instanceof NetworkError) throw error;      // vale tentar de novo depois
  throw error;
}
```

Cada classe carrega o contexto da falha em campos próprios (`status` e `url`
em `HttpError`, `timeoutMs` em `TimeoutError`, `lotteryCode`/`contestNumber` em
`DrawNotFoundError`) e preserva a causa original em `cause`.

Todas retornam dados suficientes para popular a entidade `draw` do
[schema do backend](../loterias-app-backend/docs/firestore_schema.md), usando
tipos nativos (`Date`, `number`) — a conversão para `Timestamp` do Firestore é
responsabilidade de quem consome.

## Calendário de sorteios

A Caixa não informa em que dias cada modalidade sorteia — o payload só traz a
data do próximo concurso. Esses dados moram numa tabela estática em
[src/calendar.ts](src/calendar.ts), e a lib os junta à resposta da API para
preencher `drawDaysOfWeek`.

Ser estático tem um custo conhecido: quando a Caixa muda a agenda (como fez em
julho de 2026, movendo os sorteios de sábado para a manhã de domingo), a tabela
envelhece até alguém atualizá-la. A aposta é que **um arquivo único, sem lógica
dentro, é fácil de corrigir por qualquer pessoa** — se você notou uma agenda
errada, abra um PR mudando só esse arquivo. Os testes conferem a tabela contra
o dia da semana real das respostas guardadas em `test/fixtures/`.

O calendário também é a origem de `nextDrawTime`, o horário do próximo
sorteio. Ele é **o horário do próximo concurso**, não um horário fixo da
modalidade, porque para a maioria delas esse valor único não existe: a
Mega-Sena sorteia às 21h de terça e quinta e às 11h aos domingos.

Todo horário é de Brasília, e o fuso é exportado como `DRAW_TIME_ZONE`
(`'America/Sao_Paulo'`) em vez de ficar implícito — horário de parede sem fuso
declarado é bug garantido em quem roda em UTC.

`nextDrawTime` fica **ausente** quando não há próximo concurso agendado (o
caso da Federal) ou quando a data dele não cai em dia de sorteio conhecido: a
Loteca apura às segundas, mas a API devolve a data da rodada de jogos, que cai
no sábado. Sem saber o horário, a lib não chuta um.

## Desenvolvimento

```bash
npm install
npm test                     # suíte de testes (roda direto no fonte TypeScript)
npm run test:coverage        # com relatório de cobertura
npm run test:coverage:strict # o mesmo, falhando abaixo de 100% (é o gate do CI)
npm run typecheck            # valida tipos de src/ e test/
npm run build                # gera dist/
```

Os testes rodam sobre os arquivos `.ts` sem etapa de build, usando o suporte
nativo do Node a TypeScript e o runner `node:test`. Nenhum teste acessa a
rede — a suíte passa offline, sobre as respostas reais guardadas em
[test/fixtures/](test/fixtures/README.md).

O CI roda typecheck, a suíte com gate de 100% de cobertura e o build em Node
22.x e 24.x, e ainda confere que o `dist/` publicado carrega por `require()` e
por `import()` na versão mínima declarada (22.12). Rode
`npm run test:coverage:strict` antes de abrir PR — é exatamente o que o CI vai
executar.

Convenções e decisões de arquitetura estão em [CLAUDE.md](CLAUDE.md).

## Licença

[MIT](LICENSE) © Daniel Campos

Projeto independente, sem qualquer vínculo com a Caixa Econômica Federal. Os
dados consultados são de origem pública.

