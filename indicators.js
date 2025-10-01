// SMA manual - Simple Moving Average
export function SMA(values, period) {
  const out = Array(values.length).fill(null);
  for (let t = period - 1; t < values.length; t++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[t - j];
    out[t] = sum / period;
  }
  return out;
}

// EMA manual - Exponential Moving Average
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

// RSI manual - Relative Strength Index
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

// Stochastic Oscillator manual
// %K = ((Close - Lowest Low) / (Highest High - Lowest Low)) * 100
// %D = SMA dari %K
export function StochasticOscillator(
  highs,
  lows,
  closes,
  kPeriod = 14,
  dPeriod = 3
) {
  const kValues = Array(closes.length).fill(null);
  const dValues = Array(closes.length).fill(null);

  // Hitung %K
  for (let i = kPeriod - 1; i < closes.length; i++) {
    let highestHigh = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
    let lowestLow = Math.min(...lows.slice(i - kPeriod + 1, i + 1));

    if (highestHigh === lowestLow) {
      kValues[i] = 50; // Hindari pembagian dengan nol
    } else {
      kValues[i] = ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
    }
  }

  // Hitung %D sebagai SMA dari %K
  for (let i = kPeriod + dPeriod - 2; i < closes.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = 0; j < dPeriod; j++) {
      if (kValues[i - j] !== null) {
        sum += kValues[i - j];
        count++;
      }
    }
    dValues[i] = count > 0 ? sum / count : null;
  }

  return { k: kValues, d: dValues };
}

// Stochastic RSI manual
// StochRSI = (RSI - Lowest RSI) / (Highest RSI - Lowest RSI)
export function StochasticRSI(values, rsiPeriod = 14, stochPeriod = 14) {
  // Hitung RSI terlebih dahulu
  const rsiValues = RSI(values, rsiPeriod);
  const stochRSI = Array(values.length).fill(null);

  // Hitung Stochastic dari RSI
  for (let i = rsiPeriod + stochPeriod - 2; i < values.length; i++) {
    const rsiSlice = rsiValues
      .slice(i - stochPeriod + 1, i + 1)
      .filter((v) => v !== null);

    if (rsiSlice.length === stochPeriod) {
      const highestRSI = Math.max(...rsiSlice);
      const lowestRSI = Math.min(...rsiSlice);

      if (highestRSI === lowestRSI) {
        stochRSI[i] = 50; // Hindari pembagian dengan nol
      } else {
        stochRSI[i] =
          ((rsiValues[i] - lowestRSI) / (highestRSI - lowestRSI)) * 100;
      }
    }
  }

  return stochRSI;
}

// MACD manual - Moving Average Convergence Divergence
// MACD Line = EMA(12) - EMA(26)
// Signal Line = EMA(9) dari MACD Line
// Histogram = MACD Line - Signal Line
export function MACD(
  values,
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
) {
  const emaFast = EMA(values, fastPeriod);
  const emaSlow = EMA(values, slowPeriod);
  const macdLine = Array(values.length).fill(null);

  // Hitung MACD Line
  for (let i = 0; i < values.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

  // Hitung Signal Line (EMA dari MACD Line)
  const signalLine = EMA(
    macdLine.map((v) => v || 0),
    signalPeriod
  );

  // Hitung Histogram
  const histogram = Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null) {
      histogram[i] = macdLine[i] - signalLine[i];
    }
  }

  return {
    macd: macdLine,
    signal: signalLine,
    histogram: histogram,
  };
}

// Bollinger Bands manual
// Middle Band = SMA(20)
// Upper Band = Middle Band + (2 * Standard Deviation)
// Lower Band = Middle Band - (2 * Standard Deviation)
export function BollingerBands(values, period = 20, multiplier = 2) {
  const middleBand = SMA(values, period); // SMA sebagai middle band
  const upperBand = Array(values.length).fill(null);
  const lowerBand = Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    // Hitung standard deviation
    const slice = values.slice(i - period + 1, i + 1);
    const mean = middleBand[i];

    if (mean !== null) {
      const variance =
        slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);

      upperBand[i] = mean + multiplier * standardDeviation;
      lowerBand[i] = mean - multiplier * standardDeviation;
    }
  }

  return {
    upper: upperBand,
    middle: middleBand,
    lower: lowerBand,
  };
}

// Parabolic SAR manual
// SAR = SAR_prev + AF * (EP - SAR_prev)
// AF = Acceleration Factor (mulai 0.02, maksimal 0.20)
// EP = Extreme Point (highest high untuk uptrend, lowest low untuk downtrend)
export function ParabolicSAR(highs, lows, closes, step = 0.02, maxStep = 0.2) {
  const sar = Array(closes.length).fill(null);
  if (closes.length < 2) return sar;

  let isUptrend = closes[1] > closes[0]; // Tentukan trend awal
  let af = step; // Acceleration Factor
  let ep = isUptrend
    ? Math.max(highs[0], highs[1])
    : Math.min(lows[0], lows[1]); // Extreme Point

  // SAR awal
  sar[0] = isUptrend
    ? Math.min(lows[0], lows[1])
    : Math.max(highs[0], highs[1]);
  sar[1] = sar[0];

  for (let i = 2; i < closes.length; i++) {
    // Hitung SAR baru
    const newSAR = sar[i - 1] + af * (ep - sar[i - 1]);

    if (isUptrend) {
      // Uptrend logic
      sar[i] = Math.min(newSAR, lows[i - 1], lows[i - 2] || lows[i - 1]);

      // Cek apakah trend berubah
      if (lows[i] <= sar[i]) {
        isUptrend = false;
        sar[i] = ep; // SAR menjadi extreme point sebelumnya
        af = step; // Reset AF
        ep = lows[i]; // EP menjadi low saat ini
      } else {
        // Update EP dan AF jika ada high baru
        if (highs[i] > ep) {
          ep = highs[i];
          af = Math.min(af + step, maxStep);
        }
      }
    } else {
      // Downtrend logic
      sar[i] = Math.max(newSAR, highs[i - 1], highs[i - 2] || highs[i - 1]);

      // Cek apakah trend berubah
      if (highs[i] >= sar[i]) {
        isUptrend = true;
        sar[i] = ep; // SAR menjadi extreme point sebelumnya
        af = step; // Reset AF
        ep = highs[i]; // EP menjadi high saat ini
      } else {
        // Update EP dan AF jika ada low baru
        if (lows[i] < ep) {
          ep = lows[i];
          af = Math.min(af + step, maxStep);
        }
      }
    }
  }

  return sar;
}
