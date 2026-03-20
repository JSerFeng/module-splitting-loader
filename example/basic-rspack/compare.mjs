import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

function run(args, cwd) {
  execFileSync('pnpm', args, { cwd, stdio: 'inherit' });
}

function runNode(args, cwd) {
  execFileSync('node', args, { cwd, stdio: 'inherit' });
}

function includes(text, token) {
  return text.includes(token);
}

runNode(['./node_modules/@rslib/core/bin/rslib.js', 'build'], repoRoot);
run(['build'], __dirname);
run(['build:no-loader'], __dirname);

const withLoaderPath = path.join(__dirname, 'dist', 'main.cjs');
const withLoaderAsyncPath = path.join(__dirname, 'dist', 'async-panel.chunk.cjs');
const withoutLoaderPath = path.join(__dirname, 'dist-no-loader', 'main.cjs');
const withoutLoaderAsyncPath = path.join(__dirname, 'dist-no-loader', 'async-panel.chunk.cjs');

const withLoader = await fs.readFile(withLoaderPath, 'utf8');
const withLoaderAsync = await fs.readFile(withLoaderAsyncPath, 'utf8');
const withoutLoader = await fs.readFile(withoutLoaderPath, 'utf8');
const withoutLoaderAsync = await fs.readFile(withoutLoaderAsyncPath, 'utf8');

const summary = {
  withLoader: {
    size: Buffer.byteLength(withLoader),
    mainHasAsyncMarker: includes(withLoader, 'ASYNC_ONLY_B_MARKER'),
    asyncChunkHasAsyncMarker: includes(withLoaderAsync, 'ASYNC_ONLY_B_MARKER'),
  },
  withoutLoader: {
    size: Buffer.byteLength(withoutLoader),
    mainHasAsyncMarker: includes(withoutLoader, 'ASYNC_ONLY_B_MARKER'),
    asyncChunkHasAsyncMarker: includes(withoutLoaderAsync, 'ASYNC_ONLY_B_MARKER'),
  },
};

console.log('\nComparison summary');
console.log(`with loader: mainSize=${summary.withLoader.size} mainHasAsyncMarker=${summary.withLoader.mainHasAsyncMarker} asyncChunkHasAsyncMarker=${summary.withLoader.asyncChunkHasAsyncMarker}`);
console.log(`without loader: mainSize=${summary.withoutLoader.size} mainHasAsyncMarker=${summary.withoutLoader.mainHasAsyncMarker} asyncChunkHasAsyncMarker=${summary.withoutLoader.asyncChunkHasAsyncMarker}`);

if (
  summary.withLoader.mainHasAsyncMarker ||
  !summary.withLoader.asyncChunkHasAsyncMarker ||
  !summary.withoutLoader.mainHasAsyncMarker ||
  summary.withLoader.size >= summary.withoutLoader.size
) {
  process.exitCode = 1;
}
