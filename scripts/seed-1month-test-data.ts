/**
 * Seed Script: 1 Tháng Giao Dịch (Test Analytics Fallback)
 *
 * Tạo giao dịch chi tiêu + thu nhập sinh viên chỉ trong 1 tháng.
 * Mục đích: test analytics-service hoạt động thế nào với ít data.
 *
 * Budget: Nhà 1M, Ăn uống ~1.8M, Hóa đơn ~300k, Lặt vặt ~400-500k.
 * Thu nhập: Trợ cấp ~4M/tháng.
 *
 * Script sẽ XÓA toàn bộ transactions cũ của user trước khi seed.
 *
 * Cách chạy:
 *   npx ts-node scripts/seed-1month-test-data.ts
 */

import { DataSource } from 'typeorm';

// ── Config ──────────────────────────────────────────────
const TARGET_USER_ID = 68;
const MONTHS_BACK = 1;

// ── DB Connection ───────────────────────────────────────
const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: '123',
  database: 'moneycare',
});

// ── Helpers ─────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomAmount(base: number, variancePct: number): number {
  const variance = base * variancePct;
  const raw = base + (Math.random() * 2 - 1) * variance;
  return Math.round(raw / 1000) * 1000;
}

function dateStr(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, Math.min(day, 28));
  return d.toISOString();
}

