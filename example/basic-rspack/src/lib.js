export function renderAboveTheFold() {
  return 'ABOVE_THE_FOLD_OK';
}

const asyncOnlyPayload = [
  'ASYNC_ONLY_B_MARKER',
  'cyan',
  'lime',
  'amber',
].join(':');

export function renderBelowTheFold() {
  return asyncOnlyPayload;
}
