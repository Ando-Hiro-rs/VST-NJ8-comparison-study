export const CELP_TIMING = {
  fixation: 2000,
  prime: 1600,
  blank: 600,
};

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildCelpTrials(pool, n) {
  const half = Math.floor(n / 2);
  const synSel = shuffle(pool.synonym).slice(0, half);
  const nonsynSel = shuffle(pool.nonsynonym).slice(0, n - half);
  const items = [];
  synSel.forEach(([p, t]) => items.push({
    prime: p, target: t, condition: 'synonym', isSyn: true
  }));
  nonsynSel.forEach(([p, t]) => items.push({
    prime: p, target: t, condition: 'nonsynonym', isSyn: false
  }));
  return shuffle(items);
}

export class CelpRunner {
  constructor(elements, items, callbacks) {
    this.el = elements;
    this.items = items;
    this.callbacks = callbacks;
    this.idx = 0;
    this.phase = 'idle';
    this.rtStart = 0;
    this.timer = null;
    this.results = [];
  }

  start() {
    this.idx = 0;
    this.results = [];
    this.next();
  }

  next() {
    if (this.idx >= this.items.length) {
      this.callbacks.onComplete(this.results);
      return;
    }
    if (this.callbacks.onProgress) {
      this.callbacks.onProgress(this.idx, this.items.length);
    }
    const item = this.items[this.idx];
    this.el.fix.style.display = 'flex';
    this.el.fix.textContent = '+';
    this.el.prime.style.display = 'none';
    this.el.blank.style.display = 'none';
    this.el.target.style.display = 'none';
    this.el.btnRow.style.display = 'none';
    this.el.feedback.textContent = '';
    this.phase = 'fix';

    this.timer = setTimeout(() => {
      this.el.fix.style.display = 'none';
      this.el.prime.style.display = 'flex';
      this.el.prime.textContent = item.prime.toLowerCase();
      this.phase = 'prime';

      this.timer = setTimeout(() => {
        this.el.prime.style.display = 'none';
        this.el.blank.style.display = 'flex';
        this.phase = 'blank';

        this.timer = setTimeout(() => {
          this.el.blank.style.display = 'none';
          this.el.target.style.display = 'flex';
          this.el.target.textContent = item.target.toLowerCase();
          this.el.btnRow.style.display = 'flex';
          this.phase = 'target';
          this.rtStart = performance.now();
        }, CELP_TIMING.blank);
      }, CELP_TIMING.prime);
    }, CELP_TIMING.fixation);
  }

  respond(respondedYes) {
    if (this.phase !== 'target') return;
    clearTimeout(this.timer);
    const rt = Math.round(performance.now() - this.rtStart);
    const item = this.items[this.idx];
    const correct = respondedYes === item.isSyn;
    this.el.feedback.textContent = correct ? '✓ 正解' : '✗ 不正解';
    this.el.feedback.className = 'feedback-msg ' + (correct ? 'fb-correct' : 'fb-wrong');
    this.el.btnRow.style.display = 'none';
    this.results.push({
      trial_num: this.idx + 1,
      prime: item.prime,
      target: item.target,
      condition: item.condition,
      response: respondedYes ? 'synonym' : 'nonsynonym',
      is_correct: correct,
      rt_ms: rt,
    });
    this.idx++;
    this.timer = setTimeout(() => this.next(), 400);
  }

  cleanup() {
    clearTimeout(this.timer);
  }
}
