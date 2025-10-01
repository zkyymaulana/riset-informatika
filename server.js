import express from "express";
import cors from "cors";
import { getHistorical, connectWebSocket } from "./data.js";
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

// Fungsi untuk mendapatkan global last time dari timeframe terkecil
async function calculateGlobalLastTime() {
  try {
    // Load 1m data untuk mendapatkan candle terakhir yang paling akurat
    const startTime = Date.now() - 24 * 60 * 60 * 1000; // 1 hari
    const endTime = Date.now();
    
    const candles1m = await getHistorical("BTCUSDT", "1m", startTime, endTime);
    
    if (candles1m && candles1m.length > 0) {
      const lastCandle = candles1m[candles1m.length - 1];
      globalLastTime = lastCandle.time; // sudah dalam seconds
      globalLastPrice = lastCandle.close;
      
      const jakartaTime = dayjs.unix(globalLastTime).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss');
      console.log(`🌏 Global last time set: ${globalLastTime} (${jakartaTime} WIB)`);
      console.log(`💰 Global last price: ${globalLastPrice}`);
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
    return processedData;
  } catch (err) {
    console.error(`❌ Error loading data for ${timeframe}:`, err.message);
    return null;
  }
}

// Initialize dengan data 1d default
async function init() {
  await loadDataForTimeframe("1d");
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

    // Sinkronisasi dengan globalLastTime
    let syncedData = [...data];
    const lastCandle = syncedData[syncedData.length - 1];
    
    if (globalLastTime && lastCandle.time < globalLastTime) {
      // Tambahkan candle dummy untuk sinkronisasi
      const dummyCandle = {
        time: globalLastTime,
        open: globalLastPrice,
        high: globalLastPrice,
        low: globalLastPrice,
        close: globalLastPrice,
        volume: 0,
        sma5: null,
        sma20: null,
        ema20: null,
        rsi: null,
      };
      syncedData.push(dummyCandle);
      
      const jakartaTime = dayjs.unix(globalLastTime).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss');
      console.log(`🔄 ${timeframe} - Added sync candle at ${globalLastTime} (${jakartaTime} WIB)`);
    }

    // Struktur response dengan globalLastTime
    res.json({
      success: true,
      symbol: "BTCUSDT",
      timeframe: timeframe,
      lastUpdated: new Date().toISOString(),
      globalLastTime: globalLastTime,
      globalLastTimeJakarta: globalLastTime ? dayjs.unix(globalLastTime).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss') : null,
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
    globalLastTime: globalLastTime,
    globalLastTimeJakarta: globalLastTime ? dayjs.unix(globalLastTime).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss') : null,
    type: 'candle_update'
  };
  
  const message = JSON.stringify(messageData);

  // Debug log untuk membandingkan candle terakhir
  if (dataCache[timeframe] && dataCache[timeframe].length > 0) {
    const lastCachedCandle = dataCache[timeframe][dataCache[timeframe].length - 1];
    const jakartaTime = dayjs.unix(data.time).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss');
    console.log(`📊 ${timeframe} - Broadcasting candle:`, {
      time: data.time,
      close: data.close,
      jakartaTime: jakartaTime
    });
  }

  clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  });
}

// Initialize realtime connections for all timeframes
function initializeRealtimeConnections() {
  const timeframes = ["1m", "5m", "1h", "1d"];

  timeframes.forEach((timeframe) => {
    console.log(`🔄 Starting realtime connection for ${timeframe}`);

    connectWebSocket("btcusdt", timeframe, (candleData) => {
      // Pastikan timestamp dalam UNIX detik (Math.floor(time/1000))
      const candle = {
        time: Math.floor(candleData.time / 1000), // Konversi ms ke detik
        open: parseFloat(candleData.open),
        high: parseFloat(candleData.high),
        low: parseFloat(candleData.low),
        close: parseFloat(candleData.close),
        volume: parseFloat(candleData.volume || 0),
      };

      // Update global last time jika ini candle terbaru
      if (!globalLastTime || candle.time > globalLastTime) {
        globalLastTime = candle.time;
        globalLastPrice = candle.close;
        const jakartaTime = dayjs.unix(globalLastTime).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss');
        console.log(`🌏 Global last time updated: ${globalLastTime} (${jakartaTime} WIB)`);
      }

      // Broadcast to connected clients dengan global time info
      broadcastToClients(timeframe, candle);

      // Update cache if needed
      if (dataCache[timeframe] && dataCache[timeframe].length > 0) {
        const lastCandle = dataCache[timeframe][dataCache[timeframe].length - 1];

        if (lastCandle && candle.time === lastCandle.time) {
          // Update existing candle
          console.log(`🔄 ${timeframe} - Updating existing candle at ${candle.time}`);
          Object.assign(lastCandle, {
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          });
        } else if (candle.time > lastCandle.time) {
          // Add new candle
          console.log(`➕ ${timeframe} - Adding new candle at ${candle.time}`);
          dataCache[timeframe].push({
            ...candle,
            sma5: null, // Will be recalculated if needed
            sma20: null,
            ema20: null,
            rsi: null,
          });

          // Keep cache size reasonable (keep last 1000 candles)
          if (dataCache[timeframe].length > 1000) {
            dataCache[timeframe] = dataCache[timeframe].slice(-1000);
          }
        }
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
