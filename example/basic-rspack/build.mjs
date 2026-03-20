import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rspack } from '@rspack/core';

const configArg = process.argv[2] ?? './rspack.config.mjs';
const configUrl = pathToFileURL(path.resolve(process.cwd(), configArg)).href;
const { default: config } = await import(configUrl);

const stats = await new Promise((resolve, reject) => {
  const compiler = rspack(config);
  compiler.run((err, result) => {
    if (err) {
      reject(err);
      return;
    }
    compiler.close(() => {});
    resolve(result);
  });
});

if (stats.hasErrors()) {
  console.error(stats.toString({ colors: true, errors: true }));
  process.exitCode = 1;
} else {
  console.log(stats.toString({ colors: true, preset: 'minimal' }));
}
