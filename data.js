import axios from "axios";
import WebSocket from "ws";
import { formatTime } from "./utils/formatTime.js";

// ======================= REST API =======================
export async function getHistorical(symbol, interval, startTime, endTime) {
  let allCandles = [];
  let fetchStart = startTime;
  let requestCount = 0;

  // console.log(
  //   `🔄 Loading ${symbol} ${interval} data dari ${formatTime(
  //     startTime
  //   )} sampai ${formatTime(endTime)}`
  // );

  while (fetchStart < endTime) {
    try {
      requestCount++;
      const res = await axios.get("https://api.binance.com/api/v3/klines", {
        params: {
          symbol,
          interval,
          limit: 1000,
          startTime: fetchStart,
          endTime: endTime,
        },
      });

      const candles = res.data.map((d) => ({
        time: Math.floor(d[0] / 1000), // openTime (detik)
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));

      if (candles.length === 0) break;

      allCandles = allCandles.concat(candles);

      // lanjut batch berikut
      fetchStart = res.data[res.data.length - 1][0] + 1;

      if (fetchStart < endTime) {
        await new Promise((r) => setTimeout(r, 300)); // rate limit safe
      }
    } catch (error) {
      console.error(
        `❌ Error fetching data (request #${requestCount}):`,
        error.response?.data || error.message
      );

      // Log more details for debugging
      if (error.response) {
        console.error(
          `Status: ${error.response.status}, Data:`,
          error.response.data
        );
      }

      if (error.response && error.response.status === 429) {
        console.log("⏳ Rate limit hit, waiting 2 seconds...");
        await new Promise((r) => setTimeout(r, 2000));
      } else if (error.response && error.response.status === 400) {
        console.error("❌ Bad Request - Check symbol format and time range");
        break; // Stop retrying on 400 errors
      } else {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  console.log(
    `✅ ${symbol} ${interval}: ${allCandles.length} candles loaded in ${requestCount} requests`
  );
  return allCandles;
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
