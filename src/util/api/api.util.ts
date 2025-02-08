export function delay(t) {
  return new Promise((resolve) => setTimeout(resolve, t));
}
