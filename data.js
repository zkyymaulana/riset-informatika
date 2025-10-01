import axios from "axios";
import WebSocket from "ws";

export async function getHistorical(symbol, interval, startTime, endTime) {
  // startTime dan endTime sekarang dalam ms timestamp
  let allCandles = [];
  let fetchStart = startTime;
  let requestCount = 0;

  console.log(
    `🔄 Loading ${symbol} ${interval} data from ${new Date(
      startTime
    ).toISOString()} to ${new Date(endTime).toISOString()}`
  );

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
        time: Math.floor(d[0] / 1000), // Convert ms to seconds for lightweight-charts
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));

      if (candles.length === 0) {
        break;
      }

      allCandles = allCandles.concat(candles);

      // Move to next batch: last candle time (in ms) + 1ms
      fetchStart = res.data[res.data.length - 1][0] + 1;

      // Rate limit protection
      if (fetchStart < endTime) {
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (error) {
      console.error(
        `❌ Error fetching data (request #${requestCount}):`,
        error.message
      );

      if (error.response && error.response.status === 429) {
        await new Promise((r) => setTimeout(r, 2000));
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

// Global state for managing realtime data
let globalTickerPrice = null;
let globalTickerTime = null;
const activeConnections = new Map(); // Map<timeframe, WebSocket>
const candleCallbacks = new Map(); // Map<timeframe, callback>

// WebSocket untuk realtime dengan ticker stream
export function connectWebSocket(
  symbol = "btcusdt",
  interval = "1m",
  onMessage
) {
  const connectionKey = `${symbol}_${interval}`;

  // Close existing connection for this timeframe if any
  if (activeConnections.has(connectionKey)) {
    const existingWs = activeConnections.get(connectionKey);
    existingWs.close();
    activeConnections.delete(connectionKey);
  }

  // Store callback for this timeframe
  candleCallbacks.set(connectionKey, onMessage);

  // Create kline WebSocket connection
  const klineWs = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`
  );

  activeConnections.set(connectionKey, klineWs);

  klineWs.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.k) {
        const kline = data.k;
        const candleData = {
          time: Math.floor(kline.t / 1000), // Convert to seconds
          open: parseFloat(kline.o),
          high: parseFloat(kline.h),
          low: parseFloat(kline.l),
          close: parseFloat(kline.c),
          volume: parseFloat(kline.v),
          isClosed: kline.x, // true when candle is closed/final
          isRealtime: true,
        };

        // For TradingView-like behavior: always update with latest ticker price if available
        if (globalTickerPrice && !candleData.isClosed) {
          // Update current candle with latest ticker price
          candleData.close = globalTickerPrice;
          // Update high/low if needed
          candleData.high = Math.max(candleData.high, globalTickerPrice);
          candleData.low = Math.min(candleData.low, globalTickerPrice);
        }

        console.log(`📊 ${symbol}@${interval} - Kline data:`, {
          time: candleData.time,
          close: candleData.close,
          isClosed: candleData.isClosed,
          tickerPrice: globalTickerPrice,
        });

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

    // Auto-reconnect after 5 seconds
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

// Separate ticker stream connection for global price updates
export function connectTickerStream(symbol = "btcusdt") {
  const tickerWs = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol}@ticker`
  );

  tickerWs.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.c) {
        // 'c' is the close price in ticker stream
        const newPrice = parseFloat(data.c);
        const eventTime = parseInt(data.E); // Event time in ms

        // Update global ticker state
        globalTickerPrice = newPrice;
        globalTickerTime = Math.floor(eventTime / 1000); // Convert to seconds

        console.log(
          `💰 Ticker update: ${symbol} = ${newPrice} at ${new Date(
            eventTime
          ).toISOString()}`
        );

        // Broadcast ticker update to all active timeframe connections
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
    // Auto-reconnect ticker stream
    setTimeout(() => {
      console.log(`🔄 Reconnecting ticker WebSocket for ${symbol}`);
      connectTickerStream(symbol);
    }, 5000);
  });

  return tickerWs;
}

// Helper function to broadcast ticker updates to all timeframes
function broadcastTickerToAllTimeframes(symbol, price, time) {
  const timeframes = ["1m", "5m", "1h", "1d"];

  timeframes.forEach((interval) => {
    const connectionKey = `${symbol}_${interval}`;
    const callback = candleCallbacks.get(connectionKey);

    if (callback) {
      // Create a ticker update that can be used to update current candle
      const tickerUpdate = {
        time: time,
        close: price,
        isTickerUpdate: true,
        interval: interval,
      };

      // Only call callback if we have an active connection
      if (activeConnections.has(connectionKey)) {
        callback(tickerUpdate);
      }
    }
  });
}

// Export getter for global ticker price
export function getGlobalTickerPrice() {
  return globalTickerPrice;
}

export function getGlobalTickerTime() {
  return globalTickerTime;
}
