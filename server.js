import express from "express";
import cors from "cors";
import {
  getHistorical,
  connectWebSocket,
  connectTickerStream,
  getGlobalTickerPrice,
  getGlobalTickerTime,
} from "./data.js";
import { SMA, RSI, EMA } from "./indicators.js";
import { generateMASignals, generateRSISignals } from "./signals.js";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

// Configure dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);

const app = express();
const PORT = 8000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Create HTTP server and WebSocket server
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// Cache untuk menyimpan data berbagai timeframe
let dataCache = {
  "1m": null,
  "5m": null,
  "1h": null,
  "1d": null,
};

// Global last time untuk sinkronisasi semua timeframe
let globalLastTime = null;
let globalLastPrice = null;

// WebSocket clients tracking
const wsClients = new Map(); // Map<timeframe, Set<WebSocket>>

// Current candle tracking for each timeframe
const currentCandles = new Map(); // Map<timeframe, candleData>

// Helper function to get candle start time for timeframe
function getCandleStartTime(timestamp, timeframe) {
  const date = dayjs.unix(timestamp).tz("Asia/Jakarta");

  switch (timeframe) {
    case "1m":
      return date.startOf("minute").unix();
    case "5m":
      return date
        .startOf("minute")
        .subtract(date.minute() % 5, "minute")
        .unix();
    case "1h":
      return date.startOf("hour").unix();
    case "1d":
      return date.startOf("day").unix();
    default:
      return timestamp;
  }
}

// Helper function to get next candle start time
function getNextCandleStartTime(timestamp, timeframe) {
  const date = dayjs.unix(timestamp).tz("Asia/Jakarta");

  switch (timeframe) {
    case "1m":
      return date.add(1, "minute").startOf("minute").unix();
    case "5m":
      const currentMinute = date.minute();
      const nextFiveMinute = Math.ceil((currentMinute + 1) / 5) * 5;
      return date.minute(nextFiveMinute).startOf("minute").unix();
    case "1h":
      return date.add(1, "hour").startOf("hour").unix();
    case "1d":
      return date.add(1, "day").startOf("day").unix();
    default:
      return timestamp + 60;
  }
}

// Fungsi untuk mendapatkan global last time dari ticker
async function calculateGlobalLastTime() {
  try {
    // Use ticker price and time if available
    const tickerPrice = getGlobalTickerPrice();
    const tickerTime = getGlobalTickerTime();

    if (tickerPrice && tickerTime) {
      globalLastTime = tickerTime;
      globalLastPrice = tickerPrice;

      const jakartaTime = dayjs
        .unix(globalLastTime)
        .tz("Asia/Jakarta")
        .format("DD/MM/YYYY HH:mm:ss");
      console.log(
        `🌏 Global last time from ticker: ${globalLastTime} (${jakartaTime} WIB)`
      );
      console.log(`💰 Global last price from ticker: ${globalLastPrice}`);
      return;
    }

    // Fallback: Load 1m data untuk mendapatkan candle terakhir
    const startTime = Date.now() - 24 * 60 * 60 * 1000; // 1 hari
    const endTime = Date.now();

    const candles1m = await getHistorical("BTCUSDT", "1m", startTime, endTime);

    if (candles1m && candles1m.length > 0) {
      const lastCandle = candles1m[candles1m.length - 1];
      globalLastTime = lastCandle.time;
      globalLastPrice = lastCandle.close;

      const jakartaTime = dayjs
        .unix(globalLastTime)
        .tz("Asia/Jakarta")
        .format("DD/MM/YYYY HH:mm:ss");
      console.log(
        `🌏 Global last time fallback: ${globalLastTime} (${jakartaTime} WIB)`
      );
      console.log(`💰 Global last price fallback: ${globalLastPrice}`);
    }
  } catch (error) {
    console.error("❌ Error calculating global last time:", error.message);
  }
}

