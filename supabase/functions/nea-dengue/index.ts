const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.github\.io$/i,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const isAllowed = ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
  const allowOrigin = isAllowed ? origin : "https://jasontan89.github.io";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const res = await fetch("https://www.nea.gov.sg/api/OneMap/GetMapData/DENGUE_CLUSTER", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`NEA OneMap upstream returned status ${res.status}`);
    }

    const raw = await res.text();
    let data: any;
    try {
      const parsedOnce = JSON.parse(raw);
      data = typeof parsedOnce === "string" ? JSON.parse(parsedOnce) : parsedOnce;
    } catch (_parseErr) {
      throw new Error("Unable to parse JSON from OneMap response");
    }

    const results = data?.SrchResults || [];
    const metadata = results[0] || {};
    const clusters = results.slice(1);

    const features = [];
    for (const c of clusters) {
      const gj = c?.GeoJSON;
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
            construction_sites: c.CONSTRUCTION_SITES || "",
          },
        });
      }
    }

    const featureCollection = {
      type: "FeatureCollection",
      metadata: metadata,
      features: features,
    };

    return new Response(JSON.stringify(featureCollection), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Dengue fetch error:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch dengue cluster data" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
