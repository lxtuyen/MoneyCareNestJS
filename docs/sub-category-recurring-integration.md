# Tich Hop Sub-Category Vao Chuc Nang Phan Loai Giao Dich Co Dinh (Recurring Detection)

> Tai lieu mo ta ke hoach tich hop sub-category vao he thong phat hien giao dich dinh ky (DBSCAN recurring detection) cua MNCARE.
> Tao ngay: 2026-06-22

---

## 1. Van De Hien Tai

### 1.1 Hien trang

Hien tai, he thong phat hien recurring chi lam viec o cap **category** (danh muc chinh):

- Khi gui du lieu cho analytics-service (DBSCAN), payload moi transaction chi co:
  ```json
  {
    "category": { "name": "An uong", "icon": "🍕" }
  }
  ```
- Ket qua tra ve chi hien thi: "Ban tieu 500k cho An uong moi thang"
- **Khong phan tich duoc** chi tiet ben trong danh muc (vi du: Cafe bao nhieu? Com trua bao nhieu?)

### 1.2 Muc tieu

Nang cao kha nang phan tich spending insights de:
- User thay duoc **chi tiet** trong tung danh muc recurring
- Vi du: Trong "An uong 500k/thang":
  - ☕ Cafe: 5 lan, ~150k/thang
  - 🍚 Com trua: 22 lan, ~300k/thang
  - 🧋 Tra sua: 2 lan, ~50k/thang

---

## 2. Kien Truc Hien Tai — Recurring Detection Flow

```
┌──────────┐     REST API      ┌──────────────┐     HTTP POST      ┌──────────────────┐
│ Flutter   │ ──────────────►  │ NestJS        │ ──────────────────►│ Analytics Service │
│ Frontend  │                  │ Backend       │                    │ (Python/DBSCAN)   │
│           │ ◄────────────── │               │ ◄──────────────────│                   │
│           │   JSON response  │               │   recurring_items  │                   │
└──────────┘                  └──────────────┘                    └──────────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │ PostgreSQL    │
                              │ recurring_    │
                              │ transactions  │
                              └──────────────┘
```

### 2.1 Du Lieu Gui Cho Analytics Service (Hien Tai)

**File**: `src/modules/spending-insights/spending-insights.service.ts` (dong 52-63)

```typescript
const txPayload = transactions.map((t) => ({
  id: t.id,
  amount: Number(t.amount),
  transaction_date: t.transaction_date instanceof Date
    ? t.transaction_date.toISOString()
    : String(t.transaction_date),
  type: t.type,
  category: t.category ? { name: t.category.name, icon: t.category.icon } : null,
  note: t.note || '',
  is_transfer: t.isTransfer,
}));
```

> **Van de**: Khong gui `subCategory`, DBSCAN chi nhom theo category chinh.

### 2.2 Entity Luu Tru (Hien Tai)

**File**: `src/modules/spending-insights/entities/recurring-transaction.entity.ts`

```typescript
@Entity('recurring_transactions')
export class RecurringTransaction {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Column()
  description!: string;

  @Column({ nullable: true })
  categoryName!: string;        // ← Chi co category

  @Column({ nullable: true })
  categoryIcon!: string;        // ← Chi co category icon

  // ... khong co subCategoryName, subCategoryIcon
}
```

---

## 3. Thay Doi Can Thuc Hien

### 3.1 Backend (NestJS) — 5 files can thay doi

---

#### 3.1.1 [MODIFY] `recurring-transaction.entity.ts`

**File**: `src/modules/spending-insights/entities/recurring-transaction.entity.ts`

**Them 2 columns moi**:

```typescript
@Column({ nullable: true })
subCategoryName!: string;

@Column({ nullable: true })
subCategoryIcon!: string;
```

**Vi tri**: Them ngay sau `categoryIcon` (dong 26).

**Schema thay doi**:

| Column (moi)    | Type    | Constraints | Mo ta                   |
| --------------- | ------- | ----------- | ----------------------- |
| subCategoryName | varchar | nullable    | Ten danh muc con        |
| subCategoryIcon | varchar | nullable    | Icon danh muc con       |

---

#### 3.1.2 [MODIFY] `spending-insights.service.ts`

**File**: `src/modules/spending-insights/spending-insights.service.ts`

**Thay doi 1**: Them `subCategory` vao relations khi query transactions (dong 38):

```diff
 const transactions = await this.transactionRepo.find({
   where: {
     user: { id: userId },
     type: 'expense',
     isTransfer: false,
     transaction_date: MoreThan(sinceDate),
   },
-  relations: ['category'],
+  relations: ['category', 'subCategory'],
   order: { transaction_date: 'ASC' },
 });
```

**Thay doi 2**: Gui them `sub_category` trong payload (dong 52-63):

```diff
 const txPayload = transactions.map((t) => ({
   id: t.id,
   amount: Number(t.amount),
   transaction_date: t.transaction_date instanceof Date
     ? t.transaction_date.toISOString()
     : String(t.transaction_date),
   type: t.type,
   category: t.category ? { name: t.category.name, icon: t.category.icon } : null,
+  sub_category: t.subCategory
+    ? { name: t.subCategory.name, icon: t.subCategory.icon }
+    : null,
   note: t.note || '',
   is_transfer: t.isTransfer,
 }));
```