// Fungsi untuk load data berdasarkan timeframe
async function loadDataForTimeframe(timeframe) {
  try {
    let startTime, endTime;

    // Set date range berdasarkan timeframe (dalam ms timestamp)
    switch (timeframe) {
      case "1m":
        startTime = Date.now() - 24 * 60 * 60 * 1000; // 1 hari
        endTime = Date.now();
        break;
      case "5m":
        startTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 hari
        endTime = Date.now();
        break;
      case "1h":
        startTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 hari
        endTime = Date.now();
        break;
      case "1d":
      default:
        startTime = new Date("2020-10-01").getTime();
        endTime = new Date("2025-10-01").getTime();
        break;
    }

    const candles = await getHistorical(
      "BTCUSDT",
      timeframe,
      startTime,
      endTime
    );

    if (!candles.length) {
      console.error(`⚠️ No data available for timeframe ${timeframe}`);
      return null;
    }

    const closes = candles.map((d) => d.close);
    const sma5 = SMA(closes, 5);
    const sma20 = SMA(closes, 20);
    const ema20 = EMA(closes, 20);
    const rsi14 = RSI(closes, 14);

    const processedData = candles.map((c, i) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      sma5: sma5[i],
      sma20: sma20[i],
      ema20: ema20[i],
      rsi: rsi14[i],
    }));

    dataCache[timeframe] = processedData;

    // Initialize current candle for this timeframe
    if (processedData.length > 0) {
      const lastCandle = processedData[processedData.length - 1];
      currentCandles.set(timeframe, {
        time: lastCandle.time,
        open: lastCandle.open,
        high: lastCandle.high,
        low: lastCandle.low,
        close: lastCandle.close,
        volume: lastCandle.volume,
      });
    }

    return processedData;
  } catch (err) {
    console.error(`❌ Error loading data for ${timeframe}:`, err.message);
    return null;
  }
}

// Initialize dengan data 1d default
async function init() {
  console.log("🚀 Initializing server...");

  // Load initial data for all timeframes
  for (const timeframe of ["1d", "1h", "5m", "1m"]) {
    await loadDataForTimeframe(timeframe);
  }

  // Calculate global time after loading data
  await calculateGlobalLastTime();

  console.log("✅ Server initialization complete");
}

init();

