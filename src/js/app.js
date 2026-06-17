import { VstRunner, validateVstIntegrity } from './vst.js';
import { scoreVST } from './irt-scoring.js';
import {
  downloadCSV, buildVstTrialsCSV,
  buildSummaryCSV, makeFilename,
  sendByEmail, shareViaWebShareAPI
} from './csv-export.js';

const TEST_VERSION = 'VST-NJ8 comparison study v1.0';
const STORAGE_KEY = 'vstnj8_study_student_ids';
const PROGRESS_KEY = 'vstnj8_study_progress';
const ITEM_ORDER_KEY = 'vstnj8_study_item_order';

const RESEARCHER_EMAIL = 'ahiro.research1006@gmail.com';
const RESEARCHER_NAME = '安藤 嘉';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzrRYofYf8VGqTNbT7m_SIYrAovOBUzlQ-1YZfUE8Cfh6_1FTvCms7FSfUzOojc0xk/exec';

const state = {
  participant: {},
  session: {},
  vstResult: null,
  vstRawTrials: [],
  browserInfo: null,
  qualityData: null,
};

let vstItems = null;
let vstRunner = null;

// テスト中のリロード・離脱を防ぐ確認ダイアログ
function beforeUnloadHandler(e) {
  e.preventDefault();
  e.returnValue = '';
  return '';
}
function enableUnloadWarning() {
  window.addEventListener('beforeunload', beforeUnloadHandler);
}
function disableUnloadWarning() {
  window.removeEventListener('beforeunload', beforeUnloadHandler);
}

function detectBrowserInfo() {
  const ua = navigator.userAgent;
  let deviceType = 'desktop';
  if (/Mobile|Android|iPhone/i.test(ua)) deviceType = 'mobile';
  else if (/iPad|Tablet/i.test(ua)) deviceType = 'tablet';
  return {
    user_agent: ua,
    platform: navigator.platform || '',
    language: navigator.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    color_depth: window.screen.colorDepth,
    pixel_ratio: window.devicePixelRatio || 1,
    device_type: deviceType,
    touch_support: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  };
}

function applyDeviceClass() {
  const info = state.browserInfo;
  if (info.device_type === 'mobile' || info.touch_support) {
    document.body.classList.add('is-touch-device');
  }
  if (info.device_type === 'mobile') {
    document.body.classList.add('is-mobile');
  }
  if (navigator.share && navigator.canShare) {
    document.body.classList.add('supports-web-share');
  }
}

async function loadData() {
  vstItems = await fetch('./src/data/vst-items.json').then(r => r.json());
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function getStoredIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
// 進行状態を保存する
function saveProgress(progressData) {
  try {
    const record = {
      participant: state.participant,
      session: state.session,
      progress: progressData,
      saved_at: new Date().toISOString(),
    };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(record));
  } catch (e) {
    console.warn('進行状態の保存に失敗しました', e);
  }
}
// 出題順（item_idの配列）を保存する
function saveItemOrder(items) {
  try {
    const order = items.map(it => it.id);
    localStorage.setItem(ITEM_ORDER_KEY, JSON.stringify(order));
  } catch (e) {
    console.warn('出題順の保存に失敗しました', e);
  }
}