function getMonthsBack(n: number): { year: number; month: number }[] {
  const now = new Date();
  const result: { year: number; month: number }[] = [];
  for (let i = n; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return result;
}

// ── Transaction Templates ───────────────────────────────

interface RecurringTemplate {
  categoryName: string;
  notes: string[];
  baseAmount: number;
  variancePct: number;
  frequency: 'monthly' | 'weekly' | 'bi_weekly' | 'daily';
  dayOfMonth?: number;
  dayOfWeek?: number;
  skipChance?: number;
}

const RECURRING_TEMPLATES: RecurringTemplate[] = [
  // ── Chi phí cố định hàng tháng ────────────────────
  {
    categoryName: 'Nhà cửa',
    notes: ['Tiền nhà tháng {m}', 'Tiền trọ tháng {m}'],
    baseAmount: 1000000,
    variancePct: 0.0,
    frequency: 'monthly',
    dayOfMonth: 5,
  },
  {
    categoryName: 'Hóa đơn',
    notes: ['Tiền điện tháng {m}'],
    baseAmount: 120000,
    variancePct: 0.15,
    frequency: 'monthly',
    dayOfMonth: 20,
  },
  {
    categoryName: 'Hóa đơn',
    notes: ['Tiền nước tháng {m}'],
    baseAmount: 40000,
    variancePct: 0.10,
    frequency: 'monthly',
    dayOfMonth: 22,
  },
  {
    categoryName: 'Hóa đơn',
    notes: ['Internet tháng {m}'],
    baseAmount: 65000,
    variancePct: 0.0,
    frequency: 'monthly',
    dayOfMonth: 15,
  },

  // ── Ăn cơm hàng ngày ─────────────────────────────
  {
    categoryName: 'Ăn uống',
    notes: ['Cơm trưa', 'Cơm chiều', 'Ăn cơm', 'Cơm bình dân'],
    baseAmount: 50000,
    variancePct: 0.15,
    frequency: 'daily',
    skipChance: 0.10,
  },

  // ── Thói quen hàng tuần ───────────────────────────
  {
    categoryName: 'Ăn uống',
    notes: ['Cà phê sáng', 'Cà phê', 'Cafe'],
    baseAmount: 20000,
    variancePct: 0.15,
    frequency: 'weekly',
    dayOfWeek: 1,
    skipChance: 0.15,
  },
  {
    categoryName: 'Di chuyển',
    notes: ['Grab đi học', 'Grab'],
    baseAmount: 17000,
    variancePct: 0.15,
    frequency: 'weekly',
    dayOfWeek: 1,
    skipChance: 0.15,
  },
];

// ── Random templates ────────────────────────────────────

interface RandomTemplate {
  categoryName: string;
  notes: string[];
  minAmount: number;
  maxAmount: number;
  countPerMonth: [number, number];
}

const RANDOM_TEMPLATES: RandomTemplate[] = [
  {
    categoryName: 'Ăn uống',
    notes: ['Trà sữa', 'Ăn vặt', 'Bánh mì', 'Chè'],
    minAmount: 15000,
    maxAmount: 35000,
    countPerMonth: [3, 5],
  },
  {
    categoryName: 'Di chuyển',
    notes: ['Gửi xe', 'Đổ xăng', 'Xe buýt'],
    minAmount: 5000,
    maxAmount: 20000,
    countPerMonth: [1, 3],
  },
  {
    categoryName: 'Mua sắm',
    notes: ['Mua áo', 'Quần áo'],
    minAmount: 30000,
    maxAmount: 100000,
    countPerMonth: [0, 1],
  },
  {
    categoryName: 'Giải trí',
    notes: ['Xem phim', 'Game', 'Đi chơi với bạn'],
    minAmount: 20000,
    maxAmount: 80000,
    countPerMonth: [0, 2],
  },
];

// ── Income templates ────────────────────────────────────

const INCOME_RECURRING_TEMPLATES: RecurringTemplate[] = [
  {
    categoryName: 'Trợ cấp',
    notes: ['Trợ cấp tháng {m}', 'Ba mẹ gửi tháng {m}'],
    baseAmount: 4000000,
    variancePct: 0.05,
    frequency: 'monthly',
    dayOfMonth: 5,
  },
];

// ── Generate Transactions ───────────────────────────────

interface GeneratedTx {
  amount: number;
  type: 'expense' | 'income';
  transaction_date: string;
  note: string;
  category_name: string;
  is_transfer: boolean;
  wallet_id?: number;
}

function generateRecurringTransactions(): GeneratedTx[] {
  const months = getMonthsBack(MONTHS_BACK);
  const txs: GeneratedTx[] = [];

  for (const template of RECURRING_TEMPLATES) {
    if (template.frequency === 'monthly') {
      for (const { year, month } of months) {
        if (Math.random() < (template.skipChance || 0)) continue;
        const day = template.dayOfMonth || 1;
        const dayJitter = randomBetween(-1, 1);
        const note = template.notes[randomBetween(0, template.notes.length - 1)]
          .replace('{m}', String(month));

        txs.push({
          amount: randomAmount(template.baseAmount, template.variancePct),
          type: 'expense',
          transaction_date: dateStr(year, month, Math.max(1, day + dayJitter)),
          note,
          category_name: template.categoryName,
          is_transfer: false,
        });
      }
    } else if (template.frequency === 'daily') {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - MONTHS_BACK);
      const endDate = new Date();

      const current = new Date(startDate);
      while (current <= endDate) {
        if (Math.random() >= (template.skipChance || 0)) {
          const note = template.notes[randomBetween(0, template.notes.length - 1)]
            .replace('{m}', String(current.getMonth() + 1));

          txs.push({
            amount: randomAmount(template.baseAmount, template.variancePct),
            type: 'expense',
            transaction_date: current.toISOString(),
            note,
            category_name: template.categoryName,
            is_transfer: false,
          });
        }
        current.setDate(current.getDate() + 1);
      }
    } else if (template.frequency === 'weekly' || template.frequency === 'bi_weekly') {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - MONTHS_BACK);
      const endDate = new Date();

      const intervalDays = template.frequency === 'weekly' ? 7 : 14;
      const current = new Date(startDate);

      if (template.dayOfWeek !== undefined) {
        while (current.getDay() !== template.dayOfWeek) {
          current.setDate(current.getDate() + 1);
        }
      }

      while (current <= endDate) {
        if (Math.random() >= (template.skipChance || 0)) {
          const dayJitter = randomBetween(-1, 1);
          const txDate = new Date(current);
          txDate.setDate(txDate.getDate() + dayJitter);

          const note = template.notes[randomBetween(0, template.notes.length - 1)]
            .replace('{m}', String(txDate.getMonth() + 1));

          txs.push({
            amount: randomAmount(template.baseAmount, template.variancePct),
            type: 'expense',
            transaction_date: txDate.toISOString(),
            note,
            category_name: template.categoryName,
            is_transfer: false,
          });
        }
        current.setDate(current.getDate() + intervalDays);
      }
    }
  }

  return txs;
}

