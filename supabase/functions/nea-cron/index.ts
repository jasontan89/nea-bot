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
    // 1. Fetch PSI Data
    const psiRes = await fetch("https://api-open.data.gov.sg/v2/real-time/api/psi");
    const psiData = await psiRes.json();
    const readings = psiData.data.items[0].readings.psi_twenty_four_hourly;
    const psi = Math.max(readings.central, readings.north, readings.south, readings.east, readings.west);
    
    // We only send alerts if PSI > 100 (Unhealthy)
    if (psi > 100) {
      const { data: users, error } = await supabase
        .from('user_subscriptions')
        .select('chat_id')
        .eq('psi_alert', true);
        
      if (users && users.length > 0) {
        const msg = `🚨 **PSI ALERT** 🚨\n\nThe 24h PSI has reached **${psi}** (Unhealthy).\nPlease take necessary precautions.`;
        for (const user of users) {
          try {
             await bot.api.sendMessage(user.chat_id, msg, { parse_mode: "Markdown" });
          } catch (e) {
             console.error(`Failed to send to ${user.chat_id}`, e);
          }
        }
      }
    }

    // (Rain alerts logic can be similarly implemented by fetching 2-hour nowcast)
    
    return new Response(JSON.stringify({ success: true, psi }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});
