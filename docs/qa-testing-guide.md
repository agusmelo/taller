# QA Testing Guide — Sistema de Gestión de Taller Mecánico

**Application**: Mechanic Workshop Management System  
**Stack**: Angular 20 frontend (port 4200) · Node.js/Express API (port 3000) · PostgreSQL  
**Last Updated**: 2026-06-13

---

## Environment Setup

```bash
# Start all services
docker compose up -d

# Access the app
http://localhost:4200

# Test credentials
admin / admin123          → role: Administrador (full access)
recep1 / recep1123        → role: Recepcionista  (no admin pages)
mecanico1 / mecanico1123  → role: Mecánico       (only Trabajos + Vehiculos)
```

---

## Core Flows to Test

### 1. Authentication

| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to `/login`, submit empty form | "Entrar" button disabled |
| 2 | Enter wrong credentials | Error snackbar shown |
| 3 | Login as `admin / admin123` | Redirected to `/trabajos` |
| 4 | Navigate to `/login` while logged in | Redirected back to `/trabajos` |
| 5 | Clear `localStorage` | Redirected to `/login` |

### 2. Job Management (Trabajos)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Nuevo Trabajo" | Opens job creation form |
| 2 | Search plate (e.g. "ABC") | Autocomplete shows matching vehicles |
| 3 | Select vehicle, fill fields, save | Job created, redirected to job detail |
| 4 | On job detail, click "Registrar Pago" | Payment modal opens with amount/method |
| 5 | Submit payment | Payment listed in job, total updated |
| 6 | Mark job as "Terminado" | Status badge changes, job locked from edits |
| 7 | Dates shown in job list/detail | Format `DD/MM/YYYY` (e.g. 13/06/2026, not 12/06/2026) |

**Key invariant**: Dates are stored as UTC midnight. All `date` pipes must use `:'UTC'` timezone parameter to display correctly in UTC-3.

### 3. Client Management (Clientes)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to `/clientes`, search by name | List filters in real-time |
| 2 | Click a client | Detail page shows: info cards, jobs tab, vehicles tab, payments tab |
| 3 | Click "Editar" | Edit modal opens with prefilled data |
| 4 | As admin, click "Eliminar" | Confirmation dialog warns about linked data |

### 4. Vehicle Management (Vehiculos)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to `/vehiculos`, search by plate | List filters |
| 2 | Click a vehicle | Detail shows: owner, vehicle data, ownership history, jobs |
| 3 | Click "Editar" | Edit modal opens |
| 4 | As admin, click "Transferir" | Transfer form expands, owner search works |
| 5 | Confirm transfer | Ownership history updated with old + new owner |

### 5. Dashboard (admin only)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to `/dashboard` | KPI cards, monthly revenue chart, recent jobs |
| 2 | Cycle months with prev/next | Table updates with correct jobs for that month |
| 3 | Dates in "Cierre Mensual" table | Format `DD/MM/YYYY` (UTC-safe) |
| 4 | "Saldo por cobrar" bucket | Shows jobs grouped by debt aging (0-30d, 31-60d, etc.) |

**Known cosmetic issue**: "Nuevos clientes (mes)" badge may show negative values (e.g. "-3") when deletions exist. Not a blocker but warrants investigation.

### 6. Payments Page (admin only)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to `/pagos` | Table shows all payments with date, method, amount |
| 2 | Filter by date range | Results narrow correctly |
| 3 | Payment dates | Format `DD/MM/YYYY HH:mm` for recent, `DD/MM/YYYY` for date-only |

### 7. Retention / Overdue Service

| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to `/retencion` | Shows catalog item filter, threshold field, results table |
| 2 | Threshold field label | Shows "Umbral" + "días" suffix (NOT "Umbral (días)días") |
| 3 | Select a catalog item | Results filter to vehicles last serviced with that item |
| 4 | Dates in last-service column | Format `DD/MM/YYYY` (UTC-safe) |

### 8. Alerts

| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to `/alertas` | Alerts feed with severity badges |
| 2 | Alert bell in header | Shows unread count badge |
| 3 | Go to `/alertas/definiciones` (admin) | Alert rules listed with type, condition, days |
| 4 | Toggle alert on/off | Active state persists after page refresh |

### 9. Item Catalog (admin only)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to `/trabajos/catalogo-items` | List of 35 items with type badges |
| 2 | Filter by "Mano obra" / "Repuesto" | Items filter correctly |
| 3 | Click "Nuevo item" | Modal opens with Descripcion + Tipo fields |
| 4 | Fill description | "Guardar" button becomes enabled |
| 5 | Click "Agregar detalle" | Sub-detail rows can be added |

### 10. Import (admin only)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to `/importar` | Drop zone shown, "Vista previa" disabled |
| 2 | Upload a CSV | Preview table populates, "Vista previa" enabled |
| Expected CSV format | `Cliente;Fecha;Docs A pagar;Forma de Pago;Total;Importe pagado` | |

### 11. Users (admin only)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to `/usuarios` | All users listed with roles |
| 2 | Create new user | Modal with username/password/role |
| 3 | Delete user | Confirmation dialog |

### 12. Settings (admin only)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to `/ajustes` | Tax %, discount %, business name fields |
| 2 | Update tax % | New jobs use updated rate |

### 13. Global Search

| Step | Action | Expected |
|------|--------|----------|
| 1 | Type in header search bar | Dropdown with clients, vehicles, jobs |
| 2 | Click a result | Navigates to that entity's detail page |

### 14. Role-Based Access Control

| Role | Can access | Cannot access |
|------|-----------|---------------|
| Administrador | All routes | — |
| Recepcionista | Trabajos, Clientes, Vehiculos, Alertas | Dashboard, Pagos, Usuarios, Importar, Ajustes, Catalogo |
| Mecánico | Trabajos, Vehiculos | All others |

**Test**: Login as `recep1`, navigate to `/dashboard` → should redirect to `/trabajos`.  
**Test**: Login as `mecanico1`, nav bar should show only Trabajos and Vehiculos.

---

## Known Issues / Bug History

### FIXED — ISSUE-001: Date displays one day early (UTC-3 timezone)

- **Root cause**: Angular `date:'dd/MM/yyyy'` without `:'UTC'` converts UTC-midnight dates to local time (Uruguay = UTC-3), showing the previous day.  
- **Fix**: Added `:'UTC'` to all date pipe calls across 6 files.  
- **Affected files**: `job-list`, `job-detail`, `client-detail`, `dashboard`, `vehicle-detail`, `overdue-service-list`  
- **Commit**: `fix(qa): ISSUE-001 — date pipe displays one day early in UTC-3 timezone`

### FIXED — ISSUE-002: Double "días" label on retention threshold

- **Root cause**: `<mat-label>Umbral (días)</mat-label>` combined with `<span matTextSuffix>días</span>` rendered as "Umbral (díasdías)".  
- **Fix**: Changed mat-label text to just "Umbral".  
- **Affected file**: `overdue-service-list.component.ts`  
- **Commit**: `fix(qa): ISSUE-002 — double 'dias' label in retention threshold field`

### INFORMATIONAL — Duplicate client names

- "LEONARDO FOLGAR" and "Leonardo Folgar" exist as separate clients (data quality issue, not a code bug).

### INFORMATIONAL — Dashboard "Nuevos clientes (mes)" badge

- May show negative values when deletions happened. Investigate if business logic should show 0 minimum.

---

## Regression Checklist (after any deploy)

1. Login as admin → job list shows correct dates (DD/MM/YYYY, not previous day)
2. Retention page `/retencion` → threshold label shows "Umbral" (not "Umbral (días)días")
3. Create a new job → it appears in job list and job detail with correct date
4. Register a payment → payment appears in job detail and client payments tab
5. Role guard: login as `mecanico1` → nav shows only Trabajos + Vehiculos
6. Role guard: login as `recep1` → `/dashboard` redirects to `/trabajos`
