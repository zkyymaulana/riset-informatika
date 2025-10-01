import { getHistorical, connectWebSocket } from "./data.js";
import { SMA, RSI } from "./indicators.js";
import { generateMASignals, generateRSISignals } from "./signals.js";

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

    const closes = history.map((d) => d.close);

    // tampilkan rentang data
    console.log(
      "📅 Data historis tersedia dari:",
      new Date(history[0].time * 1000).toISOString(), // Convert seconds back to ms for display
      "sampai",
      new Date(history.at(-1).time * 1000).toISOString()
    );

    console.log("Total candle:", history.length);

    // 2. Hitung indikator
    let sma5 = SMA(closes, 5);
    let sma20 = SMA(closes, 20);
    let rsi14 = RSI(closes, 14);

    // 3. Generate sinyal
    let maSignals = generateMASignals(sma5, sma20);
    let rsiSignals = generateRSISignals(rsi14);

    console.log("📊 Data terakhir:");
    history.slice(-5).forEach((d, i) => {
      console.log({
        date: new Date(d.time * 1000).toISOString(), // Convert seconds back to ms for display
        close: d.close,
        sma5: sma5[sma5.length - 5 + i],
        sma20: sma20[sma20.length - 5 + i],
        maSignal: maSignals[maSignals.length - 5 + i],
        rsi: rsi14[rsi14.length - 5 + i],
        rsiSignal: rsiSignals[rsiSignals.length - 5 + i],
      });
    });

    // 4. WebSocket realtime update
    connectWebSocket("btcusdt", "1m", ({ time, close }) => {
      closes.push(close);

      sma5 = SMA(closes, 5);
      sma20 = SMA(closes, 20);
      rsi14 = RSI(closes, 14);

      maSignals = generateMASignals(sma5, sma20);
      rsiSignals = generateRSISignals(rsi14);

      console.log(
        `📅 ${new Date(time).toISOString()} | Close: ${close} | SMA5: ${sma5
          .at(-1)
          ?.toFixed(2)} | SMA20: ${sma20
          .at(-1)
          ?.toFixed(2)} | MA Signal: ${maSignals.at(-1)} | RSI: ${rsi14
          .at(-1)
          ?.toFixed(2)} | RSI Signal: ${rsiSignals.at(-1)}`
      );
    });
  } catch (err) {
    console.error("❌ Error di index.js:", err.message);
  }
})();
