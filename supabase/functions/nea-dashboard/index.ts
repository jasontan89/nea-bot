Deno.serve(async (req) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>NEA Dashboard</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://telegram.org/js/telegram-web-app.js"></script>
    </head>
    <body class="bg-gray-100 p-4 font-sans text-gray-800">
      <div class="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6 mb-4">
        <h1 class="text-2xl font-bold mb-2">Singapore Air Quality</h1>
        <div id="psi-container" class="animate-pulse">
          <div class="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div class="h-4 bg-gray-200 rounded w-full mb-2"></div>
        </div>
      </div>

      <div class="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6">
        <h2 class="text-xl font-bold mb-2">24h Weather Forecast</h2>
        <div id="weather-container" class="animate-pulse">
          <div class="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div class="h-4 bg-gray-200 rounded w-full mb-2"></div>
        </div>
      </div>

      <script>
        // Init Telegram Mini App
        const tg = window.Telegram.WebApp;
        tg.expand();

        async function fetchData() {
          try {
            // Fetch 1h PM2.5 & calculate 1h PSI
            const pm25Res = await fetch("https://api-open.data.gov.sg/v2/real-time/api/pm25");
            const pm25Data = await pm25Res.json();
            const pm25OneHourly = pm25Data.data.items[0].readings.pm25_one_hourly;
            const values = Object.values(pm25OneHourly);
            const maxPm25 = Math.max(...values);

            function pm25ToPsi(pm25) {
              if (!pm25 || pm25 <= 0) return 0;
              if (pm25 <= 12) return Math.round((pm25 / 12) * 50);
              if (pm25 <= 55) return Math.round(50 + ((pm25 - 12) / (55 - 12)) * 50);
              if (pm25 <= 150) return Math.round(100 + ((pm25 - 55) / (150 - 55)) * 100);
              if (pm25 <= 250) return Math.round(200 + ((pm25 - 150) / (250 - 150)) * 100);
              if (pm25 <= 350) return Math.round(300 + ((pm25 - 250) / (350 - 250)) * 100);
              if (pm25 <= 500) return Math.round(400 + ((pm25 - 350) / (500 - 350)) * 100);
              return Math.round(500 + (pm25 - 500));
            }

            const psi = pm25ToPsi(maxPm25);
            let status = "Good";
            let color = "text-green-500";
            if (psi > 50) { status = "Moderate"; color = "text-yellow-500"; }
            if (psi > 100) { status = "Unhealthy"; color = "text-orange-500"; }
            if (psi > 200) { status = "Very Unhealthy"; color = "text-red-500"; }
            
            document.getElementById('psi-container').innerHTML = \`
              <div class="flex items-center justify-between mb-4">
                <div>
                  <p class="text-sm text-gray-500">1-Hour Peak PSI</p>
                  <p class="text-4xl font-black \${color}">\${psi}</p>
                </div>
                <div class="text-right">
                  <p class="text-sm text-gray-500">Status</p>
                  <p class="text-lg font-bold \${color}">\${status}</p>
                </div>
              </div>
              <p class="text-gray-600">Peak 1h PM2.5: <span class="font-semibold">\${maxPm25} µg/m³</span></p>
            \`;

            // Fetch Weather
            const weatherRes = await fetch("https://api-open.data.gov.sg/v2/real-time/api/twenty-four-hr-forecast");
            const weatherData = await weatherRes.json();
            const forecast = weatherData.data.records[0].general;
            
            document.getElementById('weather-container').innerHTML = \`
              <p class="text-lg font-semibold text-blue-600 mb-2">\${forecast.forecast}</p>
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-blue-50 p-3 rounded-lg">
                  <p class="text-xs text-gray-500 uppercase">Temperature</p>
                  <p class="text-lg font-bold">\${forecast.temperature.low}° - \${forecast.temperature.high}°C</p>
                </div>
                <div class="bg-blue-50 p-3 rounded-lg">
                  <p class="text-xs text-gray-500 uppercase">Humidity</p>
                  <p class="text-lg font-bold">\${forecast.relative_humidity.low}% - \${forecast.relative_humidity.high}%</p>
                </div>
              </div>
            \`;

          } catch (err) {
            console.error(err);
            document.getElementById('psi-container').innerHTML = '<p class="text-red-500">Failed to load data.</p>';
          }
        }

        fetchData();
      </script>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
