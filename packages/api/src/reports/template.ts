// Report: the one-page assessment record (brief section 5, use case 5) as a
// self-contained HTML document. The same HTML is shown in the app and turned
// into the archived PDF, so what people read on screen is what is filed.
// Wording never presents an alert or incident as proof of wrongdoing
// (principle 2); every section shows its source and limits (principle 3).

type Geometry = { type: string; coordinates: unknown };

export type ReportSnapshot = {
  version: 1;
  kind: "incident_assessment" | "alert_summary";
  ref: string;
  title: string;
  generatedAt: string;
  generatedBy: { institution: string | null; role: string };
  isSimulated: boolean;
  isSensitive: boolean;
  alert: {
    ref: string;
    title: string;
    summary: string;
    lens: string;
    indicator: string;
    confidence: string;
    status: string;
    firstObservedAt: string;
    detectedAt: string;
    validatedAt: string | null;
    coverage: string;
    limitations: string;
    place: string | null;
    rule: { name: string; version: number; description: string } | null;
    geometry: Geometry;
  };
  evidence: {
    label: string;
    observedAt: string | null;
    source: string | null;
    steward: string | null;
    mode: string | null;
    confidence: string | null;
    limitations: string | null;
  }[];
  fieldChecks: {
    institution: string | null;
    recordedAt: string;
    assessment: string | null;
    observation: string;
    activities: string[];
    photos: number;
  }[];
  decisions: {
    outcome: string;
    confidence: string;
    rationale: string;
    institution: string | null;
    role: string;
    decidedAt: string;
  }[];
  incident: {
    ref: string;
    title: string;
    severity: string;
    status: string;
    lead: string | null;
    openedAt: string;
    openedBy: string | null;
    assignments: {
      institution: string;
      instructions: string | null;
      assignedAt: string;
      dueAt: string | null;
    }[];
    actions: { kind: string; description: string; takenAt: string; recordedBy: string | null }[];
    closedAt: string | null;
    closureSummary: string | null;
  } | null;
  measures: {
    detectionLatencyH: number | null;
    timeToValidationH: number | null;
    timeToFirstActionH: number | null;
  };
};

const LABEL: Record<string, string> = {
  // alert status
  new: "Needs review",
  in_review: "In review",
  confirmed: "Confirmed by review",
  rejected: "Rejected by review",
  unresolved: "Unresolved",
  // incident status
  open: "Awaiting assignment",
  assigned: "Assigned",
  in_progress: "In progress",
  action_recorded: "Action recorded",
  closed: "Closed",
  // lens
  water: "Water",
  forest_land: "Forests & land",
  air: "Air",
  // field assessment
  supports_alert: "Supports the alert",
  contradicts_alert: "Contradicts the alert",
  inconclusive: "Inconclusive",
  // actions
  site_inspection: "Site inspection",
  sampling: "Sampling",
  enforcement_notice: "Enforcement notice",
  suspension: "Suspension of operations",
  arrest_or_seizure: "Arrest or seizure",
  remediation: "Remediation",
  public_notice: "Public notice",
  referral: "Referral to another institution",
  decision_not_to_act: "Decision not to act",
  other: "Other",
  // confidence and severity
  low: "Low",
  medium: "Medium",
  high: "High",
  // modes
  live: "Live",
  prepared: "Prepared",
  simulated: "Simulated",
};
const label = (k: string | null | undefined) => (k ? (LABEL[k] ?? k.replaceAll("_", " ")) : "—");

const esc = (s: string | number | null | undefined) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Accra",
      })
    : "—";
const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Africa/Accra",
      })
    : "—";
const hours = (h: number | null) =>
  h === null ? "—" : h < 48 ? `${Math.max(0, Math.round(h))} h` : `${Math.round(h / 24)} days`;

// --- Map snapshot -----------------------------------------------------------
// Sentinel-2 cloudless tiles (EOX, the app's basemap) around the alert, with
// its area drawn on top. Computed here so the PDF needs no map library.

const MAP_W = 340;
const MAP_H = 230;
const TILE = 256;
const TILE_URL = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g";

function positions(g: Geometry): [number, number][] {
  const out: [number, number][] = [];
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === "number") out.push([c[0] as number, c[1] as number]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(g.coordinates);
  return out;
}

