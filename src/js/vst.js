function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function prepareVstItem(item) {
  const choices = [
    { word: item.correct, isCorrect: true },
    ...item.distractors.map(w => ({ word: w, isCorrect: false })),
  ];
  const shuffled = shuffle(choices);
  return {
    item_id: item.id,
    level: item.level,
    pos: item.pos,
    meaning_ja: item.meaning_ja,
    correct_word: item.correct,
    shuffled_choices: shuffled.map((c, idx) => ({
      display_position: idx,
      word: c.word,
      isCorrect: c.isCorrect,
    })),
  };
}

export function recordVstResponse(preparedItem, clickedPosition, responseTimeMs) {
  const chosen = preparedItem.shuffled_choices[clickedPosition];
  const isCorrect = chosen.word === preparedItem.correct_word;
  return {
    item_id: preparedItem.item_id,
    level: preparedItem.level,
    pos: preparedItem.pos,
    target_meaning_ja: preparedItem.meaning_ja,
    correct_word: preparedItem.correct_word,
    displayed_options: preparedItem.shuffled_choices.map(c => c.word),
    response_position: clickedPosition,
    response_word: chosen.word,
    is_correct: isCorrect,
    response_time_ms: responseTimeMs,
  };
}

export class VstRunner {
  constructor(elements, items, callbacks) {
    this.el = elements;
    this.items = items.map(it => prepareVstItem(it));
    this.callbacks = callbacks;
    this.idx = 0;
    this.startTime = 0;
    this.results = [];
    this.testStartTime = 0;
    this.focusLossCount = 0;
    this.focusLossTotalMs = 0;
    this.focusLossEvents = [];
    this.blurStart = 0;
    this._onVisibilityChange = null;
    this._onBlur = null;
    this._onFocus = null;
  }

  start() {
    this.idx = 0;
    this.results = [];
    this.testStartTime = performance.now();
    this.focusLossCount = 0;
    this.focusLossTotalMs = 0;
    this.focusLossEvents = [];
    this.blurStart = 0;
    this._attachFocusMonitors();
    this.renderCurrent();
  }

  _attachFocusMonitors() {
    this._onVisibilityChange = () => {
      if (document.hidden) {
        this._markBlur();
      } else {
        this._markFocus();
      }
    };
    this._onBlur = () => this._markBlur();
    this._onFocus = () => this._markFocus();
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('focus', this._onFocus);
  }

  _detachFocusMonitors() {
    if (this._onVisibilityChange) {
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }
    if (this._onBlur) window.removeEventListener('blur', this._onBlur);
    if (this._onFocus) window.removeEventListener('focus', this._onFocus);
    this._onVisibilityChange = null;
    this._onBlur = null;
    this._onFocus = null;
  }

  _markBlur() {
    if (this.blurStart === 0) {
      this.blurStart = performance.now();
    }
  }

  _markFocus() {
    if (this.blurStart > 0) {
      const duration = Math.round(performance.now() - this.blurStart);
      this.focusLossCount += 1;
      this.focusLossTotalMs += duration;
      this.focusLossEvents.push({
        trial_index: this.idx + 1,
        duration_ms: duration,
      });
      this.blurStart = 0;
    }
  }

  renderCurrent() {
    if (this.idx >= this.items.length) {
      this._markFocus();
      this._detachFocusMonitors();
      const totalDurationMs = Math.round(performance.now() - this.testStartTime);
      const quality = {
        focus_loss_count: this.focusLossCount,
        focus_loss_total_ms: this.focusLossTotalMs,
        focus_loss_events: this.focusLossEvents,
        total_duration_ms: totalDurationMs,
      };
      this.callbacks.onComplete(this.results, quality);
      return;
    }
    if (this.callbacks.onProgress) {
      this.callbacks.onProgress(this.idx, this.items.length);
    }
    const item = this.items[this.idx];
    this.el.meaning.textContent = item.meaning_ja;
    this.el.pos.textContent = item.pos;
    this.el.options.innerHTML = '';
    item.shuffled_choices.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'vst-opt';
      btn.textContent = c.word;
      btn.onclick = () => this.respond(c.display_position);
      this.el.options.appendChild(btn);
    });
    this.startTime = performance.now();
  }

  respond(clickedPosition) {
    const rt = Math.round(performance.now() - this.startTime);
    const item = this.items[this.idx];
    const rec = recordVstResponse(item, clickedPosition, rt);
    this.results.push(rec);
    this.idx++;
    this.renderCurrent();
  }
}
export function validateVstIntegrity(records) {
  const issues = [];
  for (const r of records) {
    if (!Array.isArray(r.displayed_options) || r.displayed_options.length !== 4) {
      issues.push({ item_id: r.item_id, reason: 'displayed_options invalid' });
      continue;
    }
    if (r.displayed_options[r.response_position] !== r.response_word) {
      issues.push({ item_id: r.item_id, reason: 'position-word mismatch' });
    }
    if (!r.displayed_options.includes(r.correct_word)) {
      issues.push({ item_id: r.item_id, reason: 'correct_word not in options' });
    }
    const expectedCorrect = r.response_word === r.correct_word;
    if (expectedCorrect !== r.is_correct) {
      issues.push({ item_id: r.item_id, reason: 'is_correct mismatch' });
    }
  }
  return issues;
}
