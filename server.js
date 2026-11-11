// Minimal Node.js proxy. The API key stays on the server.
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = "https://api.ukrainealarm.com";
const API_KEY = process.env.UKRAINEALARM_API_KEY;

app.use(express.static(path.join(__dirname, "public")));
app.use("/data", express.static(path.join(__dirname, "data")));

app.get("/api-proxy/*", async (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({
      error: "API key is not configured on the server."
    });
  }

  const apiPath = req.originalUrl.replace(/^\/api-proxy/, "");
  const allowed = [
    "/api/v3/regions",
    "/api/v3/alerts",
    "/api/v3/alerts/status"
  ];

  if (!allowed.includes(apiPath)) {
    return res.status(404).json({ error: "Endpoint not allowed." });
  }

  try {
    const upstream = await fetch(`${API_BASE}${apiPath}`, {
      headers: {
        "Authorization": API_KEY,
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(10000)
    });

    const body = await upstream.text();
    res.status(upstream.status);
    res.set(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json"
    );
    res.send(body);
  } catch (error) {
    console.error("Upstream API error:", error.message);
    res.status(502).json({
      error: "Could not reach Ukraine Alert API."
    });
  }
});

app.listen(PORT, () => {
  console.log(`AlertMap running at http://localhost:${PORT}`);
});
