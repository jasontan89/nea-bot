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

// ── Keyboards ────────────────────────────────────────────────────────────────

function getMainMenuKeyboard() {
  return new InlineKeyboard()
    .webApp("🗺️ Open Interactive Map & Dashboard", DASHBOARD_URL)
    .row()
    .text("🌬️ PSI & PM2.5", "action_psi")
    .text("🌤️ 24h & 4-Day", "action_forecast")
    .row()
    .text("📍 2h Town Weather", "action_nowcast")
    .text("☀️ UV Index", "action_uv")
    .row()
    .text("🔔 Alerts Settings", "action_alerts")
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
    `• 🗺️ *Map Dashboard:* Visual overlay of PSI & weather on Singapore map\n` +
    `• 🌬️ *Air Quality:* Real-time 24h PSI & PM2.5 across all 5 zones\n` +
    `• 🌤️ *Forecasts:* 2h town nowcasts, 24h outlook, & 4-day trends\n` +
    `• ☀️ *UV Monitor:* Hourly UV Index & sun protection guides\n` +
    `• 🔔 *Alerts:* Automated push alerts for high PSI & heavy rain\n\n` +
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

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handlePsiRequest(ctx: any) {
  try {
    const readings = await fetchPsi();
    const psi = readings.psi_twenty_four_hourly;
    const pm25 = readings.pm25_twenty_four_hourly;
    const maxPsi = Math.max(psi.central, psi.north, psi.south, psi.east, psi.west);

    const msg = 
      `🌬️ *Singapore 24-Hour PSI & Air Quality*\n\n` +
      `📊 *Overall Air Quality:* ${getPsiStatus(maxPsi)}\n` +
      `🔥 *Peak 24h PSI:* *${maxPsi}*\n\n` +
      `🗺️ *Regional Breakdown (PSI | PM2.5):*\n` +
      `• 🏛️ *Central:* PSI *${psi.central}* (${getPsiStatus(psi.central)}) | PM2.5: ${pm25.central} µg/m³\n` +
      `• 🌳 *North:*   PSI *${psi.north}* (${getPsiStatus(psi.north)}) | PM2.5: ${pm25.north} µg/m³\n` +
      `• 🚢 *South:*   PSI *${psi.south}* (${getPsiStatus(psi.south)}) | PM2.5: ${pm25.south} µg/m³\n` +
      `• ✈️ *East:*    PSI *${psi.east}* (${getPsiStatus(psi.east)}) | PM2.5: ${pm25.east} µg/m³\n` +
      `• 🏭 *West:*    PSI *${psi.west}* (${getPsiStatus(psi.west)}) | PM2.5: ${pm25.west} µg/m³\n\n` +
      `_Live source: NEA (data.gov.sg)_`;

    const kb = new InlineKeyboard()
      .webApp("🗺️ View on Singapore Map", DASHBOARD_URL)
      .row()
      .text("« Back to Menu", "action_menu");

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: kb });
  } catch (error) {
    console.error("Error in handlePsiRequest:", error);
    await ctx.reply("Failed to fetch PSI data. Please try again later.");
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

async function handleAlertsMenu(ctx: any) {
  if (!ctx.chat?.id) return;
  const { data, error } = await supabase.from('user_subscriptions').select('*').eq('chat_id', ctx.chat.id).single();
  
  if (error) {
    await ctx.reply("Failed to fetch your alert preferences.");
    return;
  }

  const psiStatus = data.psi_alert ? "✅ Active" : "❌ Disabled";
  const rainStatus = data.rain_alert ? "✅ Active" : "❌ Disabled";

  const msg = 
    `🔔 *Push Alert Notifications Settings*\n\n` +
    `Customize automated warnings sent directly to your Telegram chat:\n\n` +
    `• 🚨 *Haze Alert (PSI > 100):* ${psiStatus}\n` +
    `  _Pushes when 24h PSI enters Unhealthy range._\n\n` +
    `• 🌧️ *Heavy Rain Alert:* ${rainStatus}\n` +
    `  _Pushes when intense downpours or weather alerts trigger._\n\n` +
    `Tap below to toggle your alerts:`;

  const keyboard = new InlineKeyboard()
    .text(`Haze Alerts: ${psiStatus}`, "toggle_psi").row()
    .text(`Rain Alerts: ${rainStatus}`, "toggle_rain").row()
    .text("🧪 Send Test Alert", "action_test_alert").row()
    .text("« Back to Menu", "action_menu");

  await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
}

// ── Callbacks ────────────────────────────────────────────────────────────────

bot.callbackQuery("action_test_alert", async (ctx) => {
  await ctx.answerCallbackQuery("Dispatching test alert... 🚨");
  const testMsg = 
    `🚨 *[TEST ALERT] Singapore Meteorological Warning*\n\n` +
    `This is a test notification confirming your Telegram alert delivery works!\n\n` +
    `• 🌬️ *Haze Watch:* Automated alerts trigger when 24h PSI > 100 (Unhealthy).\n` +
    `• 🌧️ *Rain Watch:* Automated alerts trigger when heavy rain or thundery showers are detected across SG towns.\n` +
    `• ⏰ *Check Frequency:* Scanned automatically every hour via Supabase.\n\n` +
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
