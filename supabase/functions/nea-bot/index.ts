import { Bot, webhookCallback, InlineKeyboard } from "npm:grammy@^1";
import { createClient } from "npm:@supabase/supabase-js@2";

const token = Deno.env.get("NEA_BOT_TELEGRAM_BOT_TOKEN");
if (!token) throw new Error("NEA_BOT_TELEGRAM_BOT_TOKEN is not set");

const bot = new Bot(token);

// Supabase client to store subscriptions
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Dashboard URL (Hosted on GitHub Pages)
const DASHBOARD_URL = Deno.env.get("NEA_DASHBOARD_URL") ?? "https://jasontan89.github.io/nea-bot/";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPsiStatus(val: number) {
  if (val <= 50) return "Good 🟢";
  if (val <= 100) return "Moderate 🟡";
  if (val <= 200) return "Unhealthy 🟠";
  if (val <= 300) return "Very Unhealthy 🔴";
  return "Hazardous 🟣";
}

function getPm25Band(val: number) {
  if (val <= 55) {
    return {
      band: 1,
      name: "Band 1 (Normal)",
      descriptor: "Normal",
      badge: "Normal 🟢",
      emoji: "🟢",
      color: "#10b981",
      advisory: "Normal activities can be continued for everyone."
    };
  }
  if (val <= 150) {
    return {
      band: 2,
      name: "Band 2 (Elevated)",
      descriptor: "Elevated",
      badge: "Elevated 🟠",
      emoji: "🟠",
      color: "#f97316",
      advisory: "Reduce strenuous outdoor physical exertion."
    };
  }
  if (val <= 250) {
    return {
      band: 3,
      name: "Band 3 (High)",
      descriptor: "High",
      badge: "High 🔴",
      emoji: "🔴",
      color: "#ef4444",
      advisory: "Vulnerable persons should avoid strenuous outdoor exertion. Others should reduce strenuous outdoor activity."
    };
  }
  return {
    band: 4,
    name: "Band 4 (Very High)",
    descriptor: "Very High",
    badge: "Very High 🟣",
    emoji: "🟣",
    color: "#8b5cf6",
    advisory: "Avoid strenuous outdoor physical exertion for everyone."
  };
}

function getUvAdvisory(val: number) {
  if (val <= 2) return "Low 🟢 (Minimal protection needed)";
  if (val <= 5) return "Moderate 🟡 (Seek shade during midday)";
  if (val <= 7) return "High 🟠 (Wear sunglasses, hat, & SPF 30+)";
  if (val <= 10) return "Very High 🔴 (Extra protection & avoid sun 11am-3pm)";
  return "Extreme 🟣 (Full protection required, stay indoors if possible)";
}

function getWeatherEmoji(text: string) {
  const t = text.toLowerCase();
  if (t.includes("thunder") || t.includes("lightning")) return "⛈️";
  if (t.includes("heavy rain")) return "🌧️";
  if (t.includes("showers") || t.includes("rain")) return "🌦️";
  if (t.includes("cloudy")) return "☁️";
  if (t.includes("windy")) return "💨";
  if (t.includes("night")) return "🌙";
  return "☀️";
}

// ── API Fetchers ─────────────────────────────────────────────────────────────

async function fetch1hPm25(): Promise<Record<string, number>> {
  const res = await fetch("https://api-open.data.gov.sg/v2/real-time/api/pm25");
  const data = await res.json();
  return data.data.items[0].readings.pm25_one_hourly;
}

async function fetchPsi() {
  const res = await fetch("https://api-open.data.gov.sg/v2/real-time/api/psi");
  const data = await res.json();
  return data.data.items[0].readings;
}

async function fetch24hForecast() {
  const res = await fetch("https://api-open.data.gov.sg/v2/real-time/api/twenty-four-hr-forecast");
  const data = await res.json();
  return data.data.records[0];
}

async function fetch4DayOutlook() {
  const res = await fetch("https://api-open.data.gov.sg/v2/real-time/api/four-day-outlook");
  const data = await res.json();
  return data.data.records[0]?.forecasts ?? [];
}

