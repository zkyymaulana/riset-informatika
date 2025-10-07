// Simple Moving Average (SMA)
export function SMA(values, period) {
  const out = Array(values.length).fill(null);
  let sum = 0;

  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period]; // keluarkan data terlama
    if (i >= period - 1) out[i] = sum / period; // mulai dari bar ke-(period-1)
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
      kValues[i] = 50; // Hindari pembagian nol
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
export function StochasticRSI(
  values,
  rsiPeriod = 14,
  stochPeriod = 14,
  kPeriod = 3,
  dPeriod = 3
) {
  const rsiValues = RSI(values, rsiPeriod);
  const stochRSI = Array(values.length).fill(null);
  const kValues = Array(values.length).fill(null);
  const dValues = Array(values.length).fill(null);

  // Hitung nilai dasar StochRSI
  for (let i = rsiPeriod + stochPeriod - 2; i < values.length; i++) {
    const slice = rsiValues
      .slice(i - stochPeriod + 1, i + 1)
      .filter((v) => v !== null);
    const maxRSI = Math.max(...slice);
    const minRSI = Math.min(...slice);

    stochRSI[i] =
      maxRSI === minRSI
        ? 50
        : ((rsiValues[i] - minRSI) / (maxRSI - minRSI)) * 100;
  }

  // Smoothing %K (3-period SMA dari StochRSI)
  for (let i = 0; i < values.length; i++) {
    if (i >= kPeriod - 1) {
      const subset = stochRSI
        .slice(i - kPeriod + 1, i + 1)
        .filter((v) => v !== null);
      if (subset.length === kPeriod) {
        kValues[i] = subset.reduce((a, b) => a + b, 0) / kPeriod;
      }
    }
  }

  // Smoothing %D (3-period SMA dari %K)
  for (let i = 0; i < values.length; i++) {
    if (i >= dPeriod - 1) {
      const subset = kValues
        .slice(i - dPeriod + 1, i + 1)
        .filter((v) => v !== null);
      if (subset.length === dPeriod) {
        dValues[i] = subset.reduce((a, b) => a + b, 0) / dPeriod;
      }
    }
  }

  return { stochRSI, k: kValues, d: dValues };
}

// MACD manual - Moving Average Convergence Divergence
// MACD Line = EMA(fastPeriod) - EMA(slowPeriod)
// Signal Line = EMA(signalPeriod) dari MACD Line (hanya data valid)
// Histogram = MACD Line - Signal Line
export function MACD(
  values,
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
) {
  const emaFast = EMA(values, fastPeriod);
  const emaSlow = EMA(values, slowPeriod);

  // Hitung MACD Line
  const macdLine = Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) {
      macdLine[i] = emaFast[i] - emaSlow[i];
    }
  }

  // Ambil data valid saja untuk Signal Line
  const macdValid = macdLine.filter((v) => v != null);
  const signalValid = EMA(macdValid, signalPeriod);

  // Mapping signal back ke array penuh dengan null pada indeks invalid
  const signalLine = Array(values.length).fill(null);
  let sigIndex = 0;
  for (let i = 0; i < values.length; i++) {
    if (macdLine[i] != null) {
      signalLine[i] = signalValid[sigIndex];
      sigIndex++;
    }
  }

  // Hitung Histogram
  const histogram = Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (macdLine[i] != null && signalLine[i] != null) {
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

// Parabolic SAR manual - TradingView compatible (Welles Wilder's method)
// SAR = SAR_prev + AF * (EP - SAR_prev)
// AF = Acceleration Factor (mulai 0.02, increment 0.02, maksimal 0.20)
// EP = Extreme Point (highest high untuk uptrend, lowest low untuk downtrend)
export function ParabolicSAR(highs, lows, closes, step = 0.02, maxStep = 0.2) {
  const n = highs.length;
  const sar = Array(n).fill(null);

  if (n < 3) return sar;

  // === Inisialisasi berdasarkan 3 candle pertama (TradingView style) ===
  // Tentukan arah trend awal berdasarkan close[2] vs close[1]
  let isUptrend = closes[2] > closes[1];

  let ep, prevSAR, af;

  if (isUptrend) {
    // Uptrend: EP = max high dari 3 candle pertama, SAR = min low dari 3 candle pertama
    ep = Math.max(highs[0], highs[1], highs[2]);
    prevSAR = Math.min(lows[0], lows[1], lows[2]);
  } else {
    // Downtrend: EP = min low dari 3 candle pertama, SAR = max high dari 3 candle pertama
    ep = Math.min(lows[0], lows[1], lows[2]);
    prevSAR = Math.max(highs[0], highs[1], highs[2]);
  }

  af = step;

  // Set SAR untuk candle ke-3 (index 2) dengan rounding 2 desimal
  sar[2] = Math.round(prevSAR * 100) / 100;

  // === Loop utama mulai dari candle ke-4 (index 3) ===
  for (let i = 3; i < n; i++) {
    // Hitung SAR baru menggunakan rumus Wilder
    let newSAR = prevSAR + af * (ep - prevSAR);

    // Round ke 2 desimal setiap step (TradingView style)
    newSAR = Math.round(newSAR * 100) / 100;

    // Batasi SAR agar tidak melewati high/low 2 candle sebelumnya
    if (isUptrend) {
      // Uptrend: SAR tidak boleh > low dari 2 bar sebelumnya
      const lowLimit1 = lows[i - 1];
      const lowLimit2 = lows[i - 2];
      newSAR = Math.min(newSAR, lowLimit1, lowLimit2);

      // Cek reversal: jika low[i] < SAR, flip ke downtrend
      if (lows[i] < newSAR) {
        // Reversal ke downtrend
        isUptrend = false;
        newSAR = ep; // SAR = EP sebelumnya
        ep = lows[i]; // EP baru = low[i]
        af = step; // Reset AF
      } else {
        // Masih uptrend, update EP dan AF jika ada high baru
        if (highs[i] > ep) {
          ep = highs[i];
          af = Math.min(af + step, maxStep);
        }
      }
    } else {
      // Downtrend: SAR tidak boleh < high dari 2 bar sebelumnya
      const highLimit1 = highs[i - 1];
      const highLimit2 = highs[i - 2];
      newSAR = Math.max(newSAR, highLimit1, highLimit2);

      // Cek reversal: jika high[i] > SAR, flip ke uptrend
      if (highs[i] > newSAR) {
        // Reversal ke uptrend
        isUptrend = true;
        newSAR = ep; // SAR = EP sebelumnya
        ep = highs[i]; // EP baru = high[i]
        af = step; // Reset AF
      } else {
        // Masih downtrend, update EP dan AF jika ada low baru
        if (lows[i] < ep) {
          ep = lows[i];
          af = Math.min(af + step, maxStep);
        }
      }
    }

    // Round final SAR ke 2 desimal
    sar[i] = Math.round(newSAR * 100) / 100;
    prevSAR = sar[i];
  }

  return sar;
}
