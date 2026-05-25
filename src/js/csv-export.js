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
    'participant_id', 'age', 'gender', 'l1', 'learning_years',
    'institution_type', 'major', 'grade',
    'english_start_age', 'overseas_experience',
    'cert_type', 'cert_score', 'cert_date',
    'english_use_frequency', 'handedness',
    'condition_rating', 'device_type', 'environment_type'
  ];
}

function participantValues(p) {
  return [
    p.id, p.age, p.gender, p.l1, p.learning_years,
    p.institution_type || '', p.major || '', p.grade || '',
    p.english_start_age || '', p.overseas_experience || '',
    p.cert_type || '', p.cert_score || '', p.cert_date || '',
    p.english_use_frequency || '', p.handedness || '',
    p.condition_rating || '', p.device_type || '', p.environment_type || ''
  ];
}

export function buildCelpTrialsCSV(participant, session, mainTrials, practiceTrials = []) {
  const pHeaders = participantHeaders();
  const headers = [
    ...pHeaders,
    'test_version', 'mode', 'cefr_level', 'test_datetime',
    'fixation_ms', 'prime_ms', 'blank_ms',
    'phase', 'trial_num', 'prime', 'target', 'condition',
    'response', 'is_correct', 'rt_ms', 'exclude_reason',
    'fix_actual_ms', 'prime_actual_ms', 'blank_actual_ms',
    'fix_deviation_ms', 'prime_deviation_ms', 'blank_deviation_ms',
    'target_onset_ms'
  ];
  const rows = [headers.join(',')];
  const pValues = participantValues(participant);
  for (const t of practiceTrials) {
    const row = [
      ...pValues,
      session.test_version, session.mode, session.cefr_level,
      session.start_time, session.fixation_ms, session.prime_ms,
      session.blank_ms, 'practice', t.trial_num, t.prime, t.target, t.condition,
      t.response, t.is_correct ? 1 : 0, t.rt_ms, '',
      t.fix_actual_ms || '', t.prime_actual_ms || '', t.blank_actual_ms || '',
      t.fix_deviation_ms || '', t.prime_deviation_ms || '', t.blank_deviation_ms || '',
      t.target_onset_ms || ''
    ];
    rows.push(row.map(csvEscape).join(','));
  }
  for (const t of mainTrials) {
    const row = [
      ...pValues,
      session.test_version, session.mode, session.cefr_level,
      session.start_time, session.fixation_ms, session.prime_ms,
      session.blank_ms, 'main', t.trial_num, t.prime, t.target, t.condition,
      t.response, t.is_correct ? 1 : 0, t.rt_ms, t.exclude_reason || '',
      t.fix_actual_ms || '', t.prime_actual_ms || '', t.blank_actual_ms || '',
      t.fix_deviation_ms || '', t.prime_deviation_ms || '', t.blank_deviation_ms || '',
      t.target_onset_ms || ''
    ];
    rows.push(row.map(csvEscape).join(','));
  }
  return rows.join('\n');
}

export function buildVstTrialsCSV(participant, session, trials) {
  const pHeaders = participantHeaders();
  const headers = [
    ...pHeaders,
    'test_version', 'mode', 'test_datetime',
    'item_id', 'level', 'pos', 'target_meaning_ja', 'correct_word',
    'option_pos_0', 'option_pos_1', 'option_pos_2', 'option_pos_3',
    'response_position', 'response_word', 'is_correct', 'response_time_ms'
  ];
  const rows = [headers.join(',')];
  const pValues = participantValues(participant);
  for (const t of trials) {
    const row = [
      ...pValues,
      session.test_version, session.mode, session.start_time,
      t.item_id, t.level, t.pos, t.target_meaning_ja, t.correct_word,
      t.displayed_options[0], t.displayed_options[1],
      t.displayed_options[2], t.displayed_options[3],
      t.response_position, t.response_word,
      t.is_correct ? 1 : 0, t.response_time_ms
    ];
    rows.push(row.map(csvEscape).join(','));
  }
  return rows.join('\n');
}

