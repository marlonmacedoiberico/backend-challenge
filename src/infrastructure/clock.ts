import type { Clock } from '../usecases/ports.js';

export class SystemClock implements Clock {
  now(): Date { return new Date(); }
}

export class ControllableClock implements Clock {
  private current: Date;

  constructor(initial: Date = new Date()) {
    this.current = initial;
  }

  now(): Date { return new Date(this.current); }

  set(value: Date): void {
    this.current = new Date(value);
  }
}

export function configuredClock(mode: string | undefined): Clock {
  return mode === 'test' ? new ControllableClock() : new SystemClock();
}
