let draining = false;
export function beginRequestDrain() {
  draining = true;
}
export function isDraining() {
  return draining;
}
