import { parseCSV, detectCsvType, parseSummaryCSV, isOutlier, calculateDescriptiveStats, buildMergedCSV } from './dashboard-stats.js';
import { drawHistogram } from './dashboard-charts.js';

// ★ アクセスパスワード（自分にしか分からないものに変更してください）
const DASHBOARD_PASSWORD = 'h1r0research2026';
const STORAGE_KEY = 'vstnj8_dashboard_participants';
const AUTH_KEY = 'vstnj8_dashboard_auth';

let participants = [];

function show(id) {
  document.querySelectorAll('.d-screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function checkAuth() {
  const pw = document.getElementById('auth-pw').value;
  if (pw === DASHBOARD_PASSWORD) {
    sessionStorage.setItem(AUTH_KEY, '1');
    loadStoredData();
    show('d-main');
    refreshAll();
  } else {
    alert('パスワードが違います');
  }
}

function logout() {
  sessionStorage.removeItem(AUTH_KEY);
  document.getElementById('auth-pw').value = '';
  show('d-auth');
}

function loadStoredData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) participants = JSON.parse(raw);
  } catch (e) {
    participants = [];
  }
}

function saveStoredData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(participants));
  } catch (e) {
    console.warn('localStorage 保存失敗', e);
  }
}

async function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.name.endsWith('.csv'));
  if (files.length === 0) {
    document.getElementById('upload-status').innerHTML = '<span class="error">CSVファイルが見つかりません</span>';
    return;
  }

  let summaryCount = 0;
  let otherCount = 0;

  for (const file of files) {
    const text = await file.text();
    const { headers, rows } = parseCSV(text);
    const type = detectCsvType(headers);

    if (type === 'summary') {
      const data = parseSummaryCSV(rows);
      const id = data.participant_id;
      if (!id) continue;
      const sessionKey = `${id}__${data.test_datetime}`;
      const existing = participants.find(p => p._key === sessionKey);
      if (existing) {
        Object.assign(existing, data);
      } else {
        participants.push({ _key: sessionKey, ...data });
      }
      summaryCount++;
    } else {
      otherCount++;
    }
  }

  saveStoredData();

  let statusMsg = `<span class="success">✓ 読み込み完了: サマリー ${summaryCount}件`;
  if (otherCount > 0) statusMsg += `（サマリー以外の ${otherCount}件はスキップ）`;
  statusMsg += `</span>`;
  document.getElementById('upload-status').innerHTML = statusMsg;

  refreshAll();
  toast(`${summaryCount}件のサマリーデータを取り込みました`);
}

function setupUploadZone() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => handleFiles(e.target.files));

  ['dragover', 'dragenter'].forEach(evt => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(evt => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
    });
  });
  zone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
}

function refreshAll() {
  refreshStats();
  refreshCharts();
  refreshTable();
}

function refreshStats() {
  document.getElementById('stat-n').textContent = participants.length;

  const vocabStats = calculateDescriptiveStats(participants, 'vst_estimated_vocab_size');
  const thetaStats = calculateDescriptiveStats(participants, 'vst_irt_theta');
  const accStats = calculateDescriptiveStats(participants, 'vst_accuracy_percent');

  const fmtBox = (v, d = 0) => v === null ? '—' : v.toFixed(d);
  document.getElementById('stat-vocab-mean').textContent = fmtBox(vocabStats.mean, 0);
  document.getElementById('stat-theta-mean').textContent = fmtBox(thetaStats.mean, 2);
  document.getElementById('stat-acc-mean').textContent = accStats.mean === null ? '—' : fmtBox(accStats.mean, 1) + '%';

  const container = document.getElementById('descriptive-stats');
  if (participants.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#888;padding:1rem">データがありません</p>';
    return;
  }

  const seStats = calculateDescriptiveStats(participants, 'vst_standard_error');
  const fmt = (v, d = 1) => v === null ? '—' : v.toFixed(d);

  container.innerHTML = `
    <div class="desc-stat-row header">
      <div></div><div>n</div><div>平均</div><div>SD</div><div>中央値</div><div>範囲</div>
    </div>
    <div class="desc-stat-row">
      <div class="label">語彙サイズ</div>
      <div>${vocabStats.n}</div>
      <div>${fmt(vocabStats.mean, 0)}</div>
      <div>${fmt(vocabStats.sd, 0)}</div>
      <div>${fmt(vocabStats.median, 0)}</div>
      <div>${fmt(vocabStats.min, 0)} – ${fmt(vocabStats.max, 0)}</div>
    </div>
    <div class="desc-stat-row">
      <div class="label">IRT θ</div>
      <div>${thetaStats.n}</div>
      <div>${fmt(thetaStats.mean, 2)}</div>
      <div>${fmt(thetaStats.sd, 2)}</div>
      <div>${fmt(thetaStats.median, 2)}</div>
      <div>${fmt(thetaStats.min, 2)} – ${fmt(thetaStats.max, 2)}</div>
    </div>
    <div class="desc-stat-row">
      <div class="label">正答率 (%)</div>
      <div>${accStats.n}</div>
      <div>${fmt(accStats.mean, 1)}</div>
      <div>${fmt(accStats.sd, 1)}</div>
      <div>${fmt(accStats.median, 1)}</div>
      <div>${fmt(accStats.min, 1)} – ${fmt(accStats.max, 1)}</div>
    </div>
    <div class="desc-stat-row">
      <div class="label">SE</div>
      <div>${seStats.n}</div>
      <div>${fmt(seStats.mean, 3)}</div>
      <div>${fmt(seStats.sd, 3)}</div>
      <div>${fmt(seStats.median, 3)}</div>
      <div>${fmt(seStats.min, 3)} – ${fmt(seStats.max, 3)}</div>
    </div>
  `;
}

