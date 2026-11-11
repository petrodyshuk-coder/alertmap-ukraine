(() => {
  "use strict";

  const POLL_INTERVAL = 5000;
  const API_REGIONS = "/api-proxy/api/v3/regions";
  const API_STATUS = "/api-proxy/api/v3/alerts/status";
  const API_ALERTS = "/api-proxy/api/v3/alerts";

  const els = {
    connection: document.getElementById("connection"),
    updated: document.getElementById("updated"),
    activeCount: document.getElementById("active-count"),
    totalCount: document.getElementById("total-count"),
    regionCount: document.getElementById("region-count"),
    regionList: document.getElementById("region-list"),
    apiState: document.getElementById("api-state"),
    mapNote: document.getElementById("map-note"),
    toast: document.getElementById("toast")
  };

  let lastActionIndex = null;
  let regionsCache = [];
  let filter = "all";
  let map;
  let geoLayer = null;
  let geoJsonData = null;
  let pollTimer = null;
  let busy = false;

  function initMap() {
    map = L.map("map", { zoomControl: true, scrollWheelZoom: false })
      .setView([48.8, 31.2], 5.8);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 10,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    fetch("/data/regions.geojson")
      .then(response => {
        if (!response.ok) throw new Error("GeoJSON not found");
        return response.json();
      })
      .then(data => {
        geoJsonData = data;
        if (regionsCache.length) updateMap(regionsCache);
        els.mapNote.textContent = "Межі регіонів завантажено.";
      })
      .catch(() => {
        els.mapNote.innerHTML =
          'Межі областей ще не додані. Додайте GeoJSON у <code>data/regions.geojson</code>. Список регіонів працює незалежно від мапи.';
      });
  }

  async function apiGet(path) {
    const response = await fetch(path, {
      method: "GET",
      headers: { "Accept": "application/json" },
      cache: "no-store"
    });

    if (response.status === 401 || response.status === 403) {
      const error = new Error("API_KEY");
      error.code = "API_KEY";
      throw error;
    }
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return response.json();
  }

  // API shape:
  // region.activeAlerts[] -> alert.activeAlertLevels[] -> level.alertLevel
  function isAlertActive(region) {
    const activeAlerts = region?.activeAlerts;
    if (!Array.isArray(activeAlerts)) return false;

    return activeAlerts.some(alert => {
      const levels = alert?.activeAlertLevels;
      if (!Array.isArray(levels)) return false;

      return levels.some(level => {
        const value = level?.alertLevel;
        return typeof value === "string" &&
          !["none", "green"].includes(value.toLowerCase());
      });
    });
  }

  function getRegionId(feature) {
    const properties = feature?.properties || {};
    return String(
      properties.regionId ??
      properties.region_id ??
      properties.id ??
      feature.id ??
      ""
    );
  }

  function updateMap(regions) {
    const byId = new Map(
      regions.map(region => [String(region.regionId), region])
    );
    if (!geoJsonData) return;

    if (geoLayer) geoLayer.remove();

    geoLayer = L.geoJSON(geoJsonData, {
      style: feature => {
        const region = byId.get(getRegionId(feature));
        const active = region ? isAlertActive(region) : false;

        return {
          color: "#d5e0ed",
          weight: 1.1,
          opacity: 0.9,
          fillColor: active ? "#ed555d" : "#28ad78",
          fillOpacity: 0.72
        };
      },
      onEachFeature: (feature, layer) => {
        const region = byId.get(getRegionId(feature));
        if (!region) return;

        const active = isAlertActive(region);
        const name = escapeHtml(region.regionName || "Регіон");
        layer.bindPopup(
          `<strong>${name}</strong><br>${active ? "Повітряна тривога" : "Немає активної тривоги"}`
        );

        layer.on("mouseover", () => {
          layer.setStyle({ weight: 2.5, fillOpacity: 0.9 });
        });
        layer.on("mouseout", () => geoLayer.resetStyle(layer));
      }
    }).addTo(map);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));
  }

  function renderRegions(regions) {
    const activeCount = regions.filter(isAlertActive).length;

    els.activeCount.textContent = activeCount;
    els.totalCount.textContent = `${regions.length} регіонів отримано`;
    els.regionCount.textContent = regions.length;

    const filtered = regions
      .filter(region => {
        const active = isAlertActive(region);
        return filter === "all" ||
          (filter === "alert" && active) ||
          (filter === "normal" && !active);
      })
      .sort((a, b) =>
        String(a.regionName || "").localeCompare(
          String(b.regionName || ""), "uk"
        )
      );

    if (!filtered.length) {
      els.regionList.innerHTML =
        '<div class="empty">Немає регіонів для цього фільтра.</div>';
      return;
    }

    els.regionList.innerHTML = filtered.map(region => {
      const active = isAlertActive(region);
      const name = escapeHtml(
        region.regionName || `Регіон ${region.regionId}`
      );
      const type = escapeHtml(region.regionType || "Регіон");

      return `<div class="region-row">
        <div>
          <div class="region-name">${name}</div>
          <div class="region-type">${type}</div>
        </div>
        <span class="badge ${active ? "alert" : "normal"}">
          ${active ? "ТРИВОГА" : "БЕЗ ТРИВОГИ"}
        </span>
      </div>`;
    }).join("");
  }

  function setConnection(text, state = "ok") {
    els.connection.textContent = text;
    const dot = document.querySelector(".live-dot");
    const color = state === "error"
      ? "#f05252"
      : state === "ok"
        ? "#28b779"
        : "#e6ae4b";

    dot.style.background = color;
    dot.style.boxShadow = `0 0 12px ${color}88`;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(
      () => els.toast.classList.remove("show"),
      4500
    );
  }

  async function loadInitialRegions() {
    const regions = await apiGet(API_REGIONS);
    if (!Array.isArray(regions)) {
      throw new Error("INVALID_REGIONS_RESPONSE");
    }

    regionsCache = regions;
    renderRegions(regionsCache);
    updateMap(regionsCache);
  }

  async function poll() {
    if (busy) return scheduleNext(POLL_INTERVAL);
    busy = true;

    try {
      const status = await apiGet(API_STATUS);

      if (!status || typeof status.lastActionIndex !== "number") {
        throw new Error("INVALID_STATUS_RESPONSE");
      }

      // Fetch full alert data only on first load or when the index changes.
      if (status.lastActionIndex !== lastActionIndex) {
        const regions = await apiGet(API_ALERTS);

        if (!Array.isArray(regions)) {
          throw new Error("INVALID_ALERTS_RESPONSE");
        }

        // Commit only after the full response has been validated.
        regionsCache = regions;
        lastActionIndex = status.lastActionIndex;

        renderRegions(regionsCache);
        updateMap(regionsCache);

        els.updated.textContent =
          `Оновлено: ${new Date().toLocaleTimeString("uk-UA")}`;
        els.apiState.textContent =
          "З’єднання з API активне. Дані тривог оновлено.";
      }

      setConnection("API підключено", "ok");
    } catch (error) {
      console.error("Alert API:", error);

      if (error.code === "API_KEY") {
        setConnection("Помилка авторизації", "error");
        els.apiState.textContent =
          "Сервер відхилив API-ключ. Перевірте налаштування сервера.";
        showToast("Помилка авторизації API. Перевірте ключ на сервері.");
      } else {
        setConnection("Немає з’єднання", "error");
        els.apiState.textContent =
          "Не вдалося отримати дані. Автоматично повторюємо спробу.";
      }
    } finally {
      busy = false;
      scheduleNext(POLL_INTERVAL);
    }
  }

  function scheduleNext(delay) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, delay);
  }

  document.querySelectorAll(".filter").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach(item =>
        item.classList.remove("active")
      );
      button.classList.add("active");
      filter = button.dataset.filter;
      renderRegions(regionsCache);
    });
  });

  async function start() {
    initMap();

    try {
      await loadInitialRegions();
      els.apiState.textContent =
        "Список регіонів завантажено. Перевіряємо індекс змін.";
    } catch (error) {
      console.warn("Initial regions request failed:", error);
      els.apiState.textContent =
        "Не вдалося завантажити початковий список регіонів. Перевіряємо API повторно.";
    }

    poll();
  }

  start();
})();
