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
    const res = await fetch("https://www.nea.gov.sg/api/OneMap/GetMapData/DENGUE_CLUSTER", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      throw new Error(`NEA OneMap returned status ${res.status}`);
    }

    const raw = await res.text();
    const data = JSON.parse(JSON.parse(raw));
    const results = data.SrchResults || [];
    const metadata = results[0] || {};
    const clusters = results.slice(1);

    const features = [];
    for (const c of clusters) {
      const gj = c.GeoJSON;
      if (gj && gj.geometry) {
        features.push({
          type: "Feature",
          geometry: gj.geometry,
          properties: {
            name: c.NAME || "Dengue_Cluster",
            locality: c.DESCRIPTION || "Dengue Cluster",
            case_size: parseInt(c.CASE_SIZE || "0", 10),
            homes: c.HOMES || "",
            public_places: c.PUBLIC_PLACES || "",
            construction_sites: c.CONSTRUCTION_SITES || ""
          }
        });
      }
    }

    const featureCollection = {
      type: "FeatureCollection",
      metadata: metadata,
      features: features
    };

    return new Response(JSON.stringify(featureCollection), {
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
