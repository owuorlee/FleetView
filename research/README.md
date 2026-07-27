# Competitor research — intake

Drop competitor material here so it can be turned into `../05-competitive-analysis.md`
(feature matrix + UX convention map + weakness log + migration playbook).

## Folder per competitor

```
research/
  <competitor-slug>/        e.g. cartrack/, safetrac/, itrack/
    links.md                URLs: website, Play Store, manuals, demo login, videos
    notes.md                freeform observations (what you saw in-app, prices quoted, etc.)
    screenshots/            app + web screenshots (png/jpg) — name them by flow
    manuals/                PDFs: device manuals, quick-start guides, brochures
```

Name screenshots by the flow they show, e.g. `live-map.png`, `immobilize-confirm.png`,
`renewal.png`, `geofence-setup.png`, `alerts.png`, `onboarding-otp.png`.

## What to capture per competitor (checklist)

**Tier 1 — no account needed**
- [ ] Play Store URL (I pull description, screenshots, reviews)
- [ ] Website feature page URL(s)
- [ ] Website pricing/packages URL
- [ ] Device manual / quick-start PDF (esp. **SMS command list** — migration-critical)
- [ ] YouTube walkthrough URL(s)

**Tier 2 — where you're already a customer (richest UX)**
- [ ] Screenshots/recordings of: onboarding, live map, trip playback,
      immobilize/restore, alert center, renewal/payment, geofence setup

**Tier 3 — device intel (migration wedge)**
- [ ] Model number + IMEI sticker photo
- [ ] SIM removable or locked? Server/APN it points to?
- [ ] SMS command manual for that model

## Guardrails
- Represent yourself honestly on any signup; skip sites whose ToS forbids it.
- Never put competitor passwords in these files or in chat.
- We adopt conventions and ideas, never their code, copy, or exact designs.
```
```