function generateRandomTransactions(): GeneratedTx[] {
  const months = getMonthsBack(MONTHS_BACK);
  const txs: GeneratedTx[] = [];

  for (const { year, month } of months) {
    for (const template of RANDOM_TEMPLATES) {
      const count = randomBetween(template.countPerMonth[0], template.countPerMonth[1]);
      for (let i = 0; i < count; i++) {
        const day = randomBetween(1, 28);
        const note = template.notes[randomBetween(0, template.notes.length - 1)];

        txs.push({
          amount: Math.round(randomBetween(template.minAmount, template.maxAmount) / 1000) * 1000,
          type: 'expense',
          transaction_date: dateStr(year, month, day),
          note,
          category_name: template.categoryName,
          is_transfer: false,
        });
      }
    }
  }

  return txs;
}

function generateIncomeTransactions(): GeneratedTx[] {
  const months = getMonthsBack(MONTHS_BACK);
  const txs: GeneratedTx[] = [];

  for (const template of INCOME_RECURRING_TEMPLATES) {
    for (const { year, month } of months) {
      const day = template.dayOfMonth || 1;
      const note = template.notes[randomBetween(0, template.notes.length - 1)]
        .replace('{m}', String(month));

      txs.push({
        amount: randomAmount(template.baseAmount, template.variancePct),
        type: 'income',
        transaction_date: dateStr(year, month, day),
        note,
        category_name: template.categoryName,
        is_transfer: false,
      });
    }
  }

  return txs;
}