async function fetchNowcast() {
  const res = await fetch("https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast");
  const data = await res.json();
  return data.data.items[0];
}

async function fetchUv() {
  const res = await fetch("https://api-open.data.gov.sg/v2/real-time/api/uv");
  const data = await res.json();
  return data.data.records[0]?.index ?? [];
}

async function fetchTides() {
  let data: any[] = [];
  try {
    const res = await fetch("https://vincentneo.github.io/SGTideTimings/latest.json");
    if (res.ok) {
      data = await res.json();
    }
  } catch (e) {
    console.warn("Direct tides fetch failed, trying GitHub raw:", e);
  }

  if (!data || data.length === 0) {
    try {
      const res2 = await fetch("https://raw.githubusercontent.com/jasontan89/nea-bot/main/docs/data/tides.json");
      if (res2.ok) {
        data = await res2.json();
      }
    } catch (e2) {
      console.warn("Raw tides fetch failed:", e2);
    }
  }

  const now = new Date();
  const sgDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  let filtered = data.filter((t: any) => t.date && t.date.startsWith(sgDateStr));

  if (filtered.length === 0 && data.length > 0) {
    const sorted = [...data].sort((a, b) => Math.abs(new Date(a.date).getTime() - now.getTime()) - Math.abs(new Date(b.date).getTime() - now.getTime()));
    if (sorted.length > 0) {
      const nearestDate = sorted[0].date.split('T')[0];
      filtered = data.filter((t: any) => t.date && t.date.startsWith(nearestDate));
    }
  }

  return filtered;
}

// ── Keyboards ────────────────────────────────────────────────────────────────

function getMainMenuKeyboard() {
  return new InlineKeyboard()
    .webApp("🗺️ Open Interactive Map & Dashboard", DASHBOARD_URL)
    .row()
    .text("🌬️ 1h PM2.5 & Air Quality", "action_psi")
    .text("🌤️ 24h & 4-Day", "action_forecast")
    .row()
    .text("📍 2h Town Weather", "action_nowcast")
    .text("☀️ UV Index", "action_uv")
    .row()
    .text("🌊 Tide Timings", "action_tides")
    .text("🔔 Alerts Settings", "action_alerts")
    .row()
    .text("🔄 Refresh", "action_refresh");
}

// ── Commands ─────────────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  const name = ctx.from?.first_name ?? "there";
  
  // Register user in DB
  if (ctx.from?.id) {
    await supabase.from('user_subscriptions').upsert({
      chat_id: ctx.chat.id,
      first_name: ctx.from.first_name,
      username: ctx.from.username
    }, { onConflict: 'chat_id' });
  }

  const welcomeText = 
    `👋 *Welcome to SG Environment Live, ${name}!* 🇸🇬\n\n` +
    `Your official real-time meteorological companion powered by live *National Environment Agency (data.gov.sg)* APIs.\n\n` +
    `📌 *Quick Access Features:*\n` +
    `• 🗺️ *Map Dashboard:* Visual overlay of 1-hr PM2.5 & weather on Singapore map\n` +
    `• 🌬️ *Air Quality:* Real-time 1-hour PM2.5 & NEA Bands across all 5 zones\n` +
    `• 🌤️ *Forecasts:* 2h town nowcasts, 24h outlook, & 4-day trends\n` +
    `• ☀️ *UV Monitor:* Hourly UV Index & sun protection guides\n` +
    `• 🔔 *Alerts:* Automated push alerts for Elevated PM2.5 (Band 2+) & heavy rain\n\n` +
    `👇 *Tap any option below or open the live map:*`;

  await ctx.reply(welcomeText, {
    parse_mode: "Markdown",
    reply_markup: getMainMenuKeyboard()
  });
});

bot.command("dashboard", async (ctx) => {
  const keyboard = new InlineKeyboard().webApp("🗺️ Launch Interactive Map", DASHBOARD_URL);
  await ctx.reply("Explore live air quality and weather radar pins overlaid across Singapore:", { reply_markup: keyboard });
});

