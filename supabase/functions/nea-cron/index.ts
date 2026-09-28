import { Bot } from "npm:grammy@^1";
import { createClient } from "npm:@supabase/supabase-js@2";

const token = Deno.env.get("NEA_BOT_TELEGRAM_BOT_TOKEN");
if (!token) throw new Error("NEA_BOT_TELEGRAM_BOT_TOKEN is not set");
const bot = new Bot(token);

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseKey);

function getPsiStatus(val: number) {
  if (val <= 50) return "Good 🟢";
  if (val <= 100) return "Moderate 🟡";
  if (val <= 200) return "Unhealthy 🟠";
  if (val <= 300) return "Very Unhealthy 🔴";
  return "Hazardous 🟣";
}

function pm25ToPsi(pm25: number): number {
  if (pm25 <= 0) return 0;
  if (pm25 <= 12) return Math.round((pm25 / 12) * 50);
  if (pm25 <= 55) return Math.round(50 + ((pm25 - 12) / (55 - 12)) * 50);
  if (pm25 <= 150) return Math.round(100 + ((pm25 - 55) / (150 - 55)) * 100);
  if (pm25 <= 250) return Math.round(200 + ((pm25 - 150) / (250 - 150)) * 100);
  if (pm25 <= 350) return Math.round(300 + ((pm25 - 250) / (350 - 250)) * 100);
  if (pm25 <= 500) return Math.round(400 + ((pm25 - 350) / (500 - 350)) * 100);
  return Math.round(500 + (pm25 - 500));
}

Deno.serve(async (req) => {
  try {
    // 1. Check 1-Hour PSI & PM2.5 Data & Alert
    const pm25Res = await fetch("https://api-open.data.gov.sg/v2/real-time/api/pm25");
    const pm25Data = await pm25Res.json();
    const pm25OneHourly = pm25Data.data.items[0].readings.pm25_one_hourly;

    const regions = [
      { key: "central", name: "Central", val: pm25OneHourly.central },
      { key: "north", name: "North", val: pm25OneHourly.north },
      { key: "south", name: "South", val: pm25OneHourly.south },
      { key: "east", name: "East", val: pm25OneHourly.east },
      { key: "west", name: "West", val: pm25OneHourly.west },
    ];

    const regionPsiList = regions.map(r => ({
      ...r,
      psi: pm25ToPsi(r.val)
    }));

    regionPsiList.sort((a, b) => b.psi - a.psi);
    const topRegion = regionPsiList[0];
    const peak1hPsi = topRegion.psi;
    const peak1hPm25 = topRegion.val;

    // We send alerts if Peak 1-hour PSI > 100 (Unhealthy / PM2.5 > 55 µg/m³)
    if (peak1hPsi > 100) {
      const { data: psiUsers } = await supabase
        .from('user_subscriptions')
        .select('chat_id')
        .eq('psi_alert', true);
        
      if (psiUsers && psiUsers.length > 0) {
        const regionalBreakdown = regionPsiList
          .map(r => `• *${r.name}:* 1h PSI *${r.psi}* (${getPsiStatus(r.psi)}) | PM2.5: ${r.val} µg/m³`)
          .join("\n");

        const msg = 
          `🚨 *SINGAPORE 1-HOUR PSI / HAZE WARNING* 🚨\n\n` +
          `Peak 1-hour PSI has reached *${peak1hPsi}* (${getPsiStatus(peak1hPsi)}) in the *${topRegion.name}* region (1h PM2.5: *${peak1hPm25} µg/m³*).\n\n` +
          `🗺️ *Regional Breakdown:*\n` +
          `${regionalBreakdown}\n\n` +
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
    
    // 3. Check High-Risk Dengue Clusters & Alert
    let highRiskCount = 0;
    try {
      const dengueRes = await fetch("https://www.nea.gov.sg/api/OneMap/GetMapData/DENGUE_CLUSTER");
      const dengueJson = await dengueRes.json();
      const parsedDengue = typeof dengueJson === "string" ? JSON.parse(dengueJson) : dengueJson;
      const rawClusters = (parsedDengue.SrchResults || []).slice(1);

      // Filter clusters with >= 10 cases (NEA Red Alert / High Risk)
      const highRisk = rawClusters
        .filter((c: any) => parseInt(c.CASE_SIZE || "0", 10) >= 10)
        .sort((a: any, b: any) => parseInt(b.CASE_SIZE || "0", 10) - parseInt(a.CASE_SIZE || "0", 10));

      highRiskCount = highRisk.length;

      if (highRisk.length > 0) {
        const { data: dengueUsers } = await supabase
          .from('user_subscriptions')
          .select('chat_id')
          .eq('dengue_alert', true);

        if (dengueUsers && dengueUsers.length > 0) {
          const clusterList = highRisk.slice(0, 4).map((c: any) => 
            `• 🔴 *${c.DESCRIPTION}*\n  ⚠️ *${c.CASE_SIZE} cases* | Breeding: _${c.HOMES || "Common areas"}_`
          ).join("\n\n");

          const extraInfo = highRisk.length > 4 ? `\n\n_...plus ${highRisk.length - 4} more high-risk clusters._` : "";

          const dengueMsg = 
            `🦟 *DENGUE HIGH-RISK CLUSTERS ALERT* ⚠️\n\n` +
            `NEA reports *${highRisk.length}* active high-risk dengue clusters (≥10 cases):\n\n` +
            `${clusterList}${extraInfo}\n\n` +
            `🛡️ *B-L-O-C-K Mosquito Breeding:*\n` +
            `• *B*reak up hardened soil\n` +
            `• *L*ift and empty flowerpot plates\n` +
            `• *O*verturn water storage pails\n` +
            `• *C*hange water in vases\n` +
            `• *K*eep roof gutters clear`;

          for (const user of dengueUsers) {
            try {
              await bot.api.sendMessage(user.chat_id, dengueMsg, { parse_mode: "Markdown" });
            } catch (e) {
              console.error(`Failed to send Dengue alert to ${user.chat_id}`, e);
            }
          }
        }
      }
    } catch (dErr) {
      console.error("Dengue scan failed in cron:", dErr);
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      peak1hPsi: peak1hPsi, 
      peak1hPm25: peak1hPm25,
      rainTownsCount: rainTowns.length,
      highRiskDengueCount: highRiskCount
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});
