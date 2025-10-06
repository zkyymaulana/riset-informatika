import { getHistorical } from "./data.js";
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
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

// Configure dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

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

// === MA20 & MA50 Analysis ===
function analyzeMACross(sma20, sma50, closes) {
  const lastClose = closes[closes.length - 1];
  const lastSMA20 = sma20[sma20.length - 1];
  const lastSMA50 = sma50[sma50.length - 1];

  // Validasi data tidak null
  if (!lastSMA20 || !lastSMA50 || !lastClose) {
    return {
      signal: "WAIT",
      message: "Data SMA belum tersedia",
    };
  }

  let signal = "HOLD";
  let message = "";

  if (lastSMA20 > lastSMA50) {
    signal = "BUY";
    message = "Golden Cross - SMA20 di atas SMA50";
  } else if (lastSMA20 < lastSMA50) {
    signal = "SELL";
    message = "Death Cross - SMA20 di bawah SMA50";
  } else {
    message = "SMA20 dan SMA50 sama";
  }

  return {
    signal,
    message,
    close: lastClose?.toFixed(2),
    sma20: lastSMA20?.toFixed(2),
    sma50: lastSMA50?.toFixed(2),
  };
}

// Main analysis function
async function main() {
  try {
    console.log("\n" + "=".repeat(60));
    console.log("🚀 Memulai analisis End-of-Day (EOD)...");
    console.log("=".repeat(60));

    // 1. Tetapkan interval fix ke "1d"
    const INTERVAL = "1d";
    console.log(`✅ Interval digunakan: ${INTERVAL}`);

    // 2. Ambil data historis (hanya candle daily yang sudah close)
    const startTime = new Date("2020-10-01").getTime();

    // Hitung endTime untuk candle terakhir yang sudah close
    const now = new Date();
    const todayUTC = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );
    const endTime = todayUTC - 24 * 60 * 60 * 1000; // 1 hari sebelumnya

    console.log(`🕐 Waktu sekarang (UTC): ${now.toISOString()}`);
    console.log(
      `📅 Candle terakhir yang diambil: ${new Date(endTime).toISOString()}`
    );

    const history = await getHistorical("BTCUSDT", INTERVAL, startTime);

    if (!history || history.length === 0) {
      console.error("❌ Tidak ada data historis!");
      return;
    }

    // Filter hanya candle yang sudah close (waktu <= endTime)
    const closedCandles = history.filter((c) => c.time * 1000 <= endTime);

    console.log(
      `🔍 Filter: ${history.length} -> ${closedCandles.length} candle (hanya yang sudah close)`
    );

    const closes = closedCandles.map((d) => d.close);
    const highs = closedCandles.map((d) => d.high);
    const lows = closedCandles.map((d) => d.low);

    if (closedCandles.length > 0) {
      const lastClosedCandle = closedCandles[closedCandles.length - 1];
      const analysisDate = dayjs
        .unix(lastClosedCandle.time)
        .tz("Asia/Jakarta")
        .format("DD MMMM YYYY");

      console.log("📊 Candle terakhir yang sudah close:");
      console.log({
        date: formatTime(lastClosedCandle.time * 1000),
        open: lastClosedCandle.open,
        high: lastClosedCandle.high,
        low: lastClosedCandle.low,
        close: lastClosedCandle.close,
        volume: lastClosedCandle.volume,
      });
    }

    console.log(
      "Data historis dari:",
      formatTime(closedCandles[0].time * 1000),
      "sampai",
      formatTime(closedCandles[closedCandles.length - 1].time * 1000)
    );

    // 2. Hitung indikator awal
    const sma20 = SMA(closes, 20);
    const sma50 = SMA(closes, 50);
    let ema20 = EMA(closes, 20);
    let rsi14 = RSI(closes, 14);

    let stochastic = StochasticOscillator(highs, lows, closes, 14, 3);
    let stochRSI = StochasticRSI(closes, 14, 14, 3, 3);
    let macd = MACD(closes, 12, 26, 9);
    let bollinger = BollingerBands(closes, 20, 2);
    const psar = ParabolicSAR(highs, lows, closes, 0.02, 0.2);

    // Tampilkan analisis MA awal
    const initialMAAnalysis = analyzeMACross(sma20, sma50, closes);

    // Get analysis date for display
    const lastCandle = closedCandles[closedCandles.length - 1];
    const analysisDate = dayjs
      .unix(lastCandle.time)
      .tz("Asia/Jakarta")
      .format("DD MMMM YYYY");

    console.log("\n" + "=".repeat(50));
    console.log("📈 HASIL ANALISIS END-OF-DAY (EOD)");
    console.log("=".repeat(50));
    console.log(`📅 Tanggal analisis: ${analysisDate}`);
    console.log(`Close terakhir: $${initialMAAnalysis.close}`);
    console.log(
      `SMA20: $${initialMAAnalysis.sma20} | SMA50: $${initialMAAnalysis.sma50}`
    );
    console.log(
      `Sinyal: ${initialMAAnalysis.signal} - ${initialMAAnalysis.message}`
    );

    // 3. Generate sinyal untuk semua indikator
    let maSignals = generateMASignals(sma20, sma50);
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

    // Combined signal for latest candle
    const finalSignal = combineSignals(closes.length - 1, {
      ma: maSignals,
      rsi: rsiSignals,
      stoch: stochasticSignals,
      stochRSI: stochRSISignals,
      macd: macdSignals,
      bb: bollingerSignals,
      psar: psarSignals,
    });

    console.log(`EMA20: $${ema20.at(-1)?.toFixed(2)}`);
    console.log(`RSI(14): ${rsi14.at(-1)?.toFixed(2)}`);
    console.log(
      `Stochastic Oscillator %K: ${stochastic.k
        .at(-1)
        ?.toFixed(2)} | %D: ${stochastic.d.at(-1)?.toFixed(2)}`
    );
    console.log(
      `StochRSI RSI: ${stochRSI.stochRSI.at(-1)?.toFixed(2)} | %K: ${stochRSI.k
        .at(-1)
        ?.toFixed(2)} | %D: ${stochRSI.d.at(-1)?.toFixed(2)}`
    );

    console.log(
      `MACD: ${macd.macd.at(-1)?.toFixed(2)} | Signal: ${macd.signal
        .at(-1)
        ?.toFixed(2)} | Histogram: ${macd.histogram.at(-1)?.toFixed(2)}`
    );

    console.log(
      `BB Upper: $${bollinger.upper
        .at(-1)
        ?.toFixed(2)} | Middle (SMA20): $${bollinger.middle
        .at(-1)
        ?.toFixed(2)} | Lower: $${bollinger.lower.at(-1)?.toFixed(2)}`
    );

    console.log(`PSAR: $${psar.at(-1)?.toFixed(2)}`);

    console.log("\n📊 SINYAL GABUNGAN:");
    console.log(`Final Signal: ${finalSignal}`);

    console.log("\n" + "=".repeat(50));
    console.log("📊 Analisis ini berbasis End-of-Day (EOD).");
    console.log(
      "📊 Akan dijalankan ulang otomatis setiap hari pukul 07:05 WIB."
    );
    console.log("=".repeat(50));
  } catch (err) {
    console.error("❌ Error di main():", err.message);
  }
}

