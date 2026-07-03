/** 判断 signal 是否具备 UXP fetch/retry 需要的事件监听 API。 */
export function canListenToAbort(signal: AbortSignal | undefined): boolean {
  return (
    signal !== undefined &&
    typeof signal.addEventListener === 'function' &&
    typeof signal.removeEventListener === 'function'
  );
}
