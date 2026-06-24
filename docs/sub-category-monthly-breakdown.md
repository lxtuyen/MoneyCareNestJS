# Chi Tieu Thang Hien Tai Theo Sub-Category (Monthly Sub-Category Breakdown)

> Tai lieu mo ta tinh nang cho phep user xem chi tiet chi tieu theo sub-category trong tung category,
> vi du: "An uong 500k" → "Cafe 150k (5 lan), Com trua 300k (22 lan), Tra sua 50k (2 lan)"
> Tao ngay: 2026-06-22

---

## 1. Muc Tieu Tinh Nang

### 1.1 Hien trang

API `GET :userId/total-by-category` tra ve:

```json
[
  { "category_id": 1, "categoryName": "An uong", "categoryIcon": "🍕", "total": 500000, "spendingPercentage": 45 },
  { "category_id": 2, "categoryName": "Di chuyen", "categoryIcon": "🚗", "total": 200000, "spendingPercentage": 18 }
]
```

**Van de**: User chi thay "An uong 500k" ma **khong biet chi tiet** ben trong.

### 1.2 Muc tieu

User co the thay:

```
Thang 6/2026:
├── 🍕 An uong: 500,000d (45%)
│   ├── ☕ Cafe: 150,000d (5 lan) — 30%
│   ├── 🍚 Com trua: 300,000d (22 lan) — 60%
│   └── 🧋 Tra sua: 50,000d (2 lan) — 10%
├── 🚗 Di chuyen: 200,000d (18%)
│   ├── ⛽ Xang: 150,000d (2 lan) — 75%
│   └── 🏍️ Grab: 50,000d (3 lan) — 25%
└── 🎮 Giai tri: 150,000d (14%)
    └── (khong co sub-category)
```

---

## 2. Phan Tich Kien Truc Hien Tai

### 2.1 Backend — API `sumByCategory`

**File**: `src/modules/transactions/transactions-statistics.service.ts` (dong 32-131)

Hien tai `sumByCategory()` chay **2 query song song**:
1. Query **tat ca categories** cua user (bao gom system categories)
2. Query **SUM(amount) GROUP BY category.id** tu transactions

Ket qua: merge 2 query → tra ve danh sach `TotalByCategory[]`

**Dac diem quan trong**:
- Da join `subCategory` trong `buildTransactionBaseQuery()` (file `transaction-query.util.ts` dong 40, 50)
- Nhung `sumByCategory` chi `groupBy('category.id')` → **khong group theo sub-category**
- Formula tinh amount da xu ly couple splits phuc tap

### 2.2 Frontend — Statistics Screen

**Files lien quan**:
- `fe/lib/features/statistics/` — Man hinh thong ke chinh
- `fe/lib/features/transaction/domain/entities/total_by_category_entity.dart` — Entity
- `fe/lib/features/statistics/presentation/widgets/statistics_overview_card.dart` — PieChart

Hien tai: PieChart chi hien thi **category chinh**, tap vao category → hien danh sach transactions (khong nhom theo sub-category).

### 2.3 Database — Du Lieu Lien Quan

- `transactions.subCategory` → FK den `sub_categories` (da co san)
- `monthly_analytics_snapshots.categoryExpenses` → JSONB chi luu `{ "An uong": 1500000 }` (khong co sub-category breakdown)

---

## 3. Cac Phuong An Thiet Ke

### Phuong An A: Mo rong API `total-by-category` (Khuyen nghi)

Them **sub-category breakdown** vao **response hien co**:

```json
[
  {
    "category_id": 1,
    "categoryName": "An uong",
    "categoryIcon": "🍕",
    "total": 500000,
    "spendingPercentage": 45,
    "subCategories": [
      {
        "subCategoryId": 10,
        "subCategoryName": "Cafe",
        "subCategoryIcon": "☕",
        "total": 150000,
        "count": 5,
        "percentage": 30
      },
      {
        "subCategoryId": 11,
        "subCategoryName": "Com trua",
        "subCategoryIcon": "🍚",
        "total": 300000,
        "count": 22,
        "percentage": 60
      }
    ]
  }
]
```