**Thay doi 3**: Map response co them sub-category (dong 155-183):

```diff
 private mapResponse(raw: any): RecurringDetectResponseDto {
   const items = (raw.recurring_items || []).map((item: any) => ({
     recurringId: item.recurring_id,
     categoryName: item.category_name,
     categoryIcon: item.category_icon,
+    subCategoryName: item.sub_category_name || null,
+    subCategoryIcon: item.sub_category_icon || null,
     description: item.description,
     // ... con lai giu nguyen
   }));
```

**Thay doi 4**: Luu subCategory khi confirm (dong 188-222):

```diff
 async confirmRecurring(userId: number, dto: ConfirmRecurringDto) {
   // ... existing code
   if (existing) {
     // ... existing updates
+    existing.subCategoryName = dto.subCategoryName || existing.subCategoryName;
+    existing.subCategoryIcon = dto.subCategoryIcon || existing.subCategoryIcon;
     return this.recurringRepo.save(existing);
   }

   const entity = this.recurringRepo.create({
     // ... existing fields
+    subCategoryName: dto.subCategoryName || '',
+    subCategoryIcon: dto.subCategoryIcon || '',
   });
 }
```

---

#### 3.1.3 [MODIFY] `recurring-transactions.dto.ts`

**File**: `src/modules/spending-insights/dto/recurring-transactions.dto.ts`

```diff
 export class RecurringTransactionDto {
   recurringId: string;
   categoryName: string;
   categoryIcon: string;
+  subCategoryName: string | null;
+  subCategoryIcon: string | null;
   description: string;
   // ... con lai giu nguyen
 }
```

---

#### 3.1.4 [MODIFY] `confirm-recurring.dto.ts`

**File**: `src/modules/spending-insights/dto/confirm-recurring.dto.ts`

```diff
 export class ConfirmRecurringDto {
   @IsString()
   aiRecurringId!: string;

   // ... existing fields

+  @IsString()
+  @IsOptional()
+  subCategoryName?: string;
+
+  @IsString()
+  @IsOptional()
+  subCategoryIcon?: string;
 }
```

---

#### 3.1.5 [MODIFY] `spending-insights.controller.ts`

**File**: `src/modules/spending-insights/spending-insights.controller.ts`

Khong can thay doi logic, chi can dam bao DTO moi duoc chap nhan. Controller hien tai da forward dto xuong service.

---

### 3.2 Analytics Service (Python) — Ngoai scope nhung can luu y

Khi analytics-service (Python/DBSCAN) duoc cap nhat, can:

1. **Nhan them field `sub_category`** trong input payload
2. **Su dung `sub_category.name`** nhu 1 feature de nhom (DBSCAN clustering)
3. **Tra ve them** `sub_category_name` va `sub_category_icon` trong response

**Logic de xuat cho DBSCAN**:
- Neu transaction co `sub_category` → nhom theo `category.name + sub_category.name`
- Neu transaction KHONG co `sub_category` → nhom theo `category.name` (nhu hien tai)

Vi du input:
```json
[
  {"id": 1, "amount": 30000, "category": {"name": "An uong"}, "sub_category": {"name": "Cafe", "icon": "☕"}, "note": "cafe sang"},
  {"id": 2, "amount": 30000, "category": {"name": "An uong"}, "sub_category": {"name": "Cafe", "icon": "☕"}, "note": "cafe sang"},
  {"id": 3, "amount": 50000, "category": {"name": "An uong"}, "sub_category": {"name": "Com trua", "icon": "🍚"}, "note": "com trua"}
]
```

Vi du output (2 recurring rieng biet):
```json
{
  "recurring_items": [
    {
      "recurring_id": "recurring_cafe_monthly",
      "category_name": "An uong",
      "category_icon": "🍕",
      "sub_category_name": "Cafe",
      "sub_category_icon": "☕",
      "description": "cafe sang",
      "average_amount": 30000,
      "frequency": "monthly",
      "monthly_estimate": 150000
    },
    {
      "recurring_id": "recurring_comtrua_monthly",
      "category_name": "An uong",
      "category_icon": "🍕",
      "sub_category_name": "Com trua",
      "sub_category_icon": "🍚",
      "description": "com trua",
      "average_amount": 50000,
      "frequency": "monthly",
      "monthly_estimate": 1100000
    }
  ]
}
```

---

### 3.3 Frontend (Flutter) — Thay doi hien thi

#### 3.3.1 [MODIFY] `recurring_transaction_entity.dart`

**File**: `fe/lib/features/spending_insights/domain/entities/recurring_transaction_entity.dart`

```diff
 class RecurringTransactionEntity {
   final String recurringId;
   final String categoryName;
   final String categoryIcon;
+  final String? subCategoryName;
+  final String? subCategoryIcon;
   final String description;
   // ...

   const RecurringTransactionEntity({
     required this.recurringId,
     required this.categoryName,
     required this.categoryIcon,
+    this.subCategoryName,
+    this.subCategoryIcon,
     required this.description,
     // ...
   });
 }
```

