const LEVEL_TIME_MS = 3 * 60 * 1000 + 30 * 1000; // 各レベル3分30秒 = 210000ms
const WARNING_MS = 30 * 1000; // 残り30秒で警告色
const TIMEUP_MESSAGE_MS = 2500; // 「時間です」表示の長さ
const FIXATION_MS = 1000; // 注視点(+)の表示時間 = 1秒

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
    note: '',
  };
}

// 時間切れで未回答になった問題の記録（is_correct=0、選択は空、noteに理由）
export function recordTimeoutResponse(preparedItem) {
  return {
    item_id: preparedItem.item_id,
    level: preparedItem.level,
    pos: preparedItem.pos,
    target_meaning_ja: preparedItem.meaning_ja,
    correct_word: preparedItem.correct_word,
    displayed_options: preparedItem.shuffled_choices.map(c => c.word),
    response_position: '',
    response_word: '',
    is_correct: false,
    response_time_ms: '',
    note: '制限時間切れのため回答不可',
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
    // レベル・タイマー管理
    this.currentLevel = null;
    this.levelStartTime = 0;
    this.levelDurations = {};     // { level: ms }
    this.timerIntervalId = null;
    this.levelDeadline = 0;
    this.isTransitioning = false;
    this.resumedAfterReload = false; // リロードで再開した直後かどうか
    this.reloadCount = 0; // リロード（復元）した回数
    this.fixationTimeoutId = null; // 注視点の表示予約
  }
  start() {
    this.idx = 0;
    this.results = [];
    this.testStartTime = performance.now();
    this.focusLossCount = 0;
    this.focusLossTotalMs = 0;
    this.focusLossEvents = [];
    this.blurStart = 0;
    this.currentLevel = null;
    this.levelDurations = {};
    this._attachFocusMonitors();
    this.renderCurrent();
  }
// 保存データから状態を復元して再開する
  resume(progress) {
    this.idx = progress.idx;
    this.results = progress.results || [];
    this.currentLevel = progress.currentLevel;
    this.levelStartTime = progress.levelStartTime;
    this.levelDeadline = progress.levelDeadline;
    this.levelDurations = progress.levelDurations || {};
    this.focusLossCount = progress.focusLossCount || 0;
    this.focusLossTotalMs = progress.focusLossTotalMs || 0;
    this.focusLossEvents = progress.focusLossEvents || [];
    this.testStartTime = progress.testStartTime || Date.now();
    // これまでのリロード回数を引き継ぎ、今回の復元分を+1する
    this.reloadCount = (progress.reloadCount || 0) + 1;
    this.resumedAfterReload = true; // 次に表示する問題はリロード再開分
    this._attachFocusMonitors();
    // 保存された締め切り時刻でタイマーを再開する
    this._resumeLevelTimer();
    this.renderCurrent();
  }

  // 保存された levelDeadline を使ってタイマーを再開（締め切り時刻は変えない）
  _resumeLevelTimer() {
    this._updateTimerDisplay();
    if (this.timerIntervalId) clearInterval(this.timerIntervalId);
    this.timerIntervalId = setInterval(() => {
      this._updateTimerDisplay();
      if (Date.now() >= this.levelDeadline) {
        this._onLevelTimeout();
      }
    }, 250);
  }
  _attachFocusMonitors() {
    this._onVisibilityChange = () => {
      if (document.hidden) this._markBlur();
      else this._markFocus();
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
    if (this.blurStart === 0) this.blurStart = performance.now();
  }

  _markFocus() {
    if (this.blurStart > 0) {
      const duration = Math.round(performance.now() - this.blurStart);
      this.focusLossCount += 1;
      this.focusLossTotalMs += duration;
      this.focusLossEvents.push({ trial_index: this.idx + 1, duration_ms: duration });
      this.blurStart = 0;
    }
  }

  // レベルのタイマーを開始
  _startLevelTimer(level) {
    this.currentLevel = level;
    this.levelStartTime = Date.now();
    this.levelDeadline = this.levelStartTime + LEVEL_TIME_MS;
    this._updateTimerDisplay();
    if (this.timerIntervalId) clearInterval(this.timerIntervalId);
    this.timerIntervalId = setInterval(() => {
      this._updateTimerDisplay();
      if (Date.now() >= this.levelDeadline) {
        this._onLevelTimeout();
      }
    }, 250);
  }

  _stopLevelTimer() {
    if (this.timerIntervalId) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
  }

  _updateTimerDisplay() {
    if (!this.el.timer) return;
    const remainMs = Math.max(0, this.levelDeadline - Date.now());
    const totalSec = Math.ceil(remainMs / 1000);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    this.el.timer.textContent = `残り ${mm}:${String(ss).padStart(2, '0')}`;
    if (remainMs <= WARNING_MS) {
      this.el.timer.classList.add('timer-warning');
    } else {
      this.el.timer.classList.remove('timer-warning');
    }
  }

  // 現在のレベルの記録済みの所要時間を保存
  _recordLevelDuration() {
    if (this.currentLevel !== null) {
      const dur = Math.round(Date.now() - this.levelStartTime);
      this.levelDurations[this.currentLevel] =
        (this.levelDurations[this.currentLevel] || 0) + dur;
    }
  }

  // 時間切れ: 現在レベルの残り問題を未回答(不正解)として記録し、次レベルへ
  _onLevelTimeout() {
    this._stopLevelTimer();
    // 注視点の表示待ちが残っていたら取り消す（古い問題が表示されるのを防ぐ）
    if (this.fixationTimeoutId) {
      clearTimeout(this.fixationTimeoutId);
      this.fixationTimeoutId = null;
    }
    this._recordLevelDuration();
    const timedOutLevel = this.currentLevel;
    // 現在のレベルに属する未回答問題をすべて未回答として記録
    while (this.idx < this.items.length && this.items[this.idx].level === timedOutLevel) {
      this.results.push(recordTimeoutResponse(this.items[this.idx]));
      this.idx++;
    }
    if (this.callbacks.onProgress) {
      this.callbacks.onProgress(this.idx, this.items.length);
    }
    this._showTimeupMessage(() => {
      this.renderCurrent();
    });
  }

  _showTimeupMessage(done) {
    this.isTransitioning = true;
    if (this.el.options) this.el.options.innerHTML = '';
    if (this.el.meaning) this.el.meaning.textContent = '';
    if (this.el.pos) this.el.pos.textContent = '';
    if (this.el.timeup) {
      this.el.timeup.style.display = 'block';
      this.el.timeup.textContent = '時間です。次のレベルに進みます。';
    }
    setTimeout(() => {
      if (this.el.timeup) this.el.timeup.style.display = 'none';
      this.isTransitioning = false;
      done();
    }, TIMEUP_MESSAGE_MS);
  }

  renderCurrent() {
    if (this.idx >= this.items.length) {
      this._stopLevelTimer();
      this._recordLevelDuration();
      this._markFocus();
      this._detachFocusMonitors();
      const totalDurationMs = Math.round(performance.now() - this.testStartTime);
      const quality = {
        focus_loss_count: this.focusLossCount,
        focus_loss_total_ms: this.focusLossTotalMs,
        focus_loss_events: this.focusLossEvents,
        total_duration_ms: totalDurationMs,
        level_durations_ms: this.levelDurations,
        reload_count: this.reloadCount,
      };
      this.callbacks.onComplete(this.results, quality);
      return;
    }

 const item = this.items[this.idx];
    // レベルが切り替わったらタイマーをリセット
    if (item.level !== this.currentLevel) {
      if (this.currentLevel !== null) this._recordLevelDuration();
      this._startLevelTimer(item.level);
    }
    if (this.callbacks.onProgress) {
      const levelInfo = this._getLevelPosition();
      this.callbacks.onProgress(this.idx, this.items.length, levelInfo);
    }
    this._showFixationThenQuestion(item);
  }

  // 今の問題が、自分のレベルの中で何問目か（および総数）を計算する
  _getLevelPosition() {
    const currentItem = this.items[this.idx];
    const level = currentItem.level;
    // このレベルの問題が、items全体のどこからどこまでか数える
    let levelStartIdx = this.idx;
    while (levelStartIdx > 0 && this.items[levelStartIdx - 1].level === level) {
      levelStartIdx--;
    }
    let levelTotal = 0;
    for (const it of this.items) {
      if (it.level === level) levelTotal++;
    }
    const positionInLevel = this.idx - levelStartIdx + 1;
    return { level, positionInLevel, levelTotal };
  }
// 今の進行状態をまとめてコールバックに渡す（保存用）
  _saveProgress() {
    if (!this.callbacks.onSaveProgress) return;
    const progressData = {
      idx: this.idx,
      results: this.results,
      currentLevel: this.currentLevel,
      levelStartTime: this.levelStartTime,
      levelDeadline: this.levelDeadline,
      levelDurations: this.levelDurations,
      focusLossCount: this.focusLossCount,
      focusLossTotalMs: this.focusLossTotalMs,
      focusLossEvents: this.focusLossEvents,
      testStartTime: this.testStartTime,
      reloadCount: this.reloadCount,
    };
    this.callbacks.onSaveProgress(progressData);
  }
  // 注視点(+)を一定時間表示してから問題を表示する
  _showFixationThenQuestion(item) {
    this.isTransitioning = true;
    // 注視点表示中は意味・品詞・選択肢を隠し、中央に「+」を出す
    this.el.pos.textContent = '';
    this.el.options.innerHTML = '';
    this.el.meaning.textContent = '+';
    this.el.meaning.classList.add('vst-fixation');

    this.fixationTimeoutId = setTimeout(() => {
      this.fixationTimeoutId = null;
      // 注視点が終わったら問題を表示
      this.el.meaning.classList.remove('vst-fixation');
      this._showQuestion(item);
    }, FIXATION_MS);
  }

  _showQuestion(item) {
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
    // リロードで再開した最初の問題には注意を表示する
    if (this.resumedAfterReload && this.el.timeup) {
      this.el.timeup.style.display = 'block';
      this.el.timeup.textContent = 'リロードしないで続けて解答してください。';
    }
    this.isTransitioning = false;
    this.startTime = performance.now();
    this._saveProgress();
  }

respond(clickedPosition) {
    if (this.isTransitioning) return; // 遷移中のクリックは無視
    const rt = Math.round(performance.now() - this.startTime);
    const item = this.items[this.idx];
    const rec = recordVstResponse(item, clickedPosition, rt);
    // リロードで再開した問題には備考を付け、注意表示を消す
    if (this.resumedAfterReload) {
      rec.note = 'リフレッシュしたため、反応時間の検討が必要';
      this.resumedAfterReload = false;
      if (this.el.timeup) this.el.timeup.style.display = 'none';
    }
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
    // 時間切れ未回答（response_positionが空）は整合性チェックの対象外
    if (r.response_position === '' || r.response_position === null || r.response_position === undefined) {
      if (!r.displayed_options.includes(r.correct_word)) {
        issues.push({ item_id: r.item_id, reason: 'correct_word not in options' });
      }
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