**Uu diem**:
- Backward compatible (them field moi, khong xoa field cu)
- 1 API call duy nhat, frontend khong can goi them
- Frontend co the hien thi hoac an sub-category tuy y

**Nhuoc diem**:
- Response lon hon
- Query phuc tap hon (them 1 query GROUP BY sub-category)

---

### Phuong An B: Tao API rieng `total-by-sub-category`

API moi: `GET :userId/total-by-sub-category?categoryId=1`

```json
[
  {
    "subCategoryId": 10,
    "subCategoryName": "Cafe",
    "subCategoryIcon": "☕",
    "total": 150000,
    "count": 5,
    "percentage": 30
  }
]
```

**Uu diem**:
- Tach biet, khong anh huong API cu
- Chi goi khi user tap vao 1 category cu the → tiet kiem bandwidth

**Nhuoc diem**:
- Them 1 API endpoint moi
- Frontend can 2 call: 1 cho categories, 1 cho sub-categories khi drill-down
- Nhieu network round-trips hon

---

### Phuong An C: Ket hop A + B

Mo rong API cu + them API rieng cho drill-down chi tiet hon (vd: xem transactions cua sub-category).

**Khuyen nghi**: **Phuong An A** vi don gian, 1 call, backward compatible.

---

## 4. Thiet Ke Chi Tiet (Phuong An A)

### 4.1 Backend — Thay Doi

#### 4.1.1 [MODIFY] `transactions-statistics.service.ts`

**File**: `src/modules/transactions/transactions-statistics.service.ts`

Them **query thu 3** trong `sumByCategory()` de lay sub-category totals:

```typescript
// Query 3: SUM(amount) GROUP BY category.id, subCategory.id
const subCategoryQuery = buildTransactionBaseQuery(
  this.transactionRepo,
  dto.userId,
  dto.type === 'income' ? 'income' : 'expense',
  { startDate: dto.startDate, endDate: dto.endDate },
);

subCategoryQuery
  .select('category.id', 'categoryId')
  .addSelect('subCategory.id', 'subCategoryId')
  .addSelect('subCategory.name', 'subCategoryName')
  .addSelect('subCategory.icon', 'subCategoryIcon')
  .addSelect(`SUM(${amountFormula})`, 'total')
  .addSelect('COUNT(transaction.id)', 'count')
  .andWhere('subCategory.id IS NOT NULL')
  .groupBy('category.id')
  .addGroupBy('subCategory.id')
  .addGroupBy('subCategory.name')
  .addGroupBy('subCategory.icon');
```

Sau do merge vao response:

```typescript
// Merge sub-category totals vao tung category
const subCategoryMap = new Map<number, SubCategoryTotal[]>();
subCategoryTotals.forEach((sc) => {
  const catId = Number(sc.categoryId);
  if (!subCategoryMap.has(catId)) subCategoryMap.set(catId, []);
  const catTotal = totalMap.get(catId) ?? 1;
  subCategoryMap.get(catId)!.push({
    subCategoryId: Number(sc.subCategoryId),
    subCategoryName: sc.subCategoryName,
    subCategoryIcon: sc.subCategoryIcon,
    total: Number(sc.total) || 0,
    count: Number(sc.count) || 0,
    percentage: catTotal > 0
      ? Math.round(((Number(sc.total) || 0) / catTotal) * 100)
      : 0,
  });
});

// Them subCategories vao tung category result
const formatted: TotalByCategory[] = categories.map((cat) => ({
  // ... existing fields
  subCategories: subCategoryMap.get(Number(cat.categoryId)) ?? [],
}));
```

---

#### 4.1.2 [MODIFY] `total-by-category.interface.ts`

**File**: `src/common/interfaces/total-by-category.interface.ts`

```diff
+interface SubCategoryTotal {
+  subCategoryId: number;
+  subCategoryName: string;
+  subCategoryIcon: string;
+  total: number;
+  count: number;
+  percentage: number;
+}
+
 interface TotalByCategory {
   category_id?: number;
   categoryIcon: string;
   categoryName: string;
   spendingPercentage: number;
   total: number;
+  subCategories: SubCategoryTotal[];
 }
-export type { TotalByCategory };
+export type { TotalByCategory, SubCategoryTotal };
```

