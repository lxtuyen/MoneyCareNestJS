/**
 * Backfill Script: Auto-assign SubCategory to existing transactions
 *
 * Reads transactions with note but no subCategory,
 * matches note to keyword groups, creates SubCategory if needed,
 * and updates the transaction.
 *
 * Cách chạy:
 *   npx ts-node scripts/backfill-sub-categories.ts
 *
 * Options:
 *   --dry-run    Chỉ hiển thị kết quả, không ghi DB
 *   --user=ID    Chỉ xử lý transactions của user cụ thể
 */

import { DataSource } from 'typeorm';

// ── Config ──────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const USER_ARG = args.find((a) => a.startsWith('--user='));
const TARGET_USER_ID = USER_ARG ? parseInt(USER_ARG.split('=')[1], 10) : null;

// ── DB Connection ───────────────────────────────────────

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: '123',
  database: 'moneycare',
});

// ── NOTE_GROUPS (giữ đồng bộ với sub-category-assignment.service.ts) ──

const NOTE_GROUPS: Record<string, string[]> = {
  Cafe: [
    'cafe', 'ca phe', 'coffee', 'highland', 'starbucks',
    'phuc long', 'trung nguyen', 'the coffee house', 'katinat',
    'cong ca phe', 'passio', 'den da', 'bac xiu', 'latte',
    'espresso', 'caphe', 'americano', 'cappuccino',
  ],
  'Trà sữa': [
    'tra sua', 'bobapop', 'gong cha', 'tiger sugar', 'koi',
    'tocotoco', 'ding tea', 'milk tea', 'phuc long tra',
  ],
  'Cơm/Bún/Phở': [
    'com trua', 'com chieu', 'com van phong', 'com binh dan', 'com tam',
    'bun', 'pho', 'mi', 'hu tieu', 'com ga', 'com suon',
    'an trua', 'an sang', 'an toi', 'com chien', 'an com',
  ],
  'Đồ ăn online': [
    'grab food', 'shopee food', 'baemin', 'gojek food',
    'now food', 'loship', 'dat do an', 'giao hang',
  ],
  'Ăn vặt': [
    'banh mi', 'banh ngot', 'banh trang', 'an kem', 'kem que',
    'snack', 'an vat', 'che', 'xoi', 'kem', 'sinh to',
  ],
  'Đi chợ': [
    'di cho', 'cho tuan', 'cho cuoi tuan', 'mua do an',
  ],
  'Xăng xe': ['xang', 'do xang', 'petrol', 'gas', 'xang xe'],
  'Grab/Taxi': ['grab', 'taxi', 'be', 'gojek', 'di xe', 'xe om'],
  'Gửi xe': ['gui xe', 'dau xe', 'phi gui', 'bai xe'],
  'Xe buýt': ['xe buyt', 'bus'],
  'Tiền điện': ['tien dien', 'dien luc', 'evn', 'electricity', 'dien thang'],
  'Tiền nước': ['tien nuoc', 'nuoc may', 'water', 'nuoc sinh hoat'],
  Internet: ['internet', 'wifi', 'fpt', 'viettel', 'vnpt'],
  'Điện thoại': ['dien thoai', 'sim', 'nap tien', 'mobile'],
  'Tiền nhà': ['tien nha', 'tien tro', 'tien phong'],
  'Xem phim': ['phim', 'cgv', 'lotte cinema', 'galaxy', 'rap phim'],
  Game: ['game', 'steam', 'play store', 'app store'],
  'Đi chơi': ['di choi'],
  'Mua online': ['shopee', 'lazada', 'tiki', 'sendo', 'mua hang'],
  'Quần áo': ['quan ao', 'mua ao', 'phu kien'],
  'Thuốc/Vitamin': ['mua thuoc', 'vitamin', 'thuoc'],
  'Học tập': ['photo', 'in bai', 'mua sach', 'tai lieu'],
};

// ── Helpers ─────────────────────────────────────────────

