"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";

const chartDefinitions = [
  {
    svgId: "price-chart",
    currentId: "price-chart-current",
    startId: "price-chart-start",
    endId: "price-chart-end",
    rangeId: "price-chart-range",
    key: "price_ada",
    label: "ASCEND to ADA price",
    format: (value) => `${value.toFixed(3)} ADA`,
  },
  {
    svgId: "stakers-chart",
    currentId: "stakers-chart-current",
    startId: "stakers-chart-start",
    endId: "stakers-chart-end",
    rangeId: "stakers-chart-range",
    key: "unique_stakers",
    label: "Unique stakers",
    format: (value) => Math.round(value).toLocaleString("en-US"),
  },
  {
    svgId: "staked-chart",
    currentId: "staked-chart-current",
    startId: "staked-chart-start",
    endId: "staked-chart-end",
    rangeId: "staked-chart-range",
    key: "total_staked",
    label: "Total ASCEND staked",
    format: (value) => `${formatCompact(value)} ASCEND`,
  },
  {
    svgId: "pool-chart",
    currentId: "pool-chart-current",
    startId: "pool-chart-start",
    endId: "pool-chart-end",
    rangeId: "pool-chart-range",
    key: "reward_pool_usdc",
    label: "Reward pool",
    format: (value) => `${formatNumber(value, 2)} USDC`,
  },
];

let metrics = null;
let selectedRange = 7;
let updateTimer = null;
const STALE_AFTER_MS = 4 * 60 * 60 * 1000;

function formatNumber(value, decimals = 0) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCompact(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateString) {
  if (!dateString) return "unavailable";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "unavailable";

  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Berlin",
    timeZoneName: "short",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${parts.timeZoneName}`;
}

function formatRelativeAge(dateString, now = Date.now()) {
  const updatedAt = new Date(dateString).getTime();
  if (!dateString || Number.isNaN(updatedAt)) return "unavailable";

  const ageMinutes = Math.max(0, Math.floor((now - updatedAt) / 60000));
  if (ageMinutes < 1) return "just now";
  if (ageMinutes < 60) return `${ageMinutes}m ago`;

  const ageHours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;
  if (ageHours < 24) {
    return minutes ? `${ageHours}h ${minutes}m ago` : `${ageHours}h ago`;
  }

  const days = Math.floor(ageHours / 24);
  const hours = ageHours % 24;
  return hours ? `${days}d ${hours}h ago` : `${days}d ago`;
}

function isStale(dateString, now = Date.now()) {
  const updatedAt = new Date(dateString).getTime();
  return Boolean(dateString)
    && !Number.isNaN(updatedAt)
    && now - updatedAt > STALE_AFTER_MS;
}

function updateAgeDisplay() {
  if (!metrics) return;

  const stale = isStale(metrics.updated_at);
  document.getElementById("updated-relative").textContent =
    `Updated: ${formatRelativeAge(metrics.updated_at)}`;
  document.getElementById("stale-warning").hidden = !stale;
  document.getElementById("status-dot").classList.toggle(
    "status-dot--stale",
    stale,
  );
}

function setMetric(id, content) {
  document.getElementById(id).innerHTML = content;
}

function metricMarkup(value, decimals, unit = "") {
  if (value === null || value === undefined) return "—";
  const suffix = unit ? ` <span class="unit">${unit}</span>` : "";
  return `${formatNumber(value, decimals)}${suffix}`;
}

function setChange(id, value, unit = "%") {
  const element = document.getElementById(id);
  const available = value !== null && value !== undefined;

  element.className = "kpi-change";

  if (!available) {
    element.textContent = "24h  n/a";
    element.classList.add("change-neutral");
    return;
  }

  const sign = value > 0 ? "+" : "";
  element.textContent = `24h  ${sign}${formatNumber(value, 2)}${unit}`;
  element.classList.add(
    value > 0 ? "change-positive" : value < 0 ? "change-negative" : "change-neutral",
  );
}

function setPublicMetricChange(id, value, percentage, unit = "") {
  const element = document.getElementById(id);
  element.className = "kpi-change";

  if (value === null || value === undefined) {
    element.textContent = "24h  n/a";
    element.classList.add("change-neutral");
    return;
  }

  const sign = value > 0 ? "+" : "";
  const unitText = unit ? ` ${unit}` : "";
  const percentageText = percentage === null || percentage === undefined
    ? ""
    : ` (${percentage > 0 ? "+" : ""}${formatNumber(percentage, 2)}%)`;
  element.textContent =
    `24h  ${sign}${formatNumber(value, 2)}${unitText}${percentageText}`;
  element.classList.add(
    value > 0
      ? "change-positive"
      : value < 0
        ? "change-negative"
        : "change-neutral",
  );
}

function pointTimestamp(point) {
  return point.timestamp || point.date;
}

function filterHistory(history, days, key) {
  if (!history.length) return [];

  const latest = new Date(pointTimestamp(history[history.length - 1]));
  const cutoff = new Date(latest);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));

  return history.filter((point) => {
    const value = point[key];
    return value !== null
      && value !== undefined
      && Number.isFinite(Number(value))
      && new Date(pointTimestamp(point)) >= cutoff;
  });
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  return element;
}

function renderChart(definition, history, days) {
  const svg = document.getElementById(definition.svgId);
  const points = filterHistory(history, days, definition.key);
  const values = points.map((point) => Number(point[definition.key]));
  const width = 640;
  const height = 220;
  const padding = { top: 16, right: 8, bottom: 14, left: 8 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-label", `${definition.label}, ${days} day trend`);

  if (!values.length) {
    svg.setAttribute("aria-label", `${definition.label}, no history available`);
    document.getElementById(definition.currentId).textContent = "n/a";
    document.getElementById(definition.startId).textContent = "—";
    document.getElementById(definition.endId).textContent = "—";
    return;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.max(Math.abs(max) * 0.01, 1);
  const lowerBound = min - spread * 0.16;
  const upperBound = max + spread * 0.16;

  const coordinates = values.map((value, index) => {
    const x = padding.left + (index / Math.max(values.length - 1, 1)) * chartWidth;
    const y = padding.top + ((upperBound - value) / (upperBound - lowerBound)) * chartHeight;
    return { x, y };
  });

  const defs = createSvgElement("defs");
  const gradient = createSvgElement("linearGradient", {
    id: `area-gradient-${definition.svgId}`,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
  });
  gradient.append(
    createSvgElement("stop", { offset: "0%", "stop-color": "#4ee6a8", "stop-opacity": "0.23" }),
    createSvgElement("stop", { offset: "100%", "stop-color": "#4ee6a8", "stop-opacity": "0" }),
  );
  defs.append(gradient);
  svg.append(defs);

  [0.25, 0.5, 0.75].forEach((ratio) => {
    svg.append(
      createSvgElement("line", {
        x1: padding.left,
        y1: padding.top + chartHeight * ratio,
        x2: width - padding.right,
        y2: padding.top + chartHeight * ratio,
        class: "chart-grid-line",
      }),
    );
  });

  const linePath = coordinates
    .map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L ${coordinates.at(-1).x.toFixed(2)} ${height - padding.bottom} L ${coordinates[0].x.toFixed(2)} ${height - padding.bottom} Z`;

  const area = createSvgElement("path", {
    d: areaPath,
    fill: `url(#area-gradient-${definition.svgId})`,
  });
  const line = createSvgElement("path", { d: linePath, class: "chart-line" });
  const finalPoint = createSvgElement("circle", {
    cx: coordinates.at(-1).x,
    cy: coordinates.at(-1).y,
    r: 4.5,
    class: "chart-point",
  });

  svg.append(area, line, finalPoint);

  document.getElementById(definition.currentId).textContent = definition.format(values.at(-1));
  document.getElementById(definition.startId).textContent =
    formatShortDate(pointTimestamp(points[0]));
  document.getElementById(definition.endId).textContent =
    formatShortDate(pointTimestamp(points.at(-1)));
  document.getElementById(definition.rangeId).textContent = `${days} day view`;
}