const worldX = (lng: number, z: number) => ((lng + 180) / 360) * TILE * 2 ** z;
const worldY = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
};

export function mapSnapshot(g: Geometry) {
  const pts = positions(g);
  if (pts.length === 0) return "";
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const [w, e, s, n] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)];

  // The closest zoom at which the area fits with room around it.
  // A point gets a few hundred metres of context either side.
  let z = g.type === "Point" ? 14 : 15;
  while (
    z > 8 &&
    (worldX(e, z) - worldX(w, z) > MAP_W * 0.6 || worldY(s, z) - worldY(n, z) > MAP_H * 0.6)
  ) {
    z--;
  }
  const cx = (worldX(w, z) + worldX(e, z)) / 2;
  const cy = (worldY(n, z) + worldY(s, z)) / 2;
  const left = cx - MAP_W / 2;
  const top = cy - MAP_H / 2;

  const tiles: string[] = [];
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + MAP_W) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + MAP_H) / TILE); ty++) {
      tiles.push(
        `<img alt="" src="${TILE_URL}/${z}/${ty}/${tx}.jpg" style="left:${Math.round(tx * TILE - left)}px;top:${Math.round(ty * TILE - top)}px">`,
      );
    }
  }

  const px = (p: [number, number]) =>
    `${(worldX(p[0], z) - left).toFixed(1)},${(worldY(p[1], z) - top).toFixed(1)}`;
  let shape = "";
  if (g.type === "Point") {
    const [x, y] = px(pts[0] as [number, number]).split(",");
    shape = `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="#fff" stroke-width="4"/><circle cx="${x}" cy="${y}" r="9" fill="none" stroke="#e11d48" stroke-width="2"/><circle cx="${x}" cy="${y}" r="2" fill="#e11d48"/>`;
  } else {
    const rings: [number, number][][] =
      g.type === "Polygon"
        ? (g.coordinates as [number, number][][])
        : g.type === "MultiPolygon"
          ? (g.coordinates as [number, number][][][]).flat()
          : g.type === "LineString"
            ? [g.coordinates as [number, number][]]
            : [pts];
    const closed = g.type === "Polygon" || g.type === "MultiPolygon";
    shape = rings
      .map(
        (r) =>
          `<${closed ? "polygon" : "polyline"} points="${r.map(px).join(" ")}" fill="${closed ? "rgba(225,29,72,.18)" : "none"}" stroke="#fff" stroke-width="4"/><${closed ? "polygon" : "polyline"} points="${r.map(px).join(" ")}" fill="none" stroke="#e11d48" stroke-width="2"/>`,
      )
      .join("");
  }

  // Scale bar: metres per pixel at the centre latitude.
  const lat = (s + n) / 2;
  const mpp = (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
  const nice = [50, 100, 200, 500, 1000, 2000, 5000, 10_000].find((m) => m / mpp >= 60) ?? 10_000;
  const bar = Math.round(nice / mpp);

  return `<figure class="map">
  <div class="tiles" style="width:${MAP_W}px;height:${MAP_H}px">${tiles.join("")}
    <svg width="${MAP_W}" height="${MAP_H}" viewBox="0 0 ${MAP_W} ${MAP_H}">${shape}</svg>
    <div class="scale"><span style="width:${bar}px"></span>${nice >= 1000 ? `${nice / 1000} km` : `${nice} m`}</div>
  </div>
  <figcaption>Area flagged by the alert, centred ${lat.toFixed(4)}, ${((w + e) / 2).toFixed(4)}. Imagery: Sentinel-2 cloudless 2024 by EOX (CC BY-NC-SA 4.0), not the date of the alert.</figcaption>
</figure>`;
}

// --- Document ----------------------------------------------------------------

