# loterias-caixa

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
import { getSupportedLotteries, getLatestDraw } from 'loterias-caixa';

// Modalidades suportadas
getSupportedLotteries();
// [{ code: 'megasena', name: 'Mega-Sena' }, { code: 'quina', name: 'Quina' }, ...]

// Último resultado de uma loteria
const draw = await getLatestDraw('megasena');
console.log(draw.contestNumber, draw.isAccumulated, draw.drawDate);
```

> As funções de consulta ainda estão em implementação — veja o TODO abaixo.
> Hoje o catálogo de modalidades (`getSupportedLotteries`, `isSupportedLottery`,
> `getLotteryName`) já está disponível.

## API pretendida

| Função | Descrição |
| --- | --- |
| `getSupportedLotteries()` | Lista as modalidades suportadas (código + nome). |
| `getLatestDraw(code)` | Resultado do último concurso de uma loteria. |
| `getDraw(code, contestNumber)` | Resultado de um concurso específico. |
| `getAllLatestDraws()` | Último resultado de todas as modalidades suportadas. |

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

O horário de cada sorteio está registrado lá, mas **não sai na resposta da
lib**: um horário de parede sem timezone é fonte garantida de bug em quem roda
em UTC. Ele fica no arquivo como documentação e para permitir conferência
contra a fonte oficial.

## Desenvolvimento

```bash
npm install
npm test              # suíte de testes (roda direto no fonte TypeScript)
npm run test:coverage # com relatório de cobertura
npm run typecheck     # valida tipos sem emitir
npm run build         # gera dist/
```

Os testes rodam sobre os arquivos `.ts` sem etapa de build, usando o suporte
nativo do Node a TypeScript e o runner `node:test`. Nenhum teste acessa a
rede — a suíte passa offline, sobre as respostas reais guardadas em
[test/fixtures/](test/fixtures/README.md).

Convenções e decisões de arquitetura estão em [CLAUDE.md](CLAUDE.md).

## Licença

[MIT](LICENSE) © Daniel Campos

Projeto independente, sem qualquer vínculo com a Caixa Econômica Federal. Os
dados consultados são de origem pública.

## TODO - Próximos passos

**Fundação**
- [x] Inicializar o projeto Node + TypeScript (ESM, zero dependências de runtime)
- [x] Definir os tipos públicos (`Draw`, `Lottery`, `LotteryCode`)
- [x] Implementar o catálogo de modalidades suportadas (`getSupportedLotteries`)
- [x] Adicionar arquivo `LICENSE` (MIT)
- [x] Confirmar o nome final do pacote no npm antes do primeiro publish

**Núcleo da biblioteca**
- [x] Implementar `src/errors.ts` com a hierarquia de erros (rede, timeout, concurso inexistente, resposta inválida)
- [x] Mapear o shape bruto da resposta da Caixa em `src/types/caixa.ts`
- [ ] Implementar `src/client.ts`: acesso HTTP com timeout, retry e `fetch` injetável para teste
- [ ] Implementar `src/mapper.ts`: conversão da resposta da Caixa para `Draw`, incluindo parse de data `dd/MM/yyyy`
  - `prizeValue` sai da **faixa 1 de `listaRateioPremio`**, não de `valorTotalPremioFaixaUm` (que é incoerente — veja o CLAUDE.md)
  - `drawDaysOfWeek` sai de `getDrawDaysOfWeek(code)`, do calendário — não da API
  - `nomeTimeCoracaoMesSorte` precisa de limpeza (bytes NUL e padding de espaço) antes de virar dado
- [ ] Implementar a projeção de `nextSpecialDrawDate` sobre o calendário:
  1. Sem projeção quando `valorAcumuladoConcurso_0_5 <= 0` ou `numeroConcursoFinal_0_5 === 0` — `0` é o sentinela de "não se aplica", e é o caso de 6 das 11 modalidades. O campo fica ausente.
  2. `saltos = numeroConcursoFinal_0_5 - numeroConcursoProximo`. Negativo é dado incoerente: deixe ausente, não invente.
  3. Com `saltos === 0`, a data é o próprio `dataProximoConcurso`.
  4. Senão, ande `saltos` dias de sorteio a partir de `dataProximoConcurso`, contando só os dias que estão em `getDrawDaysOfWeek(code)`.
  - Exemplo conferido na fixture: Mega-Sena no 3050, próximo 3051 em 30/08 (dom), alvo 3055 -> ter 01/09, qui 03/09, dom 06/09, **ter 08/09**.
  - É **estimativa**, e o tipo público já diz isso: ignora feriado, concurso especial que quebra a cadência e mudança futura de calendário.
  - Só faz sentido para o último concurso. O calendário é o de hoje — a fixture `megasena/2500` (2022, quartas e sábados) prova que projetar concurso antigo com ele dá data errada.
  - Atenção à Loteca: ela acumula em final 0/5 (alvo 1270), mas o calendário dela é o da **apuração** (segunda) e o `dataProximoConcurso` cai no sábado. A caminhada precisa lidar com data de partida fora do calendário.
- [ ] Implementar `getLatestDraw(code)`
- [ ] Implementar `getDraw(code, contestNumber)`
- [ ] Implementar `getAllLatestDraws()` com execução concorrente e tolerância a falha parcial

**Lacunas de dados — decididas em 29/08/2026**
- [x] `drawDaysOfWeek`: tabela estática em `src/calendar.ts`, juntada à resposta da API pelo mapper
- [x] `drawTime`: **não** entra na resposta pública; fica no calendário como documentação
- [x] `nextSpecialDrawDate`: projetado sobre o calendário, para as modalidades que acumulam em concurso de final 0/5

**Qualidade**
- [x] Capturar fixtures de resposta real das 11 modalidades para os testes
- [ ] Cobrir `client.ts` e `mapper.ts` com testes (erros de rede, HTTP não-2xx, JSON malformado, campos ausentes)
- [ ] Atingir e manter 100% de cobertura de linhas e branches
- [ ] Configurar CI (GitHub Actions) rodando typecheck + testes + cobertura

**Publicação**
- [ ] Publicar a versão `0.1.0` no npm
- [ ] Integrar a lib ao worker diário do `loterias-app-backend`
