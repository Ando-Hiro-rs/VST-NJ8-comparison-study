function getCanvasContext(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 280 * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.height = '280px';
  return { ctx, w: rect.width, h: 280 };
}

export function drawHistogram(canvasId, values, options = {}) {
  const result = getCanvasContext(canvasId);
  if (!result) return;
  const { ctx, w, h } = result;
  const nums = values.filter(v => !isNaN(v) && v !== null);
  if (nums.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('データなし', w / 2, h / 2);
    return;
  }

  const minVal = Math.min(...nums);
  const maxVal = Math.max(...nums);
  const range = maxVal - minVal || 1;
  const binCount = options.binCount || 12;
  const binSize = range / binCount;
  const bins = new Array(binCount).fill(0);
  for (const v of nums) {
    const idx = Math.min(binCount - 1, Math.floor((v - minVal) / binSize));
    bins[idx]++;
  }
  const maxBin = Math.max(...bins);

  const padL = 40, padR = 16, padT = 12, padB = 36;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const barW = chartW / binCount;

  ctx.strokeStyle = '#e5e3dc';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + chartH);
  ctx.lineTo(padL + chartW, padT + chartH);
  ctx.stroke();

  ctx.fillStyle = options.color || '#185fa5';
  for (let i = 0; i < binCount; i++) {
    const barH = (bins[i] / maxBin) * chartH;
    const x = padL + i * barW + 1;
    const y = padT + chartH - barH;
    ctx.fillRect(x, y, barW - 2, barH);
  }

  ctx.fillStyle = '#5f5e5a';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) {
    const val = minVal + (range * i / 4);
    const x = padL + (chartW * i / 4);
    ctx.fillText(options.xFormat ? options.xFormat(val) : Math.round(val), x, h - 16);
  }

  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = (maxBin * i / 4);
    const y = padT + chartH - (chartH * i / 4) + 4;
    ctx.fillText(Math.round(val), padL - 6, y);
  }

  ctx.fillStyle = '#444441';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(options.xLabel || '', padL + chartW / 2, h - 4);

  ctx.save();
  ctx.translate(12, padT + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('度数', 0, 0);
  ctx.restore();
}

export function drawScatter(canvasId, points, options = {}) {
  const result = getCanvasContext(canvasId);
  if (!result) return;
  const { ctx, w, h } = result;
  const validPoints = points.filter(p => !isNaN(p.x) && !isNaN(p.y) && p.x !== null && p.y !== null);
  if (validPoints.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('データなし', w / 2, h / 2);
    return;
  }

  const xs = validPoints.map(p => p.x);
  const ys = validPoints.map(p => p.y);
  const xMin = options.xMin ?? Math.min(...xs);
  const xMax = options.xMax ?? Math.max(...xs);
  const yMin = options.yMin ?? Math.min(...ys);
  const yMax = options.yMax ?? Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const padL = 50, padR = 16, padT = 12, padB = 36;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  ctx.strokeStyle = '#e5e3dc';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + chartH);
  ctx.lineTo(padL + chartW, padT + chartH);
  ctx.stroke();

  ctx.strokeStyle = '#f0eee5';
  ctx.lineWidth = 0.5;
  for (let i = 1; i <= 4; i++) {
    const y = padT + (chartH * i / 4);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + chartW, y);
    ctx.stroke();
  }

  ctx.fillStyle = options.color || '#185fa5';
  for (const p of validPoints) {
    const px = padL + ((p.x - xMin) / xRange) * chartW;
    const py = padT + chartH - ((p.y - yMin) / yRange) * chartH;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#5f5e5a';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) {
    const val = xMin + (xRange * i / 4);
    const x = padL + (chartW * i / 4);
    ctx.fillText(options.xFormat ? options.xFormat(val) : Math.round(val), x, h - 16);
  }

  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = yMin + (yRange * i / 4);
    const y = padT + chartH - (chartH * i / 4) + 4;
    ctx.fillText(options.yFormat ? options.yFormat(val) : Math.round(val), padL - 6, y);
  }

  ctx.fillStyle = '#444441';
  ctx.textAlign = 'center';
  ctx.fillText(options.xLabel || '', padL + chartW / 2, h - 4);

  ctx.save();
  ctx.translate(14, padT + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(options.yLabel || '', 0, 0);
  ctx.restore();
}
