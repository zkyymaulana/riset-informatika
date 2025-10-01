// SMA manual
export function SMA(values, period) {
  const out = Array(values.length).fill(null);
  for (let t = period - 1; t < values.length; t++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[t - j];
    out[t] = sum / period;
  }
  return out;
}

// EMA manual
export function EMA(values, period) {
  const out = Array(values.length).fill(null);
  const k = 2 / (period + 1);

  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = seed;

  for (let t = period; t < values.length; t++) {
    out[t] = values[t] * k + out[t - 1] * (1 - k);
  }
  return out;
}

// RSI manual
export function RSI(values, period = 14) {
  const rsi = Array(values.length).fill(null);
  let gains = 0,
    losses = 0;

  for (let i = 1; i <= period; i++) {
    let diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  let rs = avgGain / avgLoss;
  rsi[period] = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < values.length; i++) {
    let diff = values[i] - values[i - 1];
    let gain = diff > 0 ? diff : 0;
    let loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  }
  return rsi;
}
