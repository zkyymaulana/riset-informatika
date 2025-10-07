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

// ===================== Multi-Indicator Analysis =====================
// Weighted rule-based signal combination for EOD analysis

// Indicator weights based on technical analysis theory and literature
const INDICATOR_WEIGHTS = {
  sma: 3, // Main trend determination (Golden/Death Cross)
  ema: 3, // Short-term trend confirmation
  rsi: 2, // Overbought/oversold conditions
  stochastic: 2, // Short-term momentum shifts
  stochRsi: 2, // Enhanced RSI for volatile assets
  macd: 3, // Trend + momentum confirmation
  bollinger: 1, // Price volatility extremes
  psar: 3, // Trend direction and reversals
};

/**
 * Determines individual indicator signals based on technical rules
 * @param {Object} indicators - Object containing all indicator values
 * @returns {Object} Individual signals for each indicator
 */
export function generateIndividualSignals(indicators) {
  const {
    sma20,
    sma50,
    ema20,
    rsi,
    stochK,
    stochD,
    stochRsiK,
    stochRsiD,
    macdLine,
    macdSignal,
    bbUpper,
    bbLower,
    psar,
    close,
  } = indicators;

  const signals = {};

  // 1. SMA20 & SMA50 (Trend Analysis)
  if (sma20 != null && sma50 != null) {
    if (sma20 > sma50) {
      signals.sma = "BUY"; // Golden Cross
    } else if (sma20 < sma50) {
      signals.sma = "SELL"; // Death Cross
    } else {
      signals.sma = "HOLD";
    }
  } else {
    signals.sma = "HOLD";
  }

  // 2. EMA20 (Short-term Trend)
  if (ema20 != null && close != null) {
    if (close > ema20) {
      signals.ema = "BUY"; // Price above EMA
    } else if (close < ema20) {
      signals.ema = "SELL"; // Price below EMA
    } else {
      signals.ema = "HOLD";
    }
  } else {
    signals.ema = "HOLD";
  }

  // 3. RSI(14) (Momentum)
  if (rsi != null) {
    if (rsi < 30) {
      signals.rsi = "BUY"; // Oversold
    } else if (rsi > 70) {
      signals.rsi = "SELL"; // Overbought
    } else {
      signals.rsi = "HOLD";
    }
  } else {
    signals.rsi = "HOLD";
  }

  // 4. Stochastic Oscillator (Short-term Momentum)
  if (stochK != null && stochD != null) {
    if (stochK > stochD && stochK < 20 && stochD < 20) {
      signals.stochastic = "BUY"; // Bullish crossover in oversold
    } else if (stochK < stochD && stochK > 80 && stochD > 80) {
      signals.stochastic = "SELL"; // Bearish crossover in overbought
    } else {
      signals.stochastic = "HOLD";
    }
  } else {
    signals.stochastic = "HOLD";
  }

  // 5. Stochastic RSI (Enhanced Momentum)
  if (stochRsiK != null && stochRsiD != null) {
    if (stochRsiK > stochRsiD && stochRsiK < 20) {
      signals.stochRsi = "BUY"; // Bullish crossover in oversold
    } else if (stochRsiK < stochRsiD && stochRsiK > 80) {
      signals.stochRsi = "SELL"; // Bearish crossover in overbought
    } else {
      signals.stochRsi = "HOLD";
    }
  } else {
    signals.stochRsi = "HOLD";
  }

  // 6. MACD (Trend + Momentum)
  if (macdLine != null && macdSignal != null) {
    if (macdLine > macdSignal) {
      signals.macd = "BUY"; // Bullish crossover
    } else if (macdLine < macdSignal) {
      signals.macd = "SELL"; // Bearish crossover
    } else {
      signals.macd = "HOLD";
    }
  } else {
    signals.macd = "HOLD";
  }

  // 7. Bollinger Bands (Volatility)
  if (bbUpper != null && bbLower != null && close != null) {
    if (close < bbLower) {
      signals.bollinger = "BUY"; // Price below lower band
    } else if (close > bbUpper) {
      signals.bollinger = "SELL"; // Price above upper band
    } else {
      signals.bollinger = "HOLD";
    }
  } else {
    signals.bollinger = "HOLD";
  }

  // 8. Parabolic SAR (Trend Reversal)
  if (psar != null && close != null) {
    if (close > psar) {
      signals.psar = "BUY"; // Price above PSAR
    } else if (close < psar) {
      signals.psar = "SELL"; // Price below PSAR
    } else {
      signals.psar = "HOLD";
    }
  } else {
    signals.psar = "HOLD";
  }

  return signals;
}

