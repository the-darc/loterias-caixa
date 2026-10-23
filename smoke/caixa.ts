/**
 * Verificação de fumaça contra a **API real** da Caixa.
 *
 * Responde a uma pergunta que a suíte de testes não responde, e nem deveria:
 * *a Caixa está no ar e devolvendo as onze modalidades no formato esperado?*
 *
 * Os testes de unidade provam que a lib está certa, sobre respostas reais
 * guardadas em `test/fixtures/`. Eles passam offline e são determinísticos —
 * é por isso que **nenhum deles toca a rede**, e também por isso que uma pane
 * da Caixa passa despercebida por eles. Foi o que aconteceu com a Super Sete
 * em outubro de 2026: o serviço deles respondeu erro por dias, com a suíte
 * inteira verde.
 *
 * Por morar fora de `test/`, este arquivo fica fora do glob da suíte
 * (`test/**\/*.test.ts`). Rodar os testes nunca vai à rede por acidente.
 *
 * ## Uso
 *
 *     npm run smoke
 *
 * Sai com código 1 se alguma modalidade falhar, e escreve `smoke-report.json`
 * no formato que o shields.io consome, para virar badge no README.
 */
import { writeFile } from 'node:fs/promises';

import { getLatestDraw, getSupportedLotteries } from '../src/index.ts';
import type { LotteryCode } from '../src/index.ts';

/** O que aconteceu com uma modalidade. */
interface Resultado {
  code: LotteryCode;
  ok: boolean;
  /** Nome do erro e mensagem, quando falhou. */
  detalhe?: string;
  /** Concurso devolvido, quando deu certo. */
  contestNumber?: number;
}

/**
 * Consulta uma modalidade e nunca lança.
 *
 * A falha de uma não pode interromper a varredura: o valor deste verificador
 * está justamente em dizer **quantas** e **quais** falharam.
 */
async function verificar(code: LotteryCode): Promise<Resultado> {
  try {
    const draw = await getLatestDraw(code);
    return { code, ok: true, contestNumber: draw.contestNumber };
  } catch (erro) {
    const e = erro as Error;
    return { code, ok: false, detalhe: `${e.name}: ${e.message}` };
  }
}

/**
 * Cor do badge conforme a gravidade.
 *
 * Uma modalidade fora do ar é problema da Caixa e merece atenção, não pânico.
 * Todas fora é outra coisa: ou a API mudou de endereço, ou saiu do ar inteira.
 */
function cor(falhas: number, total: number): string {
  if (falhas === 0) return 'brightgreen';
  return falhas === total ? 'red' : 'orange';
}

async function main(): Promise<void> {
  const codes = getSupportedLotteries().map((lottery) => lottery.code);

  // Em paralelo: são 11 requisições independentes, e em série o verificador
  // levaria mais de um minuto quando a Caixa estivesse lenta.
  const resultados = await Promise.all(codes.map(verificar));
  const falhas = resultados.filter((resultado) => !resultado.ok);

  for (const resultado of resultados) {
    const marca = resultado.ok ? 'ok  ' : 'FALHOU';
    const extra = resultado.ok ? `concurso ${resultado.contestNumber}` : resultado.detalhe;
    console.log(`${marca} ${resultado.code.padEnd(16)} ${extra}`);
  }

  const total = resultados.length;
  console.log(`\n${total - falhas.length} de ${total} modalidades responderam.`);

  await writeFile(
    'smoke-report.json',
    `${JSON.stringify(
      {
        schemaVersion: 1,
        label: 'API da Caixa',
        message:
          falhas.length === 0 ?
            `${total} de ${total} no ar` :
            `${falhas.length} de ${total} fora do ar`,
        color: cor(falhas.length, total),
      },
      null,
      2,
    )}\n`,
  );

  if (falhas.length > 0) {
    console.error(
      `\nModalidades fora do ar: ${falhas.map((f) => f.code).join(', ')}`,
    );
    process.exitCode = 1;
  }
}

await main();
