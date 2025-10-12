# 📋 Ordrestyringssystem - Backend Guide

## 🚀 Kom i gang

### 1. Kør Database Migration (FØRSTE GANG)

Før du starter serveren første gang efter denne opdatering, skal du køre migration scriptet:

```bash
cd backend/breeze-portal-backend
node migrate-to-order-system.js
```

Dette vil:
- ✅ Opdatere `quotes` tabellen med nye felter
- ✅ Migrere eksisterende tilbud til nye ordrenumre (0001, 0002...)
- ✅ Oprette `invoices` og `invoice_lines` tabeller
- ✅ Forblive bagudkompatibel med eksisterende data

### 2. Start Backend Serveren

```bash
npm start
# eller
node server.js
```

---

## 📊 Nye API Endpoints

### **Quotes/Orders (Opdateret)**

#### Accept Quote (Gør til ordre)
```
POST /api/quotes/:id/accept
Authorization: Bearer <token>

Response:
{
  "id": 1,
  "order_number": "0001",
  "full_order_number": "0001",
  "status": "accepted",
  "accepted_at": "2025-10-10T20:00:00Z",
  ...
}
```

#### Create Extra Work (Ekstraarbejde)
```
POST /api/quotes/:id/extra-work
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Ekstra gulvplader",
  "notes": "Ekstra materiale efter aftale",
  "terms": "Netto 14 dage",
  "lines": [
    {
      "description": "Ekstra gulvplader 10m²",
      "quantity": 10,
      "unit": "kvm",
      "unit_price": 250,
      "discount_percent": 0
    }
  ]
}

Response:
{
  "id": 2,
  "order_number": "0001",
  "parent_order_id": 1,
  "sub_number": 1,
  "is_extra_work": 1,
  "full_order_number": "0001-01",
  "status": "accepted",
  ...
}
```

### **Invoices (NYT)**

#### Get All Invoices
```
GET /api/invoices
Authorization: Bearer <token>

Response:
[
  {
    "id": 1,
    "invoice_number": "5000",
    "order_id": 1,
    "full_order_number": "0001",
    "invoice_date": "2025-10-10",
    "due_date": "2025-10-24",
    "total": 12500,
    "status": "draft",
    ...
  }
]
```

#### Get Single Invoice with Lines
```
GET /api/invoices/:id
Authorization: Bearer <token>

Response:
{
  "id": 1,
  "invoice_number": "5000",
  "order_id": 1,
  "full_order_number": "0001",
  "invoice_date": "2025-10-10",
  "due_date": "2025-10-24",
  "payment_terms": "Netto 14 dage",
  "subtotal": 10000,
  "vat_amount": 2500,
  "total": 12500,
  "status": "draft",
  "lines": [
    {
      "description": "Gulvlægning kontor",
      "quantity": 50,
      "unit": "kvm",
      "unit_price": 200,
      "line_total": 10000
    }
  ],
  ...
}
```

#### Create Invoice from Order
```
POST /api/invoices/from-order/:orderId
Authorization: Bearer <token>
Content-Type: application/json

{
  "due_date": "2025-10-24",  // Optional (default: 14 days from now)
  "payment_terms": "Netto 14 dage",  // Optional
  "notes": "Tak for ordren"  // Optional
}

Response:
{
  "id": 1,
  "invoice_number": "5000",
  "order_id": 1,
  "full_order_number": "0001",
  "due_date": "2025-10-24",
  "total": 12500,
  ...
}
```

#### Update Invoice
```
PUT /api/invoices/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "due_date": "2025-10-30",
  "payment_terms": "Netto 30 dage",
  "status": "sent",
  "notes": "Opdateret forfaldsdato"
}
```

#### Send Invoice via Email
```
POST /api/invoices/:id/send
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Invoice sent successfully"
}
```

#### Delete Invoice
```
DELETE /api/invoices/:id
Authorization: Bearer <token>

Response:
{
  "success": true
}
```

---

## 🔢 Nummer Systemer

### Order Numbers (Tilbud/Ordre)
- **Format:** `0001`, `0002`, `0003`...
- **Start:** 0001
- **Felter:** `order_number` i `quotes` tabel
- Genereres automatisk når et nyt tilbud oprettes

### Extra Work Numbers (Ekstraarbejde)
- **Format:** `0001-01`, `0001-02`, `0002-01`...
- **Struktur:** `{hovedsag}-{sub-nummer}`
- **Eksempel:**
  - Ordre 0001 (hovedsag)
    - Ekstraarbejde 0001-01
    - Ekstraarbejde 0001-02
  - Ordre 0002 (hovedsag)
    - Ekstraarbejde 0002-01

### Invoice Numbers (Fakturaer)
- **Format:** `5000`, `5001`, `5002`...
- **Start:** 5000
- **Felter:** `invoice_number` i `invoices` tabel
- Genereres automatisk når faktura oprettes

---

## 🗂️ Database Struktur

