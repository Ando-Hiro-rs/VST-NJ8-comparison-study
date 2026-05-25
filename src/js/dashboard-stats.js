export function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
  return { headers, rows };
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && inQuote && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (c === '"') {
      inQuote = !inQuote;
    } else if (c === ',' && !inQuote) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

export function detectCsvType(headers) {
  if (headers.includes('prime') && headers.includes('target')) return 'celp';
  if (headers.includes('item_id') && headers.includes('correct_word')) return 'vst';
  if (headers.includes('key') && headers.includes('value')) return 'summary';
  return 'unknown';
}

export function parseSummaryCSV(rows) {
  const data = {};
  for (const row of rows) {
    data[row.key] = row.value;
  }
  return data;
}

export function mean(arr) {
  const nums = arr.filter(v => !isNaN(v) && v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

export function sd(arr) {
  const nums = arr.filter(v => !isNaN(v) && v !== null);
  if (nums.length < 2) return null;
  const m = mean(nums);
  return Math.sqrt(nums.reduce((s, v) => s + (v - m) ** 2, 0) / (nums.length - 1));
}

export function median(arr) {
  const nums = arr.filter(v => !isNaN(v) && v !== null).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

export function minOf(arr) {
  const nums = arr.filter(v => !isNaN(v) && v !== null);
  return nums.length === 0 ? null : Math.min(...nums);
}

export function maxOf(arr) {
  const nums = arr.filter(v => !isNaN(v) && v !== null);
  return nums.length === 0 ? null : Math.max(...nums);
}

export function isOutlier(participant) {
  if (participant.celp_acrrt_ms) {
    const acrrt = parseFloat(participant.celp_acrrt_ms);
    if (acrrt > 2000) return { outlier: true, reason: 'ACRRT > 2000ms' };
  }
  if (participant.celp_cv_percent) {
    const cv = parseFloat(participant.celp_cv_percent);
    if (cv > 60) return { outlier: true, reason: 'CV > 60%' };
  }
  if (participant.celp_total_trials && participant.celp_n_valid) {
    const validRate = parseInt(participant.celp_n_valid) / parseInt(participant.celp_total_trials);
    if (validRate < 0.70) return { outlier: true, reason: 'Valid rate < 70%' };
  }
  return { outlier: false, reason: '' };
}

export function calculateDescriptiveStats(participants, key) {
  const values = participants.map(p => parseFloat(p[key])).filter(v => !isNaN(v));
  return {
    n: values.length,
    mean: mean(values),
    sd: sd(values),
    median: median(values),
    min: minOf(values),
    max: maxOf(values),
  };
}
export function groupBy(participants, key) {
  const groups = {};
  for (const p of participants) {
    const value = p[key] || '(未回答)';
    if (!groups[value]) groups[value] = [];
    groups[value].push(p);
  }
  return groups;
}

export function calculateGroupStats(participants, groupKey, metricKey) {
  const groups = groupBy(participants, groupKey);
  const result = {};
  for (const [group, members] of Object.entries(groups)) {
    const values = members.map(p => parseFloat(p[metricKey])).filter(v => !isNaN(v));
    if (values.length === 0) continue;
    result[group] = {
      n: values.length,
      mean: values.reduce((s, v) => s + v, 0) / values.length,
      values: values,
    };
    if (values.length > 1) {
      const m = result[group].mean;
      result[group].sd = Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
    }
  }
  return result;
}
export function buildMergedCSV(participants) {
  if (participants.length === 0) return '';
  const allKeys = new Set();
  for (const p of participants) {
    Object.keys(p).forEach(k => allKeys.add(k));
  }
  const headers = Array.from(allKeys);
  const rows = [headers.join(',')];
  for (const p of participants) {
    const row = headers.map(h => {
      const v = p[h] ?? '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    });
    rows.push(row.join(','));
  }
  return '\uFEFF' + rows.join('\n');
}
