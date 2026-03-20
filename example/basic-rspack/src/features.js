const greetingPrefix = 'Hello';
const punctuation = '!';

export function greet(name) {
  return `${greetingPrefix}, ${name}${punctuation}`;
}

export function farewell(name) {
  return `Goodbye, ${name}. UNUSED_EXAMPLE_EXPORT`;
}