// Scheduler functions
function getNextScheduleTime() {
  const now = dayjs().tz("Asia/Jakarta");
  const target = now.hour(7).minute(5).second(0).millisecond(0);

  // Jika sudah lewat jam 07:05 hari ini, jadwalkan untuk besok
  if (now.isAfter(target)) {
    return target.add(1, "day");
  }

  return target;
}

function scheduleNextRun() {
  const nextRun = getNextScheduleTime();
  const now = dayjs().tz("Asia/Jakarta");
  const delay = nextRun.diff(now);

  console.log(
    `\n⏰ Analisis berikutnya dijadwalkan pada: ${nextRun.format(
      "DD MMMM YYYY, HH:mm:ss"
    )} WIB`
  );
  console.log(`⏰ Dalam ${Math.round(delay / 1000 / 60)} menit lagi...`);

  setTimeout(async () => {
    console.log(
      `\n🔔 Waktunya analisis EOD! ${dayjs()
        .tz("Asia/Jakarta")
        .format("DD MMMM YYYY, HH:mm:ss")} WIB`
    );
    await main();

    // Jadwalkan run berikutnya
    scheduleNextRun();
  }, delay);
}

// Start the EOD system
(async () => {
  console.log("🚀 Sistem EOD (End-of-Day) Analysis dimulai...");
  console.log(
    `🕐 Waktu saat ini: ${dayjs()
      .tz("Asia/Jakarta")
      .format("DD MMMM YYYY, HH:mm:ss")} WIB`
  );

  // Jalankan analisis pertama kali
  await main();

  // Jadwalkan run berikutnya
  scheduleNextRun();

  // Keep the process running
  process.on("SIGINT", () => {
    console.log("\n📊 Sistem EOD dihentikan. Terima kasih!");
    process.exit(0);
  });
})();
