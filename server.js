import express from "express";
import cors from "cors";
import {
  getHistorical,
  connectWebSocket,
  connectTickerStream,
  getGlobalTickerPrice,
  getGlobalTickerTime,
} from "./data.js";
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

// Current candle tracking for each timeframe with slot-based approach
const currentCandles = new Map(); // Map<timeframe, candleData>

// Timeframe configurations in seconds
const TIMEFRAME_SECONDS = {
  "1m": 60,
  "5m": 300,
  "1h": 3600,
  "1d": 86400,
};

// Helper function to get timeframe size in seconds
function getTimeframeSeconds(timeframe) {
  return TIMEFRAME_SECONDS[timeframe] || 60;
}

// Helper function to calculate candle slot for timeframe
function getCandleSlot(timestamp, timeframe) {
  const timeframeSeconds = getTimeframeSeconds(timeframe);
  return Math.floor(timestamp / timeframeSeconds);
}

// Helper function to get candle start time from slot
function getCandleStartTimeFromSlot(slot, timeframe) {
  const timeframeSeconds = getTimeframeSeconds(timeframe);
  return slot * timeframeSeconds;
}

// Helper function to get candle start time for timeframe (legacy - kept for compatibility)
function getCandleStartTime(timestamp, timeframe) {
  const slot = getCandleSlot(timestamp, timeframe);
  return getCandleStartTimeFromSlot(slot, timeframe);
}

