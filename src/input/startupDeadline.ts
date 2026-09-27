/** Release resources that resolve after timeout/cancellation instead of leaking them. */
export function startupDeadline<T>(
  work: Promise<T>, milliseconds: number, message: string,
  isCancelled: () => boolean = () => false,
  releaseLate?: (value: T) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      finished = true;
      reject(new Error(message));
    }, milliseconds);
    work.then(value => {
      if (finished || isCancelled()) {
        releaseLate?.(value);
        if (!finished) { finished = true; clearTimeout(timer); reject(new Error('Camera startup cancelled.')); }
        return;
      }
      finished = true; clearTimeout(timer); resolve(value);
    }, error => {
      if (finished) return;
      finished = true; clearTimeout(timer); reject(error);
    });
  });
}
