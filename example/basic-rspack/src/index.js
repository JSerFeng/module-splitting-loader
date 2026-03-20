import { renderAboveTheFold } from './lib.js';

console.log(`main:${renderAboveTheFold()}`);

import(/* webpackChunkName: "async-panel" */ './async-panel.js').then(
  ({ runAsyncPanel }) => {
    console.log(`async:${runAsyncPanel()}`);
  },
);