---

#### 4.1.3 Controller & DTO

Khong can thay doi — API endpoint, parameters, va logic giu nguyen.

---

### 4.2 Frontend — Thay Doi

#### 4.2.1 [MODIFY] `total_by_category_entity.dart`

```diff
+class SubCategoryTotalEntity {
+  final int subCategoryId;
+  final String subCategoryName;
+  final String subCategoryIcon;
+  final int total;
+  final int count;
+  final double percentage;
+
+  const SubCategoryTotalEntity({
+    required this.subCategoryId,
+    required this.subCategoryName,
+    required this.subCategoryIcon,
+    required this.total,
+    required this.count,
+    required this.percentage,
+  });
+}
+
 class TotalByCategoryEntity {
   // ... existing fields
+  final List<SubCategoryTotalEntity> subCategories;

   const TotalByCategoryEntity({
     // ... existing params
+    this.subCategories = const [],
   });
 }
```

#### 4.2.2 [MODIFY] `total_by_category_model.dart`

Them parsing `subCategories` tu JSON response.

#### 4.2.3 [NEW] Widget hien thi sub-category breakdown

Tao widget `SubCategoryBreakdownList` hien thi khi user tap vao 1 category trong PieChart:

```
┌─────────────────────────────────────┐
│ 🍕 An uong                 500,000d│
│                                     │
│  ☕ Cafe          150,000d    30%   │
│  ████████░░░░░░░░░░░░░░ 5 lan       │
│                                     │
│  🍚 Com trua      300,000d    60%   │
│  ████████████████████░░ 22 lan      │
│                                     │
│  🧋 Tra sua        50,000d    10%   │
│  ███░░░░░░░░░░░░░░░░░░ 2 lan       │
└─────────────────────────────────────┘
```

---

## 5. Phan Tich Risk

### 5.1 Risk Matrix

| # | Risk | Muc do | Kha nang | Impact | Giai phap |
|---|------|--------|----------|--------|-----------|
| R1 | **Performance: Query them 1 GROUP BY** | ⚠️ Trung binh | Trung binh | Response cham hon 50-100ms | Su dung `Promise.all()` chay song song 3 queries. Them index `(userId, type, transaction_date, subCategoryId)` neu can |
| R2 | **Response size tang** | 🟢 Thap | Cao | Bandwidth tang, mobile load cham hon | Moi category chi co vai sub-categories (3-8). Tong response tang ~20-30%. Chap nhan duoc |
| R3 | **Backward compatibility: Frontend cu** | 🟢 Thap | Thap | Frontend cu bi crash | Them field moi (additive change), field `subCategories` co default `[]`. Frontend cu ignore field khong biet |
| R4 | **Categories khong co sub-category** | 🟢 Thap | Cao | Hien thi trong | `subCategories: []` khi khong co. Frontend xu ly: neu `subCategories.isEmpty` → khong hien thi drill-down |
| R5 | **Couple transactions: Amount formula phuc tap** | ⚠️ Trung binh | Trung binh | Tinh sai so tien sub-category cho couple | Copy chinh xac `amountFormula` tu `sumByCategory()` sang sub-category query. Test voi couple transactions |
| R6 | **Transactions khong co sub-category** | 🟢 Thap | Cao | Tong sub-categories < tong category | Accepted: giao dich khong co sub-category van tinh vao category tong. Chi sub-categories co data moi hien thi. Them item "Khac" = category_total - SUM(sub_totals) |
| R7 | **Cache invalidation** | ⚠️ Trung binh | Trung binh | Du lieu cu cache, user thay so cu | API hien tai **KHONG cache** `sumByCategory()` (chi `getStatisticsSummary` moi cache). Nen khong anh huong |
| R8 | **monthly_analytics_snapshots khong co sub-category data** | 🟡 Luu y | Cao | AI analytics khong su dung duoc sub-category data cho phan tich | Tach rieng: tinh nang nay chi lien quan den realtime statistics, khong anh huong monthly snapshots. Neu can, cap nhat snapshot sau |
| R9 | **Sub-category bi soft delete** | ⚠️ Trung binh | Thap | Giao dich cu tham chieu sub-category da xoa, hien thi sai | `sub_categories` dung `DeleteDateColumn` (soft delete). Query can JOIN ca sub-categories da xoa (dung `withDeleted: true` hoac query raw) de hien thi lich su chinh xac |

