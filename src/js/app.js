import { VstRunner, validateVstIntegrity } from './vst.js';
import { scoreVST } from './irt-scoring.js';
import {
  downloadCSV, buildVstTrialsCSV,
  buildSummaryCSV, makeFilename,
  sendByEmail, shareViaWebShareAPI
} from './csv-export.js';

const TEST_VERSION = 'VST-NJ8 comparison study v1.0';
const STORAGE_KEY = 'vstnj8_study_student_ids';

const RESEARCHER_EMAIL = 'd16638f2@stu.hokkyodai.ac.jp';
const RESEARCHER_NAME = '安藤 嘉';

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
  // 研究版: スコアは受験者に表示しない（裏で計算し、CSVには記録される）
  document.getElementById('researcher-email-display').textContent = RESEARCHER_EMAIL;
  document.getElementById('researcher-name-display').textContent = RESEARCHER_NAME;
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
