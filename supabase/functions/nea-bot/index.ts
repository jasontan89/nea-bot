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

// ── Commands ─────────────────────────────────────────────────────────────────

bot.command("start", async (ctx) => {
  const name = ctx.from?.first_name ?? "there";
  const keyboard = new InlineKeyboard()
    .text("☁️ PSI & Haze", "action_psi").row()
    .text("🌦️ Weather Forecast", "action_forecast").row()
    .text("🚨 Manage Alerts", "action_alerts").row()
    .webApp("📊 Open Dashboard", DASHBOARD_URL);

  await ctx.reply(`Hi ${name}! 👋\n\nI'm the NEA Bot. I provide real-time meteorological data for Singapore.`, {
    reply_markup: keyboard
  });
  
  // Register user in DB
  if (ctx.from?.id) {
    await supabase.from('user_subscriptions').upsert({
      chat_id: ctx.chat.id,
      first_name: ctx.from.first_name,
      username: ctx.from.username
    }, { onConflict: 'chat_id' });
  }
});

bot.command("dashboard", async (ctx) => {
  const keyboard = new InlineKeyboard().webApp("📊 Open Dashboard", DASHBOARD_URL);
  await ctx.reply("Click the button below to view the visual dashboard:", { reply_markup: keyboard });
});

bot.command("psi", async (ctx) => {
  await handlePsiRequest(ctx);
});

bot.command("forecast", async (ctx) => {
  await handleForecastRequest(ctx);
});

bot.command("weather", async (ctx) => {
  await ctx.reply("Weather warnings functionality coming soon.");
});

bot.command("alerts", async (ctx) => {
  await handleAlertsMenu(ctx);
});

// ── API Fetchers ─────────────────────────────────────────────────────────────

async function fetchPsi() {
  const res = await fetch("https://api-open.data.gov.sg/v2/real-time/api/psi");
  const data = await res.json();
  const latest = data.data.readings[0];
  return latest;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handlePsiRequest(ctx: any) {
  try {
    const psiData = await fetchPsi();
    const pm25 = psiData.pm25_twenty_four_hourly.national;
    const psi = psiData.psi_twenty_four_hourly.national;
    
    let status = "Good";
    if (psi > 50) status = "Moderate";
    if (psi > 100) status = "Unhealthy";
    if (psi > 200) status = "Very Unhealthy";
    if (psi > 300) status = "Hazardous";

    const msg = `**Current Air Quality (National)**\n\n` +
                `🌬️ **PSI (24h):** ${psi} (${status})\n` +
                `🌫️ **PM2.5 (24h):** ${pm25} µg/m³\n\n` +
                `*Data from data.gov.sg*`;
    
    await ctx.reply(msg, { parse_mode: "Markdown" });
  } catch (error) {
    console.error(error);
    await ctx.reply("Failed to fetch PSI data. Please try again later.");
  }
}

async function handleForecastRequest(ctx: any) {
  try {
    const res = await fetch("https://api-open.data.gov.sg/v2/real-time/api/twenty-four-hr-forecast");
    const data = await res.json();
    const forecast = data.data.records[0];
    const general = forecast.general;

    const msg = `**24-Hour Weather Forecast**\n\n` +
                `🌤️ **Forecast:** ${general.forecast}\n` +
                `🌡️ **Temperature:** ${general.temperature.low}°C - ${general.temperature.high}°C\n` +
                `💧 **Humidity:** ${general.relative_humidity.low}% - ${general.relative_humidity.high}%\n\n` +
                `*Data from data.gov.sg*`;
    
    await ctx.reply(msg, { parse_mode: "Markdown" });
  } catch (error) {
    console.error(error);
    await ctx.reply("Failed to fetch forecast data.");
  }
}

async function handleAlertsMenu(ctx: any) {
  if (!ctx.chat?.id) return;
  const { data, error } = await supabase.from('user_subscriptions').select('*').eq('chat_id', ctx.chat.id).single();
  
  if (error) {
    await ctx.reply("Failed to fetch your alert preferences.");
    return;
  }

  const psiStatus = data.psi_alert ? "✅ ON" : "❌ OFF";
  const rainStatus = data.rain_alert ? "✅ ON" : "❌ OFF";

  const keyboard = new InlineKeyboard()
    .text(`Toggle PSI Alerts (${psiStatus})`, "toggle_psi").row()
    .text(`Toggle Rain Alerts (${rainStatus})`, "toggle_rain");

  await ctx.reply("Manage your push notification alerts:", { reply_markup: keyboard });
}

// ── Callbacks ────────────────────────────────────────────────────────────────

bot.callbackQuery("action_psi", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handlePsiRequest(ctx);
});

bot.callbackQuery("action_forecast", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleForecastRequest(ctx);
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
  
  await ctx.answerCallbackQuery(`PSI Alerts turned ${newState ? "ON" : "OFF"}`);
  await ctx.editMessageText("PSI alerts updated. Run /alerts to see changes.");
});

bot.callbackQuery("toggle_rain", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  
  const { data } = await supabase.from('user_subscriptions').select('rain_alert').eq('chat_id', chatId).single();
  const newState = !data?.rain_alert;
  
  await supabase.from('user_subscriptions').update({ rain_alert: newState }).eq('chat_id', chatId);
  
  await ctx.answerCallbackQuery(`Rain Alerts turned ${newState ? "ON" : "OFF"}`);
  await ctx.editMessageText("Rain alerts updated. Run /alerts to see changes.");
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