bot.command("psi", async (ctx) => {
  await handlePsiRequest(ctx);
});

bot.command("forecast", async (ctx) => {
  await handleForecastRequest(ctx);
});

bot.command("nowcast", async (ctx) => {
  await handleNowcastRequest(ctx);
});

bot.command("uv", async (ctx) => {
  await handleUvRequest(ctx);
});

bot.command("alerts", async (ctx) => {
  await handleAlertsMenu(ctx);
});

bot.command("tides", async (ctx) => {
  await handleTidesRequest(ctx);
});

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handlePsiRequest(ctx: any) {
  try {
    const [pm25_1h, psi24Readings] = await Promise.all([
      fetch1hPm25().catch(() => null),
      fetchPsi().catch(() => null)
    ]);

    const regions = ["central", "north", "south", "east", "west"] as const;
    const regionLabels: Record<string, string> = {
      central: "🏛️ Central",
      north: "🌳 North",
      south: "🚢 South",
      east: "✈️ East",
      west: "🏭 West"
    };

    const max1hPm25 = pm25_1h ? Math.max(...regions.map(r => pm25_1h[r] ?? 0)) : 0;
    const peakBand = getPm25Band(max1hPm25);

    const psi24 = psi24Readings?.psi_twenty_four_hourly;
    const max24hPsi = psi24 ? Math.max(psi24.central, psi24.north, psi24.south, psi24.east, psi24.west) : null;

    const breakdown = regions.map(r => {
      const pmVal = pm25_1h ? (pm25_1h[r] ?? 0) : 0;
      const band = getPm25Band(pmVal);
      return `• ${regionLabels[r]}: *${pmVal} µg/m³* — ${band.name} ${band.emoji}`;
    }).join("\n");

    const msg = 
      `🌬️ *Singapore 1-Hour PM2.5 (Air Quality)*\n\n` +
      `📊 *Overall Status:* *${peakBand.name}* ${peakBand.emoji}\n` +
      `🔥 *Peak 1-Hour PM2.5:* *${max1hPm25} µg/m³*\n\n` +
      `🗺️ *Regional 1-Hr PM2.5 (Official NEA Bands):*\n` +
      `${breakdown}\n\n` +
      `💡 *Health Advisory:* ${peakBand.advisory}\n\n` +
      (max24hPsi ? `ℹ️ *24-Hour Rolling Peak PSI Reference:* ${max24hPsi} (${getPsiStatus(max24hPsi)})\n\n` : '') +
      `_Live source: NEA (haze.gov.sg / data.gov.sg)_`;

    const kb = new InlineKeyboard()
      .webApp("🗺️ View on Singapore Map", DASHBOARD_URL)
      .row()
      .text("« Back to Menu", "action_menu");

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
  } catch (error) {
    console.error("Error in handlePsiRequest:", error);
    await ctx.reply("Failed to fetch Air Quality data. Please try again later.");
  }
}

