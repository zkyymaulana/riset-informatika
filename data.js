import axios from "axios";
import WebSocket from "ws";
import { formatTime } from "./utils/formatTime.js";

// ======================= REST API =======================
export async function getHistorical(symbol, interval, startTime, endTime) {
  if (interval !== "1d") {
    console.warn(`API Coinbase hanya support di interval: ${interval}`);
    return [];
  }

  // Convert symbol format
  let coinbaseSymbol = symbol;
  if (symbol === "BTCUSDT" || symbol === "BTCUSD") {
    coinbaseSymbol = "BTC-USD";
  }

  let allCandles = [];
  let batchCount = 0;
  let currentStart = startTime;

  // Coinbase maksimal 300 candles per request
  const maxCandlesPerBatch = 300;
  const oneDayMs = 24 * 60 * 60 * 1000; // 1 hari dalam milliseconds

  while (currentStart < endTime) {
    try {
      batchCount++;

      // Hitung end time untuk batch ini (300 hari dari current start)
      const batchEnd = Math.min(
        currentStart + maxCandlesPerBatch * oneDayMs,
        endTime
      );

      // Ubah ke format ISO untuk API Coinbase
      const startISO = new Date(currentStart).toISOString();
      const endISO = new Date(batchEnd).toISOString();

      const res = await axios.get(
        `https://api.exchange.coinbase.com/products/${coinbaseSymbol}/candles`,
        {
          params: {
            start: startISO,
            end: endISO,
            granularity: 86400, // 1 hari dalam detik
          },
        }
      );

      if (!res.data || !Array.isArray(res.data)) {
        console.error(
          `❌ Batch #${batchCount}: Invalid response format from Coinbase API`
        );
        break;
      }

      // Coinbase mengembalikan: [time, low, high, open, close, volume]
      // Ubah format: { time, open, high, low, close, volume }
      const batchCandles = res.data.map((data) => ({
        time: data[0],
        open: parseFloat(data[3]),
        high: parseFloat(data[2]),
        low: parseFloat(data[1]),
        close: parseFloat(data[4]),
        volume: parseFloat(data[5]),
      }));

      if (batchCandles.length > 0) {
        const firstCandle = batchCandles[0];
        const lastCandle = batchCandles[batchCandles.length - 1];

        // console.log(
        //   `✅ Batch #${batchCount}: ${
        //     batchCandles.length
        //   } candles loaded (${formatTime(
        //     firstCandle.time * 1000
        //   )} → ${formatTime(lastCandle.time * 1000)})`
        // );

        // tambah ke array utama
        allCandles = allCandles.concat(batchCandles);
      } else {
        console.log(`⚠️ Batch #${batchCount}: No data returned`);
      }

      // Siapkan start time untuk batch berikutnya
      currentStart = batchEnd + oneDayMs; // tambah 1 hari untuk menghindari overlap

      // setelah 1 batch, lanjut ke batch berikutnya agar tidak terkena limit coin base
      if (currentStart < endTime) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error(error.response?.data || error.message);
    }
  }

  // sort berdasarkan waktu ascending (terlama ke terbaru)
  allCandles.sort((a, b) => a.time - b.time);

  // hapus duplikat (jika ada overlap)
  const uniqueCandles = [];
  const seenTimes = new Set();

  for (const candle of allCandles) {
    if (!seenTimes.has(candle.time)) {
      seenTimes.add(candle.time);
      uniqueCandles.push(candle);
    }
  }

  if (uniqueCandles.length > 0) {
    const firstCandle = uniqueCandles[0];
    const lastCandle = uniqueCandles[uniqueCandles.length - 1];

    console.log(
      `Total ${uniqueCandles.length} candles loaded in ${batchCount} requests.`
    );
    console.log(
      `Data dari: ${formatTime(firstCandle.time * 1000)} - ${formatTime(
        lastCandle.time * 1000
      )}`
    );
  } else {
    console.log(`No data loaded for ${coinbaseSymbol} ${interval}`);
  }

  return uniqueCandles;
}

// ======================= GLOBAL STATE =======================
let globalTickerPrice = null;
let globalTickerTime = null;
const activeConnections = new Map(); // Map<symbol_interval, WebSocket>
const candleCallbacks = new Map(); // Map<symbol_interval, callback>

