/** 判断 signal 是否具备 UXP fetch/retry 需要的事件监听 API。 */
export function canListenToAbort(signal: AbortSignal | undefined): signal is AbortSignal {
  return (
    signal !== undefined &&
    typeof signal.addEventListener === 'function' &&
    typeof signal.removeEventListener === 'function'
  );
}
