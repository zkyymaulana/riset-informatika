import { getHistorical, connectWebSocket } from "./data.js";
import {
  SMA,
  RSI,
  EMA,
  StochasticOscillator,
  StochasticRSI,
  MACD,
  BollingerBands,
  ParabolicSAR,
} from "./indicators.js";
import {
  generateMASignals,
  generateRSISignals,
  generateStochasticSignals,
  generateStochasticRSISignals,
  generateMACDSignals,
  generateBollingerBandsSignals,
  generateParabolicSARSignals,
} from "./signals.js";

(async () => {
  try {
    // 1. Ambil data historis dengan timestamp (ms)
    const startTime = new Date("2020-10-01").getTime();
    const endTime = new Date("2025-10-01").getTime();

    const history = await getHistorical("BTCUSDT", "1d", startTime, endTime);

    if (!history || history.length === 0) {
      console.error("❌ Tidak ada data historis yang berhasil diambil!");
      return;
    }

    // Extract data arrays untuk perhitungan indikator
    const closes = history.map((d) => d.close);
    const highs = history.map((d) => d.high);
    const lows = history.map((d) => d.low);

    // tampilkan rentang data
    console.log(
      "📅 Data historis tersedia dari:",
      new Date(history[0].time * 1000).toISOString(), // Convert seconds back to ms for display
      "sampai",
      new Date(history.at(-1).time * 1000).toISOString()
    );

    console.log("Total candle:", history.length);

    // 2. Hitung indikator tradisional
    let sma5 = SMA(closes, 5);
    let sma20 = SMA(closes, 20);
    let ema20 = EMA(closes, 20);
    let rsi14 = RSI(closes, 14);

    // 3. Hitung indikator baru
    let stochastic = StochasticOscillator(highs, lows, closes, 14, 3);
    let stochRSI = StochasticRSI(closes, 14, 14);
    let macd = MACD(closes, 12, 26, 9);
    let bollinger = BollingerBands(closes, 20, 2);
    let psar = ParabolicSAR(highs, lows, closes, 0.02, 0.2);

    // 4. Generate sinyal untuk semua indikator
    let maSignals = generateMASignals(sma5, sma20);
    let rsiSignals = generateRSISignals(rsi14);
    let stochasticSignals = generateStochasticSignals(
      stochastic.k,
      stochastic.d
    );
    let stochRSISignals = generateStochasticRSISignals(stochRSI);
    let macdSignals = generateMACDSignals(
      macd.macd,
      macd.signal,
      macd.histogram
    );
    let bollingerSignals = generateBollingerBandsSignals(
      closes,
      bollinger.upper,
      bollinger.lower
    );
    let psarSignals = generateParabolicSARSignals(closes, psar);

    console.log("📊 Data terakhir dengan semua indikator:");
    history.slice(-5).forEach((d, i) => {
      const idx = history.length - 5 + i;
      console.log({
        date: new Date(d.time * 1000).toISOString(), // Convert seconds back to ms for display
        close: d.close,
        // Indikator tradisional
        sma5: sma5[idx]?.toFixed(2),
        sma20: sma20[idx]?.toFixed(2),
        ema20: ema20[idx]?.toFixed(2),
        rsi: rsi14[idx]?.toFixed(2),
        // Indikator baru
        stochK: stochastic.k[idx]?.toFixed(2),
        stochD: stochastic.d[idx]?.toFixed(2),
        stochRSI: stochRSI[idx]?.toFixed(2),
        macdLine: macd.macd[idx]?.toFixed(4),
        macdSignal: macd.signal[idx]?.toFixed(4),
        macdHist: macd.histogram[idx]?.toFixed(4),
        bbUpper: bollinger.upper[idx]?.toFixed(2),
        bbMiddle: bollinger.middle[idx]?.toFixed(2),
        bbLower: bollinger.lower[idx]?.toFixed(2),
        psar: psar[idx]?.toFixed(2),
        // Sinyal
        maSignal: maSignals[idx],
        rsiSignal: rsiSignals[idx],
        stochSignal: stochasticSignals[idx],
        stochRSISignal: stochRSISignals[idx],
        macdSignal: macdSignals[idx],
        bbSignal: bollingerSignals[idx],
        psarSignal: psarSignals[idx],
      });
    });

    // 5. WebSocket realtime update dengan semua indikator
    connectWebSocket("btcusdt", "1m", ({ time, close, high, low, open }) => {
      // Update arrays dengan data baru
      closes.push(close);
      highs.push(high);
      lows.push(low);

      // Recalculate semua indikator
      sma5 = SMA(closes, 5);
      sma20 = SMA(closes, 20);
      ema20 = EMA(closes, 20);
      rsi14 = RSI(closes, 14);

      stochastic = StochasticOscillator(highs, lows, closes, 14, 3);
      stochRSI = StochasticRSI(closes, 14, 14);
      macd = MACD(closes, 12, 26, 9);
      bollinger = BollingerBands(closes, 20, 2);
      psar = ParabolicSAR(highs, lows, closes, 0.02, 0.2);

      // Recalculate semua sinyal
      maSignals = generateMASignals(sma5, sma20);
      rsiSignals = generateRSISignals(rsi14);
      stochasticSignals = generateStochasticSignals(stochastic.k, stochastic.d);
      stochRSISignals = generateStochasticRSISignals(stochRSI);
      macdSignals = generateMACDSignals(macd.macd, macd.signal, macd.histogram);
      bollingerSignals = generateBollingerBandsSignals(
        closes,
        bollinger.upper,
        bollinger.lower
      );
      psarSignals = generateParabolicSARSignals(closes, psar);

      console.log(
        `📅 ${new Date(time).toISOString()} | Close: ${close.toFixed(2)} | ` +
          `SMA5: ${sma5.at(-1)?.toFixed(2)} | SMA20: ${sma20
            .at(-1)
            ?.toFixed(2)} | ` +
          `EMA20: ${ema20.at(-1)?.toFixed(2)} | RSI: ${rsi14
            .at(-1)
            ?.toFixed(2)} | ` +
          `Stoch %K: ${stochastic.k.at(-1)?.toFixed(2)} | %D: ${stochastic.d
            .at(-1)
            ?.toFixed(2)} | ` +
          `StochRSI: ${stochRSI.at(-1)?.toFixed(2)} | ` +
          `MACD: ${macd.macd.at(-1)?.toFixed(4)} | Signal: ${macd.signal
            .at(-1)
            ?.toFixed(4)} | ` +
          `BB Upper: ${bollinger.upper
            .at(-1)
            ?.toFixed(2)} | Lower: ${bollinger.lower.at(-1)?.toFixed(2)} | ` +
          `PSAR: ${psar.at(-1)?.toFixed(2)} | ` +
          `Signals - MA: ${maSignals.at(-1)} | RSI: ${rsiSignals.at(-1)} | ` +
          `Stoch: ${stochasticSignals.at(-1)} | StochRSI: ${stochRSISignals.at(
            -1
          )} | ` +
          `MACD: ${macdSignals.at(-1)} | BB: ${bollingerSignals.at(
            -1
          )} | PSAR: ${psarSignals.at(-1)}`
      );
    });
  } catch (err) {
    console.error("❌ Error di index.js:", err.message);
  }
})();