// ======================= KLINE STREAM =======================
export function connectWebSocket(
  symbol = "BTCUSDT",
  interval = "1m",
  onMessage
) {
  const connectionKey = `${symbol}_${interval}`;

  // tutup koneksi lama kalau ada
  if (activeConnections.has(connectionKey)) {
    const existingWs = activeConnections.get(connectionKey);
    existingWs.close();
    activeConnections.delete(connectionKey);
  }

  candleCallbacks.set(connectionKey, onMessage);

  const klineWs = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`
  );

  activeConnections.set(connectionKey, klineWs);

  klineWs.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.k) {
        const kline = data.k;
        const candleTime = kline.t ? Math.floor(kline.t / 1000) : null;
        const eventTime = data.E ? Math.floor(data.E / 1000) : null;

        const candleData = {
          time: eventTime ?? candleTime, // default pakai eventTime, fallback ke candleTime
          candleTime,
          eventTime,
          open: parseFloat(kline.o),
          high: parseFloat(kline.h),
          low: parseFloat(kline.l),
          close: parseFloat(kline.c),
          volume: parseFloat(kline.v),
          isClosed: kline.x,
          isRealtime: true,
        };

        // update harga realtime dengan ticker stream
        if (globalTickerPrice && !candleData.isClosed) {
          candleData.close = globalTickerPrice;
          candleData.high = Math.max(candleData.high, globalTickerPrice);
          candleData.low = Math.min(candleData.low, globalTickerPrice);
        }

        onMessage(candleData);
      }
    } catch (error) {
      console.error(
        `❌ Error parsing kline message for ${symbol}@${interval}:`,
        error
      );
    }
  });

  klineWs.on("error", (error) => {
    console.error(
      `❌ Kline WebSocket error for ${symbol}@${interval}:`,
      error.message
    );
  });

  klineWs.on("close", () => {
    console.log(`🔌 Kline WebSocket closed for ${symbol}@${interval}`);
    activeConnections.delete(connectionKey);

    // auto-reconnect
    setTimeout(() => {
      if (candleCallbacks.has(connectionKey)) {
        console.log(
          `🔄 Reconnecting kline WebSocket for ${symbol}@${interval}`
        );
        connectWebSocket(symbol, interval, candleCallbacks.get(connectionKey));
      }
    }, 5000);
  });

  return klineWs;
}

// ======================= TICKER STREAM =======================
export function connectTickerStream(symbol = "BTCUSDT") {
  const tickerWs = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@miniTicker`
  );

  tickerWs.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.c) {
        const newPrice = parseFloat(data.c);
        const eventTime = parseInt(data.E);

        globalTickerPrice = newPrice;
        globalTickerTime = Math.floor(eventTime / 1000);

        console.log(
          `💰 Ticker update: ${symbol} = ${newPrice} at ${new Date(
            eventTime
          ).toISOString()}`
        );

        broadcastTickerToAllTimeframes(symbol, newPrice, globalTickerTime);
      }
    } catch (error) {
      console.error(`❌ Error parsing ticker message for ${symbol}:`, error);
    }
  });

  tickerWs.on("error", (error) => {
    console.error(`❌ Ticker WebSocket error for ${symbol}:`, error.message);
  });

  tickerWs.on("close", () => {
    console.log(`🔌 Ticker WebSocket closed for ${symbol}`);
    setTimeout(() => {
      console.log(`🔄 Reconnecting ticker WebSocket for ${symbol}`);
      connectTickerStream(symbol);
    }, 5000);
  });

  return tickerWs;
}

// ======================= BROADCAST =======================
function broadcastTickerToAllTimeframes(symbol, price, time) {
  for (const connectionKey of activeConnections.keys()) {
    if (connectionKey.startsWith(symbol)) {
      const callback = candleCallbacks.get(connectionKey);
      if (callback) {
        const tickerUpdate = {
          time, // pakai eventTime dari ticker
          close: price,
          isTickerUpdate: true,
          interval: connectionKey.split("_")[1],
        };
        callback(tickerUpdate);
      }
    }
  }
}

// ======================= GETTER =======================
export function getGlobalTickerPrice() {
  return globalTickerPrice;
}
export function getGlobalTickerTime() {
  return globalTickerTime;
}