### `quotes` Tabel (Opdateret)
```sql
quotes:
  - id (PRIMARY KEY)
  - order_number (TEXT) -- 0001, 0002...
  - parent_order_id (INTEGER, NULL) -- Reference til hovedsag ved ekstraarbejde
  - sub_number (INTEGER, NULL) -- 1, 2, 3... ved ekstraarbejde
  - is_extra_work (INTEGER) -- 0 eller 1
  - customer_id (INTEGER)
  - title (TEXT)
  - requisition_number (TEXT)
  - date (TEXT)
  - valid_until (TEXT)
  - status (TEXT) -- 'draft', 'sent', 'accepted', 'rejected'
  - notes (TEXT)
  - terms (TEXT)
  - subtotal (REAL)
  - vat_rate (REAL)
  - vat_amount (REAL)
  - total (REAL)
  - created_by (INTEGER)
  - created_at (TEXT)
  - sent_at (TEXT)
  - accepted_at (TEXT)
```

### `invoices` Tabel (NYT)
```sql
invoices:
  - id (PRIMARY KEY)
  - invoice_number (TEXT UNIQUE) -- 5000, 5001...
  - order_id (INTEGER) -- Reference til quotes.id
  - full_order_number (TEXT) -- "0001" eller "0001-01"
  - invoice_date (TEXT)
  - due_date (TEXT)
  - payment_terms (TEXT)
  - subtotal (REAL)
  - vat_rate (REAL)
  - vat_amount (REAL)
  - total (REAL)
  - notes (TEXT)
  - status (TEXT) -- 'draft', 'sent', 'paid', 'overdue'
  - created_by (INTEGER)
  - created_at (TEXT)
  - sent_at (TEXT)
  - paid_at (TEXT)
```

### `invoice_lines` Tabel (NYT)
```sql
invoice_lines:
  - id (PRIMARY KEY)
  - invoice_id (INTEGER)
  - description (TEXT)
  - quantity (REAL)
  - unit (TEXT)
  - unit_price (REAL)
  - discount_percent (REAL)
  - discount_amount (REAL)
  - line_total (REAL)
  - sort_order (INTEGER)
```

---

## 📝 Workflow Eksempel

### Komplet Sags-flow

```
1. OPRET TILBUD
   POST /api/quotes
   → Tilbud 0001 (status: draft)

2. SEND TIL KUNDE
   POST /api/quotes/1/send
   → Tilbud 0001 (status: sent)

3. KUNDE ACCEPTERER
   POST /api/quotes/1/accept
   → Ordre 0001 (status: accepted)

4. OPRET FAKTURA
   POST /api/invoices/from-order/1
   → Faktura 5000 (ref: Ordre 0001)

5. SEND FAKTURA
   POST /api/invoices/1/send
   → Faktura 5000 sendt til kunde

--- SENERE: EKSTRAARBEJDE ---

6. OPRET EKSTRAARBEJDE
   POST /api/quotes/1/extra-work
   → Ordre 0001-01 (status: accepted)

7. OPRET FAKTURA FOR EKSTRAARBEJDE
   POST /api/invoices/from-order/2
   → Faktura 5001 (ref: Ordre 0001-01)
```

---

## 🔧 Helper Functions (i server.js)

### `generateOrderNumber()`
Genererer næste ordre nummer (0001, 0002...)

### `generateExtraWorkNumber(parentOrderId)`
Genererer ekstraarbejde nummer (0001-01, 0001-02...)

### `generateInvoiceNumber()`
Genererer næste faktura nummer (5000, 5001...)

### `getFullOrderNumber(quote)`
Returnerer fuldt ordre nummer inkl. ekstraarbejde suffix
- Hovedsag: "0001"
- Ekstraarbejde: "0001-01"

---

## 📌 Næste Skridt

Backend er nu klar! For at få et komplet system skal der også laves:

1. **Frontend UI Opdateringer:**
   - Omdøb menu "Tilbud" → "Ordrestyring"
   - Tilføj tab system (Tilbud, Fakturering, Kunder)
   - Status filtre på hver tab
   - "Opret Ekstraarbejde" knap på accepterede ordrer
   - "Opret Faktura" funktionalitet

2. **PDF Generation:**
   - Tilbud PDF
   - Ordrebekræftelse PDF
   - Faktura PDF
   - Med virksomhedsinfo i bunden

3. **Testing:**
   - Test komplet workflow
   - Verificer nummer generering
   - Test ekstraarbejde flow

---

## 🎯 Status

### ✅ Komplet Backend Features:
- [x] Order numbering system (0001, 0002...)
- [x] Extra work numbering (0001-01, 0001-02...)
- [x] Invoice numbering (5000, 5001...)
- [x] Accept quote endpoint
- [x] Create extra work endpoint
- [x] Full invoice CRUD API
- [x] Invoice from order creation
- [x] Email sending (quotes & invoices)
- [x] Database migration script

### ⏳ Mangler (Frontend):
- [ ] UI tab system
- [ ] Status filters
- [ ] Extra work UI
- [ ] Invoice UI
- [ ] PDF generation

Backend er klar til brug! 🚀