### 5.2 Risk Chi Tiet

#### R5 — Couple Amount Formula (Trung Binh)

Day la risk phuc tap nhat. Hien tai `sumByCategory()` dung formula nay:

```sql
CASE
  WHEN transaction.coupleId IS NOT NULL THEN
    CASE
      WHEN transaction.splitMethod != 'none' THEN
        COALESCE(splits.amount, 0)
      ELSE
        CASE WHEN transaction.payerId = :userId THEN transaction.amount ELSE 0 END
    END
  ELSE
    transaction.amount
END
```

Khi them GROUP BY sub-category, formula nay **phai duoc giu nguyen**. Neu sai, so tien sub-category se khong khop voi so tien category.

**Mitigation**: 
- Copy chinh xac formula, KHONG viet lai
- Test case: tao couple transaction co sub-category, verify tong sub-categories = tong category

#### R6 — Transactions Khong Co Sub-Category (Can Xu Ly)

Vi du: user co 10 giao dich "An uong", nhung chi 7 co sub-category:
- ☕ Cafe: 150k (5 lan)
- 🍚 Com trua: 200k (2 lan)
- ❓ Khac (khong phan loai): 150k (3 lan) ← **SUM cua category (500k) - SUM cua subs (350k)**

**Mitigation**: Backend tinh them "uncategorized" amount:

```typescript
const subTotal = subCategories.reduce((sum, sc) => sum + sc.total, 0);
const uncategorized = categoryTotal - subTotal;
if (uncategorized > 0) {
  subCategories.push({
    subCategoryId: null,
    subCategoryName: 'Khac',
    subCategoryIcon: '📦',
    total: uncategorized,
    count: /* transactions khong co sub-category */,
    percentage: Math.round((uncategorized / categoryTotal) * 100),
  });
}
```

#### R9 — Soft Delete Sub-Categories

Hien tai `sub_categories` dung `DeleteDateColumn`:

```typescript
@DeleteDateColumn()
deleted_at?: Date;
```

Khi user xoa 1 sub-category, no bi soft-delete. Nhung giao dich cu van tham chieu no. Khi query `GROUP BY subCategory.id`, cac sub-category da xoa se **bi an** (TypeORM tu dong filter `deleted_at IS NULL`).

**Mitigation**: Su dung `withDeleted()` trong query builder:

```typescript
subCategoryQuery.withDeleted(); // Bao gom ca sub-categories da xoa
```

Hoac dung raw query de bypass soft-delete filter.

---

## 6. Performance Analysis

### 6.1 Query Hien Tai (2 queries)

```
Query 1: SELECT categories WHERE userId = X               ~5ms
Query 2: SELECT SUM(amount) GROUP BY category_id           ~20-50ms
                                                    Total: ~25-55ms
```

### 6.2 Query Sau Khi Them (3 queries, chay song song)

```
Query 1: SELECT categories WHERE userId = X               ~5ms
Query 2: SELECT SUM(amount) GROUP BY category_id           ~20-50ms
Query 3: SELECT SUM(amount) GROUP BY category_id, sub_id   ~30-70ms (*)
                                              Total (parallel): ~30-70ms
```

(*) Query 3 co the cham hon vi:
- GROUP BY 2 columns thay vi 1
- Them condition `subCategory.id IS NOT NULL`
- Nhung chi tang ~10-20ms vi bang transactions da co index tren `subCategoryId`

### 6.3 Index Khuyen Nghi

Kiem tra xem da co index chua. Neu chua, them:

```sql
CREATE INDEX idx_transactions_subcategory ON transactions("subCategoryId")
  WHERE "subCategoryId" IS NOT NULL;
```