// ── Main ────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  SEED 1 THÁNG TEST DATA (Test analytics fallback)');
  console.log('═══════════════════════════════════════════════════\n');

  await dataSource.initialize();
  console.log('✅ Database connected\n');

  // 1. Kiểm tra user
  const user = await dataSource.query(
    `SELECT id, email FROM users WHERE id = $1`,
    [TARGET_USER_ID],
  );
  if (user.length === 0) {
    console.error(`❌ User ID ${TARGET_USER_ID} không tồn tại!`);
    await dataSource.destroy();
    process.exit(1);
  }
  console.log(`👤 User: ${user[0].email} (ID: ${user[0].id})`);

  // 2. Xóa transactions cũ
  const deleteResult = await dataSource.query(
    `DELETE FROM transactions WHERE "userId" = $1`,
    [TARGET_USER_ID],
  );
  const deletedCount = deleteResult[1] || 0;
  console.log(`🗑️  Đã xóa ${deletedCount} transactions cũ\n`);

  // 3. Xóa recurring cache + confirmed recurring
  await dataSource.query(
    `DELETE FROM recurring_transactions WHERE "userId" = $1`,
    [TARGET_USER_ID],
  );
  console.log(`🗑️  Đã xóa recurring transactions cũ\n`);

  // 4. Lấy category mapping
  const categories = await dataSource.query(
    `SELECT id, name FROM categories WHERE "userId" = $1 OR is_system = true`,
    [TARGET_USER_ID],
  );
  const categoryMap = new Map<string, number>();
  for (const cat of categories) {
    categoryMap.set(cat.name, cat.id);
  }
  console.log(`📂 Tìm thấy ${categories.length} categories\n`);

  // 5. Generate data
  const recurringTxs = generateRecurringTransactions();
  const randomTxs = generateRandomTransactions();
  const incomeTxs = generateIncomeTransactions();
  const allTxs = [...recurringTxs, ...randomTxs, ...incomeTxs];

  console.log(`📊 Đã tạo:`);
  console.log(`   - ${recurringTxs.length} giao dịch chi tiêu recurring`);
  console.log(`   - ${randomTxs.length} giao dịch chi tiêu random`);
  console.log(`   - ${incomeTxs.length} giao dịch thu nhập`);
  console.log(`   - ${allTxs.length} tổng cộng\n`);

  // 6. Tính thống kê
  const totalExpense = allTxs
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const totalIncome = allTxs
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const expenseCount = allTxs.filter((t) => t.type === 'expense').length;

  // Đếm ngày có giao dịch
  const uniqueDays = new Set(
    allTxs.map((t) => t.transaction_date.substring(0, 10)),
  );

  console.log(`💰 Tổng thu nhập: ${totalIncome.toLocaleString('vi-VN')}đ`);
  console.log(`💸 Tổng chi tiêu: ${totalExpense.toLocaleString('vi-VN')}đ`);
  console.log(`📅 Số ngày có giao dịch: ${uniqueDays.size}`);
  console.log(`📋 Số giao dịch expense: ${expenseCount}`);
  console.log();

  // Analytics thresholds check
  console.log('═══════════════════════════════════════════════════');
  console.log('  ANALYTICS THRESHOLDS CHECK');
  console.log('═══════════════════════════════════════════════════\n');

  const dataSpanDays = Math.ceil(
    (new Date().getTime() - new Date(allTxs[0]?.transaction_date || '').getTime())
    / (1000 * 60 * 60 * 24),
  );

  console.log(`   Data span: ~${dataSpanDays} ngày`);
  console.log(`   Transactions: ${expenseCount} expense`);
  console.log();
  console.log(`   ✅ Moving average forecast (cần ≥7 ngày): ${dataSpanDays >= 7 ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`   ${dataSpanDays >= 14 ? '✅' : '❌'} Gradient Boosting forecast (cần ≥14 ngày): ${dataSpanDays >= 14 ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`   ${expenseCount >= 50 && dataSpanDays >= 30 ? '✅' : '❌'} Train forecasting model (cần ≥50 tx + ≥30 ngày): ${expenseCount >= 50 && dataSpanDays >= 30 ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
  console.log(`   ❌ Recurring monthly detection (cần ≥2 lần/khoản): CHƯA ĐẠT (chỉ 1 tháng)`);
  console.log();

  // 7. Lấy wallet
  const wallets = await dataSource.query(
    `SELECT id, name FROM wallets WHERE "userId" = $1 ORDER BY id ASC`,
    [TARGET_USER_ID],
  );
  const defaultWalletId = wallets.length > 0 ? wallets[0].id : null;

  // 8. Insert vào DB
  let inserted = 0;
  let skipped = 0;

  for (const tx of allTxs) {
    const categoryId = categoryMap.get(tx.category_name);
    if (!categoryId) {
      skipped++;
      continue;
    }

    await dataSource.query(
      `INSERT INTO transactions (amount, type, transaction_date, note, "isTransfer", "userId", "categoryId", "splitMethod", "walletId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        tx.amount,
        tx.type,
        tx.transaction_date,
        tx.note,
        tx.is_transfer,
        TARGET_USER_ID,
        categoryId,
        'none',
        tx.wallet_id || defaultWalletId,
      ],
    );
    inserted++;
  }

  console.log(`✅ Đã insert ${inserted} giao dịch vào DB`);
  if (skipped > 0) {
    console.log(`⚠️  Bỏ qua ${skipped} giao dịch (không tìm thấy category)`);
  }

  // 9. Chi tiết theo danh mục
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  CHI TIẾT THEO DANH MỤC');
  console.log('═══════════════════════════════════════════════════\n');

  const byCategory = new Map<string, { count: number; total: number }>();
  for (const tx of allTxs.filter((t) => t.type === 'expense')) {
    const entry = byCategory.get(tx.category_name) || { count: 0, total: 0 };
    entry.count++;
    entry.total += tx.amount;
    byCategory.set(tx.category_name, entry);
  }

  for (const [cat, val] of [...byCategory.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${cat.padEnd(15)} ${val.count.toString().padStart(3)} tx | ${val.total.toLocaleString('vi-VN').padStart(12)}đ`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  XONG! Thử gọi analytics API để test fallback.');
  console.log('═══════════════════════════════════════════════════');

  await dataSource.destroy();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
