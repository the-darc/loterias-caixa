/**
 * Carrega todo arquivo de `src/` para que ele apareça no relatório de
 * cobertura.
 *
 * Sem isso há um buraco no gate de CI: a cobertura do Node só mede arquivo que
 * foi carregado, então um módulo que nenhum teste importa fica **invisível** —
 * o relatório dá 100% e o CI passa, enquanto o arquivo não tem teste nenhum.
 * (`--test-coverage-include` não resolve: ele filtra o que já foi carregado,
 * não força a medição de quem ficou de fora.)
 *
 * Carregando todos, um arquivo sem teste aparece com cobertura baixa e derruba
 * o gate — que é o comportamento que a gente quer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC_DIR = join(import.meta.dirname, '..', 'src');

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

const sourceFiles = listSourceFiles(SRC_DIR).sort();

test('src/ tem arquivos para carregar', () => {
  assert.ok(sourceFiles.length > 0, 'não achei nenhum arquivo em src/');
});

for (const file of sourceFiles) {
  test(`${relative(SRC_DIR, file)} carrega sem efeito colateral`, async () => {
    const modulo = await import(pathToFileURL(file).href);
    assert.equal(typeof modulo, 'object');
  });
}
