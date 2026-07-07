# Kenya Vehicle & Motorbike Tracking Platform — Planning Documents

Working name: **FleetView**. Architecture: self-hosted **Traccar** core + custom NestJS/Flutter/React layer ("Path B"). Drafted 2026-07-06.

| # | Document | Contents |
|---|---|---|
| 1 | [01-technical-spec.md](01-technical-spec.md) | Architecture, Traccar-vs-backend responsibilities, data model (ERD), API design, immobilization safety flow, alerting pipeline, M-Pesa billing flows, SIM ops, security/ODPC, NFRs, milestones M1–M3 |
| 2 | [02-traccar-server-setup-guide.md](02-traccar-server-setup-guide.md) | Copy-paste Ubuntu 24.04 deployment: Traccar 6.14.5 + PostgreSQL, Nginx/TLS, UFW, **verified device ports (GT06 → 5023, Teltonika → 5027)**, GT06N & FMB920 SMS provisioning, relay wiring notes, backups, troubleshooting |
| 3 | [03-app-design-and-prototype.md](03-app-design-and-prototype.md) | Personas, IA, user flows, screen-by-screen wireframes with empty/error/offline states, design system, EN/SW copy, Android-light constraints |
| 4 | [04-business-plan-and-financials.md](04-business-plan-and-financials.md) | Market sizing, competitive positioning, pricing, unit economics, startup budget (KSh 363k), 3-year projection to EBITDA break-even (~month 20–22), sensitivity, GTM, ops, risks, KPIs, 90-day plan |
| — | [prototype/index.html](prototype/index.html) | Clickable static HTML/CSS mockup of 6 key screens (no build tooling — open in a browser) |

**Key verified facts** (traccar.org, 2026-07-06): current release 6.14.5; Linux installer bundles Java, installs to `/opt/traccar`; protocol ports gt06 = 5023, teltonika = 5027; PostgreSQL switch via `database.*` keys in `traccar.xml`. Daraja endpoint paths documented from standard Safaricom docs — re-verify on the developer portal when API credentials are issued.