// Endpoint untuk chart - struktur JSON sesuai requirement
app.get("/api/candles", async (req, res) => {
  try {
    const timeframe = req.query.timeframe || "1d";

    // Pastikan global last time sudah dihitung
    if (!globalLastTime) {
      await calculateGlobalLastTime();
    }

    // Cek apakah data sudah ada di cache
    let data = dataCache[timeframe];

    // Jika belum ada, load data baru
    if (!data) {
      data = await loadDataForTimeframe(timeframe);
    }

    if (!data || data.length === 0) {
      return res.status(500).json({
        success: false,
        message: `Data tidak tersedia untuk timeframe ${timeframe}`,
      });
    }

    // Sinkronisasi dengan globalLastTime dan ticker price
    let syncedData = [...data];
    const lastCandle = syncedData[syncedData.length - 1];
    const tickerPrice = getGlobalTickerPrice();
    const tickerTime = getGlobalTickerTime();

    // Use ticker data if available and more recent
    if (tickerPrice && tickerTime && tickerTime >= lastCandle.time) {
      const candleStartTime = getCandleStartTime(tickerTime, timeframe);

      if (candleStartTime === lastCandle.time) {
        // Update existing candle with ticker price
        lastCandle.close = tickerPrice;
        lastCandle.high = Math.max(lastCandle.high, tickerPrice);
        lastCandle.low = Math.min(lastCandle.low, tickerPrice);

        console.log(
          `🔄 ${timeframe} - Updated last candle with ticker price: ${tickerPrice}`
        );
      } else if (candleStartTime > lastCandle.time) {
        // Add new candle based on ticker
        const newCandle = {
          time: candleStartTime,
          open: lastCandle.close,
          high: tickerPrice,
          low: tickerPrice,
          close: tickerPrice,
          volume: 0,
          sma5: null,
          sma20: null,
          ema20: null,
          rsi: null,
        };
        syncedData.push(newCandle);

        const jakartaTime = dayjs
          .unix(candleStartTime)
          .tz("Asia/Jakarta")
          .format("DD/MM/YYYY HH:mm:ss");
        console.log(
          `➕ ${timeframe} - Added new candle at ${candleStartTime} (${jakartaTime} WIB) with ticker price: ${tickerPrice}`
        );
      }
    }

    // Update global last time to ticker time if available
    const finalGlobalTime = tickerTime || globalLastTime;
    const finalGlobalPrice = tickerPrice || globalLastPrice;

    // Struktur response dengan globalLastTime
    res.json({
      success: true,
      symbol: "BTCUSDT",
      timeframe: timeframe,
      lastUpdated: new Date().toISOString(),
      globalLastTime: finalGlobalTime,
      globalLastTimeJakarta: finalGlobalTime
        ? dayjs
            .unix(finalGlobalTime)
            .tz("Asia/Jakarta")
            .format("DD/MM/YYYY HH:mm:ss")
        : null,
      globalLastPrice: finalGlobalPrice,
      candles: syncedData,
      indicators: {
        sma5: syncedData
          .map((d, i) => ({ time: d.time, value: d.sma5 }))
          .filter((item) => item.value !== null && item.value !== undefined),
        sma20: syncedData
          .map((d, i) => ({ time: d.time, value: d.sma20 }))
          .filter((item) => item.value !== null && item.value !== undefined),
        ema20: syncedData
          .map((d, i) => ({ time: d.time, value: d.ema20 }))
          .filter((item) => item.value !== null && item.value !== undefined),
        rsi: syncedData
          .map((d, i) => ({ time: d.time, value: d.rsi }))
          .filter((item) => item.value !== null && item.value !== undefined),
      },
      count: syncedData.length,
    });
  } catch (error) {
    console.error("❌ Error in /api/candles:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Endpoint lama untuk kompatibilitas
app.get("/api/indicators", (req, res) => {
  const data = dataCache["1d"];
  if (!data || !data.length) {
    return res.status(500).json({
      success: false,
      message: "Data belum tersedia",
    });
  }

  res.json({
    success: true,
    symbol: "BTCUSDT",
    interval: "1d",
    lastUpdated: new Date().toISOString(),
    indicators: data,
  });
});

// Endpoint untuk refresh data - tambahkan GET method
app.get("/api/refresh/:timeframe", async (req, res) => {
  try {
    const timeframe = req.params.timeframe;

    const data = await loadDataForTimeframe(timeframe);

    if (data) {
      res.json({
        success: true,
        message: `Data ${timeframe} berhasil di-refresh`,
        count: data.length,
      });
    } else {
      res.status(500).json({
        success: false,
        message: `Gagal refresh data ${timeframe}`,
      });
    }
  } catch (error) {
    console.error("❌ Error in refresh:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// POST method untuk refresh (untuk kompatibilitas)
app.post("/api/refresh/:timeframe", async (req, res) => {
  try {
    const timeframe = req.params.timeframe;

    const data = await loadDataForTimeframe(timeframe);

    if (data) {
      res.json({
        success: true,
        message: `Data ${timeframe} berhasil di-refresh`,
        count: data.length,
      });
    } else {
      res.status(500).json({
        success: false,
        message: `Gagal refresh data ${timeframe}`,
      });
    }
  } catch (error) {
    console.error("❌ Error in refresh:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// WebSocket connection handler
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const timeframe = url.searchParams.get("timeframe") || "1d";

  console.log(`📡 WebSocket client connected for ${timeframe}`);

  // Add client to tracking
  if (!wsClients.has(timeframe)) {
    wsClients.set(timeframe, new Set());
  }
  wsClients.get(timeframe).add(ws);

  // Send initial connection confirmation
  ws.send(
    JSON.stringify({
      type: "connected",
      timeframe: timeframe,
      timestamp: Date.now(),
    })
  );

  ws.on("close", () => {
    console.log(`📡 WebSocket client disconnected from ${timeframe}`);
    if (wsClients.has(timeframe)) {
      wsClients.get(timeframe).delete(ws);
      if (wsClients.get(timeframe).size === 0) {
        wsClients.delete(timeframe);
      }
    }
  });

  ws.on("error", (error) => {
    console.error("📡 WebSocket error:", error);
  });
});

// Function to broadcast realtime data to WebSocket clients
function broadcastToClients(timeframe, data) {
  if (!wsClients.has(timeframe)) return;

  const clients = wsClients.get(timeframe);

  // Include global time info in WebSocket message
  const messageData = {
    ...data,
    globalLastTime: getGlobalTickerTime() || globalLastTime,
    globalLastTimeJakarta:
      getGlobalTickerTime() || globalLastTime
        ? dayjs
            .unix(getGlobalTickerTime() || globalLastTime)
            .tz("Asia/Jakarta")
            .format("DD/MM/YYYY HH:mm:ss")
        : null,
    globalLastPrice: getGlobalTickerPrice() || globalLastPrice,
    type: "candle_update",
  };

  const message = JSON.stringify(messageData);

  clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  });
}

// Function to handle candle updates for a specific timeframe
function handleCandleUpdate(timeframe, candleData) {
  if (!dataCache[timeframe]) return;

  const candleStartTime = getCandleStartTime(candleData.time, timeframe);
  const currentCandle = currentCandles.get(timeframe);

  // Get ticker price for real-time updates
  const tickerPrice = getGlobalTickerPrice();

  if (currentCandle && candleStartTime === currentCandle.time) {
    // Update existing candle
    if (!candleData.isClosed && tickerPrice) {
      // Use ticker price for running candle
      currentCandle.close = tickerPrice;
      currentCandle.high = Math.max(currentCandle.high, tickerPrice);
      currentCandle.low = Math.min(currentCandle.low, tickerPrice);
    } else {
      // Use kline data for closed candle or when ticker unavailable
      currentCandle.close = candleData.close;
      currentCandle.high = Math.max(currentCandle.high, candleData.high);
      currentCandle.low = Math.min(currentCandle.low, candleData.low);
    }

    console.log(
      `🔄 ${timeframe} - Updated running candle: close=${currentCandle.close}, closed=${candleData.isClosed}`
    );

    // Broadcast the updated candle
    broadcastToClients(timeframe, {
      time: currentCandle.time,
      open: currentCandle.open,
      high: currentCandle.high,
      low: currentCandle.low,
      close: currentCandle.close,
      volume: currentCandle.volume,
      isClosed: candleData.isClosed || false,
    });
  } else {
    // New candle period
    const newCandle = {
      time: candleStartTime,
      open: currentCandle ? currentCandle.close : candleData.open,
      high: tickerPrice || candleData.high,
      low: tickerPrice || candleData.low,
      close: tickerPrice || candleData.close,
      volume: candleData.volume || 0,
    };

    // Update current candle tracking
    currentCandles.set(timeframe, newCandle);

    // Add to cache
    dataCache[timeframe].push({
      ...newCandle,
      sma5: null,
      sma20: null,
      ema20: null,
      rsi: null,
    });

    // Keep cache size reasonable
    if (dataCache[timeframe].length > 1000) {
      dataCache[timeframe] = dataCache[timeframe].slice(-1000);
    }

    const jakartaTime = dayjs
      .unix(candleStartTime)
      .tz("Asia/Jakarta")
      .format("DD/MM/YYYY HH:mm:ss");
    console.log(
      `➕ ${timeframe} - New candle: ${candleStartTime} (${jakartaTime} WIB) close=${newCandle.close}`
    );

    // Broadcast the new candle
    broadcastToClients(timeframe, {
      ...newCandle,
      isClosed: false,
    });
  }
}

// Function to handle ticker price updates
function handleTickerUpdate(tickerData) {
  const timeframes = ["1m", "5m", "1h", "1d"];

  timeframes.forEach((timeframe) => {
    if (!dataCache[timeframe] || !currentCandles.has(timeframe)) return;

    const currentCandle = currentCandles.get(timeframe);
    const candleStartTime = getCandleStartTime(tickerData.time, timeframe);

    if (candleStartTime === currentCandle.time) {
      // Update current running candle with ticker price
      currentCandle.close = tickerData.close;
      currentCandle.high = Math.max(currentCandle.high, tickerData.close);
      currentCandle.low = Math.min(currentCandle.low, tickerData.close);

      // Broadcast ticker update
      broadcastToClients(timeframe, {
        time: currentCandle.time,
        open: currentCandle.open,
        high: currentCandle.high,
        low: currentCandle.low,
        close: currentCandle.close,
        volume: currentCandle.volume,
        isClosed: false,
        isTickerUpdate: true,
      });
    }
  });
}

// Initialize realtime connections for all timeframes
function initializeRealtimeConnections() {
  const timeframes = ["1m", "5m", "1h", "1d"];

  // Start ticker stream first
  console.log(`🔄 Starting ticker stream for BTCUSDT`);
  connectTickerStream("btcusdt");

  // Start kline streams for each timeframe
  timeframes.forEach((timeframe) => {
    console.log(`🔄 Starting kline stream for ${timeframe}`);

    connectWebSocket("btcusdt", timeframe, (candleData) => {
      if (candleData.isTickerUpdate) {
        // Handle ticker price update
        handleTickerUpdate(candleData);
      } else {
        // Handle kline candle update
        handleCandleUpdate(timeframe, candleData);
      }
    });
  });
}

// Start server with WebSocket support
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📡 WebSocket server ready for realtime updates`);

  // Initialize realtime connections after server starts
  setTimeout(() => {
    initializeRealtimeConnections();
  }, 2000);
});
