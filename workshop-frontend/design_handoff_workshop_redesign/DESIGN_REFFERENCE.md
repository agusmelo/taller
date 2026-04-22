# Handoff: Workshop Backoffice — Visual Redesign

## Overview
Visual redesign of the existing Angular 20 + Angular Material workshop backoffice (`workshop-frontend/`). The goal is to replace the current design system (Roboto + saturated navy `#1A2B5F` + red accent `#C41E2A` + white cards with hard elevation) with a modern, minimal system (Plus Jakarta Sans + dark slate `#111827` + quiet neutrals + soft shadows) **without replacing Angular Material** — just re-tokenizing and re-skinning via `styles.scss` overrides and component template updates.

## About the Design Files
The file `workshop-migration.html` is a **design reference** — a static HTML/CSS/JS prototype showing the intended look and behavior of every screen. It is NOT production code to paste in. Your task is to recreate these designs in the existing Angular + Material codebase under `workshop-frontend/`, preserving all current business logic, routing, services, pipes, and components — only the presentation layer changes.

## Fidelity
**High-fidelity.** Exact hex values, spacing, typography, and interactions are final. The prototype includes all thirteen screens at the real proportions; recreate them pixel-close using Angular Material components re-skinned via the token system below.

## Screens covered in the prototype

| # | Screen | Route (existing) | Prototype ID |
|---|---|---|---|
| 1 | Dashboard | `/dashboard` | `p-dashboard` |
| 2 | Trabajos (list) | `/trabajos` | `p-trabajos` |
| 3 | Trabajo detalle | `/trabajos/:id` | `p-trabajoDetail` |
| 4 | Nuevo trabajo | `/trabajos/nuevo` | `p-trabajoCreate` |
| 5 | Clientes (list) | `/clientes` | `p-clientes` |
| 6 | Cliente detalle | `/clientes/:id` | `p-clienteDetail` |
| 7 | Vehículos (list) | `/vehiculos` | `p-vehiculos` |
| 8 | Pagos | `/pagos` | `p-pagos` |
| 9 | Usuarios | `/usuarios` | `p-usuarios` |
| 10 | Importar | `/importar` | `p-importar` |
| 11 | Ajustes | `/ajustes` | `p-ajustes` |
| 12 | Login | `/login` | `p-login` |
| 13 | Migration guide (reference only — not a real screen) | — | `p-migracion` |

Open `workshop-migration.html` in a browser to navigate between all of them. The bottom-right **Tweaks** panel toggles sidebar variants (light / dark / rail) and KPI styles (minimal / icon / sparkline) — pick one of each with the team and ship that combination.

## Design Tokens

Replace the contents of the `:root` block in `src/styles.scss` with:

```scss
:root {
  /* Surfaces */
  --bg:       #f4f4f1;   /* warm off-white app background */
  --surface:  #ffffff;   /* cards, sidebar, topbar */

  /* Brand / text */
  --navy:     #111827;   /* primary — buttons, active nav, chart */
  --navy2:    #1f2937;   /* navy hover */
  --text-1:   #111827;
  --text-2:   #6b7280;
  --text-3:   #9ca3af;

  /* Borders */
  --border:   #e5e7eb;
  --border2:  #f3f4f6;   /* inner separators, row dividers */

  /* Status */
  --blue:     #2563eb;   --blue-lt:   #eff6ff;   /* abierto */
  --amber:    #d97706;   --amber-lt:  #fef3c7;   /* terminado / warn */
  --green:    #16a34a;   --green-lt:  #f0fdf4;   /* pagado / ok */
  --red:      #dc2626;   --red-lt:    #fef2f2;   /* urgente / error */
  --purple:   #7c3aed;   --purple-lt: #f5f3ff;   /* new */
  --teal:     #0d9488;   --teal-lt:   #f0fdfa;   /* mano de obra */

  /* Radius */
  --r:        10px;      /* cards, kpi */
  --r-sm:     6px;       /* inputs, buttons, chips */

  /* Shadow */
  --shadow:     0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
  --shadow-md:  0 4px 12px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.04);

  /* Layout */
  --sidebar-w: 220px;
}
```

### Tokens to delete
- `--color-primary: #1A2B5F` → replaced by `--navy`
- `--color-accent: #C41E2A` → dropped; status uses `--red` only for errors, never as primary
- All Roboto references → Plus Jakarta Sans

