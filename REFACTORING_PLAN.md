# REFACTORING PLAN - Code Optimization

## CONTEXT
Vi har deployed 3 nye feed features (emoji picker, edit/delete comments, link previews) + 4 performance optimeringer.

Nu skal vi optimere kodebasen for bedre struktur og mindre context usage.

## CURRENT STATUS (2025-10-22)
✅ Feed features deployed and working
✅ Performance optimizations deployed
✅ Netlify cleanup complete
✅ PROJECT_INFO.md created

## PROBLEM
**Massive filer** bruger for meget context:
1. quotes.js - 3236 linjer (161.75 KB) ⚠️
2. email.js - 2287 linjer (77.47 KB) ⚠️
3. quotes-workspace.js - 1672 linjer (87.07 KB)
4. files-real.js - 1175 linjer (44.25 KB)
5. feed.js - 1010 linjer (56.01 KB)

## REFACTORING PLAN

### PHASE 1: Split quotes.js (CURRENT TASK) 🎯

**Før:** quotes.js - 3236 linjer i én fil

**Efter:** Split i moduler:
```
js/quotes/
  ├── quotes.js (main controller - 300-400 linjer)
  ├── quotes-products.js (produkt CRUD - 500-600 linjer)
  ├── quotes-pdf.js (PDF generation - 400-500 linjer)
  ├── quotes-email.js (email sending - 200-300 linjer)
  ├── quotes-archive.js (arkivering - 300-400 linjer)
  ├── quotes-search.js (search/filter - 200-300 linjer)
  ├── quotes-core.js (EXISTING - keep as is)
  ├── quotes-workspace.js (EXISTING - keep as is)
  ├── quotes-customers.js (EXISTING - keep as is)
  ├── quotes-invoices.js (EXISTING - keep as is)
  └── quotes-utils.js (EXISTING - keep as is)
```

**Approach:**
1. Read quotes.js and analyze sections
2. Create new module files
3. Move functions to appropriate modules
4. Update imports/exports
5. Test that quotes system still works
6. Commit changes

**Expected Result:**
- 80% mindre context usage når Cline arbejder på quotes
- Bedre organization
- Lettere at vedligeholde

### PHASE 2: Split email.js (NEXT)
```
js/email/
  ├── email.js (main controller)
  ├── email-ui.js (UI rendering)
  ├── email-sync.js (IMAP sync)
  ├── email-compose.js (compose window)
  └── email-storage.js (localStorage ops)
```

### PHASE 3: Extract shared components
```
js/shared/
  ├── emoji-picker.js (genbrugelig emoji picker)
  ├── avatar-utils.js (avatar rendering logic)
  ├── date-utils.js (getTimeAgo, formatDate)
  └── api-client.js (centralized API calls)
```

### PHASE 4: Optimize other large files
- files-real.js (1175 linjer)
- videocall.js (898 linjer)
- feed.js (1010 linjer - extract emoji picker)

## TECHNICAL NOTES

### Module Pattern
```javascript
// quotes-products.js
export function addProduct() { ... }
export function editProduct() { ... }
export function deleteProduct() { ... }

// quotes.js (main)
import { addProduct, editProduct, deleteProduct } from './quotes-products.js';
```

### Testing Checklist After Each Module Split
- [ ] Quotes system loads without errors
- [ ] Can create new quote
- [ ] Can add products
- [ ] Can generate PDF
- [ ] Can send email
- [ ] Can archive quote
- [ ] Search/filter works

## ESTIMATED TIME
- Phase 1 (quotes.js split): 20-30 minutes
- Phase 2 (email.js split): 20-30 minutes
- Phase 3 (shared components): 30-40 minutes
- Phase 4 (other files): 20-30 minutes

**Total:** 1.5-2 hours for complete refactoring

## SUCCESS METRICS
✅ Context usage reduced by 70-80% per file
✅ No functionality broken
✅ Code better organized
✅ DRY principles followed
✅ Easier to maintain going forward

---

## CURRENT TASK FOR NEW CONVERSATION:
**Start Phase 1: Split quotes.js into modules**

Read this plan, then:
1. Read quotes.js
2. Analyze the sections/functions
3. Create module files
4. Move code to modules
5. Test functionality
6. Commit with message: "REFACTOR: Split quotes.js into 5 modules (products, pdf, email, archive, search)"