---

## 7. Files Can Thay Doi — Tom Tat

### Backend (NestJS) — 2 files

| File | Loai | Mo ta |
|------|------|-------|
| `transactions/transactions-statistics.service.ts` | MODIFY | Them query GROUP BY sub-category, merge vao response |
| `common/interfaces/total-by-category.interface.ts` | MODIFY | Them `SubCategoryTotal` interface va `subCategories` field |

### Frontend (Flutter) — 4+ files

| File | Loai | Mo ta |
|------|------|-------|
| `transaction/domain/entities/total_by_category_entity.dart` | MODIFY | Them `SubCategoryTotalEntity` class va `subCategories` field |
| `transaction/data/models/total_by_category_model.dart` | MODIFY | Them parsing `subCategories` tu JSON |
| `transaction/data/models/total_by_category_model.freezed.dart` | REGENERATE | Chay `build_runner` de regenerate |
| `statistics/presentation/widgets/` | NEW/MODIFY | Widget hien thi sub-category breakdown khi tap vao category |

---

## 8. Phu Thuoc Va Lien Ket Voi Cac Tinh Nang Khac

| Tinh nang | Quan he | Ghi chu |
|-----------|---------|---------|
| Sub-Category Recurring Integration (tai lieu rieng) | **Doc lap** | Hai tinh nang doc lap, dung chung sub-category data |
| Monthly Analytics Snapshots | **Khong anh huong** | Snapshots van luu categoryExpenses o cap category. Co the mo rong sau |
| Spending Plans (estimated_expenses) | **Khong anh huong** | Spending plans da dung sub-category (FK). Tinh nang nay chi doc du lieu |
| AI Insights / Personalization | **Tiem nang mo rong** | AI co the dung sub-category breakdown de cho khuyen nghi chinh xac hon |
| PieChart Statistics | **Can cap nhat** | PieChart hien tai chi hien category chinh. Them drill-down cho sub-category |

---

## 9. Thu Tu Trien Khai De Xuat

```
Phase 1 — Backend (1-2 gio)
├── Them SubCategoryTotal interface
├── Them query GROUP BY sub-category trong sumByCategory()
├── Xu ly "Khac" (uncategorized)
├── Xu ly soft-deleted sub-categories
└── Test voi couple transactions

Phase 2 — Frontend (2-3 gio)
├── Cap nhat entity/model (them subCategories)
├── Chay build_runner regenerate freezed
├── Them widget sub-category breakdown
└── Them drill-down khi tap vao category trong PieChart
```

---

## 10. Test Cases

| # | Test Case | Mo ta | Expected |
|---|-----------|-------|----------|
| T1 | User co giao dich voi sub-category | 3 giao dich An uong: 2 Cafe, 1 Com trua | subCategories co 2 items, tong = category total |
| T2 | User co giao dich KHONG co sub-category | 5 giao dich An uong, 0 co sub-category | subCategories: [] hoac chi co "Khac" |
| T3 | Mix: co va khong co sub-category | 5 giao dich, 3 co sub, 2 khong co | subCategories co items + "Khac" cho 2 giao dich |
| T4 | Sub-category da bi xoa (soft delete) | Xoa sub "Cafe", nhung giao dich cu van tham chieu | Van hien thi "Cafe" trong sub-category breakdown |
| T5 | Couple transaction voi splits | Couple giao dich 100k, chia doi | Sub-category total hien thi 50k (phan cua user) |
| T6 | Category khong co sub-categories nao | Category "Luong" la income, khong co sub | subCategories: [] |
| T7 | Nhieu sub-categories trong 1 category | 1 category co 5 sub-categories | Tat ca 5 hien thi, percentage tong ~100% |
| T8 | Date range filter | Loc theo startDate/endDate | Sub-category totals chi tinh trong khoang thoi gian |

---

> **Tai lieu nay dung de AI hoac developer tham khao khi implement.**
> Risk lon nhat: R5 (couple amount formula) va R9 (soft-deleted sub-categories).
> Phuong an khuyen nghi: Phuong An A (mo rong API hien co).
