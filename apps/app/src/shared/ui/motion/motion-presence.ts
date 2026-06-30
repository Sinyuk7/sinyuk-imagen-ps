export type MotionPresenceState = 'unmounted' | 'entering' | 'entered' | 'exiting';

export class MotionPresence {
  private stateValue: MotionPresenceState;

  constructor(visible: boolean) {
    this.stateValue = visible ? 'entered' : 'unmounted';
  }

  get state(): MotionPresenceState {
    return this.stateValue;
  }

  setVisible(visible: boolean): MotionPresenceState {
    if (visible) {
      this.stateValue = this.stateValue === 'unmounted' ? 'entering' : 'entered';
      return this.stateValue;
    }
    this.stateValue = this.stateValue === 'unmounted' ? 'unmounted' : 'exiting';
    return this.stateValue;
  }

  entered(): void {
    this.stateValue = 'entered';
  }

  unmounted(): void {
    this.stateValue = 'unmounted';
  }
}