function normalizeVietnamese(input: string): string {
  let text = input.toLowerCase().trim();
  text = text.replace(/đ/g, 'd').replace(/Đ/g, 'd');
  text = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function matchNoteGroup(normalizedNote: string): string | null {
  for (const [groupName, keywords] of Object.entries(NOTE_GROUPS)) {
    for (const kw of keywords) {
      // Word-boundary: keyword phải là từ riêng, không nằm giữa từ khác
      const regex = new RegExp(`(?:^|\\s)${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
      if (regex.test(normalizedNote)) {
        return groupName;
      }
    }
  }
  return null;
}

// SubCategory cache: "categoryId:name" → subCategoryId
const subCategoryCache = new Map<string, number>();

async function findOrCreateSubCategory(
  name: string,
  categoryId: number,
): Promise<number> {
  const cacheKey = `${categoryId}:${name}`;
  if (subCategoryCache.has(cacheKey)) {
    return subCategoryCache.get(cacheKey)!;
  }

  // Check existing
  const existing = await dataSource.query(
    `SELECT id FROM sub_categories WHERE name = $1 AND "categoryId" = $2 LIMIT 1`,
    [name, categoryId],
  );

  if (existing.length > 0) {
    subCategoryCache.set(cacheKey, existing[0].id);
    return existing[0].id;
  }

  // Create new
  const result = await dataSource.query(
    `INSERT INTO sub_categories (name, type, is_system, "categoryId")
     VALUES ($1, 'expense', false, $2) RETURNING id`,
    [name, categoryId],
  );
  const id = result[0].id;
  subCategoryCache.set(cacheKey, id);
  console.log(`  ➕ Created SubCategory "${name}" (category #${categoryId}) → ID #${id}`);
  return id;
}

// ── Main ────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  BACKFILL SUB-CATEGORIES');
  if (DRY_RUN) console.log('  🔍 DRY RUN MODE (không ghi DB)');
  if (TARGET_USER_ID) console.log(`  👤 User: ${TARGET_USER_ID}`);
  console.log('═══════════════════════════════════════════════════\n');

  await dataSource.initialize();
  console.log('✅ Database connected\n');

  // 1. Query transactions without subCategory
  let query = `
    SELECT t.id, t.note, t."categoryId", c.name as category_name
    FROM transactions t
    LEFT JOIN categories c ON t."categoryId" = c.id
    WHERE t."subCategoryId" IS NULL
      AND t.note IS NOT NULL
      AND t.note != ''
      AND t.type = 'expense'
  `;
  const params: any[] = [];
  if (TARGET_USER_ID) {
    query += ` AND t."userId" = $1`;
    params.push(TARGET_USER_ID);
  }
  query += ` ORDER BY t.transaction_date DESC`;

  const transactions = await dataSource.query(query, params);
  console.log(`📊 Found ${transactions.length} transactions without subCategory\n`);

  if (transactions.length === 0) {
    console.log('✅ Nothing to backfill!');
    await dataSource.destroy();
    return;
  }

  // 2. Process
  let assigned = 0;
  let skipped = 0;
  const groupCounts = new Map<string, number>();

  for (const tx of transactions) {
    if (!tx.categoryId || !tx.note) {
      skipped++;
      continue;
    }

    const normalizedNote = normalizeVietnamese(tx.note);
    if (normalizedNote.length < 2) {
      skipped++;
      continue;
    }

    const groupName = matchNoteGroup(normalizedNote);
    if (!groupName) {
      skipped++;
      continue;
    }

    groupCounts.set(groupName, (groupCounts.get(groupName) || 0) + 1);

    if (!DRY_RUN) {
      const subCategoryId = await findOrCreateSubCategory(
        groupName,
        tx.categoryId,
      );
      await dataSource.query(
        `UPDATE transactions SET "subCategoryId" = $1 WHERE id = $2`,
        [subCategoryId, tx.id],
      );
    }

    assigned++;
  }

  // 3. Summary
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(`  ✅ Assigned: ${assigned}`);
  console.log(`  ⏭️  Skipped (no match): ${skipped}`);
  console.log(`  📊 Total: ${transactions.length}\n`);

  if (groupCounts.size > 0) {
    console.log('  Groups created/assigned:');
    const sorted = [...groupCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
      console.log(`    ${name}: ${count} transactions`);
    }
  }

  if (DRY_RUN) {
    console.log('\n  🔍 Dry run — no changes written to DB.');
  }

  await dataSource.destroy();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
