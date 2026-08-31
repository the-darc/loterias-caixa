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
- [x] Implementar `src/client.ts`: acesso HTTP com timeout, retry e `fetch` injetável para teste
- [x] Implementar `src/mapper.ts`: conversão da resposta da Caixa para `Draw`, incluindo parse de data `dd/MM/yyyy`
- [x] Implementar a projeção de `nextSpecialDrawDate` sobre o calendário:
  1. Sem projeção quando `valorAcumuladoConcurso_0_5 <= 0` ou `numeroConcursoFinal_0_5 === 0` — `0` é o sentinela de "não se aplica", e é o caso de 6 das 11 modalidades. O campo fica ausente.
  2. `saltos = numeroConcursoFinal_0_5 - numeroConcursoProximo`. Negativo é dado incoerente: deixe ausente, não invente.
  3. Com `saltos === 0`, a data é o próprio `dataProximoConcurso`.
  4. Senão, ande `saltos` dias de sorteio a partir de `dataProximoConcurso`, contando só os dias que estão em `getDrawDaysOfWeek(code)`.
  - Exemplo conferido na fixture: Mega-Sena no 3050, próximo 3051 em 30/08 (dom), alvo 3055 -> ter 01/09, qui 03/09, dom 06/09, **ter 08/09**.
  - É **estimativa**, e o tipo público já diz isso: ignora feriado, concurso especial que quebra a cadência e mudança futura de calendário.
  - Só faz sentido para o último concurso. O calendário é o de hoje — a fixture `megasena/2500` (2022, quartas e sábados) prova que projetar concurso antigo com ele dá data errada.
  - Atenção à Loteca: ela acumula em final 0/5 (alvo 1270), mas o calendário dela é o da **apuração** (segunda) e o `dataProximoConcurso` cai no sábado. A caminhada precisa lidar com data de partida fora do calendário.
- [x] Implementar `getLatestDraw(code)`
- [x] Implementar `getDraw(code, contestNumber)`
- [x] Implementar `getAllLatestDraws()` com execução concorrente e tolerância a falha parcial
- [x] Expor o resultado completo das 4 modalidades que têm mais que dezenas: `secondDrawNumbers` (Dupla Sena), `bonusNumbers` (+Milionária) e `bonusName` (Timemania e Dia de Sorte)

**Lacunas de dados — decididas em 29/08/2026**
- [x] `drawDaysOfWeek`: tabela estática em `src/calendar.ts`, juntada à resposta da API pelo mapper
- [x] `drawTime`: **não** entra na resposta pública; fica no calendário como documentação
- [x] `nextSpecialDrawDate`: projetado sobre o calendário, para as modalidades que acumulam em concurso de final 0/5

**Qualidade**
- [x] Capturar fixtures de resposta real das 11 modalidades para os testes
- [x] Cobrir `client.ts` com testes (rede, timeout, HTTP não-2xx, erro disfarçado, JSON malformado, retry)
- [x] Cobrir `mapper.ts` com testes (campos ausentes, parse de data, projeção do especial)
- [x] Cobrir as três funções públicas com testes (falha parcial, concorrência, propagação de erro)
- [x] Atingir e manter 100% de cobertura de linhas e branches
- [x] Configurar CI (GitHub Actions) rodando typecheck + testes + cobertura em Node 22.x e 24.x, com gate de 100% e verificação do `dist/` na versão mínima declarada

**Publicação**
- [ ] Publicar a versão `0.1.0` no npm
- [ ] Integrar a lib ao worker diário do `loterias-app-backend`