### Typography
- **Font family:** `'Plus Jakarta Sans', -apple-system, sans-serif`
- **Body size:** 13px (was 14–15px)
- **Load in `src/index.html`:**
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  ```
- JetBrains Mono only for: job numbers (`T-0447`), RUT, patente, column tokens in the migration guide.

### Scale
| | Size | Weight | Use |
|---|---|---|---|
| `h1` (page title) | 22px | 700 | `.page-head h1` |
| `card-title-lg` | 13px | 700 | Card headers |
| `kpi-val` | 24px | 700 | KPI numbers, letter-spacing -.04em |
| `kpi-label` | 10px | 600 | Uppercase, letter-spacing .08em, color `--text-3` |
| body | 13px | 400 | default |
| table cell | 13px | 400 | `.mat-mdc-cell` |
| table header | 9px | 700 | uppercase, letter-spacing .08em, color `--text-3` |
| caption / td-sm | 11px | 400 | secondary info |

## Layout shell (`layout.component.ts`)

Two big changes from the current layout:

1. **Sidebar is white now.** Background `--surface`, border-right `--border`. Nav items are grey-500; active item is solid `--navy` background with white text (no red accent bar). Width **220px** (was 240px).
2. **Topbar is white too.** Background `--surface`, 56px tall, border-bottom `--border`. Contains: page title, a 380px-wide search input with `--bg` fill, date chip, notification bell, and the primary CTA "Nuevo trabajo".

Use the HTML in the `<aside class="sidebar">` and `<header class="topbar">` blocks of `workshop-migration.html` as the direct template. Replace `<a class="nav-item">` with `<a mat-list-item routerLink="…" routerLinkActive="active">` if keeping `mat-nav-list`, but the cleanest approach is to drop `mat-nav-list` and use the plain custom markup — Material's nav-list styling fights the new look.

## Angular Material overrides (`styles.scss`, after tokens)

```scss
/* Card — flat, soft shadow, neutral border */
.mat-mdc-card {
  background: var(--surface) !important;
  border: 1px solid var(--border2);
  border-radius: var(--r);
  box-shadow: var(--shadow) !important;
  padding: 18px 20px;
  transition: box-shadow .15s;
  &:hover { box-shadow: var(--shadow-md) !important; }
}
.mat-mdc-card-content { padding: 0 !important; }

/* Table — borderless, micro header, hover row */
.mat-mdc-header-row {
  background: transparent !important;
  border-bottom: 1px solid var(--border2);
  height: auto !important;
}
.mat-mdc-header-cell {
  color: var(--text-3) !important;
  font-size: 9px !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  letter-spacing: .08em;
  padding: 0 12px 10px !important;
  border-bottom: none !important;
}
.mat-mdc-row { cursor: pointer; }
.mat-mdc-row:hover { background: var(--bg); }
.mat-mdc-cell {
  padding: 10px 12px !important;
  border-bottom: 1px solid var(--border2) !important;
  font-size: 13px;
  color: var(--text-1);
}

/* Form field — 6px radius, navy focus */
.mat-mdc-form-field.mat-mdc-form-field-appearance-outline {
  --mdc-outlined-text-field-outline-color: var(--border);
  --mdc-outlined-text-field-focus-outline-color: var(--navy);
  --mdc-outlined-text-field-container-shape: 6px;
  --mdc-outlined-text-field-label-text-color: var(--text-3);
  --mdc-outlined-text-field-input-text-color: var(--text-1);
}

/* Raised button primary — navy */
.mat-mdc-raised-button.mat-primary {
  --mdc-protected-button-container-color: var(--navy);
  --mdc-protected-button-label-text-color: #fff;
  --mdc-protected-button-container-shape: 6px;
  box-shadow: none !important;
  &:hover { background: var(--navy2) !important; }
}
.mat-mdc-stroked-button {
  --mdc-outlined-button-outline-color: var(--border);
  --mdc-outlined-button-label-text-color: var(--text-1);
  --mdc-outlined-button-container-shape: 6px;
}

/* Paginator — smaller, transparent */
.mat-mdc-paginator {
  background: transparent;
  font-size: 11px;
  border-top: 1px solid var(--border2);
}