// 保存された出題順（item_idの配列）を読み込む（無ければ null）
function loadItemOrder() {
  try {
    const raw = localStorage.getItem(ITEM_ORDER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// 出題順を削除する
function clearItemOrder() {
  try {
    localStorage.removeItem(ITEM_ORDER_KEY);
  } catch (e) {
    console.warn('出題順の削除に失敗しました', e);
  }
}
// 進行状態を読み込む（無ければ null）
function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// 進行状態を削除する
function clearProgress() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch (e) {
    console.warn('進行状態の削除に失敗しました', e);
  }
}
function addStoredId(studentId) {
  try {
    const ids = getStoredIds();
    ids.push({ studentId, timestamp: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch (e) {
    console.warn('localStorage への保存に失敗しました', e);
  }
}

function checkConsentForm() {
  const c1 = document.getElementById('consent-1');
  const c2 = document.getElementById('consent-2');
  const c3 = document.getElementById('consent-3');
  const btn = document.getElementById('consent-btn');
  if (!c1 || !c2 || !c3 || !btn) {
    console.error('同意画面の要素が見つかりません');
    return;
  }
  btn.disabled = !(c1.checked && c2.checked && c3.checked);
}

function submitConsent() {
  try {
    state.session.consent_agreed = true;
    state.session.consent_timestamp = new Date().toISOString();
    // 送信同意は必須チェックに含まれるため、ここでは常に true
    state.session.data_sharing_agreed = true;
    show('s-info');
  } catch (err) {
    console.error('同意処理でエラー:', err);
    alert('画面遷移でエラーが発生しました。ページをリロードして再試行してください。');
  }
}

function checkInfoForm() {
  const sidEl = document.getElementById('f-student-id');
  const nameEl = document.getElementById('f-name');
  const deptEl = document.getElementById('f-department');
  const warningEl = document.getElementById('student-id-warning');
  const btn = document.getElementById('info-btn');
  if (!sidEl || !nameEl || !deptEl || !btn) {
    console.error('受験者情報フォームの要素が見つかりません', { sidEl, nameEl, deptEl, btn });
    return;
  }
  const sid = sidEl.value.trim();
  const name = nameEl.value.trim();
  const dept = deptEl.value;

  // 学籍番号は算用数字7桁かチェック
  const sidValid = /^[0-9]{7}$/.test(sid);

  // 何か入力されていて、7桁の数字でないときだけ注意文を出す
  if (warningEl) {
    if (sid.length > 0 && !sidValid) {
      warningEl.style.display = 'block';
      warningEl.textContent = '⚠ 学籍番号は算用数字7桁で入力してください（例: 1234567）。';
    } else {
      warningEl.style.display = 'none';
    }
  }

  // 学籍番号が7桁の数字 かつ 名前・学科が入力されていれば「次へ」を有効化
  btn.disabled = !(sidValid && name.length > 0 && dept);
}

function submitInfo() {
  const sid = document.getElementById('f-student-id').value.trim();
  const name = document.getElementById('f-name').value.trim();
  const dept = document.getElementById('f-department').value;
  if (!/^[0-9]{7}$/.test(sid) || name.length === 0 || !dept) {
    alert('学籍番号（算用数字7桁）・お名前・学科は必須です。');
    return;
  }
  state.participant = {
    id: sid,
    student_id: sid,
    name: name,
    department: dept,
  };
  state.session = {
    ...state.session,
    test_version: TEST_VERSION,
    start_time: new Date().toISOString(),
    device_type: state.browserInfo.device_type,
  };
  show('s-vst-instructions');
}
// 説明画面のチェックボックスでボタンの有効/無効を切り替える
function checkVstStart() {
  const chk = document.getElementById('vst-understand');
  const btn = document.getElementById('vst-start-btn');
  if (!chk || !btn) return;
  btn.disabled = !chk.checked;
}
function startVst() {
  // レベル(1〜8)ごとに問題を分類
  const byLevel = {};
  for (const item of vstItems) {
    const lv = item.level;
    if (!byLevel[lv]) byLevel[lv] = [];
    byLevel[lv].push(item);
  }
  // 各レベル内でシャッフルし、レベル順(1→8)に連結
  const items = [];
  const levels = Object.keys(byLevel).map(Number).sort((a, b) => a - b);
  for (const lv of levels) {
    const levelItems = [...byLevel[lv]];
    for (let i = levelItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [levelItems[i], levelItems[j]] = [levelItems[j], levelItems[i]];
    }
    items.push(...levelItems);
  }
  // 決めた出題順を保存（リロード復元用）
  saveItemOrder(items);
  const elements = {
    meaning: document.getElementById('vst-meaning'),
    pos: document.getElementById('vst-pos'),
    options: document.getElementById('vst-options'),
    timer: document.getElementById('vst-timer'),
    timeup: document.getElementById('vst-timeup'),
    questionArea: document.getElementById('vst-question-area'),
    wait: document.getElementById('vst-wait'),
    waitTitle: document.getElementById('vst-wait-title'),
    waitMsg: document.getElementById('vst-wait-msg'),
    nextBtn: document.getElementById('vst-next-btn'),
  };
 show('s-vst');
  enableUnloadWarning();
  vstRunner = new VstRunner(elements, items, {
    onProgress: (i, n, levelInfo) => {
      document.getElementById('vst-prog-fill').style.width = `${((i + 1) / n) * 100}%`;
      if (levelInfo) {
        document.getElementById('vst-prog-label').textContent =
          `レベル ${levelInfo.level} ・ ${levelInfo.positionInLevel} / ${levelInfo.levelTotal}`;
      } else {
        document.getElementById('vst-prog-label').textContent = `${i + 1} / ${n}`;
      }
    },
    onSaveProgress: (progressData) => {
      saveProgress(progressData);
    },
    onComplete: (results, quality) => {
      state.vstRawTrials = results;
      state.qualityData = quality;
      const issues = validateVstIntegrity(results);
      if (issues.length > 0) console.error('VST整合性エラー:', issues);
      state.vstResult = scoreVST(results, vstItems);
      finishSession();
    },
  });
  vstRunner.start();
}
function goNextLevel() {
  if (vstRunner) vstRunner.goNextLevel();
}
function finishSession() {
  disableUnloadWarning();
  clearProgress();
  clearItemOrder();
  addStoredId(state.participant.student_id);
  showResult();
}
// 指定ミリ秒だけ待つ
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function showResult() {
  show('s-result');
  // 研究版: スコアは受験者に表示しない（裏で計算し、CSVに記録・GASに送信される）
  // テスト終了と同時にGASへ自動送信
  autoSendToGAS();
}

async function autoSendToGAS() {
  const statusEl = document.getElementById('gas-status');
  const restartBtn = document.getElementById('restart-btn');
  const manualCard = document.getElementById('manual-download-card');
  // 送信中は「最初に戻る」ボタンと手動ダウンロードカードを隠す
  if (restartBtn) restartBtn.style.display = 'none';
  if (manualCard) manualCard.style.display = 'none';
  if (statusEl) {
    statusEl.className = 'gas-status sending';
    statusEl.textContent = '⏳ データを送信中です。しばらくお待ちください…';
  }
  try {
    await sendToGAS();
    if (statusEl) {
      statusEl.className = 'gas-status done';
      statusEl.textContent = '✅ データの送信が完了しました。試験監督者の指示をお待ちください。';
    }
    // 成功時は手動ダウンロードカードは出さない
  } catch (err) {
    console.error('GAS送信エラー:', err);
    if (statusEl) {
      statusEl.className = 'gas-status error';
      statusEl.textContent = '⚠ 送信に失敗しました。試験監督者にお知らせください。';
    }
    // 失敗時だけ手動ダウンロードカードを表示
    if (manualCard) manualCard.style.display = '';
  } finally {
    // 送信処理が終わったら「最初に戻る」ボタンを表示
    if (restartBtn) restartBtn.style.display = '';
  }
}
// 各問題の見出しキーを「L{level}_{レベル内連番2桁}_{意味}」形式で作る
function buildItemColumnKeys() {
  // vstItems を id 順（正規順）に並べる
  const sorted = [...vstItems].sort((a, b) => a.id - b.id);
  // レベルごとの連番を振るためのカウンタ
  const levelCounter = {};
  return sorted.map(item => {
    const lv = item.level;
    levelCounter[lv] = (levelCounter[lv] || 0) + 1;
    const seq = String(levelCounter[lv]).padStart(2, '0');
    // 意味は前後の空白を除去（見出しを整える）
    const meaning = (item.meaning_ja || '').trim();
    return {
      id: item.id,
      key: `L${lv}_${seq}_${meaning}`,
    };
  });
}
// GAS(Googleスプレッドシート)へサマリーデータを自動送信する
async function sendToGAS() {
  // 送信するデータを1つのオブジェクトにまとめる（サマリーCSVと同じ内容）
  const v = state.vstResult || {};
  const q = state.qualityData || {};
  const b = state.browserInfo || {};
  const p = state.participant;
  const s = state.session;
// 受験者の回答を item_id で引けるようにする（resultsは出題順なので）
  const trials = state.vstRawTrials || [];
  const byItemId = {};
  for (const t of trials) {
    byItemId[t.item_id] = t;
  }
  // 各問題の見出しキー（正規順）
  const itemKeys = buildItemColumnKeys();
  // 正誤（正解1/不正解0/未回答0）と 位置番号（0〜3、未回答は空）を正規順で作る
  const correctByItem = {};   // メインシート用
  const positionByItem = {};  // 2枚目シート用
  for (const { id, key } of itemKeys) {
    const t = byItemId[id];
    if (t && t.response_position !== '' && t.response_position !== null && t.response_position !== undefined) {
      // 回答あり
      correctByItem[key] = t.is_correct ? 1 : 0;
      positionByItem[key] = t.response_position;
    } else {
      // 未回答（時間切れ等）
      correctByItem[key] = 0;
      positionByItem[key] = '';
    }
  }
  const payload = {
    participant_id: p.id || '',
    student_id: p.student_id || '',
    name: p.name || '',
    department: p.department || '',
    test_version: s.test_version || '',
    test_datetime: s.start_time || '',
    device_type: s.device_type || b.device_type || '',
    consent_agreed: s.consent_agreed ? 1 : 0,
    consent_timestamp: s.consent_timestamp || '',
    data_sharing_agreed: s.data_sharing_agreed ? 1 : 0,
    browser_user_agent: b.user_agent || '',
    browser_platform: b.platform || '',
    browser_language: b.language || '',
    browser_timezone: b.timezone || '',
    screen_width: b.screen_width || '',
    screen_height: b.screen_height || '',
    vst_raw_score: v.raw_score ?? '',
    vst_total_items: v.total_items ?? '',
    vst_accuracy_percent: v.accuracy_percent ?? '',
    vst_irt_theta: v.irt_theta ?? '',
    vst_standard_error: v.standard_error ?? '',
    vst_estimated_vocab_size: v.estimated_vocab_size ?? '',
    quality_focus_loss_count: q.focus_loss_count ?? 0,
    quality_focus_loss_total_ms: q.focus_loss_total_ms ?? 0,
    quality_total_duration_ms: q.total_duration_ms ?? '',
    quality_total_duration_sec: q.total_duration_ms ? Math.round(q.total_duration_ms / 1000) : '',
    reload_count: q.reload_count ?? 0,
  };

  // レベル別の正答数と所要時間も追加
  if (v.correct_by_level) {
    for (let lv = 1; lv <= 8; lv++) {
      payload[`vst_level_${lv}_correct`] = v.correct_by_level[`level_${lv}`] ?? '';
    }
  }
  // レベル別の推定語彙サイズも追加
  if (v.vocab_size_by_level) {
    for (let lv = 1; lv <= 8; lv++) {
      payload[`vst_level_${lv}_vocab`] = v.vocab_size_by_level[`level_${lv}`] ?? '';
    }
  }
  if (q.level_durations_ms) {
    for (let lv = 1; lv <= 8; lv++) {
      const ms = q.level_durations_ms[lv];
      payload[`level_${lv}_duration_sec`] = (ms !== undefined) ? Math.round(ms / 1000) : '';
    }
  }
  // 各問題の正誤（正解1/不正解0/未回答0）をメインシートに追加（level_8_duration_sec の後）
  for (const { key } of itemKeys) {
    payload[key] = correctByItem[key];
  }
// summaryとtrialsのCSVの中身も送る（GAS側でドライブに保存しリンク化する）
  payload.summary_csv_content = buildSummaryCSV(
    state.participant, state.session, state.vstResult, state.browserInfo, state.qualityData
  );
  payload.summary_csv_filename = makeFilename(state.participant, state.session, 'summary');
  if (state.vstResult) {
    payload.trials_csv_content = buildVstTrialsCSV(
      state.participant, state.session, state.vstRawTrials
    );
    payload.trials_csv_filename = makeFilename(state.participant, state.session, 'trials');
    
  }
  // 2枚目のシート（回答位置）用のデータを別途添付
  payload.position_sheet = {
    participant_id: p.id || '',
    student_id: p.student_id || '',
    name: p.name || '',
    test_datetime: s.start_time || '',
    positions: positionByItem,
  };
// 送信を少しずらす（80人同時送信のピークを分散させるため、0〜2秒のランダム待機）
  const jitter = Math.floor(Math.random() * 2000);
  await sleep(jitter);

  // 失敗したら少し待って再試行する（最大3回）
  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      });
      const result = await response.json();
      if (!result || result.result !== 'success') {
        throw new Error('GAS returned non-success: ' + JSON.stringify(result));
      }
      return result; // 成功したら終わり
    } catch (err) {
      lastError = err;
      console.warn(`GAS送信 試行${attempt}/${maxAttempts} 失敗:`, err);
      if (attempt < maxAttempts) {
        // 再試行前に待つ（回を追うごとに長く: 1秒, 2秒）
        await sleep(attempt * 1000);
      }
    }
  }
  // 全試行が失敗
  throw lastError;
}
function buildAllCsvBlobs() {
  const blobs = [];
  if (state.vstResult) {
    blobs.push({
      filename: makeFilename(state.participant, state.session, 'vst_trials'),
      content: buildVstTrialsCSV(state.participant, state.session, state.vstRawTrials),
    });
  }
  blobs.push({
    filename: makeFilename(state.participant, state.session, 'summary'),
    content: buildSummaryCSV(state.participant, state.session, state.vstResult, state.browserInfo, state.qualityData),
  });
  return blobs;
}

function exportVstTrials() {
  if (!state.vstResult) return;
  const csv = buildVstTrialsCSV(state.participant, state.session, state.vstRawTrials);
  downloadCSV(makeFilename(state.participant, state.session, 'vst_trials'), csv);
  toast('VST試行データをダウンロードしました');
}

function exportSummary() {
  const csv = buildSummaryCSV(state.participant, state.session, state.vstResult, state.browserInfo, state.qualityData);
  downloadCSV(makeFilename(state.participant, state.session, 'summary'), csv);
  toast('集計データをダウンロードしました');
}

function sendDataByEmail() {
  const blobs = buildAllCsvBlobs();
  sendByEmail(RESEARCHER_EMAIL, state.participant, state.session, blobs);
  toast('CSVをダウンロード後、メールアプリが起動します');
}

async function shareDataViaApps() {
  try {
    const blobs = buildAllCsvBlobs();
    await shareViaWebShareAPI(state.participant, state.session, blobs);
    toast('共有が完了しました');
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('共有エラー:', err);
    toast('共有に失敗しました');
  }
}

function restart() {
  clearProgress();
  clearItemOrder();
  disableUnloadWarning();
  Object.assign(state, {
    participant: {}, session: {},
    vstResult: null, vstRawTrials: [],
    qualityData: null,
  });
  const fieldsToReset = ['f-student-id', 'f-name'];
  fieldsToReset.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
 const selectsToReset = ['f-department'];
  selectsToReset.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const btn = document.getElementById('info-btn');
  if (btn) btn.disabled = true;
  show('s-consent');
  const understandChk = document.getElementById('vst-understand');
  if (understandChk) understandChk.checked = false;
  const vstStartBtn = document.getElementById('vst-start-btn');
  if (vstStartBtn) vstStartBtn.disabled = true;
}

window.checkConsentForm = checkConsentForm;
window.submitConsent = submitConsent;
window.checkInfoForm = checkInfoForm;
window.submitInfo = submitInfo;
window.startVst = startVst;
window.checkVstStart = checkVstStart;
window.goNextLevel = goNextLevel;
window.exportVstTrials = exportVstTrials;
window.exportSummary = exportSummary;
window.sendDataByEmail = sendDataByEmail;
window.shareDataViaApps = shareDataViaApps;
window.restart = restart;

state.browserInfo = detectBrowserInfo();
applyDeviceClass();

loadData().then(() => {
  const saved = loadProgress();
  const savedOrder = loadItemOrder();
  if (saved && saved.progress && saved.participant && savedOrder) {
    // リロードで戻ってきた → 出題順と状態を復元してテストを再開
    resumeFromSaved(saved, savedOrder);
  } else {
    show('s-consent');
  }
}).catch(err => {
  console.error('データ読み込みに失敗:', err);
  document.body.innerHTML = '<div style="padding:2rem;text-align:center;color:red">データの読み込みに失敗しました。</div>';
});

// 保存データからテストを復元して再開する
function resumeFromSaved(saved, savedOrder) {
  state.participant = saved.participant;
  state.session = saved.session;
  // 保存された出題順(item_idの配列)から、元データを使って同じ並びを再構築
  const itemMap = {};
  for (const it of vstItems) {
    itemMap[it.id] = it;
  }
  const items = savedOrder.map(id => itemMap[id]).filter(it => it !== undefined);
  // 念のため、復元した問題数が元と違う場合は復元せず最初から
  if (items.length !== vstItems.length) {
    console.warn('出題順の復元に失敗（問題数不一致）。最初から開始します。');
    clearProgress();
    clearItemOrder();
    show('s-consent');
    return;
  }
  const elements = {
    meaning: document.getElementById('vst-meaning'),
    pos: document.getElementById('vst-pos'),
    options: document.getElementById('vst-options'),
    timer: document.getElementById('vst-timer'),
    timeup: document.getElementById('vst-timeup'),
    questionArea: document.getElementById('vst-question-area'),
    wait: document.getElementById('vst-wait'),
    waitTitle: document.getElementById('vst-wait-title'),
    waitMsg: document.getElementById('vst-wait-msg'),
    nextBtn: document.getElementById('vst-next-btn'),
  };
  show('s-vst');
  enableUnloadWarning();
  vstRunner = new VstRunner(elements, items, {
    onProgress: (i, n, levelInfo) => {
      document.getElementById('vst-prog-fill').style.width = `${((i + 1) / n) * 100}%`;
      if (levelInfo) {
        document.getElementById('vst-prog-label').textContent =
          `レベル ${levelInfo.level} ・ ${levelInfo.positionInLevel} / ${levelInfo.levelTotal}`;
      } else {
        document.getElementById('vst-prog-label').textContent = `${i + 1} / ${n}`;
      }
    },
    onSaveProgress: (progressData) => {
      saveProgress(progressData);
    },
    onComplete: (results, quality) => {
      state.vstRawTrials = results;
      state.qualityData = quality;
      const issues = validateVstIntegrity(results);
      if (issues.length > 0) console.error('VST整合性エラー:', issues);
      state.vstResult = scoreVST(results, vstItems);
      finishSession();
    },
  });
  vstRunner.resume(saved.progress);
}