const CSS = `
@page { size: A4; margin: 12mm 13mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 8.5pt/1.35 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #0f172a; background: #fff; }
.page { max-width: 184mm; margin: 0 auto; padding: 14px 0; }
@media print { .page { padding: 0; } }
header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
.brand { font-weight: 700; letter-spacing: .02em; }
.kicker { text-transform: uppercase; letter-spacing: .08em; font-size: 7pt; color: #475569; }
h1 { font-size: 13pt; line-height: 1.25; margin: 2px 0 0; }
h2 { font-size: 7pt; text-transform: uppercase; letter-spacing: .08em; color: #475569; margin: 9px 0 3px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; }
.meta { text-align: right; font-size: 7.5pt; color: #475569; white-space: nowrap; }
.banner { margin-top: 8px; padding: 5px 8px; border: 1px solid #f59e0b; background: #fffbeb; color: #92400e; font-size: 7.5pt; }
.banner.sensitive { border-color: #e11d48; background: #fff1f2; color: #9f1239; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 6px; }
.cell span { line-height: 1.25; }
.cell { border: 1px solid #e2e8f0; padding: 5px 7px; }
.cell b { display: block; font-size: 6.5pt; text-transform: uppercase; letter-spacing: .06em; color: #64748b; font-weight: 600; }
.cell span { font-size: 9.5pt; font-weight: 600; }
p { margin: 0 0 4px; }
.muted { color: #64748b; }
table { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
th { text-align: left; font-weight: 600; color: #475569; font-size: 7pt; border-bottom: 1px solid #cbd5e1; padding: 2px 4px; }
td { border-bottom: 1px solid #f1f5f9; padding: 2px 4px; vertical-align: top; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.map { margin: 9px 0 0; }
.tiles { position: relative; overflow: hidden; background: #1e293b; }
.tiles img { position: absolute; width: 256px; height: 256px; }
.tiles svg { position: absolute; inset: 0; }
.scale { position: absolute; left: 8px; bottom: 6px; color: #fff; font-size: 7pt; text-shadow: 0 0 2px #000; }
.scale span { display: block; height: 4px; border: 1.5px solid #fff; border-top: 0; margin-bottom: 1px; }
figcaption { font-size: 7pt; color: #64748b; margin-top: 3px; }
ul { margin: 0; padding-left: 14px; }
li { margin-bottom: 3px; }
footer { margin-top: 8px; break-inside: avoid; border-top: 1px solid #cbd5e1; padding-top: 6px; font-size: 7pt; color: #64748b; }
`;

