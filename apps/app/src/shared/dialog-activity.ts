const active = new Set<object>();
const listeners = new Set<() => void>();
export const dialogActivity = {
  getSnapshot: () => active.size,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
/** Track the native modal host through its dismissal animation. */
export function registerDialog() {
  const key = {};
  active.add(key);
  listeners.forEach((listener) => listener());
  return () => {
    if (!active.delete(key)) return;
    listeners.forEach((listener) => listener());
  };
}