/**
 * Converts signal strings to numeric values
 * @param {string} signal - "BUY", "SELL", or "HOLD"
 * @returns {number} +1 for BUY, -1 for SELL, 0 for HOLD
 */
function signalToNumeric(signal) {
  switch (signal) {
    case "BUY":
      return 1;
    case "SELL":
      return -1;
    case "HOLD":
      return 0;
    default:
      return 0;
  }
}

/**
 * Calculates weighted combined signal from individual indicators
 * @param {Object} signals - Individual indicator signals
 * @returns {Object} Combined analysis result
 */
export function calculateCombinedSignal(signals) {
  let weightedSum = 0;
  let totalWeight = 0;

  // Calculate weighted sum
  for (const [indicator, weight] of Object.entries(INDICATOR_WEIGHTS)) {
    if (signals[indicator] != null) {
      const numericSignal = signalToNumeric(signals[indicator]);
      weightedSum += weight * numericSignal;
      totalWeight += weight;
    }
  }

  // Calculate combined score (normalized)
  const combinedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Determine final signal based on thresholds
  let finalSignal;
  if (combinedScore >= 0.3) {
    finalSignal = "BUY";
  } else if (combinedScore <= -0.3) {
    finalSignal = "SELL";
  } else {
    finalSignal = "HOLD";
  }

  return {
    signals,
    combinedScore: parseFloat(combinedScore.toFixed(3)),
    finalSignal,
    weightedSum,
    totalWeight,
  };
}

/**
 * Main function for multi-indicator EOD analysis
 * @param {Object} indicators - All indicator values for the latest candle
 * @returns {Object} Complete analysis result
 */
export function performMultiIndicatorAnalysis(indicators) {
  // Generate individual signals
  const individualSignals = generateIndividualSignals(indicators);

  // Calculate combined signal
  const combinedResult = calculateCombinedSignal(individualSignals);

  // Log results in EOD system style
  console.log("\n" + "=".repeat(50));
  console.log("📊 MULTI-INDICATOR ANALYSIS RESULT");
  console.log("=".repeat(50));
  console.log(`SMA20/SMA50: ${individualSignals.sma}`);
  console.log(`EMA20: ${individualSignals.ema}`);
  console.log(`RSI(14): ${individualSignals.rsi}`);
  console.log(`Stochastic: ${individualSignals.stochastic}`);
  console.log(`StochRSI: ${individualSignals.stochRsi}`);
  console.log(`MACD: ${individualSignals.macd}`);
  console.log(`Bollinger Bands: ${individualSignals.bollinger}`);
  console.log(`PSAR: ${individualSignals.psar}`);
  console.log("");
  console.log(`📈 Weighted Combined Score: ${combinedResult.combinedScore}`);

  // Add appropriate emoji based on final signal
  const signalEmoji =
    combinedResult.finalSignal === "BUY"
      ? "🟢"
      : combinedResult.finalSignal === "SELL"
      ? "🔴"
      : "🟡";
  console.log(
    `${signalEmoji} Final Combined Signal: ${combinedResult.finalSignal}`
  );
  console.log("=".repeat(50));

  return combinedResult;
}

/**
 * Detailed breakdown of weighted calculation for debugging
 * @param {Object} signals - Individual indicator signals
 * @returns {Object} Detailed breakdown
 */
export function getWeightedBreakdown(signals) {
  const breakdown = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [indicator, weight] of Object.entries(INDICATOR_WEIGHTS)) {
    if (signals[indicator] != null) {
      const numericSignal = signalToNumeric(signals[indicator]);
      const contribution = weight * numericSignal;

      breakdown.push({
        indicator,
        signal: signals[indicator],
        weight,
        numericValue: numericSignal,
        contribution,
      });

      weightedSum += contribution;
      totalWeight += weight;
    }
  }

  return {
    breakdown,
    weightedSum,
    totalWeight,
    normalizedScore: totalWeight > 0 ? weightedSum / totalWeight : 0,
  };
}
