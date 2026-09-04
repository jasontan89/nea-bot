import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const DATA_GOV_KEY = "v2:4d2c5238dd16197b7f066e3c4999fc3fc5cdfcbfb3e0be5cad586af628ff4fc2:ttHTkdKyQKno_OAXVNtR2Bor1R3ya0HC";
    if (!DATA_GOV_KEY) {
      throw new Error("Missing DATA_GOV_API_KEY environment variable");
    }

    const headers = {
      "x-api-key": DATA_GOV_KEY
    };

    const datasetId = "d_dbfabf16158d1b0e1c420627c0819168";
    const pollUrl = `https://api-production.data.gov.sg/v2/public/api/datasets/${datasetId}/poll-download`;
    
    let res = await fetch(pollUrl, { headers });
    let json = await res.json();
    
    if (json.code !== 0 && json.code !== 200 && !json.data?.url) {
      return new Response(JSON.stringify({ error: "Failed to poll data.gov.sg", details: json }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const downloadUrl = json.data.url;
    const geoRes = await fetch(downloadUrl);
    const geoJson = await geoRes.json();

    return new Response(JSON.stringify(geoJson), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