function refreshCharts() {
  const vocabValues = participants.map(p => parseFloat(p.vst_estimated_vocab_size)).filter(v => !isNaN(v));
  drawHistogram('chart-vocab-hist', vocabValues, { xLabel: '推定語彙サイズ', color: '#0f6e56' });

  const thetaValues = participants.map(p => parseFloat(p.vst_irt_theta)).filter(v => !isNaN(v));
  drawHistogram('chart-theta-hist', thetaValues, { xLabel: 'IRT θ', color: '#185fa5' });
}

function refreshTable() {
  applyFilter();
}

function applyFilter() {
  const filterText = (document.getElementById('filter-input').value || '').toLowerCase();
  const onlyOutliers = document.getElementById('filter-outliers').checked;

  const tbody = document.getElementById('participants-tbody');
  tbody.innerHTML = '';

  const filtered = participants.filter(p => {
    if (filterText && !(p.participant_id || '').toLowerCase().includes(filterText)) return false;
    const out = isOutlier(p);
    if (onlyOutliers && !out.outlier) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#888">該当する受験者がいません</td></tr>';
    return;
  }

  for (const p of filtered) {
    const out = isOutlier(p);
    const tr = document.createElement('tr');
    if (out.outlier) tr.className = 'outlier';

    const datetime = p.test_datetime ? p.test_datetime.slice(0, 16).replace('T', ' ') : '—';

    tr.innerHTML = `
      <td><b>${p.participant_id || '—'}</b></td>
      <td>${p.age || '—'}</td>
      <td>${p.gender || '—'}</td>
      <td>${p.vst_accuracy_percent ? p.vst_accuracy_percent + '%' : '—'}</td>
      <td>${p.vst_estimated_vocab_size || '—'}</td>
      <td>${p.vst_irt_theta || '—'}</td>
      <td>${p.vst_standard_error || '—'}</td>
      <td>${datetime}</td>
      <td>${out.outlier ? `<span class="badge badge-outlier" title="${out.reason}">⚠ 要確認</span>` : '<span class="badge badge-ok">✓</span>'}</td>
    `;
    tbody.appendChild(tr);
  }
}

function exportMergedCSV() {
  if (participants.length === 0) {
    alert('エクスポートするデータがありません');
    return;
  }
  const csv = buildMergedCSV(participants);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.href = url;
  a.download = `VST-NJ8_merged_${date}_n${participants.length}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`${participants.length}件の集約CSVをダウンロードしました`);
}

function clearAllData() {
  if (!confirm(`本当に全データ (${participants.length}件) を削除しますか？\nこの操作は取り消せません。`)) return;
  if (!confirm('最終確認: 本当に削除しますか？')) return;
  participants = [];
  localStorage.removeItem(STORAGE_KEY);
  refreshAll();
  document.getElementById('upload-status').innerHTML = '<span class="success">全データを削除しました</span>';
  toast('全データを削除しました');
}

window.checkAuth = checkAuth;
window.logout = logout;
window.applyFilter = applyFilter;
window.exportMergedCSV = exportMergedCSV;
window.clearAllData = clearAllData;

setupUploadZone();

if (sessionStorage.getItem(AUTH_KEY) === '1') {
  loadStoredData();
  show('d-main');
  refreshAll();
}
