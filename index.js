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
import { formatTime } from "./utils/formatTime.js";

/**
 * Kombinasi sinyal: minimal 2 indikator sepakat BUY/SELL baru dianggap final signal
 */
function combineSignals(index, signalsObj) {
  const votes = { BUY: 0, SELL: 0 };
  for (const key of Object.keys(signalsObj)) {
    const sig = signalsObj[key][index];
    if (sig === "BUY") votes.BUY++;
    if (sig === "SELL") votes.SELL++;
  }

  if (votes.BUY >= 2 && votes.BUY > votes.SELL) return "BUY";
  if (votes.SELL >= 2 && votes.SELL > votes.BUY) return "SELL";
  return "NULL"; // default jika tidak ada konfirmasi
}

(async () => {
  try {
    // 1. Ambil data historis (timestamp ms)
    const startTime = new Date("2020-10-01").getTime();
    const endTime = new Date("2025-10-01").getTime();

    const history = await getHistorical("BTCUSDT", "1d", startTime, endTime);

    if (!history || history.length === 0) {
      console.error("❌ Tidak ada data historis!");
      return;
    }

    const closes = history.map((d) => d.close);
    const highs = history.map((d) => d.high);
    const lows = history.map((d) => d.low);

    console.log(
      "Data historis dari:",
      formatTime(history[0].time * 1000),
      "sampai",
      formatTime(history[history.length - 1].time * 1000)
    );

    // 2. Hitung indikator awal
    let sma5 = SMA(closes, 5);
    let sma20 = SMA(closes, 20);
    let ema20 = EMA(closes, 20);
    let rsi14 = RSI(closes, 14);

    let stochastic = StochasticOscillator(highs, lows, closes, 14, 3);
    let stochRSI = StochasticRSI(closes, 14, 14);
    let macd = MACD(closes, 12, 26, 9);
    let bollinger = BollingerBands(closes, 20, 2);
    let psar = ParabolicSAR(highs, lows, closes, 0.02, 0.2);

    // 3. Generate sinyal
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

    console.log("5 candle terakhir (OHLC):");
    history.slice(-5).forEach((d) => {
      console.log({
        date: formatTime(d.time * 1000),
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      });
    });

    // console.log("📊 Data terakhir (5 candle terakhir):");
    // history.slice(-5).forEach((d, i) => {
    //   const idx = history.length - 5 + i;
    //   const finalSignal = combineSignals(idx, {
    //     ma: maSignals,
    //     rsi: rsiSignals,
    //     stoch: stochasticSignals,
    //     stochRSI: stochRSISignals,
    //     macd: macdSignals,
    //     bb: bollingerSignals,
    //     psar: psarSignals,
    //   });
    //   console.log({
    //     date: new Date(d.time * 1000).toISOString(),
    //     close: d.close,
    //     sma5: sma5[idx]?.toFixed(2),
    //     sma20: sma20[idx]?.toFixed(2),
    //     ema20: ema20[idx]?.toFixed(2),
    //     rsi: rsi14[idx]?.toFixed(2),
    //     stochK: stochastic.k[idx]?.toFixed(2),
    //     stochD: stochastic.d[idx]?.toFixed(2),
    //     stochRSI: stochRSI[idx]?.toFixed(2),
    //     macdLine: macd.macd[idx]?.toFixed(4),
    //     macdSignal: macd.signal[idx]?.toFixed(4),
    //     macdHist: macd.histogram[idx]?.toFixed(4),
    //     bbUpper: bollinger.upper[idx]?.toFixed(2),
    //     bbMiddle: bollinger.middle[idx]?.toFixed(2),
    //     bbLower: bollinger.lower[idx]?.toFixed(2),
    //     psar: psar[idx]?.toFixed(2),
    //     // Sinyal
    //     maSignal: maSignals[idx],
    //     rsiSignal: rsiSignals[idx],
    //     stochSignal: stochasticSignals[idx],
    //     stochRSISignal: stochRSISignals[idx],
    //     macdSignal: macdSignals[idx],
    //     bbSignal: bollingerSignals[idx],
    //     psarSignal: psarSignals[idx],
    //     finalSignal,
    //   });
    // });

    // 4. WebSocket realtime update
    connectWebSocket(
      "BTCUSDT",
      "1d",
      ({ time, close, high, low, interval = "1d" }) => {
        closes.push(close);
        highs.push(high);
        lows.push(low);

        // Recalculate indikator
        sma5 = SMA(closes, 5);
        sma20 = SMA(closes, 20);
        ema20 = EMA(closes, 20);
        rsi14 = RSI(closes, 14);

        stochastic = StochasticOscillator(highs, lows, closes, 14, 3);
        stochRSI = StochasticRSI(closes, 14, 14);
        macd = MACD(closes, 12, 26, 9);
        bollinger = BollingerBands(closes, 20, 2);
        psar = ParabolicSAR(highs, lows, closes, 0.02, 0.2);

        // Recalculate sinyal
        maSignals = generateMASignals(sma5, sma20);
        rsiSignals = generateRSISignals(rsi14);
        stochasticSignals = generateStochasticSignals(
          stochastic.k,
          stochastic.d
        );
        stochRSISignals = generateStochasticRSISignals(stochRSI);
        macdSignals = generateMACDSignals(
          macd.macd,
          macd.signal,
          macd.histogram
        );
        bollingerSignals = generateBollingerBandsSignals(
          closes,
          bollinger.upper,
          bollinger.lower
        );
        psarSignals = generateParabolicSARSignals(closes, psar);

        const finalSignal = combineSignals(closes.length - 1, {
          ma: maSignals,
          rsi: rsiSignals,
          stoch: stochasticSignals,
          stochRSI: stochRSISignals,
          macd: macdSignals,
          bb: bollingerSignals,
          psar: psarSignals,
        });

        console.log(
          `   TF: ${interval.toUpperCase()} | 📅 ${formatTime(
            time * 1000
          )} | Close: ${close.toFixed(2)}\n` +
            ` SMA5: ${sma5.at(-1)?.toFixed(2)} | SMA20: ${sma20
              .at(-1)
              ?.toFixed(2)} | EMA20: ${ema20.at(-1)?.toFixed(2)}\n` +
            ` RSI: ${rsi14.at(-1)?.toFixed(2)} | Stoch %K: ${stochastic.k
              .at(-1)
              ?.toFixed(2)} | %D: ${stochastic.d
              .at(-1)
              ?.toFixed(2)} | StochRSI: ${stochRSI.at(-1)?.toFixed(2)}\n` +
            ` MACD: ${macd.macd.at(-1)?.toFixed(4)} | Signal: ${macd.signal
              .at(-1)
              ?.toFixed(4)} | Hist: ${macd.histogram.at(-1)?.toFixed(4)}\n` +
            ` BB Upper: ${bollinger.upper
              .at(-1)
              ?.toFixed(2)} | Mid: ${bollinger.middle
              .at(-1)
              ?.toFixed(2)} | Lower: ${bollinger.lower.at(-1)?.toFixed(2)}\n` +
            ` PSAR: ${psar.at(-1)?.toFixed(2)}\n` +
            ` 🔎 Signals → MA: ${maSignals.at(-1)} | RSI: ${rsiSignals.at(
              -1
            )} | Stoch: ${stochasticSignals.at(
              -1
            )} | StochRSI: ${stochRSISignals.at(-1)} | MACD: ${macdSignals.at(
              -1
            )} | BB: ${bollingerSignals.at(-1)} | PSAR: ${psarSignals.at(
              -1
            )}\n` +
            ` ✅ Final Signal: ${finalSignal}`
        );
      }
    );
  } catch (err) {
    console.error("❌ Error di index.js:", err.message);
  }
})();