function formatShortDate(dateString) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(dateString));
}

function renderAllCharts() {
  chartDefinitions.forEach((definition) => {
    renderChart(definition, metrics.history, selectedRange);
  });

  const note = document.getElementById("history-note");
  if (metrics.history.length < 2) {
    note.hidden = false;
    return;
  }

  const first = new Date(pointTimestamp(metrics.history[0]));
  const last = new Date(pointTimestamp(metrics.history.at(-1)));
  const availableDays = (last - first) / (24 * 60 * 60 * 1000);
  note.hidden = availableDays >= selectedRange - 1;
}

function renderMetrics(data) {
  metrics = data;
  document.getElementById("updated-at").textContent = formatDate(data.updated_at);
  document.getElementById("updated-at").dateTime = data.updated_at || "";

  setMetric("price-ada", metricMarkup(data.price_ada, 3, "ADA"));
  setMetric("unique-stakers", metricMarkup(data.unique_stakers, 0));
  setMetric("total-staked", metricMarkup(data.total_staked, 2, "ASCEND"));
  setMetric("reward-pool", metricMarkup(data.reward_pool_usdc, 2, "USDC"));

  setChange("price-change", data.change_24h_pct);
  setPublicMetricChange(
    "stakers-change",
    data.stakers_change_24h,
    data.stakers_change_24h_pct,
  );
  setPublicMetricChange(
    "total-staked-change",
    data.total_staked_change_24h,
    data.total_staked_change_24h_pct,
    "ASCEND",
  );
  setPublicMetricChange(
    "reward-pool-change",
    data.reward_pool_change_24h,
    data.reward_pool_change_24h_pct,
    "USDC",
  );

  document.getElementById("next-distribution").textContent =
    data.next_distribution || "n/a";
  updateAgeDisplay();
  clearInterval(updateTimer);
  updateTimer = setInterval(updateAgeDisplay, 60000);
  renderAllCharts();
}

function initializeDashboard() {
  document.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedRange = Number(button.dataset.range);

      document.querySelectorAll("[data-range]").forEach((rangeButton) => {
        rangeButton.setAttribute("aria-pressed", String(rangeButton === button));
      });

      if (metrics) renderAllCharts();
    });
  });

  fetch("metrics.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Metrics request failed: ${response.status}`);
      }
      return response.json();
    })
    .then(renderMetrics)
    .catch((error) => {
      document.getElementById("load-error").hidden = false;
      document.getElementById("updated-at").textContent = "unavailable";
      document.getElementById("updated-relative").textContent =
        "Updated: unavailable";
      console.error(error);
    });
}

if (typeof module !== "undefined") {
  module.exports = { formatRelativeAge, isStale };
}

if (typeof document !== "undefined") {
  initializeDashboard();
}
