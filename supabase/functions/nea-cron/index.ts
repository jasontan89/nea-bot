import { Bot } from "npm:grammy@^1";
import { createClient } from "npm:@supabase/supabase-js@2";

const token = Deno.env.get("NEA_BOT_TELEGRAM_BOT_TOKEN");
if (!token) throw new Error("NEA_BOT_TELEGRAM_BOT_TOKEN is not set");
const bot = new Bot(token);

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseKey);

Deno.serve(async (req) => {
  try {
    // 1. Check PSI Data & Alert
    const psiRes = await fetch("https://api-open.data.gov.sg/v2/real-time/api/psi");
    const psiData = await psiRes.json();
    const readings = psiData.data.items[0].readings.psi_twenty_four_hourly;
    const psi = Math.max(readings.central, readings.north, readings.south, readings.east, readings.west);
    
    // We send alerts if Peak 24h PSI > 100 (Unhealthy)
    if (psi > 100) {
      const { data: psiUsers } = await supabase
        .from('user_subscriptions')
        .select('chat_id')
        .eq('psi_alert', true);
        
      if (psiUsers && psiUsers.length > 0) {
        const msg = 
          `🚨 *SINGAPORE PSI / HAZE WARNING* 🚨\n\n` +
          `Peak 24-hr PSI has reached *${psi}* (Unhealthy Air Quality).\n\n` +
          `💡 *Health Advisory:* Vulnerable individuals (elderly, pregnant women, children, and those with chronic heart/lung disease) should reduce strenuous outdoor activity.`;
        for (const user of psiUsers) {
          try {
            await bot.api.sendMessage(user.chat_id, msg, { parse_mode: "Markdown" });
          } catch (e) {
            console.error(`Failed to send PSI alert to ${user.chat_id}`, e);
          }
        }
      }
    }

    // 2. Check 2-Hour Rain / Storm Nowcast & Alert
    const nowcastRes = await fetch("https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast");
    const nowcastData = await nowcastRes.json();
    const item = nowcastData.data.items[0];
    const forecasts = item?.forecasts ?? [];
    const validPeriod = item?.valid_period?.text ?? "Next 2 hours";

    const rainTowns = forecasts.filter((f: any) => {
      const fc = (f.forecast || "").toLowerCase();
      return fc.includes("rain") || fc.includes("thunder") || fc.includes("shower");
    });

    if (rainTowns.length > 0) {
      const { data: rainUsers } = await supabase
        .from('user_subscriptions')
        .select('chat_id')
        .eq('rain_alert', true);

      if (rainUsers && rainUsers.length > 0) {
        const sampleAreas = rainTowns.slice(0, 8).map((t: any) => `• *${t.area}:* ${t.forecast}`).join("\n");
        const extraCount = rainTowns.length > 8 ? `\n_...and ${rainTowns.length - 8} more areas._` : "";
        
        const msg = 
          `🌧️ *HEAVY RAIN / SHOWERS ALERT* 🌧️\n\n` +
          `Rain or thundery showers detected in *${rainTowns.length}* areas across Singapore:\n\n` +
          `${sampleAreas}${extraCount}\n\n` +
          `⏰ *Valid Period:* ${validPeriod}\n` +
          `💡 *Precaution:* Bring an umbrella and expect reduced visibility and slippery roads.`;

        for (const user of rainUsers) {
          try {
            await bot.api.sendMessage(user.chat_id, msg, { parse_mode: "Markdown" });
          } catch (e) {
            console.error(`Failed to send Rain alert to ${user.chat_id}`, e);
          }
        }
      }
    }
    
    return new Response(JSON.stringify({ success: true, peakPsi: psi, rainTownsCount: rainTowns.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});