async function handleForecastRequest(ctx: any) {
  try {
    const [record24, outlook4] = await Promise.all([fetch24hForecast(), fetch4DayOutlook()]);
    const general = record24.general;

    const forecastText = general.forecast?.text ?? general.forecast ?? "Fair";
    const emoji = getWeatherEmoji(forecastText);
    const tempLow = general.temperature?.low ?? "--";
    const tempHigh = general.temperature?.high ?? "--";
    const humLow = general.relativeHumidity?.low ?? "--";
    const humHigh = general.relativeHumidity?.high ?? "--";
    const windSpeed = general.wind?.speed ? `${general.wind.speed.low}-${general.wind.speed.high} km/h` : "--";

    let msg = 
      `🌤️ *Singapore 24-Hour Weather Outlook*\n\n` +
      `*Forecast:* ${emoji} *${forecastText}*\n` +
      `🌡️ *Temperature:* ${tempLow}°C - ${tempHigh}°C\n` +
      `💧 *Humidity:* ${humLow}% - ${humHigh}%\n` +
      `💨 *Wind:* ${general.wind?.direction ?? ""} ${windSpeed}\n\n`;

    if (outlook4.length > 0) {
      msg += `📅 *4-Day Weather Forecast:*\n`;
      for (const day of outlook4) {
        const dEmoji = getWeatherEmoji(day.forecast?.text ?? "");
        msg += `• *${day.day}:* ${dEmoji} ${day.forecast?.text ?? "Fair"} (${day.temperature.low}°-${day.temperature.high}°C)\n`;
      }
      msg += `\n`;
    }

    msg += `_Live source: NEA (data.gov.sg)_`;

    const kb = new InlineKeyboard()
      .webApp("🗺️ View Map Radar", DASHBOARD_URL)
      .row()
      .text("« Back to Menu", "action_menu");

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
  } catch (error) {
    console.error("Error in handleForecastRequest:", error);
    await ctx.reply("Failed to fetch forecast data.");
  }
}

async function handleNowcastRequest(ctx: any) {
  try {
    const nowcast = await fetchNowcast();
    const period = nowcast.valid_period?.text ?? "Next 2 hours";
    const forecasts = nowcast.forecasts ?? [];

    // Filter popular/key towns across Singapore
    const keyTowns = [
      "Ang Mo Kio", "Bedok", "Bishan", "Bukit Batok", "Changi", 
      "City", "Clementi", "Jurong East", "Novena", "Pasir Ris", 
      "Punggol", "Sembawang", "Sentosa", "Tampines", "Woodlands", "Yishun"
    ];

    const filtered = forecasts.filter((f: any) => keyTowns.includes(f.area));

    let msg = 
      `📍 *Singapore 2-Hour Town Nowcast*\n` +
      `⏰ *Valid Period:* ${period}\n\n`;

    for (const f of filtered) {
      const emoji = getWeatherEmoji(f.forecast);
      msg += `• *${f.area}:* ${emoji} ${f.forecast}\n`;
    }

    msg += `\n💡 _Open the interactive map to see all 47 locations islandwide._\n\n`;
    msg += `_Live source: NEA (data.gov.sg)_`;

    const kb = new InlineKeyboard()
      .webApp("🗺️ See All 47 Towns on Map", DASHBOARD_URL)
      .row()
      .text("« Back to Menu", "action_menu");

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
  } catch (error) {
    console.error("Error in handleNowcastRequest:", error);
    await ctx.reply("Failed to fetch 2-hour nowcast.");
  }
}

async function handleUvRequest(ctx: any) {
  try {
    const indices = await fetchUv();
    if (indices.length === 0) {
      await ctx.reply("UV Index currently unavailable.");
      return;
    }

    const current = indices[0];
    const maxVal = Math.max(...indices.map((i: any) => i.value));
    const advisory = getUvAdvisory(current.value);

    let msg = 
      `☀️ *Singapore Live UV Index*\n\n` +
      `🔆 *Current UV Index:* *${current.value}*\n` +
      `🛡️ *Sun Safety Level:* ${advisory}\n` +
      `📈 *Today's Peak UV:* ${maxVal}\n\n` +
      `🕒 *Today's Hourly Trend (Chronological):*\n`;

    // Sort chronologically (earliest AM morning hour to latest PM hour)
    const chronological = [...indices].sort((a: any, b: any) => new Date(a.hour).getTime() - new Date(b.hour).getTime());
    for (const item of chronological) {
      const timeStr = new Date(item.hour).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Singapore" });
      msg += `• ${timeStr}: UV ${item.value}\n`;
    }

    msg += `\n_Live source: NEA (data.gov.sg)_`;

    const kb = new InlineKeyboard()
      .webApp("📊 Open Dashboard", DASHBOARD_URL)
      .row()
      .text("« Back to Menu", "action_menu");

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
  } catch (error) {
    console.error("Error in handleUvRequest:", error);
    await ctx.reply("Failed to fetch UV Index.");
  }
}

