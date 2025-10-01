// Generate sinyal crossover untuk MA
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

// Generate sinyal untuk RSI
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