/* Slide-toggle — navy on */
.mat-mdc-slide-toggle.mat-primary {
  --mdc-switch-selected-track-color: var(--navy);
  --mdc-switch-selected-handle-color: #fff;
}
```

## Class-level migration map

Existing global classes → new classes. Do a project-wide find-and-replace, verifying each hit.

| Old | New | Notes |
|---|---|---|
| `.page-container` | wrap content in `<main class="content">` | 24px 28px padding |
| `.page-header` | `.page-head` | flex row with h1 left + actions right |
| `.card-grid.kpi-grid` | `.kpi-row.kpi-row-4` (or `-5`, `-6`) | grid with fixed column count |
| `.stat-card` (inner mat-card content) | `.kpi` markup — `.kpi-label`, `.kpi-val`, `.kpi-delta` | Icon tile optional via `body.kpi-icon .kpi .ico` |
| `.stat-icon` | `.kpi .ico` | 38×38 rounded tile, `--bg` background |
| `.status-badge.status-abierto` | `.badge.b-abierto` | blue-light bg |
| `.status-badge.status-terminado` | `.badge.b-terminado` | amber-light bg |
| `.status-badge.status-pagado` | `.badge.b-pagado` | green-light bg |
| `.search-field` | `.topbar-search` | custom input with inline svg icon |
| `.balance-positive` / `.balance-negative` | inline `color: var(--red)` / `color: var(--green)` with `td-num` | — |
| `.lock-banner` | `.banner.banner-warn` | amber-tint pill |
| `.error-msg` / `.warning-msg` | `.banner.banner-error` / `.banner-warn` | consistent banner component |
| `.totals-panel` | `.totals` + `.totals-row` | right column of `trabajo-detail` |
| `.alert-item` / `.alerts-card` | Two-column grid inside a single `.card` | simpler, less ceremony |
| — (new) | `.filt` chips | replace the current `mat-chip-listbox` for status filtering |
| — (new) | `.tabs` + `.tab.on` | lightweight tabs for cliente-detail sections |

## Component-by-component breakdown

Copy the HTML structure from the prototype and re-wire with the existing component's data bindings. Items below call out non-obvious details.

### Dashboard (`dashboard.component.ts`)
- **KPI grid is 6 columns** on wide screens (breakpoint below 1200px → 3 cols). The first card has `.kpi-accent` (2px navy top border) and shows `facturado_month`.
- **Second row: 4-column `.card` strips** showing status counters and new-clients delta — replaces the current `status-grid`.
- **Alerts** are now inside a single `.card` with a two-column body (overdue left, unpaid jobs right) — no more stacked cards with collapsed tables.
- **Revenue trend** is a bar+line Chart.js combo: `Cobrado` bars in `--navy` (radius 5), `Facturado` line in `#d1d5db` dashed. Switch the select to change period.
- **Jobs-by-type** donut: 5 slices in a monochrome grey ramp (`#111827 → #d1d5db`). Hides legend; uses a custom legend list below the donut.
- **Cierre mensual** card becomes the KPI-6 breakdown strip + first 5 rows of the month's jobs. Tabs for Todos / Con IVA / Sin IVA.
- **Top 5 clientes** right column with VIP / Nueva badges.

### Jobs list (`jobs/list/job-list.component.ts`)
- 5 KPI summary cards on top (total abiertos / en proceso / esperando / listos / urgentes).
- Filter row: `.filt` chips (Todos / Abierto / Terminado / Pagado) + search input + two `<input type=date>` in place of the current `matDatepicker` — or keep `matDatepicker` but restyle.
- Table loses elevation (`mat-elevation-z1` → remove class). Paginator sits inside the card's bottom with `padding: 10px 20px; border-top: 1px solid var(--border2)`.
- `t-mono` class for `job_number`, muted lowercase for dates.

### Job detail (`jobs/detail/job-detail.component.ts`)
- Header: h1 + status badge + optional lock icon, right side has "Marcar pagado" (primary) / "Imprimir PDF" / "Eliminar" (danger).
- If locked: `.banner.banner-warn` with "Desbloquear" button.
- **Three info cards** in a row: Cliente / Vehículo / Financiero. Financiero uses the nested `.totals` block.
- Items table with type badge (`b-teal` = "Mano de obra", `b-reg` = "Repuesto").
- Bottom row: two cards side-by-side — Pagos list (or empty state) + Notas internas textarea.

### Job create (`jobs/create/job-create.component.ts`)
- 2-1 layout: left = form (cliente+vehículo, items table with inline inputs, notes), right = **sticky summary card** at `top: 72px` with totals and action buttons + recent history of the client.
- Items table uses `<input class="field-input">` inside cells for inline edit — keep the existing FormArray logic intact.

### Clients / Vehicles lists
- Same shape as Jobs list: 4 KPI cards → filter bar → card-wrapped `mat-table`.
- Nombre column shows inline badges (`VIP`, `Nueva`) appended to the name.
- Saldo column uses `--red` + weight 600 when > 0, `--text-3` "—" when 0.

### Client detail
- 3 info cards (Contacto / Financiero / Stats) → `.tabs` (Trabajos / Vehículos / Pagos) → flat table with the selected tab's data.

### Payments (`payments-page.component.ts`)
- 4 KPIs; the last one (`Métodos de cobro`) has a tiny 48px donut chart inside.
- Full-width horizontal-bar comparison (Cobrado green 82% / Pendiente red 18%) with the amount+percent rendered inside the bar.
- `.aging-grid` — 5 equal columns (0-30 / 31-60 / 61-90 / 90+ / Total). The "90+" card uses `.aging-danger` (red tint).
- Tabs: Trabajos con saldo / Pagos recientes / Deudores.
- Each row has a primary "Cobrar" button on the right.

