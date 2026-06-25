/**
 * Seed Script: Fake Transaction Data for Recurring Detection Testing
 * 
 * Tạo giao dịch chi tiêu + thu nhập sinh viên (trợ cấp ~4 triệu/tháng) trong 6 tháng.
 * Budget: Nhà 1M, Ăn uống ~1.8M, Hóa đơn ~300k, Lặt vặt ~400-500k, dư ~400-500k.
 * Thu nhập: Lương part-time ~4M/tháng + trợ cấp gia đình lâu lâu.
 * 
 * Bao gồm cả recurring (cố định, thói quen) và random (không lặp).
 * Script sẽ XÓA toàn bộ transactions cũ của user trước khi seed.
 * 
 * Cách chạy:
 *   npx ts-node scripts/seed-recurring-test-data.ts
 * 
 * Yêu cầu:
 *   - DB PostgreSQL đang chạy (localhost:5432/moneycare)
 *   - Đã có user và categories trong DB
 */

import { DataSource } from 'typeorm';

// ── Config ──────────────────────────────────────────────

const TARGET_USER_ID = 68; // Thay đổi nếu cần
const MONTHS_BACK = 6;

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
  return Math.round(raw / 1000) * 1000; // Làm tròn đến 1.000đ
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
  variancePct: number; // 0.0 = exact, 0.15 = ±15%
  frequency: 'monthly' | 'weekly' | 'bi_weekly' | 'daily';
  dayOfMonth?: number; // for monthly
  dayOfWeek?: number; // 0=Sun, 1=Mon... for weekly
  skipChance?: number; // 0.0 - 1.0 chance to skip
}

const RECURRING_TEMPLATES: RecurringTemplate[] = [
  // ── Chi phí cố định hàng tháng ────────────────────
  {
    categoryName: 'Nhà cửa',
    notes: ['Tiền nhà tháng {m}', 'Tiền trọ tháng {m}', 'Tiền phòng tháng {m}'],
    baseAmount: 1000000,
    variancePct: 0.0,
    frequency: 'monthly',
    dayOfMonth: 5,
  },
  {
    categoryName: 'Hóa đơn',
    notes: ['Tiền điện tháng {m}', 'Điện tháng {m}'],
    baseAmount: 120000,
    variancePct: 0.15,
    frequency: 'monthly',
    dayOfMonth: 20,
  },
  {
    categoryName: 'Hóa đơn',
    notes: ['Tiền nước tháng {m}', 'Nước sinh hoạt tháng {m}'],
    baseAmount: 40000,
    variancePct: 0.10,
    frequency: 'monthly',
    dayOfMonth: 22,
  },
  {
    categoryName: 'Hóa đơn',
    notes: ['Internet tháng {m}', 'Wifi tháng {m}'],
    baseAmount: 65000,
    variancePct: 0.0,
    frequency: 'monthly',
    dayOfMonth: 15,
  },
  {
    categoryName: 'Hóa đơn',
    notes: ['Cước điện thoại tháng {m}', 'Điện thoại tháng {m}'],
    baseAmount: 60000,
    variancePct: 0.10,
    frequency: 'monthly',
    dayOfMonth: 10,
  },

  // ── Ăn cơm hàng ngày (daily recurring) ────────────
  {
    categoryName: 'Ăn uống',
    notes: ['Cơm trưa', 'Cơm chiều', 'Ăn cơm', 'Cơm bình dân', 'Cơm trưa + chiều'],
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
    dayOfWeek: 1, // Thứ 2
    skipChance: 0.15,
  },
  {
    categoryName: 'Ăn uống',
    notes: ['Cà phê chiều', 'Cafe cuối tuần'],
    baseAmount: 22000,
    variancePct: 0.10,
    frequency: 'weekly',
    dayOfWeek: 5, // Thứ 6
    skipChance: 0.20,
  },
  {
    categoryName: 'Di chuyển',
    notes: ['Grab đi học', 'Grab', 'Xe ôm'],
    baseAmount: 17000,
    variancePct: 0.15,
    frequency: 'weekly',
    dayOfWeek: 1,
    skipChance: 0.15,
  },

  // ── Bi-weekly ─────────────────────────────────────
  {
    categoryName: 'Chợ, siêu thị',
    notes: ['Đi chợ tuần', 'Chợ cuối tuần', 'Mua đồ ăn tuần'],
    baseAmount: 125000,
    variancePct: 0.15,
    frequency: 'bi_weekly',
    dayOfWeek: 6, // Thứ 7
    skipChance: 0.10,
  },
];

