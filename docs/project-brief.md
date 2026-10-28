# Ecolens — Project Brief (Source of Truth)

> Derived from the **Ecolens Project Concept Note** (17 pp., project lead: Theophilus Berchie Amanfo; existing prototype: https://ecolens-ghana.vercel.app/).
> This file is the guardrail for the prototype. If a feature, data source or design choice is not traceable to something here, question it before building it.
> Section 11 ("Prototype decisions") records choices we make that the concept note leaves open.

---

## 1. What Ecolens is

An **environmental intelligence platform** — a *visual command centre* — that brings **satellite imagery, sensor readings, agency records and field observations** into **one shared, map-based view of ecological risk**.

It helps decision-makers:
1. **identify** unusual changes in **rivers, air quality and forests** earlier,
2. **validate** the evidence,
3. **coordinate** a response, and
4. **document** the action taken.

**Core promise:** shorten the time between environmental change and a *usable, trusted alert*.

**It supports scientific and regulatory judgement; it does not replace it.**

## 2. The problem

Ghana faces interconnected pressures: illegal mining (galamsey), water pollution, forest degradation, settlement expansion, dust, harmful gases, climate hazards. Three constraints:

1. **Fragmented data** — water, air, forest and regulatory data sit in different institutions/systems.
2. **Retrospective reporting** — by the time reports are consolidated, damage has continued.
3. **Hard to interpret** — raw satellite imagery and sensor readings need interpretation before non-technical leaders can act confidently.

Ecolens answers by **organising multiple signals around a common location**, applying **agreed anomaly rules**, and presenting results that **authorised users can interpret and act on**, through an **auditable workflow**.

## 3. Scope

| Item | Definition |
|---|---|
| Initial geography | **Western Region, Ghana** — priority sites (illegal-mining pressure). Rivers named: **Pra** and **Ankobra** basins. |
| Initial focus | **Water pollution and land disturbance from illegal mining**, supported by air and forest-risk lenses *where data permits*. |
| Primary users | Environmental & mining regulators, water authorities, regional & local authorities, field teams, authorised decision-makers. |
| Pilot | 12 months, partner-led (Validation 0–3, Build & test 4–8, Evaluation 9–12). |

### Risk lenses

| Lens | Initial indicators | Decision use |
|---|---|---|
| **Water** (primary) | River turbidity/colour, selected toxicity indicators where available, illegal-mining impact, flood-related signals | Prioritise verification, inspection, water-resource response |
| **Forests & land** (primary) | Canopy loss, vegetation stress, suspected logging roads, mining encroachment | Review activity in protected areas or outside approved zones |
| **Air** (supporting) | PM2.5 anomalies, aerosol optical depth, thermal activity, exposure near populated areas | Flag areas for closer assessment / public-health coordination |

Scope expands **only** when suitable data, validated methods and responsible institutional use exist.

## 4. Operating model — the core workflow

This six-stage loop is the spine of the product. Every feature should map to a stage.

| Stage | Function | Output |
|---|---|---|
| **Observe** | Ingest satellite imagery, river & air readings, agency datasets, regulatory records, field observations | Time-stamped observations linked to locations |
| **Analyse** | Spatial processing, change detection, anomaly thresholds, vulnerability logic | Potential turbidity spike, thermal anomaly, canopy loss, mining encroachment |
| **Interpret** | Show **source, date, coverage, confidence, supporting evidence** on a shared map | Prioritised alert with an evidence trail |
| **Validate** | Technical review + agency data + field confirmation **before** an alert becomes an incident | **Confirmed / Rejected / Unresolved** alert |
| **Escalate** | Route validated incidents through an agreed institutional process | Assigned action, responsible institution, response status |
| **Report** | Concise maps, summaries, assessment reports | Downloadable intelligence report + response record |

Key distinction: **an alert is not an incident.** An alert becomes an incident only after human validation.

## 5. Product capabilities

From "Current Prototype Status", "Priority Pilot Use Cases" and "Expected Outputs":

| Capability | Existing prototype | Target for validated pilot |
|---|---|---|
| **Spatial interface** | Responsive 3D globe + 2D regional maps | Usable, performant, approved geographic coverage |
| **River monitoring** | Pra & Ankobra basins mapped with satellite views indicating muddy/polluted water | Imagery refresh, local baselines, agreed thresholds, field confirmation |
| **Air-quality view** | Fast dashboard: dust, aerosol, harmful-gas indicators from available estimates | Trusted local stations, clear **data-quality labels** |
| **Environmental overlays** | Aerosol, thermal, satellite imagery layers | Automated pipelines, **provenance records**, scientific review |
| **Field reporting** | Digital logbook of suspicious machinery/activity | Mobile **GPS tagging, photo upload**, identity & access control, **offline/low-connectivity** support (queued submissions) |
| **Alerts** | Logs show PM2.5 anomalies and turbidity spikes | Automatic generation, **confidence logic**, human review, **escalation rules** |
| **Boundaries** | — | Legal mining-concession & protected-area layer (when authoritative data is available) to compare suspected activity against |
| **Reporting** | Basic PDF summaries of maps & incidents | **One-page intelligence/assessment report**: evidence, confidence, validation status, responsible institution, recommended/taken action |
| **Vulnerability indicators** | Present | Vulnerability indices in analytics layer |

### Priority use cases
1. Detect significant **river turbidity/colour change** at monitoring locations → trigger review.
2. Detect **vegetation loss, land disturbance, new access routes** indicating mining/logging.
3. **Compare suspected activity with approved mining boundaries and protected areas.**
4. **Authorised field personnel submit GPS-tagged photos & observations** to confirm/reject satellite alerts.
5. Produce an **assessment record**: evidence, confidence, validation status, responsible institution, action taken.

## 6. Technical design (from the concept note)

Modular — new data sources plug in without rebuilding. Must support secure ingestion, common geographic references, repeatable analysis, **documented data lineage**, **role-based access**, **auditable alerts**.

| Layer | Components |
|---|---|
| Observation | Sentinel-2 & Landsat imagery, river & air sensors, agency datasets, legal boundaries, field reports |
| Processing | Google Earth Engine (or equivalent), raster analysis, change detection |
| Analytics | Turbidity proxies, land-cover change, vegetation stress, aerosol & thermal indicators, thresholds, vulnerability indices |
| Application | **Web map, alert queue, field submission interface, dashboards, report generation** |
| Governance | Provenance, access control, retention, audit records, publication rules |

### Our stack (this repo)
Approved stack and performance budget: **`docs/stack.md`**. In short: Next.js on Vercel · Hono + oRPC on Cloudflare Workers · Neon Postgres + PostGIS via Hyperdrive · MapLibre GL + deck.gl (globe and 2D) · Durable Objects for realtime · R2/KV/Queues · Clerk Organizations.

## 7. Non-negotiable principles (guardrails)

These come straight from the concept note's principles, safeguards and governance sections. The prototype must embody them:

1. **Human in the loop.** No alert is treated as an incident, or escalated, without a human validation step.
2. **An anomaly is a prompt for review, not proof of wrongdoing.** UI copy must never present an alert as evidence of illegality or regulatory breach.
3. **Show provenance and uncertainty everywhere.** Every data layer and alert shows **source, date/timestamp, coverage, confidence category and known limitations**.
4. **Clear confidence categories** (e.g. low / medium / high), not false precision.
5. **Auditable.** Every status change (validate, escalate, assign, act, close) is recorded with who, when and why.
6. **Role-based access & least privilege.** Sensitive locations, communities and investigations are protected; publication is controlled.
7. **Offline-first, everywhere.** Networks in Ghana can be poor. Every screen opens with last-known data offline, every action is saved locally and synced later, and the UI always shows connection and sync status. Field reporting must work fully offline on mobile. (Details: `docs/stack.md`, "Offline-first".)
8. **Start narrow.** Limited high-value locations and indicators (Western Region, Pra/Ankobra, mining-related water & land) before expanding.
9. **Data stewardship.** Each source institution retains authority over its data; show which institution a dataset comes from.
10. **Clarity for non-technical leaders.** Outputs must be interpretable quickly by decision-makers, not only analysts.
11. **Honesty about prototype data.** Where data is simulated/prepared rather than live, label it as such.

## 8. Stakeholders & roles

**Partner institutions (proposed):** EPA Ghana, Minerals Commission, Water Resources Commission, meteorological/air-quality providers, Western Regional Coordinating Council + MMDAs, research institutions, community representatives & field teams.

**Governance functions → candidate app roles:**

| Function | Responsibility | Candidate app role |
|---|---|---|
| Strategic oversight | Steering group approves scope & safeguards | Admin / Viewer (leadership) |
| Data stewardship | Source institution controls its data | Data steward (per institution) |
| Scientific assurance | Review indicators, thresholds, confidence logic | Analyst / Reviewer |
| Operational validation | Technical officers & field teams review alerts before escalation | Analyst, Field officer |
| Response coordination | Named institutions receive incidents & record action | Responder (per institution) |
| Platform management | Integrations, security, uptime | Admin |

## 9. Success measures (MEL)

Success = **earlier, trusted action**, not number of maps or alerts. The data model should make these measurable:

- **Detection latency** — observation timestamp → alert timestamp
- **Validation quality** — share confirmed / rejected / unresolved
- **False-alert rate** — share rejected after review
- **Response speed** — validated alert → documented action (or recorded decision not to act)
- **Coverage** — priority sites with adequate data continuity
- **Adoption** — active use, completed cases
- **Decision usefulness** — user feedback on alerts/reports

## 10. Out of scope for the prototype

- Replacing scientific/regulatory judgement or auto-declaring violations
- Buying/deploying new monitoring hardware (Ecolens connects *existing* sources)
- Nationwide or multi-country coverage (replication is a later phase)
- Production-grade scientific validation of thresholds (needs domain experts and partner data)

---

## 11. Prototype decisions

_Choices made for this build where the concept note is silent. Update as they are decided._

| Topic | Decision | Date |
|---|---|---|
| Existing prototype | **Rebuild from scratch** on this stack. ecolens-ghana.vercel.app is reference only; no code is ported. | 2026-10-28 |
| Data | **Seeded + some live.** Realistic seeded observations/alerts/incidents for Western Region (Pra, Ankobra), plus free live public sources where practical (e.g. Sentinel-2/Landsat imagery tiles, air-quality feeds, forest-loss alerts). Seeded data is **always labelled** as prototype/simulated (principle 11). | 2026-10-28 |
| First cut | **All four:** map + layers, full alert workflow (Observe → Report with audit trail), mobile field reporting (GPS, photos, offline queue), one-page reports + overview dashboard (incl. MEL metrics). | 2026-10-28 |
| Per-player dashboards | **Every stakeholder role gets its own dedicated dashboard** tailored to its job in the workflow (see section 8). | 2026-10-28 |
| Players (dashboards) | **8 roles:** Leadership/steering, Regulator (EPA), Minerals Commission, Water Resources Commission, Analyst/Reviewer, Field officer, Responder (district assembly), Admin. | 2026-10-28 |
| Offline-first | The **whole app** is offline-first, not just field reporting, because of unreliable networks in Ghana. | 2026-10-28 |
| Map views | **Both 3D globe and 2D map**, with **instant switching** at any time, keeping the same location, layers and selection. | 2026-10-28 |
| Timeline | No fixed demo date. Build continuously; quality bar unchanged. | 2026-10-28 |
| Real-time | Alerts, status changes, field submissions and dashboards **update live** across users without refresh. | 2026-10-28 |
| Quality bar | **Very fast, butter-smooth, best practices.** Performance and polish are core requirements, not extras. | 2026-10-28 |
| Audience | **Partner/funder demo** (EPA, Minerals Commission, WRC, funders). Storytelling and polish come first, but the workflow must be real and work end to end, not just a mock-up. | 2026-10-28 |

## 12. Open questions

_None currently. Add new ones here as they come up._
