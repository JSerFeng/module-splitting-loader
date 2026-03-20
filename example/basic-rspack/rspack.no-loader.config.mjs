import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  mode: 'production',
  context: __dirname,
  entry: './src/index.js',
  target: 'node',
  output: {
    path: path.resolve(__dirname, 'dist-no-loader'),
    filename: 'main.cjs',
    chunkFilename: '[name].chunk.cjs',
    clean: true,
  },
  optimization: {
    usedExports: true,
    providedExports: true,
    sideEffects: true,
    minimize: true,
  },
};