async function handleTidesRequest(ctx: any) {
  try {
    const tides = await fetchTides();
    if (!tides || tides.length === 0) {
      await ctx.reply("🌊 Singapore Tidal predictions are currently unavailable for today.");
      return;
    }

    tides.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const now = Date.now();
    const nextTide = tides.find((t: any) => new Date(t.date).getTime() > now);

    let msg = 
      `🌊 *Singapore Daily Tide Timings*\n` +
      `_Hydrographic Dept / MPA Singapore Reference_\n\n`;

    if (nextTide) {
      const typeStr = nextTide.classification === "H" ? "High Tide 🌊" : "Low Tide 🏖️";
      const timeStr = new Date(nextTide.date).toLocaleTimeString("en-SG", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Singapore"
      });
      msg += `📍 *Next Tide:* *${typeStr}* at *${timeStr}* (${nextTide.height}m)\n\n`;
    }

    msg += `📅 *Today's Tidal Schedule:*\n`;
    for (const t of tides) {
      const tTime = new Date(t.date).getTime();
      const isPast = tTime < now;
      const isNext = t === nextTide;
      const typeStr = t.classification === "H" ? "🌊 High Tide" : "🏖️ Low Tide";
      const timeStr = new Date(t.date).toLocaleTimeString("en-SG", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Singapore"
      });
      const badge = isNext ? " 👈 *NEXT*" : isPast ? " _(passed)_" : "";
      msg += `• ${timeStr} — *${typeStr}* (${t.height.toFixed(1)}m)${badge}\n`;
    }

    msg += `\n💡 *Note:* Heights are above Chart Datum. Essential for fishing, coastal walks & watersports.`;

    const kb = new InlineKeyboard()
      .webApp("📊 Open Dashboard & Tides", DASHBOARD_URL)
      .row()
      .text("« Back to Menu", "action_menu");

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
  } catch (error) {
    console.error("Error in handleTidesRequest:", error);
    await ctx.reply("Failed to fetch Tide Timings.");
  }
}

async function handleAlertsMenu(ctx: any) {
  if (!ctx.chat?.id) return;
  const { data, error } = await supabase.from('user_subscriptions').select('*').eq('chat_id', ctx.chat.id).single();
  
  if (error) {
    await ctx.reply("Failed to fetch your alert preferences.");
    return;
  }

  const psiStatus = data.psi_alert ? "✅ Active" : "❌ Disabled";
  const rainStatus = data.rain_alert ? "✅ Active" : "❌ Disabled";
  const dengueStatus = data.dengue_alert ? "✅ Active" : "❌ Disabled";

  const msg = 
    `🔔 *Push Alert Notifications Settings*\n\n` +
    `Customize automated warnings sent directly to your Telegram chat:\n\n` +
    `• 🚨 *Haze Alert (1h PM2.5 > 55 µg/m³):* ${psiStatus}\n` +
    `  _Pushes when 1-hour PM2.5 enters Band 2 Elevated (or higher)._\n\n` +
    `• 🌧️ *Heavy Rain Alert:* ${rainStatus}\n` +
    `  _Pushes when intense downpours or weather alerts trigger._\n\n` +
    `• 🦟 *Dengue Cluster Watch:* ${dengueStatus}\n` +
    `  _Pushes when high-risk clusters (≥10 cases) are active._\n\n` +
    `Tap below to toggle your alerts:`;

  const keyboard = new InlineKeyboard()
    .text(`Haze Alerts (Band 2+): ${psiStatus}`, "toggle_psi").row()
    .text(`Rain Alerts: ${rainStatus}`, "toggle_rain").row()
    .text(`Dengue Watch: ${dengueStatus}`, "toggle_dengue").row()
    .text("🧪 Send Test Alert", "action_test_alert").row()
    .text("« Back to Menu", "action_menu");

  await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
}

// ── Callbacks ────────────────────────────────────────────────────────────────