export function renderReport(s: ReportSnapshot): string {
  const a = s.alert;
  const i = s.incident;
  const latestDecision = s.decisions[0];

  const facts = [
    ["Validation", label(a.status)],
    [
      "Confidence",
      latestDecision
        ? `${label(latestDecision.confidence)} (review)`
        : `${label(a.confidence)} (rule)`,
    ],
    i ? ["Response", label(i.status)] : ["Lens", label(a.lens)],
    i ? ["Lead institution", i.lead ?? "—"] : ["Location", a.place ?? "—"],
  ];

  const measures = [
    ["Observed → flagged", hours(s.measures.detectionLatencyH)],
    ["Flagged → validated", hours(s.measures.timeToValidationH)],
    ["Validated → first action", hours(s.measures.timeToFirstActionH)],
  ];

  const section = (title: string, body: string) => (body ? `<h2>${esc(title)}</h2>${body}` : "");

  const evidence = s.evidence.length
    ? `<table><tr><th>Evidence</th><th>Source</th><th>Observed</th><th>Limitations</th></tr>${s.evidence
        .map(
          (e, n) =>
            `<tr><td>${esc(e.label)}${e.confidence ? ` <span class="muted">(${esc(label(e.confidence))} confidence)</span>` : ""}</td><td>${esc(e.source ?? "—")}${e.steward || e.mode ? `<br><span class="muted">${esc([e.steward, e.mode && label(e.mode)].filter(Boolean).join(" · "))}</span>` : ""}</td><td>${esc(date(e.observedAt))}</td><td class="muted">${n > 0 && e.limitations && e.limitations === s.evidence[n - 1]?.limitations ? "As above." : esc(e.limitations ?? "")}</td></tr>`,
        )
        .join("")}</table>`
    : `<p class="muted">No observations attached.</p>`;

  const field = s.fieldChecks.length
    ? `<ul>${s.fieldChecks
        .map(
          (f) =>
            `<li><b>${esc(label(f.assessment))}</b> · ${esc(f.institution ?? "Field team")}, ${esc(date(f.recordedAt))}${f.photos ? ` · ${f.photos} photo${f.photos === 1 ? "" : "s"} on file` : ""}<br>${esc(f.observation)}</li>`,
        )
        .join(
          "",
        )}</ul><p class="muted">Exact field locations and photos are held in Ecolens for cleared roles and are not reproduced here.</p>`
    : `<p class="muted">No field confirmation recorded.</p>`;

  const decisions = s.decisions.length
    ? `<ul>${s.decisions
        .map(
          (d) =>
            `<li><b>${esc(label(d.outcome))}</b>, ${esc(label(d.confidence))} confidence · ${esc(d.role)}${d.institution ? `, ${esc(d.institution)}` : ""}, ${esc(date(d.decidedAt))}<br>${esc(d.rationale)}</li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">No decision recorded yet. This alert has not been validated.</p>`;

  const response = i
    ? `<p><b>${esc(i.ref)}</b> · ${esc(label(i.severity))} severity · opened ${esc(date(i.openedAt))}${i.openedBy ? ` by ${esc(i.openedBy)}` : ""}</p>
${i.assignments.length ? `<table><tr><th>Assigned to</th><th>Instructions</th><th>Assigned</th><th>Due</th></tr>${i.assignments.map((x) => `<tr><td>${esc(x.institution)}</td><td>${esc(x.instructions ?? "")}</td><td>${esc(day(x.assignedAt))}</td><td>${esc(day(x.dueAt))}</td></tr>`).join("")}</table>` : `<p class="muted">Not yet assigned.</p>`}
<h2>Action taken</h2>
${i.actions.length ? `<table><tr><th>Action</th><th>What was done</th><th>When</th><th>By</th></tr>${i.actions.map((x) => `<tr><td>${esc(label(x.kind))}</td><td>${esc(x.description)}</td><td>${esc(date(x.takenAt))}</td><td>${esc(x.recordedBy ?? "")}</td></tr>`).join("")}</table>` : `<p class="muted">No action recorded yet.</p>`}
${i.closureSummary ? `<p style="margin-top:6px"><b>Closed ${esc(date(i.closedAt))}.</b> ${esc(i.closureSummary)}</p>` : ""}`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.ref)} · ${esc(s.title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="page">
<header>
  <div>
    <div class="kicker"><span class="brand">Ecolens</span> · ${s.kind === "incident_assessment" ? "Incident assessment" : "Alert summary"} · ${esc(s.ref)}</div>
    <h1>${esc(s.title)}</h1>
    <div class="muted">${esc(label(a.lens))} · ${esc(a.place ?? "Western Region")} · from ${esc(a.ref)}</div>
  </div>
  <div class="meta">Generated ${esc(date(s.generatedAt))}<br>${esc(s.generatedBy.role)}${s.generatedBy.institution ? `, ${esc(s.generatedBy.institution)}` : ""}</div>
</header>
${s.isSimulated ? `<div class="banner"><b>Prototype · simulated data.</b> This report is built from prepared demonstration data, not real observations. It must not be used for decisions.</div>` : ""}
${s.isSensitive ? `<div class="banner sensitive"><b>Sensitive location.</b> Restricted to roles cleared for sensitive locations. Do not circulate.</div>` : ""}
<div class="grid">${facts.map(([k, v]) => `<div class="cell"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join("")}</div>

<div class="two">
  <div>
    ${section("What was detected", `<p>${esc(a.summary)}</p><p class="muted">First observed ${esc(date(a.firstObservedAt))} · flagged ${esc(date(a.detectedAt))}${a.rule ? ` by rule “${esc(a.rule.name)}” v${a.rule.version}` : ""}.</p><p class="muted">Coverage: ${esc(a.coverage)}</p>`)}
    ${section("Known limitations", `<p>${esc(a.limitations)}</p>`)}
    ${section("Timeliness", `<table>${measures.map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join("")}</table>`)}
  </div>
  <div>${mapSnapshot(a.geometry)}</div>
</div>

${section("Evidence", evidence)}
<div class="two">
  <div>${section("Field confirmation", field)}</div>
  <div>${section("Validation", decisions)}</div>
</div>
${i ? section("Response", response) : ""}

<footer>
  An alert is a prompt for review, not proof of wrongdoing. Confirmation means a change was verified by human review, not that any party has been found responsible.
  Each source institution retains authority over its data. Report ${esc(s.ref)} reflects the record at ${esc(date(s.generatedAt))} and is archived unchanged.
</footer>
</div>
</body>
</html>`;
}