// ── Income Recurring Templates ──────────────────────

const INCOME_RECURRING_TEMPLATES: RecurringTemplate[] = [
  {
    categoryName: 'Trợ cấp',
    notes: ['Trợ cấp tháng {m}', 'Ba mẹ gửi tháng {m}', 'Gia đình hỗ trợ tháng {m}'],
    baseAmount: 4000000,
    variancePct: 0.05,
    frequency: 'monthly',
    dayOfMonth: 5,
  },
];

// ── Income Random Templates ─────────────────────────

const INCOME_RANDOM_TEMPLATES: RandomTemplate[] = [
  {
    categoryName: 'Thưởng',
    notes: ['Thưởng làm thêm', 'Bonus', 'Thưởng hiệu suất'],
    minAmount: 200000,
    maxAmount: 500000,
    countPerMonth: [0, 0], // Very rare - will override below
  },
];

// ── Random (non-recurring) transaction templates ────

interface RandomTemplate {
  categoryName: string;
  notes: string[];
  minAmount: number;
  maxAmount: number;
  countPerMonth: [number, number]; // [min, max] transactions per month
}

const RANDOM_TEMPLATES: RandomTemplate[] = [
  {
    categoryName: 'Ăn uống',
    notes: ['Trà sữa', 'Ăn vặt', 'Bánh mì', 'Chè', 'Sinh tố'],
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
    notes: ['Mua áo', 'Quần áo', 'Phụ kiện'],
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
  {
    categoryName: 'Sức khỏe',
    notes: ['Mua thuốc', 'Vitamin'],
    minAmount: 20000,
    maxAmount: 100000,
    countPerMonth: [0, 1],
  },
  {
    categoryName: 'Học tập',
    notes: ['Photo tài liệu', 'Mua sách', 'In bài'],
    minAmount: 15000,
    maxAmount: 50000,
    countPerMonth: [0, 1],
  },
];

// ── Generate Transactions ───────────────────────────

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
        const dayJitter = randomBetween(-1, 1); // ±1 ngày
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
      // Daily recurring (e.g., cơm hàng ngày)
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

      // Tìm ngày đầu tiên đúng dayOfWeek
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

// ── Generate Income Transactions ────────────────────

function generateIncomeRecurringTransactions(): GeneratedTx[] {
  const months = getMonthsBack(MONTHS_BACK);
  const txs: GeneratedTx[] = [];

  for (const template of INCOME_RECURRING_TEMPLATES) {
    for (const { year, month } of months) {
      if (Math.random() < (template.skipChance || 0)) continue;

      const day = template.dayOfMonth || 1;
      const dayJitter = randomBetween(-1, 1);
      const note = template.notes[randomBetween(0, template.notes.length - 1)]
        .replace('{m}', String(month));

      txs.push({
        amount: randomAmount(template.baseAmount, template.variancePct),
        type: 'income',
        transaction_date: dateStr(year, month, Math.max(1, day + dayJitter)),
        note,
        category_name: template.categoryName,
        is_transfer: false,
      });
    }
  }

  return txs;
}

function generateIncomeRandomTransactions(): GeneratedTx[] {
  const months = getMonthsBack(MONTHS_BACK);
  const txs: GeneratedTx[] = [];

  for (const { year, month } of months) {
    for (const template of INCOME_RANDOM_TEMPLATES) {
      // Trợ cấp: ~40% tháng có, Thưởng: ~15% tháng có
      const chance = template.categoryName === 'Thưởng' ? 0.15 : 0.40;
      if (Math.random() > chance) continue;

      const day = randomBetween(1, 28);
      const note = template.notes[randomBetween(0, template.notes.length - 1)];

      txs.push({
        amount: Math.round(randomBetween(template.minAmount, template.maxAmount) / 1000) * 1000,
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

// ── Main ────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  SEED RECURRING TEST DATA (Sinh viên ~4M/tháng)');
  console.log('═══════════════════════════════════════════════════\n');

  await dataSource.initialize();
  console.log('✅ Database connected\n');

  // 1. Kiểm tra user tồn tại
  const user = await dataSource.query(
    `SELECT id, email FROM users WHERE id = $1`,
    [TARGET_USER_ID],
  );
  if (user.length === 0) {
    console.error(`❌ User ID ${TARGET_USER_ID} không tồn tại!`);
    console.log('   Hãy thay đổi TARGET_USER_ID ở đầu file.');
    await dataSource.destroy();
    process.exit(1);
  }
  console.log(`👤 User: ${user[0].email} (ID: ${user[0].id})`);

  // 2. Xóa transactions cũ của user
  const deleteResult = await dataSource.query(
    `DELETE FROM transactions WHERE "userId" = $1`,
    [TARGET_USER_ID],
  );
  const deletedCount = deleteResult[1] || 0;
  console.log(`🗑️  Đã xóa ${deletedCount} transactions cũ\n`);

  // 3. Lấy category mapping
  const categories = await dataSource.query(
    `SELECT id, name FROM categories WHERE "userId" = $1 OR is_system = true`,
    [TARGET_USER_ID],
  );
  const categoryMap = new Map<string, number>();
  for (const cat of categories) {
    categoryMap.set(cat.name, cat.id);
  }
  console.log(`📂 Tìm thấy ${categories.length} categories\n`);

  // 4. Generate data
  const recurringTxs = generateRecurringTransactions();
  const randomTxs = generateRandomTransactions();
  const incomeRecurringTxs = generateIncomeRecurringTransactions();
  const incomeRandomTxs = generateIncomeRandomTransactions();
  const allTxs = [...recurringTxs, ...randomTxs, ...incomeRecurringTxs, ...incomeRandomTxs];

  console.log(`📊 Đã tạo:`);
  console.log(`   - ${recurringTxs.length} giao dịch chi tiêu recurring`);
  console.log(`   - ${randomTxs.length} giao dịch chi tiêu random`);
  console.log(`   - ${incomeRecurringTxs.length} giao dịch thu nhập recurring`);
  console.log(`   - ${incomeRandomTxs.length} giao dịch thu nhập random`);
  console.log(`   - ${allTxs.length} tổng cộng\n`);

  // 5. Tính budget estimate
  const monthlyExpense = new Map<string, number>();
  const monthlyIncome = new Map<string, number>();
  for (const tx of allTxs) {
    const month = tx.transaction_date.substring(0, 7);
    if (tx.type === 'expense') {
      monthlyExpense.set(month, (monthlyExpense.get(month) || 0) + tx.amount);
    } else {
      monthlyIncome.set(month, (monthlyIncome.get(month) || 0) + tx.amount);
    }
  }
  const avgExpense = Math.round(
    [...monthlyExpense.values()].reduce((s, v) => s + v, 0) / monthlyExpense.size,
  );
  const avgIncome = monthlyIncome.size > 0
    ? Math.round([...monthlyIncome.values()].reduce((s, v) => s + v, 0) / monthlyIncome.size)
    : 0;
  console.log(`💰 Thu nhập trung bình/tháng: ~${avgIncome.toLocaleString('vi-VN')}đ`);
  console.log(`💸 Chi tiêu trung bình/tháng: ~${avgExpense.toLocaleString('vi-VN')}đ`);
  console.log(`📊 Tích lũy trung bình/tháng: ~${(avgIncome - avgExpense).toLocaleString('vi-VN')}đ\n`);

  // 5.5. Lấy wallet mapping
  const wallets = await dataSource.query(
    `SELECT id, name FROM wallets WHERE "userId" = $1 ORDER BY id ASC`,
    [TARGET_USER_ID],
  );
  const defaultWalletId = wallets.length > 0 ? wallets[0].id : null;
  console.log(`👛 Tìm thấy ${wallets.length} ví`);
  if (defaultWalletId) {
    console.log(`   Ví mặc định: ${wallets[0].name} (ID: ${defaultWalletId})`);
  } else {
    console.log(`   ⚠️ Không tìm thấy ví, transactions sẽ không gắn ví`);
  }
  console.log();

  // 6. Insert vào DB
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

  // 7. Summary - Expense
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  RECURRING PATTERNS ĐÃ TẠO (CHI TIÊU)');
  console.log('═══════════════════════════════════════════════════\n');

  const recurringByType = new Map<string, { count: number; avgAmount: number; freq: string }>();
  for (const template of RECURRING_TEMPLATES) {
    const key = `${template.categoryName} - ${template.notes[0].replace('{m}', 'X')}`;
    const matching = recurringTxs.filter(
      (t) => t.category_name === template.categoryName && template.notes.some(
        (n) => t.note.includes(n.replace(' tháng {m}', '').replace('{m}', '')),
      ),
    );
    recurringByType.set(key, {
      count: matching.length,
      avgAmount: matching.length > 0
        ? Math.round(matching.reduce((s, t) => s + t.amount, 0) / matching.length)
        : 0,
      freq: template.frequency,
    });
  }

  for (const [key, val] of recurringByType) {
    const freqLabel = {
      daily: 'Hàng ngày',
      weekly: 'Hàng tuần',
      bi_weekly: '2 tuần/lần',
      monthly: 'Hàng tháng',
    }[val.freq];
    console.log(`  📌 ${key}`);
    console.log(`     ${freqLabel} | ${val.count} lần | ~${val.avgAmount.toLocaleString('vi-VN')}đ\n`);
  }

  // 7.5. Summary - Income
  console.log('═══════════════════════════════════════════════════');
  console.log('  RECURRING PATTERNS ĐÃ TẠO (THU NHẬP)');
  console.log('═══════════════════════════════════════════════════\n');

  for (const template of INCOME_RECURRING_TEMPLATES) {
    const key = `${template.categoryName} - ${template.notes[0].replace('{m}', 'X')}`;
    console.log(`  📌 ${key}`);
    console.log(`     Hàng tháng | ${incomeRecurringTxs.length} lần | ~${template.baseAmount.toLocaleString('vi-VN')}đ\n`);
  }
  console.log(`  📌 Trợ cấp gia đình (random ~40% tháng)`);
  console.log(`  📌 Thưởng (random ~15% tháng)\n`);

  // 8. Tổng hợp theo tháng
  console.log('═══════════════════════════════════════════════════');
  console.log('  THU CHI THEO THÁNG');
  console.log('═══════════════════════════════════════════════════\n');

  const allMonths = new Set([...monthlyExpense.keys(), ...monthlyIncome.keys()]);
  const sortedMonths = [...allMonths].sort();
  for (const month of sortedMonths) {
    const expense = monthlyExpense.get(month) || 0;
    const income = monthlyIncome.get(month) || 0;
    const net = income - expense;
    const netSign = net >= 0 ? '+' : '';
    console.log(`  ${month}: Thu ${income.toLocaleString('vi-VN').padStart(12)}đ | Chi ${expense.toLocaleString('vi-VN').padStart(12)}đ | ${netSign}${net.toLocaleString('vi-VN')}đ`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Test API: GET /spending-insights/recurring`);
  console.log('═══════════════════════════════════════════════════');

  await dataSource.destroy();
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
