import {
  isCanonicalHttpOrigin,
  isCanonicalPluginId,
} from './bridge-runtime.mjs?v=1.0.2';

function isObjectLike(value) {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

/**
 * 固定当前 page load 的 host transport；UXP source 必须是同一 uxpHost object。
 */
export function resolvePageHostTransport(windowObject, identity) {
  if (!isObjectLike(windowObject) || !identity) return undefined;
  let uxpHost;
  let parent;
  try {
    uxpHost = windowObject.uxpHost;
    parent = windowObject.parent;
  } catch {
    return undefined;
  }
  if (
    isObjectLike(uxpHost) &&
    typeof uxpHost.postMessage === 'function' &&
    isCanonicalPluginId(identity.origin)
  ) {
    return {
      kind: 'uxp',
      expectedSource: uxpHost,
      reply(_event, response) {
        uxpHost.postMessage(response);
      },
    };
  }

  if (
    isObjectLike(parent) &&
    parent !== windowObject &&
    typeof parent.postMessage === 'function' &&
    isCanonicalHttpOrigin(identity.origin)
  ) {
    return {
      kind: 'iframe',
      expectedSource: parent,
      reply(event, response) {
        parent.postMessage(response, event.origin);
      },
    };
  }
  return undefined;
}
