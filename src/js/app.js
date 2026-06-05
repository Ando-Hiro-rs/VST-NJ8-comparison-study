import { VstRunner, validateVstIntegrity } from './vst.js';
import { scoreVST } from './irt-scoring.js';
import {
  downloadCSV, buildVstTrialsCSV,
  buildSummaryCSV, makeFilename,
  sendByEmail, shareViaWebShareAPI
} from './csv-export.js';

const TEST_VERSION = 'VST-NJ8 comparison study v1.0';
const STORAGE_KEY = 'vstnj8_study_student_ids';

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
    const shareEl = document.getElementById('consent-share');
    state.session.data_sharing_agreed = shareEl ? shareEl.checked : false;
    show('s-info');
  } catch (err) {
    console.error('同意処理でエラー:', err);
    alert('画面遷移でエラーが発生しました。ページをリロードして再試行してください。');
  }
}

function checkInfoForm() {
  const sidEl = document.getElementById('f-student-id');
  const weekdayEl = document.getElementById('f-weekday');
  const deptEl = document.getElementById('f-department');
  const btn = document.getElementById('info-btn');
  if (!sidEl || !weekdayEl || !deptEl || !btn) {
    console.error('受験者情報フォームの要素が見つかりません', { sidEl, weekdayEl, deptEl, btn });
    return;
  }
  const sid = sidEl.value.trim();
  const weekday = weekdayEl.value;
  const dept = deptEl.value;
  btn.disabled = !(sid.length > 0 && weekday && dept);
}

function submitInfo() {
  const sid = document.getElementById('f-student-id').value.trim();
  const nameEl = document.getElementById('f-name');
  const weekday = document.getElementById('f-weekday').value;
  const dept = document.getElementById('f-department').value;
  if (sid.length === 0 || !weekday || !dept) {
    alert('学籍番号・曜日・学科は必須です。');
    return;
  }
  state.participant = {
    id: sid,
    student_id: sid,
    name: nameEl ? nameEl.value.trim() : '',
    weekday: weekday,
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
  const elements = {
    meaning: document.getElementById('vst-meaning'),
    pos: document.getElementById('vst-pos'),
    options: document.getElementById('vst-options'),
    timer: document.getElementById('vst-timer'),
    timeup: document.getElementById('vst-timeup'),
  };
  show('s-vst');
  vstRunner = new VstRunner(elements, items, {
    onProgress: (i, n) => {
      document.getElementById('vst-prog-fill').style.width = `${(i / n) * 100}%`;
      document.getElementById('vst-prog-label').textContent = `${i} / ${n}`;
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

function finishSession() {
  addStoredId(state.participant.student_id);
  showResult();
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

// GAS(Googleスプレッドシート)へサマリーデータを自動送信する
async function sendToGAS() {
  // 送信するデータを1つのオブジェクトにまとめる（サマリーCSVと同じ内容）
  const v = state.vstResult || {};
  const q = state.qualityData || {};
  const b = state.browserInfo || {};
  const p = state.participant;
  const s = state.session;

  const payload = {
    participant_id: p.id || '',
    student_id: p.student_id || '',
    name: p.name || '',
    weekday: p.weekday || '',
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
  };

  // レベル別の正答数と所要時間も追加
  if (v.correct_by_level) {
    for (let lv = 1; lv <= 8; lv++) {
      payload[`vst_level_${lv}_correct`] = v.correct_by_level[`level_${lv}`] ?? '';
    }
  }
  if (q.level_durations_ms) {
    for (let lv = 1; lv <= 8; lv++) {
      const ms = q.level_durations_ms[lv];
      payload[`level_${lv}_duration_sec`] = (ms !== undefined) ? Math.round(ms / 1000) : '';
    }
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
// GASへ送信し、返事(成功/失敗)を受け取る
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
  return result;
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
  const selectsToReset = ['f-weekday', 'f-department'];
  selectsToReset.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const btn = document.getElementById('info-btn');
  if (btn) btn.disabled = true;
  show('s-consent');
}

window.checkConsentForm = checkConsentForm;
window.submitConsent = submitConsent;
window.checkInfoForm = checkInfoForm;
window.submitInfo = submitInfo;
window.startVst = startVst;
window.exportVstTrials = exportVstTrials;
window.exportSummary = exportSummary;
window.sendDataByEmail = sendDataByEmail;
window.shareDataViaApps = shareDataViaApps;
window.restart = restart;

state.browserInfo = detectBrowserInfo();
applyDeviceClass();

loadData().then(() => {
  show('s-consent');
}).catch(err => {
  console.error('データ読み込みに失敗:', err);
  document.body.innerHTML = '<div style="padding:2rem;text-align:center;color:red">データの読み込みに失敗しました。</div>';
});