#### 3.3.2 [MODIFY] `recurring_transaction_model.dart`

**File**: `fe/lib/features/spending_insights/data/models/recurring_transaction_model.dart`

Them parsing `subCategoryName` va `subCategoryIcon` tu JSON response.

#### 3.3.3 [MODIFY] `recurring_item_card.dart`

**File**: `fe/lib/features/spending_insights/presentation/widgets/recurring_item_card.dart`

Hien thi sub-category name ben duoi category name:

```diff
 // Trong _buildTopRow(), phan hien thi text
 Column(
   crossAxisAlignment: CrossAxisAlignment.start,
   children: [
     Text(item.description, ...),
     const SizedBox(height: 2),
-    Text(item.categoryName, ...),
+    Text(
+      item.subCategoryName != null && item.subCategoryName!.isNotEmpty
+        ? '${item.categoryName} > ${item.subCategoryName}'
+        : item.categoryName,
+      style: const TextStyle(fontSize: 12, color: AppColors.text4),
+    ),
   ],
 ),
```

---

## 4. Database Schema Thay Doi

### 4.1 Bang `recurring_transactions` (cap nhat)

| Column (moi)     | Type    | Constraints | Mo ta             |
| ---------------- | ------- | ----------- | ----------------- |
| subCategoryName  | varchar | nullable    | Ten danh muc con  |
| subCategoryIcon  | varchar | nullable    | Icon danh muc con |

> Luu y: Vi dung `synchronize: true`, TypeORM se tu dong them 2 columns nay khi restart app.

### 4.2 Anh huong den database-layer-architecture.md

Can cap nhat tai lieu `be/docs/database-layer-architecture.md`:
- Section 3.4.4 (`recurring_transactions`): them 2 columns moi
- Khong anh huong den cac bang khac

---

## 5. Backward Compatibility

| Khia canh              | Anh huong         | Ly do                                                        |
| ---------------------- | ----------------- | ------------------------------------------------------------ |
| Existing recurring data| Khong anh huong   | Columns moi la nullable, du lieu cu se co gia tri null       |
| Analytics service      | Khong break       | Backend gui them field, analytics co the ignore neu chua xu ly|
| Frontend               | Khong break       | Neu API chua tra subCategory, hien thi nhu cu (chi categoryName)|
| API response           | Backward compatible| Them fields moi (additive change), khong xoa fields cu       |

---

## 6. Thu Tu Trien Khai De Xuat

1. **Phase 1 — Backend (NestJS)**: Them columns, gui sub_category cho analytics, cap nhat DTOs
2. **Phase 2 — Analytics Service (Python)**: Cap nhat DBSCAN de nhom theo sub-category
3. **Phase 3 — Frontend (Flutter)**: Hien thi sub-category trong UI

> Moi phase doc lap, co the deploy rieng ma khong break he thong.

---

## 7. Files Can Thay Doi — Tom Tat

### Backend (NestJS)

| File                                  | Loai   | Mo ta thay doi                              |
| ------------------------------------- | ------ | ------------------------------------------- |
| `spending-insights/entities/recurring-transaction.entity.ts` | MODIFY | Them subCategoryName, subCategoryIcon columns |
| `spending-insights/spending-insights.service.ts`             | MODIFY | Gui subCategory cho analytics, map response, save |
| `spending-insights/dto/recurring-transactions.dto.ts`        | MODIFY | Them subCategoryName, subCategoryIcon fields   |
| `spending-insights/dto/confirm-recurring.dto.ts`             | MODIFY | Them subCategoryName, subCategoryIcon optional |
| `docs/database-layer-architecture.md`                        | MODIFY | Cap nhat recurring_transactions schema        |

### Frontend (Flutter)

| File                                                    | Loai   | Mo ta thay doi                              |
| ------------------------------------------------------- | ------ | ------------------------------------------- |
| `spending_insights/domain/entities/recurring_transaction_entity.dart` | MODIFY | Them subCategoryName, subCategoryIcon fields |
| `spending_insights/data/models/recurring_transaction_model.dart`      | MODIFY | Parse subCategoryName, subCategoryIcon tu JSON |
| `spending_insights/presentation/widgets/recurring_item_card.dart`     | MODIFY | Hien thi "Category > SubCategory"             |

### Analytics Service (Python) — Tham Khao

| Thanh phan          | Mo ta thay doi                                              |
| ------------------- | ----------------------------------------------------------- |
| Input schema        | Them field `sub_category: { name, icon }` cho moi transaction |
| DBSCAN clustering   | Nhom theo `category + sub_category` khi co                   |
| Output schema       | Them `sub_category_name`, `sub_category_icon` trong ket qua  |

---

> **Tai lieu nay dung de AI hoac developer tham khao khi implement.**
> Moi thay doi nen theo dung thu tu Phase 1 → 2 → 3 de dam bao backward compatibility.
