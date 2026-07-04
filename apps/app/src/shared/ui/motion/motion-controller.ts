import { getSharedMotionRuntime, StaticMotionHandle, type MotionRuntime } from './motion-runtime';
import type { MotionChannel, MotionHandle, MotionRecipe } from './motion-types';

export class MotionController {
  private readonly byChannel = new Map<MotionChannel, Set<MotionHandle>>();

  constructor(readonly runtime: MotionRuntime = getSharedMotionRuntime()) {}

  play(recipe: MotionRecipe): MotionHandle {
    this.stop(recipe.channel);
    const handle = recipe.run(this.runtime);
    this.track(handle);
    return handle;
  }

  static(channel: MotionChannel): MotionHandle {
    return new StaticMotionHandle(channel);
  }

  stop(channel?: MotionChannel): void {
    this.forEachHandle(channel, (handle) => handle.stop());
    if (channel) {
      this.byChannel.delete(channel);
    } else {
      this.byChannel.clear();
    }
  }

  finish(channel?: MotionChannel): void {
    this.forEachHandle(channel, (handle) => handle.finish());
    if (channel) {
      this.byChannel.delete(channel);
    } else {
      this.byChannel.clear();
    }
  }

  isRunning(channel?: MotionChannel): boolean {
    if (!channel) {
      return Array.from(this.byChannel.values()).some((items) => Array.from(items).some((handle) => handle.isRunning()));
    }
    return Array.from(this.byChannel.get(channel) ?? []).some((handle) => handle.isRunning());
  }

  private track(handle: MotionHandle): void {
    if (!handle.isRunning()) {
      return;
    }
    const set = this.byChannel.get(handle.channel) ?? new Set<MotionHandle>();
    set.add(handle);
    this.byChannel.set(handle.channel, set);
  }

  private forEachHandle(channel: MotionChannel | undefined, visit: (handle: MotionHandle) => void): void {
    const sets = channel ? [this.byChannel.get(channel)] : Array.from(this.byChannel.values());
    for (const set of sets) {
      if (!set) {
        continue;
      }
      for (const handle of Array.from(set)) {
        visit(handle);
        set.delete(handle);
      }
    }
  }
}

let sharedController: MotionController | undefined;

export function getSharedMotionController(): MotionController {
  sharedController ??= new MotionController();
  return sharedController;
}
