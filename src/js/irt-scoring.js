export const LEVEL_PARAMS = {
  1: { a: 2.2090, b: -2.2060, c: 0.0742 },
  2: { a: 2.8727, b: -1.5120, c: 0.0801 },
  3: { a: 2.0053, b: -0.7011, c: 0.1202 },
  4: { a: 2.7199, b: -0.0750, c: 0.1302 },
  5: { a: 2.1835, b:  0.7484, c: 0.0968 },
  6: { a: 1.9354, b:  1.1518, c: 0.0830 },
  7: { a: 2.2150, b:  1.5036, c: 0.1234 },
  8: { a: 2.2096, b:  2.0890, c: 0.1476 },
};

export function probCorrect(theta, a, b, c) {
  return c + (1 - c) / (1 + Math.exp(-1.7 * a * (theta - b)));
}

export function estimateTheta(responses, itemBank, options = {}) {
  const min = options.min ?? -3.0;
  const max = options.max ?? 3.0;
  const step = options.step ?? 0.1;
  const correction = options.correction ?? 0.2;
  const itemMap = new Map(itemBank.map(it => [it.id, it]));
  let bestTheta = min;
  let bestLL = -Infinity;
  const nSteps = Math.round((max - min) / step) + 1;
  for (let i = 0; i < nSteps; i++) {
    const theta = min + i * step;
    let ll = 0;
    for (const r of responses) {
      const item = itemMap.get(r.item_id);
      if (!item) continue;
      const p = Math.max(1e-10, Math.min(1 - 1e-10,
                probCorrect(theta, item.a, item.b, item.c)));
      ll += r.is_correct ? Math.log(p) : Math.log(1 - p);
    }
    if (ll > bestLL) { bestLL = ll; bestTheta = theta; }
  }
  return {
    theta: bestTheta + correction,
    theta_raw: bestTheta,
    log_likelihood: bestLL,
  };
}

export function estimateVocabSize(theta) {
  const perLevel = {};
  let total = 0;
  for (let lv = 1; lv <= 8; lv++) {
    const p = LEVEL_PARAMS[lv];
    // 公式Open Scoring Sheetと同じ式: c + (1-c)/(1+exp(-1.7a(θ-b))) * 1000
    // （Excelの演算子優先順位により、cは1000倍されない）
    const est = Math.round(
      p.c + (1 - p.c) / (1 + Math.exp(-1.7 * p.a * (theta - p.b))) * 1000
    );
    perLevel[`level_${lv}`] = est;
    total += est;
  }
  return { total_vocab_size: total, per_level: perLevel };
}

export function computeStandardError(theta, responses, itemBank) {
  const itemMap = new Map(itemBank.map(it => [it.id, it]));
  let info = 0;
  for (const r of responses) {
    const item = itemMap.get(r.item_id);
    if (!item) continue;
    const p = Math.max(1e-10, Math.min(1 - 1e-10,
              probCorrect(theta, item.a, item.b, item.c)));
    const numer = (1.7 * item.a * (p - item.c)) / (1 - item.c);
    info += (numer ** 2) * (1 - p) / p;
  }
  return info > 0 ? 1 / Math.sqrt(info) : NaN;
}

export function scoreVST(responses, itemBank) {
  if (!Array.isArray(responses) || responses.length === 0) {
    throw new Error('応答データが空です');
  }
  const rawScore = responses.filter(r => r.is_correct).length;
  const thetaResult = estimateTheta(responses, itemBank);
  const vocabResult = estimateVocabSize(thetaResult.theta);
  const se = computeStandardError(thetaResult.theta, responses, itemBank);
  const correctByLevel = {};
  for (let lv = 1; lv <= 8; lv++) correctByLevel[`level_${lv}`] = 0;
  const itemMap = new Map(itemBank.map(it => [it.id, it]));
  for (const r of responses) {
    if (r.is_correct) {
      const item = itemMap.get(r.item_id);
      if (item) correctByLevel[`level_${item.level}`]++;
    }
  }
  return {
    raw_score: rawScore,
    total_items: responses.length,
    accuracy_percent: Math.round((rawScore / responses.length) * 1000) / 10,
    irt_theta: Math.round(thetaResult.theta * 100) / 100,
    irt_theta_raw: Math.round(thetaResult.theta_raw * 100) / 100,
    standard_error: isNaN(se) ? null : Math.round(se * 1000) / 1000,
    estimated_vocab_size: vocabResult.total_vocab_size,
    vocab_size_by_level: vocabResult.per_level,
    correct_by_level: correctByLevel,
    log_likelihood: Math.round(thetaResult.log_likelihood * 1000) / 1000,
  };
}
