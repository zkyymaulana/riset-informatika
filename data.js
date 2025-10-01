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

// WebSocket untuk realtime
export function connectWebSocket(
  symbol = "btcusdt",
  interval = "1m",
  onMessage
) {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`
  );

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    if (data.k && data.k.x) {
      // Binance sends completed kline data when x is true
      const kline = data.k;
      const candleData = {
        time: kline.t, // Keep in milliseconds
        open: parseFloat(kline.o),
        high: parseFloat(kline.h),
        low: parseFloat(kline.l),
        close: parseFloat(kline.c),
        volume: parseFloat(kline.v),
      };

      onMessage(candleData);
    }
  });

  ws.on("error", (error) => {
    console.error(
      `❌ WebSocket error for ${symbol}@${interval}:`,
      error.message
    );
  });

  ws.on("close", () => {
    console.log(`🔌 WebSocket closed for ${symbol}@${interval}`);
    // Auto-reconnect after 5 seconds
    setTimeout(() => {
      console.log(`🔄 Reconnecting WebSocket for ${symbol}@${interval}`);
      connectWebSocket(symbol, interval, onMessage);
    }, 5000);
  });

  return ws;
}
