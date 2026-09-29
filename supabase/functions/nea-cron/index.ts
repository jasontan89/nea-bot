import { Bot } from "npm:grammy@^1";
import { createClient } from "npm:@supabase/supabase-js@2";

const token = Deno.env.get("NEA_BOT_TELEGRAM_BOT_TOKEN");
if (!token) throw new Error("NEA_BOT_TELEGRAM_BOT_TOKEN is not set");
const bot = new Bot(token);

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseKey);

function getPm25Band(val: number) {
  if (val <= 55) {
    return {
      band: 1,
      name: "Band 1 (Normal)",
      descriptor: "Normal",
      emoji: "🟢",
      advisory: "Normal outdoor activities can be continued for everyone."
    };
  }
  if (val <= 150) {
    return {
      band: 2,
      name: "Band 2 (Elevated)",
      descriptor: "Elevated",
      emoji: "🟠",
      advisory: "Reduce strenuous outdoor physical exertion."
    };
  }
  if (val <= 250) {
    return {
      band: 3,
      name: "Band 3 (High)",
      descriptor: "High",
      emoji: "🔴",
      advisory: "Vulnerable individuals (elderly, pregnant women, children, and those with chronic heart/lung disease) should avoid strenuous outdoor physical exertion. Others should reduce strenuous outdoor activity."
    };
  }
  return {
    band: 4,
    name: "Band 4 (Very High)",
    descriptor: "Very High",
    emoji: "🟣",
    advisory: "Avoid strenuous outdoor physical exertion for everyone."
  };
}

Deno.serve(async (req) => {
  try {
    // 1. Check 1-Hour PM2.5 Data & Alert (Official NEA 4-Band System)
    let pm25Res = await fetch("https://api-open.data.gov.sg/v2/real-time/api/pm25");
    let pm25Data = await pm25Res.json();
    let pm25Item = pm25Data.data?.items?.[0];

    // If data timestamp is older than 50 minutes (meaning the API refresh is slightly delayed past the top of the hour),
    // wait 10 seconds and re-fetch once to ensure we get the fresh hour dataset.
    const itemTimestamp = new Date(pm25Item?.timestamp || 0).getTime();
    if (itemTimestamp > 0 && (Date.now() - itemTimestamp) > 50 * 60 * 1000) {
      console.log("NEA API data is lagging; waiting 10s to re-fetch...");
      await new Promise((r) => setTimeout(r, 10000));
      pm25Res = await fetch("https://api-open.data.gov.sg/v2/real-time/api/pm25");
      pm25Data = await pm25Res.json();
      pm25Item = pm25Data.data?.items?.[0];
    }

    const pm25OneHourly = pm25Item?.readings?.pm25_one_hourly ?? {};

    const regions = [
      { key: "central", name: "Central", val: pm25OneHourly.central },
      { key: "north", name: "North", val: pm25OneHourly.north },
      { key: "south", name: "South", val: pm25OneHourly.south },
      { key: "east", name: "East", val: pm25OneHourly.east },
      { key: "west", name: "West", val: pm25OneHourly.west },
    ];

    const regionPm25List = regions.map(r => ({
      ...r,
      bandInfo: getPm25Band(r.val)
    }));

    regionPm25List.sort((a, b) => b.val - a.val);
    const topRegion = regionPm25List[0];
    const peak1hPm25 = topRegion.val;
    const peakBand = topRegion.bandInfo;

    // Send alerts if Peak 1-hour PM2.5 > 55 µg/m³ (Band 2 Elevated or higher)
    if (peak1hPm25 > 55) {
      const { data: psiUsers } = await supabase
        .from('user_subscriptions')
        .select('chat_id')
        .eq('psi_alert', true);
        
      if (psiUsers && psiUsers.length > 0) {
        const regionalBreakdown = regionPm25List
          .map(r => `• *${r.name}:* *${r.val} µg/m³* — ${r.bandInfo.name} ${r.bandInfo.emoji}`)
          .join("\n");

        const readingTime = pm25Item?.timestamp ? new Date(pm25Item.timestamp).toLocaleTimeString("en-SG", {
          timeZone: "Asia/Singapore",
          hour: "numeric",
          minute: "2-digit",
          hour12: true
        }) : "";

        const msg = 
          `🚨 *SINGAPORE 1-HOUR PM2.5 / HAZE WARNING* 🚨\n\n` +
          `Peak 1-Hour PM2.5 has reached *${peak1hPm25} µg/m³* (*${peakBand.name}* ${peakBand.emoji}) in the *${topRegion.name}* region.\n\n` +
          `🗺️ *Regional Breakdown (Official NEA Bands):*\n` +
          `${regionalBreakdown}\n\n` +
          `💡 *Health Advisory:* ${peakBand.advisory}\n` +
          (readingTime ? `🕒 *Reading Time:* ${readingTime}\n\n` : '\n') +
          `_Live source: NEA (haze.gov.sg)_`;
        for (const user of psiUsers) {
          try {
            await bot.api.sendMessage(user.chat_id, msg, { parse_mode: "Markdown" });
          } catch (e) {
            console.error(`Failed to send PM2.5 alert to ${user.chat_id}`, e);
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
      peak1hPm25: peak1hPm25,
      peakBand: peakBand.name,
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
