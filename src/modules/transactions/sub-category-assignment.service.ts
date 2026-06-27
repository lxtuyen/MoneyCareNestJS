import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SubCategory } from '../categories/entities/sub-category.entity';
import { Transaction } from './entities/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { CategoryType } from '../categories/entities/category-type.enum';

/**
 * NOTE_GROUPS: keyword → group name mapping.
 * Giữ đồng bộ với analytics-service/app/services/category_breakdown_service.py
 */
const NOTE_GROUPS: Record<string, string[]> = {
  // --- Ăn uống ---
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
  // --- Di chuyển ---
  'Xăng xe': ['xang', 'do xang', 'petrol', 'gas', 'xang xe'],
  'Grab/Taxi': ['grab', 'taxi', 'be', 'gojek', 'di xe', 'xe om'],
  'Gửi xe': ['gui xe', 'dau xe', 'phi gui', 'bai xe'],
  'Xe buýt': ['xe buyt', 'bus'],
  // --- Hóa đơn ---
  'Tiền điện': ['tien dien', 'dien luc', 'evn', 'electricity', 'dien thang'],
  'Tiền nước': ['tien nuoc', 'nuoc may', 'water', 'nuoc sinh hoat'],
  Internet: ['internet', 'wifi', 'fpt', 'viettel', 'vnpt'],
  'Điện thoại': ['dien thoai', 'sim', 'nap tien', 'mobile'],
  // --- Nhà cửa ---
  'Tiền nhà': ['tien tro', 'tien phong'],
  // --- Giải trí ---
  'Xem phim': ['phim', 'cgv', 'lotte cinema', 'galaxy', 'rap phim'],
  Game: ['game', 'steam', 'play store', 'app store'],
  'Đi chơi': ['di choi'],
  // --- Mua sắm ---
  'Mua online': ['shopee', 'lazada', 'tiki', 'sendo', 'mua hang'],
  'Quần áo': ['quan ao', 'mua ao', 'phu kien'],
  // --- Sức khỏe ---
  'Thuốc/Vitamin': ['mua thuoc', 'vitamin', 'thuoc'],
  // --- Học tập ---
  'Học tập': ['photo', 'in bai', 'mua sach', 'tai lieu'],
};

@Injectable()
export class SubCategoryAssignmentService implements OnModuleInit {
  private readonly logger = new Logger(SubCategoryAssignmentService.name);

  constructor(
    @InjectRepository(SubCategory)
    private readonly subCategoryRepo: Repository<SubCategory>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  async onModuleInit() {
    this.logger.log(
      'Running startup backfill for transaction subcategories...',
    );
    try {
      const stats = await this.backfillKeywordOnly();
      this.logger.log(
        `Startup backfill completed: assigned ${stats.assigned} transactions`,
      );
    } catch (e) {
      this.logger.warn(`Startup backfill failed: ${e.message}`);
    }
  }

  /**
   * Gán SubCategory cho transaction dựa trên note (keyword-only).
   * Chỉ gán nếu transaction chưa có subCategory.
   */
  async assignFromNote(transaction: Transaction): Promise<void> {
    // Đã có subCategory → skip
    if (transaction.subCategory) return;
    // Không có note → skip
    if (!transaction.note?.trim()) return;
    // Không có category → skip (cần category để tạo sub)
    if (!transaction.category) return;

    const normalizedNote = this.normalizeVietnamese(transaction.note);
    if (normalizedNote.length < 2) return;

    const groupName = this.matchNoteGroup(normalizedNote);
    if (!groupName) return;

    try {
      const subCategory = await this.findOrCreateSubCategory(
        groupName,
        transaction.category,
      );

      await this.transactionRepo.update(transaction.id, {
        subCategory: { id: subCategory.id } as any,
      });

      this.logger.debug(
        `Assigned subCategory "${groupName}" to transaction #${transaction.id}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to assign subCategory for tx #${transaction.id}: ${error.message}`,
      );
    }
  }

  /**
   * Backfill: gán subCategory cho tất cả transactions chưa có.
   * Chỉ dùng keyword matching (nhanh, không gọi Gemini).
   * Trả về số lượng đã gán.
   */
  async backfillKeywordOnly(userId?: number): Promise<{
    total: number;
    assigned: number;
    skipped: number;
  }> {
    const where: any = {
      subCategory: IsNull(),
      type: 'expense' as const,
    };
    if (userId) {
      where.user = { id: userId };
    }

    const transactions = await this.transactionRepo.find({
      where,
      relations: ['category'],
      order: { transaction_date: 'DESC' },
    });

    let assigned = 0;
    let skipped = 0;

    for (const tx of transactions) {
      if (!tx.note?.trim() || !tx.category) {
        skipped++;
        continue;
      }

      const normalizedNote = this.normalizeVietnamese(tx.note);
      const groupName = this.matchNoteGroup(normalizedNote);

      if (!groupName) {
        skipped++;
        continue;
      }

      try {
        const subCategory = await this.findOrCreateSubCategory(
          groupName,
          tx.category,
        );
        await this.transactionRepo.update(tx.id, {
          subCategory: { id: subCategory.id } as any,
        });
        assigned++;
      } catch {
        skipped++;
      }
    }

    this.logger.log(
      `Backfill completed: total=${transactions.length}, assigned=${assigned}, skipped=${skipped}`,
    );

    return { total: transactions.length, assigned, skipped };
  }

  // ─── Private ───────────────────────────────────────────────────────

  private matchNoteGroup(normalizedNote: string): string | null {
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

  private async findOrCreateSubCategory(
    name: string,
    category: Category,
  ): Promise<SubCategory> {
    // Tìm sub existing (cùng category)
    const existing = await this.subCategoryRepo.findOne({
      where: {
        name,
        category: { id: category.id },
      },
    });

    if (existing) return existing;

    // Tạo mới
    const newSub = this.subCategoryRepo.create({
      name,
      type: CategoryType.EXPENSE,
      is_system: false,
      category,
    });

    const saved = await this.subCategoryRepo.save(newSub);
    this.logger.log(
      `Created new SubCategory "${name}" under category "${category.name}" (id=${saved.id})`,
    );

    return saved;
  }

  private normalizeVietnamese(input: string): string {
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
}
