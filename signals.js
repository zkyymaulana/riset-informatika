// Generate sinyal crossover untuk MA - Moving Average signals
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

// Generate sinyal untuk RSI - Relative Strength Index signals
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

// Generate sinyal untuk Stochastic Oscillator
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

    // BUY signal: %K crosses above %D in oversold area
    if (
      stochK[i - 1] <= stochD[i - 1] &&
      stochK[i] > stochD[i] &&
      stochK[i] < oversold &&
      stochD[i] < oversold
    ) {
      signals[i] = "BUY";
    }
    // SELL signal: %K crosses below %D in overbought area
    else if (
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

// Generate sinyal untuk Stochastic RSI
// BUY: StochRSI naik dari area oversold (<20)
// SELL: StochRSI turun dari area overbought (>80)
export function generateStochasticRSISignals(
  stochRSI,
  oversold = 20,
  overbought = 80
) {
  const signals = Array(stochRSI.length).fill(null);

  for (let i = 1; i < stochRSI.length; i++) {
    if (stochRSI[i] == null || stochRSI[i - 1] == null) continue;

    // BUY signal: StochRSI crosses above oversold level
    if (stochRSI[i - 1] <= oversold && stochRSI[i] > oversold) {
      signals[i] = "BUY";
    }
    // SELL signal: StochRSI crosses below overbought level
    else if (stochRSI[i - 1] >= overbought && stochRSI[i] < overbought) {
      signals[i] = "SELL";
    }
  }
  return signals;
}

// Generate sinyal untuk MACD
// BUY: MACD line cross di atas signal line
// SELL: MACD line cross di bawah signal line
// Tambahan: histogram berubah dari negatif ke positif (bullish) atau sebaliknya (bearish)
export function generateMACDSignals(macdLine, signalLine, histogram) {
  const signals = Array(macdLine.length).fill(null);

  for (let i = 1; i < macdLine.length; i++) {
    if (
      macdLine[i] == null ||
      signalLine[i] == null ||
      macdLine[i - 1] == null ||
      signalLine[i - 1] == null
    )
      continue;

    // BUY signal: MACD crosses above signal line
    if (macdLine[i - 1] <= signalLine[i - 1] && macdLine[i] > signalLine[i]) {
      signals[i] = "BUY";
    }
    // SELL signal: MACD crosses below signal line
    else if (
      macdLine[i - 1] >= signalLine[i - 1] &&
      macdLine[i] < signalLine[i]
    ) {
      signals[i] = "SELL";
    }
  }
  return signals;
}

// Generate sinyal untuk Bollinger Bands
// BUY: Price menyentuh lower band lalu bounce up
// SELL: Price menyentuh upper band lalu bounce down
export function generateBollingerBandsSignals(closes, upperBand, lowerBand) {
  const signals = Array(closes.length).fill(null);

  for (let i = 2; i < closes.length; i++) {
    if (
      closes[i] == null ||
      upperBand[i] == null ||
      lowerBand[i] == null ||
      closes[i - 1] == null ||
      closes[i - 2] == null
    )
      continue;

    // BUY signal: Price touches lower band and starts bouncing up
    if (
      closes[i - 2] > lowerBand[i - 2] &&
      closes[i - 1] <= lowerBand[i - 1] &&
      closes[i] > closes[i - 1]
    ) {
      signals[i] = "BUY";
    }
    // SELL signal: Price touches upper band and starts bouncing down
    else if (
      closes[i - 2] < upperBand[i - 2] &&
      closes[i - 1] >= upperBand[i - 1] &&
      closes[i] < closes[i - 1]
    ) {
      signals[i] = "SELL";
    }
  }
  return signals;
}

// Generate sinyal untuk Parabolic SAR
// BUY: Price cross di atas SAR (SAR berubah dari atas ke bawah price)
// SELL: Price cross di bawah SAR (SAR berubah dari bawah ke atas price)
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

    // BUY signal: Price crosses above SAR
    if (closes[i - 1] <= sarValues[i - 1] && closes[i] > sarValues[i]) {
      signals[i] = "BUY";
    }
    // SELL signal: Price crosses below SAR
    else if (closes[i - 1] >= sarValues[i - 1] && closes[i] < sarValues[i]) {
      signals[i] = "SELL";
    }
  }
  return signals;
}