### Users
- Simple table inside a card, with role badges: `b-vip` admin, `b-pro` recep, `b-teal` mecánico. Active/Inactive as status badge.

### Import (`import.component.ts`)
- Three-step wizard in a 2-1 layout. Left: type picker (3 big buttons) → `.upload-zone` (dashed border, drag area) → mapping table of `<select>` elements. Right: file summary card + validation banners (success / warn / error).
- Below: `Importaciones recientes` table.

### Settings
- 2-1 layout. Left: `Datos del taller` / `Facturación` / `Seguridad` cards with `.setting-row` (label + desc left, control right, separator below). Right: system status token list + action buttons.
- Custom `.switch` component (34×20 pill with sliding dot) replaces `mat-slide-toggle` only where the label layout doesn't fit, otherwise re-skin `mat-slide-toggle`.

### Login (`auth/login/login.component.ts`)
- Full-viewport `.login-wrapper` with `--bg` background.
- Centered `.login-card` (400px, radius 14px, soft deep shadow).
- Brand: 44×44 logo-mark + "Taller Morales e Hijos" + "Iniciar sesión".
- Two `.field` inputs + primary button full width + footer with version + "¿Olvidaste tu contraseña?" link.

## Interactions & Behavior

- **Active nav item:** navy background, white text. Hover on inactive: `--bg` background, `--text-1` color.
- **Table rows:** `cursor: pointer; hover { background: var(--bg); }`.
- **Buttons:** 140ms transitions on background/border. Primary `--navy` → `--navy2` on hover.
- **Focus ring:** `box-shadow: 0 0 0 3px rgba(17,24,39,.06); border-color: var(--navy);` for inputs.
- **Charts:** Chart.js 4.4.x, loaded from CDN. All chart colors use the token palette, font family Plus Jakarta Sans.
- **Privacy mode** toggle on dashboard: preserve the existing `privacyMode` behavior (`***` replaces amounts) — no visual change needed, just rewire the toggle as a `.btn.btn-ghost` in the `.page-head-actions` area.

## File-by-file checklist (Angular side)

| File | Action | Effort |
|---|---|---|
| `src/styles.scss` | Replace tokens + add Material overrides block | High |
| `src/index.html` | Swap font link to Plus Jakarta Sans + JetBrains Mono | Low |
| `layout/layout.component.ts` | White sidebar + white topbar + search chip, drop red accents | Medium |
| `dashboard/dashboard.component.ts` | Restructure KPIs (6 col), two-column alerts, chart re-theme | High |
| `jobs/list/job-list.component.ts` | KPI strip + filter chips + flat table | Medium |
| `jobs/detail/job-detail.component.ts` | 3 info cards + items table + totals panel + warning banner | High |
| `jobs/create/job-create.component.ts` | 2-1 layout, sticky summary | Medium |
| `clients/list/*.ts`, `vehicles/list/*.ts` | Same pattern as jobs list | Medium each |
| `clients/detail/*.ts` | 3 info cards + tabs | Medium |
| `payments/*.ts` | KPI + bar + aging-grid + tabbed tables | High |
| `users/*.ts` | Plain table with role badges | Low |
| `import/*.ts` | Wizard 3 steps + upload zone + validation panel | Medium |
| `settings/*.ts` | setting-row with custom switches | Medium |
| `auth/login/login.component.ts` | Centered card | Low |
| `shared/pipes/status.pipe.ts` | No change — only the CSS of badges changes | Low |

## Recommended implementation order

1. **Tokens + fonts** (`styles.scss`, `index.html`). Verify nothing crashes.
2. **Layout shell** (`layout.component`). Biggest visual regression, fastest payoff.
3. **Dashboard** — canonical example of KPIs + charts + tables.
4. **Lists** (Jobs / Clients / Vehicles) — same pattern, copy once, apply thrice.
5. **Detail views** (Trabajo detalle + create, Cliente detalle).
6. **Payments** + **Import** (most specific).
7. **Users / Settings / Login** — leave for last, they're quick wins.

## Assets
No external assets beyond Google Fonts and Chart.js (already a dep). The logo mark is an inline SVG wrench — keep yours, just put it inside a 30×30 `.logo-mark` tile with `--navy` background.

## Files in this bundle
- `workshop-migration.html` — full interactive prototype; open in a browser, use the left sidebar to navigate all 13 screens, use the Tweaks button (bottom right) to compare sidebar and KPI variants.
- `README.md` — this file.