bot.callbackQuery("action_test_alert", async (ctx) => {
  await ctx.answerCallbackQuery("Dispatching test alert... 🚨");
  const testMsg = 
    `🚨 *[TEST ALERT] Singapore Environmental Warning*\n\n` +
    `This is a test notification confirming your Telegram alert delivery works!\n\n` +
    `• 🌬️ *Haze Watch:* Automated alerts trigger when 1-hour PM2.5 > 55 µg/m³ (Band 2 Elevated or higher).\n` +
    `• 🌧️ *Rain Watch:* Automated alerts trigger when heavy rain or thundery showers are detected across SG towns.\n` +
    `• 🦟 *Dengue Watch:* Automated alerts trigger when high-risk clusters (≥10 cases) are active.\n` +
    `• ⏰ *Check Frequency:* Scanned automatically via Supabase Cron.\n\n` +
    `✅ *Delivery Status:* Perfect! You will receive live warnings here whenever thresholds are breached.`;
  await ctx.reply(testMsg, { parse_mode: "Markdown" });
});

bot.callbackQuery("action_menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const welcomeText = 
    `🏠 *SG Environment Live — Main Menu*\n\n` +
    `Select a category below or explore the interactive live map:`;
  await ctx.editMessageText(welcomeText, {
    parse_mode: "Markdown",
    reply_markup: getMainMenuKeyboard()
  });
});

bot.callbackQuery("action_refresh", async (ctx) => {
  await ctx.answerCallbackQuery("Refreshed live data! 🔄");
  const welcomeText = 
    `🏠 *SG Environment Live — Main Menu* _(Updated)_\n\n` +
    `Select a category below or explore the interactive live map:`;
  await ctx.editMessageText(welcomeText, {
    parse_mode: "Markdown",
    reply_markup: getMainMenuKeyboard()
  });
});

bot.callbackQuery("action_psi", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handlePsiRequest(ctx);
});

bot.callbackQuery("action_forecast", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleForecastRequest(ctx);
});

bot.callbackQuery("action_nowcast", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleNowcastRequest(ctx);
});

bot.callbackQuery("action_uv", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleUvRequest(ctx);
});

bot.callbackQuery("action_tides", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleTidesRequest(ctx);
});

bot.callbackQuery("action_alerts", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleAlertsMenu(ctx);
});

bot.callbackQuery("toggle_psi", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  
  const { data } = await supabase.from('user_subscriptions').select('psi_alert').eq('chat_id', chatId).single();
  const newState = !data?.psi_alert;
  
  await supabase.from('user_subscriptions').update({ psi_alert: newState }).eq('chat_id', chatId);
  await ctx.answerCallbackQuery(`Haze Alerts turned ${newState ? "ON" : "OFF"}`);
  await handleAlertsMenu(ctx);
});

bot.callbackQuery("toggle_rain", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  
  const { data } = await supabase.from('user_subscriptions').select('rain_alert').eq('chat_id', chatId).single();
  const newState = !data?.rain_alert;
  
  await supabase.from('user_subscriptions').update({ rain_alert: newState }).eq('chat_id', chatId);
  await ctx.answerCallbackQuery(`Rain Alerts turned ${newState ? "ON" : "OFF"}`);
  await handleAlertsMenu(ctx);
});

bot.callbackQuery("toggle_dengue", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  
  const { data } = await supabase.from('user_subscriptions').select('dengue_alert').eq('chat_id', chatId).single();
  const newState = !data?.dengue_alert;
  
  await supabase.from('user_subscriptions').update({ dengue_alert: newState }).eq('chat_id', chatId);
  await ctx.answerCallbackQuery(`Dengue Alerts turned ${newState ? "ON" : "OFF"}`);
  await handleAlertsMenu(ctx);
});

// ── Serve ─────────────────────────────────────────────────────────────────────
const handleUpdate = webhookCallback(bot, "std/http");

Deno.serve(async (req) => {
  try {
    return await handleUpdate(req);
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});
