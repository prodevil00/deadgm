// Fixed-capacity object pool. Objects need `active` and a `kill()` method.

export class Pool {
  constructor(factory, max) {
    this.factory = factory;
    this.max = max;
    this.items = [];
  }

  obtain() {
    for (let i = 0; i < this.items.length; i++) {
      if (!this.items[i].active) return this.items[i];
    }
    if (this.items.length >= this.max) return null;
    const item = this.factory();
    this.items.push(item);
    return item;
  }

  countActive() {
    let n = 0;
    for (let i = 0; i < this.items.length; i++) if (this.items[i].active) n++;
    return n;
  }

  forEachActive(fn) {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.active) fn(it);
    }
  }

  killAll() {
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].active) this.items[i].kill();
    }
  }
}
