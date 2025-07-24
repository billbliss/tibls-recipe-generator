export function itLive(name: string, fn: () => any, timeout?: number) {
  if (process.env.RUN_LIVE_CHATGPT === 'true') {
    return it(name, fn, timeout);
  } else {
    return it.skip(name, fn, timeout);
  }
}