// Helper function to get next candle start time
function getNextCandleStartTime(timestamp, timeframe) {
  const currentSlot = getCandleSlot(timestamp, timeframe);
  const nextSlot = currentSlot + 1;
  return getCandleStartTimeFromSlot(nextSlot, timeframe);
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

    // Extract data arrays untuk perhitungan indikator
    const closes = candles.map((d) => d.close);
    const highs = candles.map((d) => d.high);
    const lows = candles.map((d) => d.low);

    // Hitung indikator tradisional
    const sma5 = SMA(closes, 5);
    const sma20 = SMA(closes, 20);
    const ema20 = EMA(closes, 20);
    const rsi14 = RSI(closes, 14);

    // Hitung indikator baru
    const stochastic = StochasticOscillator(highs, lows, closes, 14, 3);
    const stochRSI = StochasticRSI(closes, 14, 14);
    const macd = MACD(closes, 12, 26, 9);
    const bollinger = BollingerBands(closes, 20, 2);
    const psar = ParabolicSAR(highs, lows, closes, 0.02, 0.2);

    // Proses data dengan semua indikator
    const processedData = candles.map((c, i) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      // Indikator lama
      sma5: sma5[i],
      sma20: sma20[i],
      ema20: ema20[i],
      rsi: rsi14[i],
      // Indikator baru
      stochK: stochastic.k[i],
      stochD: stochastic.d[i],
      stochRSI: stochRSI[i],
      macdLine: macd.macd[i],
      macdSignal: macd.signal[i],
      macdHistogram: macd.histogram[i],
      bbUpper: bollinger.upper[i],
      bbMiddle: bollinger.middle[i],
      bbLower: bollinger.lower[i],
      psar: psar[i],
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

    // Struktur response dengan semua indikator baru
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
        // Indikator lama
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

        // Indikator baru - Stochastic Oscillator
        stochK: syncedData
          .map((d, i) => ({ time: d.time, value: d.stochK }))
          .filter((item) => item.value !== null && item.value !== undefined),
        stochD: syncedData
          .map((d, i) => ({ time: d.time, value: d.stochD }))
          .filter((item) => item.value !== null && item.value !== undefined),

        // Stochastic RSI
        stochRSI: syncedData
          .map((d, i) => ({ time: d.time, value: d.stochRSI }))
          .filter((item) => item.value !== null && item.value !== undefined),

        // MACD
        macdLine: syncedData
          .map((d, i) => ({ time: d.time, value: d.macdLine }))
          .filter((item) => item.value !== null && item.value !== undefined),
        macdSignal: syncedData
          .map((d, i) => ({ time: d.time, value: d.macdSignal }))
          .filter((item) => item.value !== null && item.value !== undefined),
        macdHistogram: syncedData
          .map((d, i) => ({ time: d.time, value: d.macdHistogram }))
          .filter((item) => item.value !== null && item.value !== undefined),

        // Bollinger Bands
        bbUpper: syncedData
          .map((d, i) => ({ time: d.time, value: d.bbUpper }))
          .filter((item) => item.value !== null && item.value !== undefined),
        bbMiddle: syncedData
          .map((d, i) => ({ time: d.time, value: d.bbMiddle }))
          .filter((item) => item.value !== null && item.value !== undefined),
        bbLower: syncedData
          .map((d, i) => ({ time: d.time, value: d.bbLower }))
          .filter((item) => item.value !== null && item.value !== undefined),

        // Parabolic SAR
        psar: syncedData
          .map((d, i) => ({ time: d.time, value: d.psar }))
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

// Function to handle candle updates for a specific timeframe with slot-based logic
function handleCandleUpdate(timeframe, candleData) {
  if (!dataCache[timeframe]) {
    console.warn(`⚠️ No cache initialized for ${timeframe}`);
    return;
  }

  const currentSlot = getCandleSlot(candleData.time, timeframe);
  const candleStartTime = getCandleStartTimeFromSlot(currentSlot, timeframe);

  // Get ticker price for real-time updates
  const tickerPrice = getGlobalTickerPrice();
  const currentTime = getGlobalTickerTime() || Math.floor(Date.now() / 1000);

  // Use ticker price if available and candle is not closed
  const effectivePrice =
    !candleData.isClosed && tickerPrice ? tickerPrice : candleData.close;

  // Get or initialize current candle for this timeframe
  let currentCandle = currentCandles.get(timeframe);

  if (!currentCandle) {
    // Initialize from last candle in cache if available
    const cacheData = dataCache[timeframe];
    if (cacheData && cacheData.length > 0) {
      const lastCachedCandle = cacheData[cacheData.length - 1];
      const lastCachedSlot = getCandleSlot(lastCachedCandle.time, timeframe);

      if (lastCachedSlot === currentSlot) {
        // Use existing cached candle as current
        currentCandle = {
          time: lastCachedCandle.time,
          open: lastCachedCandle.open,
          high: lastCachedCandle.high,
          low: lastCachedCandle.low,
          close: lastCachedCandle.close,
          volume: lastCachedCandle.volume || 0,
        };
      }
    }
  }

  if (currentCandle) {
    const currentCandleSlot = getCandleSlot(currentCandle.time, timeframe);

    if (currentCandleSlot === currentSlot) {
      // Same slot - update existing running candle
      currentCandle.high = Math.max(
        currentCandle.high,
        candleData.high,
        effectivePrice
      );
      currentCandle.low = Math.min(
        currentCandle.low,
        candleData.low,
        effectivePrice
      );
      currentCandle.close = effectivePrice;
      currentCandle.volume =
        (currentCandle.volume || 0) + (candleData.volume || 0);

      // Update in cache to prevent duplicates
      const cacheData = dataCache[timeframe];
      if (cacheData && cacheData.length > 0) {
        const lastCachedSlot = getCandleSlot(
          cacheData[cacheData.length - 1].time,
          timeframe
        );
        if (lastCachedSlot === currentSlot) {
          // Update existing cache entry
          cacheData[cacheData.length - 1] = {
            ...currentCandle,
            sma5: cacheData[cacheData.length - 1].sma5,
            sma20: cacheData[cacheData.length - 1].sma20,
            ema20: cacheData[cacheData.length - 1].ema20,
            rsi: cacheData[cacheData.length - 1].rsi,
          };
        }
      }

      const jakartaTime = dayjs
        .unix(currentCandle.time)
        .tz("Asia/Jakarta")
        .format("DD/MM/YYYY HH:mm:ss");
      console.log(
        `🔄 ${timeframe} - Updated running candle: slot=${currentSlot}, time=${
          currentCandle.time
        } (${jakartaTime} WIB), close=${currentCandle.close.toFixed(
          2
        )}, closed=${candleData.isClosed || false}`
      );
    } else {
      // Different slot - create new candle
      const newCandle = {
        time: candleStartTime,
        open: currentCandle.close, // Use previous candle's close as open
        high: Math.max(candleData.high, effectivePrice),
        low: Math.min(candleData.low, effectivePrice),
        close: effectivePrice,
        volume: candleData.volume || 0,
      };

      // Add new candle to cache
      dataCache[timeframe].push({
        ...newCandle,
        sma5: null,
        sma20: null,
        ema20: null,
        rsi: null,
      });

      // Update current candle tracking
      currentCandle = newCandle;

      const jakartaTime = dayjs
        .unix(newCandle.time)
        .tz("Asia/Jakarta")
        .format("DD/MM/YYYY HH:mm:ss");
      console.log(
        `➕ ${timeframe} - New candle: slot=${currentSlot}, time=${
          newCandle.time
        } (${jakartaTime} WIB), close=${newCandle.close.toFixed(2)}`
      );
    }
  } else {
    // No current candle - create new one
    const newCandle = {
      time: candleStartTime,
      open: candleData.open,
      high: Math.max(candleData.high, effectivePrice),
      low: Math.min(candleData.low, effectivePrice),
      close: effectivePrice,
      volume: candleData.volume || 0,
    };

    // Add to cache
    dataCache[timeframe].push({
      ...newCandle,
      sma5: null,
      sma20: null,
      ema20: null,
      rsi: null,
    });

    currentCandle = newCandle;

    const jakartaTime = dayjs
      .unix(newCandle.time)
      .tz("Asia/Jakarta")
      .format("DD/MM/YYYY HH:mm:ss");
    console.log(
      `🆕 ${timeframe} - Created new candle: slot=${currentSlot}, time=${
        newCandle.time
      } (${jakartaTime} WIB), close=${newCandle.close.toFixed(2)}`
    );
  }

  // Update current candle tracking
  currentCandles.set(timeframe, currentCandle);

  // Keep cache size reasonable
  if (dataCache[timeframe].length > 1000) {
    dataCache[timeframe] = dataCache[timeframe].slice(-1000);
    console.log(`🗑️ ${timeframe} - Trimmed cache to 1000 candles`);
  }

  // Broadcast the current candle (running or new)
  broadcastToClients(timeframe, {
    time: currentCandle.time,
    open: currentCandle.open,
    high: currentCandle.high,
    low: currentCandle.low,
    close: currentCandle.close,
    volume: currentCandle.volume,
    isClosed: candleData.isClosed || false,
    slot: currentSlot,
  });
}

// Function to handle ticker price updates with slot-based logic
function handleTickerUpdate(tickerData) {
  const timeframes = ["1m", "5m", "1h", "1d"];

  timeframes.forEach((timeframe) => {
    if (!dataCache[timeframe] || dataCache[timeframe].length === 0) return;

    const currentCandle = currentCandles.get(timeframe);
    if (!currentCandle) return;

    const tickerSlot = getCandleSlot(tickerData.time, timeframe);
    const currentCandleSlot = getCandleSlot(currentCandle.time, timeframe);

    if (tickerSlot === currentCandleSlot) {
      // Same slot - update current running candle with ticker price
      const originalClose = currentCandle.close;
      currentCandle.close = tickerData.close;
      currentCandle.high = Math.max(currentCandle.high, tickerData.close);
      currentCandle.low = Math.min(currentCandle.low, tickerData.close);

      // Update in cache
      const cacheData = dataCache[timeframe];
      if (cacheData && cacheData.length > 0) {
        const lastCachedSlot = getCandleSlot(
          cacheData[cacheData.length - 1].time,
          timeframe
        );
        if (lastCachedSlot === currentCandleSlot) {
          cacheData[cacheData.length - 1].close = currentCandle.close;
          cacheData[cacheData.length - 1].high = currentCandle.high;
          cacheData[cacheData.length - 1].low = currentCandle.low;
        }
      }

      console.log(
        `💰 ${timeframe} - Ticker update: slot=${tickerSlot}, ${originalClose.toFixed(
          2
        )} → ${tickerData.close.toFixed(2)}`
      );

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
        slot: currentCandleSlot,
      });
    } else if (tickerSlot > currentCandleSlot) {
      // New slot - create new candle with ticker data
      const newCandleStartTime = getCandleStartTimeFromSlot(
        tickerSlot,
        timeframe
      );
      const newCandle = {
        time: newCandleStartTime,
        open: currentCandle.close,
        high: tickerData.close,
        low: tickerData.close,
        close: tickerData.close,
        volume: 0,
      };

      // Add to cache
      dataCache[timeframe].push({
        ...newCandle,
        sma5: null,
        sma20: null,
        ema20: null,
        rsi: null,
      });

      // Update current candle tracking
      currentCandles.set(timeframe, newCandle);

      const jakartaTime = dayjs
        .unix(newCandle.time)
        .tz("Asia/Jakarta")
        .format("DD/MM/YYYY HH:mm:ss");
      console.log(
        `🎯 ${timeframe} - New candle from ticker: slot=${tickerSlot}, time=${
          newCandle.time
        } (${jakartaTime} WIB), close=${newCandle.close.toFixed(2)}`
      );

      // Broadcast new candle
      broadcastToClients(timeframe, {
        time: newCandle.time,
        open: newCandle.open,
        high: newCandle.high,
        low: newCandle.low,
        close: newCandle.close,
        volume: newCandle.volume,
        isClosed: false,
        isTickerUpdate: true,
        slot: tickerSlot,
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