export function buildSummaryCSV(participant, session, celpResult, vstResult, practiceStats, browserInfo) {
  const headers = ['key', 'value'];
  const rows = [headers.join(',')];
  const data = [
    ['participant_id', participant.id],
    ['age', participant.age],
    ['gender', participant.gender],
    ['l1', participant.l1],
    ['learning_years', participant.learning_years],
    ['institution_type', participant.institution_type || ''],
    ['major', participant.major || ''],
    ['grade', participant.grade || ''],
    ['english_start_age', participant.english_start_age || ''],
    ['overseas_experience', participant.overseas_experience || ''],
    ['cert_type', participant.cert_type || ''],
    ['cert_score', participant.cert_score || ''],
    ['cert_date', participant.cert_date || ''],
    ['english_use_frequency', participant.english_use_frequency || ''],
    ['handedness', participant.handedness || ''],
    ['condition_rating', participant.condition_rating || ''],
    ['device_type', participant.device_type || ''],
    ['environment_type', participant.environment_type || ''],
    ['test_version', session.test_version],
    ['mode', session.mode],
    ['test_datetime', session.start_time],
    ['consent_agreed', session.consent_agreed ? 1 : 0],
    ['consent_timestamp', session.consent_timestamp || ''],
    ['data_sharing_agreed', session.data_sharing_agreed ? 1 : 0],
  ];
  if (session.timer_precision) {
    data.push(
      ['timer_resolution_ms', session.timer_precision.resolution_ms],
      ['timer_sample_count', session.timer_precision.sample_count],
    );
  }
  if (session.timing_precision) {
    const tp = session.timing_precision;
    data.push(
      ['precision_fix_mean_deviation_ms', Math.round(tp.fixation.mean * 100) / 100],
      ['precision_fix_max_deviation_ms', Math.round(tp.fixation.max * 100) / 100],
      ['precision_prime_mean_deviation_ms', Math.round(tp.prime.mean * 100) / 100],
      ['precision_prime_max_deviation_ms', Math.round(tp.prime.max * 100) / 100],
      ['precision_blank_mean_deviation_ms', Math.round(tp.blank.mean * 100) / 100],
      ['precision_blank_max_deviation_ms', Math.round(tp.blank.max * 100) / 100],
      ['precision_trials_above_50ms', tp.prime.above_50ms],
      ['precision_trials_above_100ms', tp.prime.above_100ms],
    );
  }
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
  if (practiceStats) {
    data.push(
      ['celp_practice_total', practiceStats.total],
      ['celp_practice_correct', practiceStats.correct],
      ['celp_practice_accuracy_percent', practiceStats.accuracy],
      ['celp_practice_mean_rt_ms', practiceStats.mean_rt],
    );
  }
  if (celpResult) {
    data.push(
      ['celp_cefr_level', session.cefr_level],
      ['celp_total_trials', celpResult.total],
      ['celp_n_wrong', celpResult.n_wrong],
      ['celp_n_fast', celpResult.n_fast],
      ['celp_n_outlier', celpResult.n_outlier],
      ['celp_n_valid', celpResult.n_valid],
      ['celp_acrrt_ms', celpResult.acrrt],
      ['celp_sd_ms', celpResult.sd],
      ['celp_cv_percent', celpResult.cv],
      ['celp_synonym_mean_ms', celpResult.syn_mean],
      ['celp_nonsynonym_mean_ms', celpResult.nsyn_mean],
      ['celp_priming_effect_ms', celpResult.priming_effect],
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
  const id = participant.id || 'anonymous';
  return `NeoCELP-VST_${id}_${session.mode}_${timestamp}_${type}.csv`;
}

export function sendByEmail(recipientEmail, participant, session, csvBlobs) {
  const subject = `NeoCELP-VST テスト結果 (${participant.id} / ${session.mode})`;
  const bodyLines = [
    `お世話になっております。`,
    ``,
    `NeoCELP & NeoVST-NJ8 のテスト結果を送付いたします。`,
    ``,
    `■ 受験者情報`,
    `  ID: ${participant.id}`,
    `  モード: ${session.mode}`,
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
  bodyLines.push(`このメールは NeoCELP & NeoVST-NJ8 システムから自動生成されました。`);

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
    title: `NeoCELP-VST テスト結果 (${participant.id})`,
    text: `NeoCELP & NeoVST-NJ8 テスト結果\n受験者ID: ${participant.id}\nモード: ${session.mode}\n受験日時: ${session.start_time}`,
    files: files,
  };

  if (!navigator.canShare(shareData)) {
    throw new Error('このデバイスではファイル共有がサポートされていません');
  }

  await navigator.share(shareData);
}
