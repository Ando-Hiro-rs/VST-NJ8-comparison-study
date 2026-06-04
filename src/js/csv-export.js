export function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function downloadCSV(filename, csv) {
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function participantHeaders() {
  return [
    'participant_id', 'student_id', 'name', 'weekday', 'department'
  ];
}

function participantValues(p) {
  return [
    p.id, p.student_id || '', p.name || '', p.weekday || '', p.department || ''
  ];
}

export function buildVstTrialsCSV(participant, session, trials) {
  const pHeaders = participantHeaders();
  const headers = [
    ...pHeaders,
    'test_version', 'test_datetime', 'device_type',
    'item_id', 'level', 'pos', 'target_meaning_ja', 'correct_word',
    'option_pos_0', 'option_pos_1', 'option_pos_2', 'option_pos_3',
    'response_position', 'response_word', 'is_correct', 'response_time_ms', 'note'
  ];
  const rows = [headers.join(',')];
  const pValues = participantValues(participant);
  const device = session.device_type || '';
  for (const t of trials) {
    const row = [
      ...pValues,
      session.test_version, session.start_time, device,
      t.item_id, t.level, t.pos, t.target_meaning_ja, t.correct_word,
      t.displayed_options[0], t.displayed_options[1],
      t.displayed_options[2], t.displayed_options[3],
      t.response_position, t.response_word,
      t.is_correct ? 1 : 0, t.response_time_ms, t.note || ''
    ];
    rows.push(row.map(csvEscape).join(','));
  }
  return rows.join('\n');
}

export function buildSummaryCSV(participant, session, vstResult, browserInfo, qualityData) {
  const headers = ['key', 'value'];
  const rows = [headers.join(',')];
  const data = [
    ['participant_id', participant.id],
    ['student_id', participant.student_id || ''],
    ['name', participant.name || ''],
    ['weekday', participant.weekday || ''],
    ['department', participant.department || ''],
    ['test_version', session.test_version],
    ['test_datetime', session.start_time],
    ['device_type', session.device_type || (browserInfo ? browserInfo.device_type : '')],
    ['consent_agreed', session.consent_agreed ? 1 : 0],
    ['consent_timestamp', session.consent_timestamp || ''],
    ['data_sharing_agreed', session.data_sharing_agreed ? 1 : 0],
  ];
  if (browserInfo) {
    data.push(
      ['browser_user_agent', browserInfo.user_agent],
      ['browser_platform', browserInfo.platform],
      ['browser_language', browserInfo.language],
      ['browser_timezone', browserInfo.timezone],
      ['screen_width', browserInfo.screen_width],
      ['screen_height', browserInfo.screen_height],
      ['screen_color_depth', browserInfo.color_depth],
      ['device_pixel_ratio', browserInfo.pixel_ratio],
      ['device_type', browserInfo.device_type],
      ['touch_support', browserInfo.touch_support ? 1 : 0],
    );
  }
  if (vstResult) {
    data.push(
      ['vst_raw_score', vstResult.raw_score],
      ['vst_total_items', vstResult.total_items],
      ['vst_accuracy_percent', vstResult.accuracy_percent],
      ['vst_irt_theta', vstResult.irt_theta],
      ['vst_standard_error', vstResult.standard_error],
      ['vst_estimated_vocab_size', vstResult.estimated_vocab_size],
    );
    for (let lv = 1; lv <= 8; lv++) {
      data.push([`vst_level_${lv}_correct`, vstResult.correct_by_level[`level_${lv}`]]);
      data.push([`vst_level_${lv}_estimated_words`, vstResult.vocab_size_by_level[`level_${lv}`]]);
    }
  }
  if (qualityData) {
    const totalSec = qualityData.total_duration_ms
      ? Math.round(qualityData.total_duration_ms / 1000) : '';
    const lossSec = qualityData.focus_loss_total_ms
      ? Math.round(qualityData.focus_loss_total_ms / 1000) : 0;
    data.push(
      ['quality_focus_loss_count', qualityData.focus_loss_count ?? 0],
      ['quality_focus_loss_total_ms', qualityData.focus_loss_total_ms ?? 0],
      ['quality_focus_loss_total_sec', lossSec],
      ['quality_total_duration_ms', qualityData.total_duration_ms ?? ''],
      ['quality_total_duration_sec', totalSec],
    );
  }
  for (const [k, v] of data) {
    rows.push([csvEscape(k), csvEscape(v)].join(','));
  }
  return rows.join('\n');
}

export function makeFilename(participant, session, type) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${y}${m}${d}_${hh}${mm}${ss}`;
  const id = participant.student_id || participant.id || 'anonymous';
  return `VST-NJ8_${id}_${timestamp}_${type}.csv`;
}

export function sendByEmail(recipientEmail, participant, session, csvBlobs) {
  const subject = `VST-NJ8 テスト結果 (${participant.student_id || participant.id})`;
  const bodyLines = [
    `お世話になっております。`,
    ``,
    `VST-NJ8 のテスト結果を送付いたします。`,
    ``,
    `■ 受験者情報`,
    `  学籍番号: ${participant.student_id || participant.id}`,
    `  受験日時: ${session.start_time}`,
    ``,
    `■ 添付ファイル`,
    `  以下の CSV ファイルが添付されています:`,
  ];
  for (const blob of csvBlobs) {
    bodyLines.push(`  - ${blob.filename}`);
  }
  bodyLines.push(``);
  bodyLines.push(`本メールにファイルが添付されていない場合は、お手数ですがダウンロードしたファイルを手動で添付してください。`);
  bodyLines.push(``);
  bodyLines.push(`---`);
  bodyLines.push(`このメールは VST-NJ8 システムから自動生成されました。`);

  const body = bodyLines.join('\n');
  const mailtoUrl = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  for (const blob of csvBlobs) {
    downloadCSV(blob.filename, blob.content);
  }

  setTimeout(() => {
    window.location.href = mailtoUrl;
  }, 500);
}

export async function shareViaWebShareAPI(participant, session, csvBlobs) {
  if (!navigator.share || !navigator.canShare) {
    throw new Error('お使いのブラウザは共有機能に対応していません');
  }
  const files = csvBlobs.map(blob => {
    const bom = '\uFEFF';
    const fileContent = bom + blob.content;
    return new File([fileContent], blob.filename, { type: 'text/csv' });
  });
  const shareData = {
    title: `VST-NJ8 テスト結果 (${participant.student_id || participant.id})`,
    text: `VST-NJ8 テスト結果\n学籍番号: ${participant.student_id || participant.id}\n受験日時: ${session.start_time}`,
    files: files,
  };
  if (!navigator.canShare(shareData)) {
    throw new Error('このデバイスではファイル共有がサポートされていません');
  }
  await navigator.share(shareData);
}
