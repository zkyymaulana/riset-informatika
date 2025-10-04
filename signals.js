// ===================== Moving Average Signals =====================
// BUY jika short MA cross di atas long MA
// SELL jika short MA cross di bawah long MA
export function generateMASignals(shortMA, longMA) {
  const signals = Array(shortMA.length).fill(null);

  for (let i = 1; i < shortMA.length; i++) {
    if (shortMA[i] == null || longMA[i] == null) continue;

    const prevDiff = shortMA[i - 1] - longMA[i - 1];
    const currDiff = shortMA[i] - longMA[i];

    if (prevDiff <= 0 && currDiff > 0) {
      signals[i] = "BUY";
    } else if (prevDiff >= 0 && currDiff < 0) {
      signals[i] = "SELL";
    }
  }
  return signals;
}

// ===================== RSI Signals =====================
// BUY: RSI cross up dari bawah 30
// SELL: RSI cross down dari atas 70
export function generateRSISignals(rsiValues, lower = 30, upper = 70) {
  const sig = Array(rsiValues.length).fill(null);
  for (let i = 1; i < rsiValues.length; i++) {
    if (rsiValues[i - 1] == null || rsiValues[i] == null) continue;

    if (rsiValues[i - 1] <= lower && rsiValues[i] > lower) {
      sig[i] = "BUY";
    } else if (rsiValues[i - 1] >= upper && rsiValues[i] < upper) {
      sig[i] = "SELL";
    }
  }
  return sig;
}

// ===================== Stochastic Oscillator Signals =====================
// BUY: %K cross di atas %D di area oversold (<20)
// SELL: %K cross di bawah %D di area overbought (>80)
export function generateStochasticSignals(
  stochK,
  stochD,
  oversold = 20,
  overbought = 80
) {
  const signals = Array(stochK.length).fill(null);

  for (let i = 1; i < stochK.length; i++) {
    if (
      stochK[i] == null ||
      stochD[i] == null ||
      stochK[i - 1] == null ||
      stochD[i - 1] == null
    )
      continue;

    if (
      stochK[i - 1] <= stochD[i - 1] &&
      stochK[i] > stochD[i] &&
      stochK[i] < oversold &&
      stochD[i] < oversold
    ) {
      signals[i] = "BUY";
    } else if (
      stochK[i - 1] >= stochD[i - 1] &&
      stochK[i] < stochD[i] &&
      stochK[i] > overbought &&
      stochD[i] > overbought
    ) {
      signals[i] = "SELL";
    }
  }
  return signals;
}

// ===================== Stochastic RSI Signals =====================
// BUY: cross up dari bawah level oversold
// SELL: cross down dari atas level overbought
export function generateStochasticRSISignals(
  stochRSI,
  oversold = 20,
  overbought = 80
) {
  const signals = Array(stochRSI.length).fill(null);

  for (let i = 1; i < stochRSI.length; i++) {
    if (stochRSI[i] == null || stochRSI[i - 1] == null) continue;

    if (stochRSI[i - 1] <= oversold && stochRSI[i] > oversold) {
      signals[i] = "BUY";
    } else if (stochRSI[i - 1] >= overbought && stochRSI[i] < overbought) {
      signals[i] = "SELL";
    }
  }
  return signals;
}

// ===================== MACD Signals =====================
// BUY: MACD cross up signal + histogram positif
// SELL: MACD cross down signal + histogram negatif
export function generateMACDSignals(macdLine, signalLine, histogram) {
  const signals = Array(macdLine.length).fill(null);

  for (let i = 1; i < macdLine.length; i++) {
    if (
      macdLine[i] == null ||
      signalLine[i] == null ||
      histogram[i] == null ||
      macdLine[i - 1] == null ||
      signalLine[i - 1] == null ||
      histogram[i - 1] == null
    )
      continue;

    if (
      macdLine[i - 1] <= signalLine[i - 1] &&
      macdLine[i] > signalLine[i] &&
      histogram[i] > 0
    ) {
      signals[i] = "BUY";
    } else if (
      macdLine[i - 1] >= signalLine[i - 1] &&
      macdLine[i] < signalLine[i] &&
      histogram[i] < 0
    ) {
      signals[i] = "SELL";
    }
  }
  return signals;
}

// ===================== Bollinger Bands Signals =====================
// mode "bounce" (default): deteksi pantulan
// mode "breakout": deteksi tembus band
export function generateBollingerBandsSignals(
  closes,
  upperBand,
  lowerBand,
  mode = "bounce"
) {
  const signals = Array(closes.length).fill(null);

  for (let i = 2; i < closes.length; i++) {
    if (
      closes[i] == null ||
      upperBand[i] == null ||
      lowerBand[i] == null ||
      closes[i - 1] == null
    )
      continue;

    if (mode === "bounce") {
      if (
        closes[i - 2] > lowerBand[i - 2] &&
        closes[i - 1] <= lowerBand[i - 1] &&
        closes[i] > closes[i - 1]
      ) {
        signals[i] = "BUY";
      } else if (
        closes[i - 2] < upperBand[i - 2] &&
        closes[i - 1] >= upperBand[i - 1] &&
        closes[i] < closes[i - 1]
      ) {
        signals[i] = "SELL";
      }
    } else if (mode === "breakout") {
      if (closes[i] < lowerBand[i]) {
        signals[i] = "BUY";
      } else if (closes[i] > upperBand[i]) {
        signals[i] = "SELL";
      }
    }
  }
  return signals;
}

// ===================== Parabolic SAR Signals =====================
// BUY: Close cross di atas SAR
// SELL: Close cross di bawah SAR
export function generateParabolicSARSignals(closes, sarValues) {
  const signals = Array(closes.length).fill(null);

  for (let i = 1; i < closes.length; i++) {
    if (
      closes[i] == null ||
      sarValues[i] == null ||
      closes[i - 1] == null ||
      sarValues[i - 1] == null
    )
      continue;

    if (closes[i - 1] <= sarValues[i - 1] && closes[i] > sarValues[i]) {
      signals[i] = "BUY";
    } else if (closes[i - 1] >= sarValues[i - 1] && closes[i] < sarValues[i]) {
      signals[i] = "SELL";
    }
  }
  return signals;
}
