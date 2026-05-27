import { Type, FunctionCallingConfigMode } from '@google/genai';

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiResponse {
  functionCalls?: GeminiFunctionCall[];
}

export function getQueryTransactionsTool() {
  return {
    tools: [
      {
        functionDeclarations: [
          {
            name: 'query_transactions',
            description: 'Truy van danh sach giao dich theo dieu kien',
            parameters: {
              type: Type.OBJECT,
              properties: {
                type: {
                  type: Type.STRING,
                  description: 'Loai giao dich (income/expense/all)',
                  enum: ['income', 'expense', 'all'],
                },
                startDate: {
                  type: Type.STRING,
                  description: 'Ngay bat dau (ISO 8601)',
                  nullable: true,
                },
                endDate: {
                  type: Type.STRING,
                  description: 'Ngay ket thuc (ISO 8601)',
                  nullable: true,
                },
                category_name: {
                  type: Type.STRING,
                  description: 'Ten hang muc muon loc',
                  nullable: true,
                },
                limit: {
                  type: Type.NUMBER,
                  description: 'Gioi han so luong ket qua',
                  nullable: true,
                },
              },
              required: ['type'],
            },
          },
        ],
      },
    ],
    toolConfig: {
      functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
    },
  };
}

export function getRecordTransactionTool(categoryNames: string[]) {
  return {
    tools: [
      {
        functionDeclarations: [
          {
            name: 'record_transaction',
            description:
              'Ghi lai thong tin chi tieu hoac thu nhap tu tin nhan nguoi dung',
            parameters: {
              type: Type.OBJECT,
              properties: {
                amount: {
                  type: Type.NUMBER,
                  description: 'So tien giao dich',
                  nullable: true,
                },
                type: {
                  type: Type.STRING,
                  description: 'Loai giao dich (thu nhap hay chi tieu)',
                  enum: ['income', 'expense'],
                },
                category_name: {
                  type: Type.STRING,
                  description: 'Ten hang muc giao dich',
                  enum: [...categoryNames, 'Khac'],
                },
                sub_category_name: {
                  type: Type.STRING,
                  description:
                    'Ten danh muc con. Chi chon tu danh sach co san; null neu khong ro.',
                  nullable: true,
                },
                description: {
                  type: Type.STRING,
                  description:
                    'Ghi chú ngắn gọn về nội dung giao dịch (Ví dụ: "Ăn trưa", "Lương tháng 4"). TUYỆT ĐỐI KHÔNG bao gồm số tiền trong ghi chú này.',
                },
                time: {
                  type: Type.STRING,
                  description:
                    'Thoi gian giao dich theo ISO 8601, null neu khong de cap',
                  nullable: true,
                },
                wallet_name: {
                  type: Type.STRING,
                  description: 'Ten vi nguoi dung nhac den',
                  nullable: true,
                },
                needs_clarification: {
                  type: Type.BOOLEAN,
                  description:
                    'true neu can hoi user xac nhan sub category truoc khi luu',
                },
                suggested_sub_categories: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    'Danh sach goi y sub category khi needs_clarification=true',
                },
              },
              required: ['type', 'category_name', 'description'],
            },
          },
        ],
      },
    ],
    toolConfig: {
      functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
    },
  };
}

export function getProposeSavingGoalTool() {
  return {
    tools: [
      {
        functionDeclarations: [
          {
            name: 'propose_saving_goal',
            description: 'De xuat muc tieu tiet kiem moi cho nguoi dung',
            parameters: {
              type: Type.OBJECT,
              properties: {
                name: {
                  type: Type.STRING,
                  description: 'Ten muc tieu tiet kiem',
                },
                target: {
                  type: Type.NUMBER,
                  description: 'So tien muc tieu (VND)',
                },
                months_estimate: {
                  type: Type.NUMBER,
                  description: 'So thang uoc tinh de hoan thanh (lam tron len)',
                },
                requested_months: {
                  type: Type.NUMBER,
                  description:
                    'So thang nguoi dung yeu cau ro trong tin nhan (vi du "trong 5 thang" -> 5); null neu khong co',
                  nullable: true,
                },
                requested_days: {
                  type: Type.NUMBER,
                  description:
                    'So ngay nguoi dung yeu cau ro trong tin nhan (vi du "trong 14 ngay" -> 14); null neu khong co',
                  nullable: true,
                },
              },
              required: ['name', 'target', 'months_estimate'],
            },
          },
        ],
      },
    ],
    toolConfig: {
      functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
    },
  };
}

export function getQueryTransactionsPrompt(
  message: string,
  nowIso: string,
): string {
  return `Ban la tro ly tai chinh thong minh.
NHIEM VU: Trich xuat thong tin truy van lich su giao dich tu tin nhan cua nguoi dung.

QUY TAC TRICH XUAT:
1. type: 
   - 'income': neu nguoi dung hoi ve thu nhap, luong, tien nhan duoc.
   - 'expense': neu hoi ve chi tieu, mua sam, tien da tra.
   - 'all': neu hoi chung chung (vd: "cho xem giao dich", "lich su gan day").
2. startDate / endDate: Dinh dang ISO 8601. Hom nay la ${nowIso}.
   - "hom nay": bat dau tu 00:00 hom nay den hien tai.
   - "hom qua": tu 00:00 hom qua den 23:59 hom qua.
   - "tuan nay": tu thu 2 dau tuan den hien tai.
   - "thang nay": tu ngay 1 cua thang nay den hien tai.
   - "thang truoc": tu ngay 1 den ngay cuoi cung cua thang truoc.
   - "nam nay": tu ngay 1/1 den hien tai.
   - Neu khong de cap thoi gian: tra ve null cho ca hai.
3. category_name: Ten hang muc (vd: "an uong", "di lai"). Tra ve null neu khong co.
4. limit: So luong giao dich (vd: "5 giao dich", "top 10"). Tra ve null neu khong gioi han.

Tin nhan: "${message}"`;
}

export function getRecordTransactionPrompt(
  message: string,
  nowIso: string,
  categoryListStr: string,
  subCategoryRulesStr: string,
  walletListStr: string,
): string {
  return `Ban la mot may trich xuat du lieu tai chinh. 
NHIEM VU: Bat buoc dung cong cu 'record_transaction' de ghi lai moi thong tin thu nhap hoac chi tieu trong tin nhan.
QUY TAC:
1. KHONG duoc tra loi bang van ban thong thuong. Chi duoc goi function call.
2. Bat buoc lay CHINH XAC so tien, khong tu y tinh toan.
3. Loai giao dich (type) phai chinh xac: 'income' cho thu nhap/luong, 'expense' cho chi tiêu.
4. Neu khong co thoi gian, tra ve null cho time.
5. Ghi chú (description) phải ngắn gọn, tập trung vào nội dung chính. TUYỆT ĐỐI KHÔNG lặp lại số tiền trong phần ghi chú này.
6. category_name: He thong su dung bo danh muc CO DINH. Ban CHI DUOC PHEP chon tu danh sach: [${categoryListStr}]. TUYET DOI KHONG tu y tao ra ten danh muc moi.
7. sub_category_name: Chi duoc chon tu danh sach sub category co san ben duoi. Khong tu tao sub category moi.
Danh sach sub category:
${subCategoryRulesStr}
8. Neu tin nhan mo ho nhu "tra hoa don 400k" thi needs_clarification=true, category_name="Hoa don", sub_category_name=null, suggested_sub_categories gom cac sub category phu hop.
9. Neu noi ro "tien dien", "tien nuoc", "hoc phi", "an trua" thi chon dung sub_category_name va needs_clarification=false.
10. Neu noi "dien nuoc 400k" nhung khong tach tien, needs_clarification=true.
11. wallet_name: Neu nguoi dung co nhac den ten vi (vd: "vi ATM", "tien mat", "Momo"), hay trich xuat ten vi do tu danh sach: [${walletListStr}]. Neu khong nhac den, tra ve null.

Hom nay la: ${nowIso}. 
Tin nhan nguoi dung: "${message}"`;
}

export function getProposeSavingGoalPrompt(
  message: string,
  nowIso: string,
  capacity: {
    totalAmount: number;
    fixedExpenseTotal: number;
    projectedEndBalance: number;
  } | null,
): string {
  const plannedSavingCapacity = capacity
    ? Math.max(0, capacity.totalAmount - capacity.fixedExpenseTotal)
    : 0;

  const capacityContext = capacity
    ? `Nguoi dung co Ke hoach chi tieu dang hoat dong:
  - Tong ngan sach (Thu nhap): ${capacity.totalAmount} VND/thang
  - Chi phi co dinh: ${capacity.fixedExpenseTotal} VND/thang
  - Kha nang tiet kiem theo ke hoach: ${plannedSavingCapacity} VND/thang
  - So du linh hoat con lai du kien cuoi thang: ${capacity.projectedEndBalance} VND`
    : 'Nguoi dung CHUA co ke hoach chi tieu. Hay khuyen ho tao ke hoach truoc.';

  return `Ban la tro ly tai chinh thong minh cua app Money Care.
NHIEM VU: Trich xuat thong tin muc tieu tiet kiem tu tin nhan nguoi dung.

THONG TIN TAI CHINH HIEN TAI:
${capacityContext}

QUY TAC:
1. name: Ten muc tieu (vd: "Mua dien thoai", "Du lich Da Nang").
2. target: So tien muc tieu (VND). Neu nguoi dung noi "3 trieu" -> 3000000, "500k" -> 500000.
3. requested_months: So thang nguoi dung noi ro trong tin nhan. Vi du "trong 5 thang", "5 thang nua", "trong vong 5 thang" -> 5. Neu nguoi dung noi thoi gian theo ngay thi de requested_months la null.
4. requested_days: So ngay nguoi dung noi ro trong tin nhan. Vi du "trong 14 ngay", "14 ngay nua", "trong vong 10 ngay" -> 14 hoac 10. Neu nguoi dung noi thoi gian theo thang thi de requested_days la null.
5. months_estimate: Uoc tinh so thang can thiet = target / kha_nang_tiet_kiem_moi_thang. Lam tron len.
   Neu khong co ke hoach chi tieu, hay uoc tinh khoang 6 thang. Neu co requested_months thi months_estimate van co the bang requested_months.
   Neu co requested_days thi months_estimate bang requested_days / 30.

Hom nay la ${nowIso}.
Tin nhan: "${message}"`;
}

export function getGoalPlanInsightPrompt(
  goalName: string,
  daysDiff: number,
  projectionStatus: string,
  formattedTm: string,
  formattedSactual: string,
  dtoJson: string,
): string {
  const daysDiffStr =
    daysDiff === 999
      ? 'Trễ vô hạn (chưa có tích lũy)'
      : daysDiff > 0
        ? `Trễ khoảng ${daysDiff} ngày`
        : daysDiff < 0
          ? `Sớm khoảng ${Math.abs(daysDiff)} ngày`
          : 'Đúng tiến độ';

  const projectionStatusStr =
    projectionStatus === 'early'
      ? 'Hoàn thành SỚM'
      : projectionStatus === 'delayed'
        ? 'Hoàn thành TRỄ'
        : 'ĐÚNG TIẾN ĐỘ';

  return `
Ban la tro ly tai chinh thong minh, chuyen nghiep va than thien cua ung dung Money Care.

NHIEM VU:
Dua tren du lieu so hoc da duoc tinh toan san va snapshot chi tieu ke hoach cua nguoi dung, hay viet mot bao cao phan tich (insight) tieng Viet cuc ky thuyet phuc va tu nhien ve muc tieu tiet kiem "${goalName}" trong thang nay.

DU LIEU DU DOAN CHINH XAC (BAT BUOC SU DUNG KHI VIET):
- So ngay chenh lech: ${daysDiffStr}
- Trang thai du doan: ${projectionStatusStr}.
- Muc tieu chang thang nay (Tm): ${formattedTm}
- Da tich luy duoc trong thang nay (Sactual): ${formattedSactual}

YEU CAU NOI DUNG BAO CAO:
1. "summary" (Tom tat): Mot cau ngan gon duy nhat bao cao ket qua som/tre bao nhieu ngay dua tren "DU LIEU DU DOAN CHINH XAC" o tren. 
   - Neu som (vi du: am 5 ngày): phai dung tu ngu khen ngoi nhu "Tuyệt vời! Dự kiến chặng tiết kiệm tháng này sẽ hoàn thành sớm 5 ngày."
   - Neu tre (vi du: duong 8 ngày): viet "Dự kiến chặng tiết kiệm tháng này sẽ hoàn thành trễ khoảng 8 ngày."
   - Neu dung tien do (0 ngay): "Kế hoạch chặng tháng này của bạn đang rất xuất sắc và đúng tiến độ."
   - Neu tre vo han (999 ngay): "Kế hoạch chặng tháng này dự kiến sẽ không thể hoàn thành nếu không có điều chỉnh kịp thời."
2. "reason" (Ly do): Phai phan tich sau cac danh muc chi tieu tu snapshot du lieu ben duoi. 
   - Neu co nhom nao co status="delayed" (actualSpent > plannedToDate): chi ra nhom do dang lam cham tre tien do.
   - Neu tat ca cac nhom deu co status="on_track" (actualSpent <= plannedToDate): ghi nhan dieu do, khong duoc bịa ra nhom nao dang vuot ke hoach.
   - TUYET DOI KHONG dung vi du minh hoa nhu "Nhóm Ăn uống" neu du lieu thuc te khong co nhom do bi vuot.
3. "suggestion" (De xuat): Gợi ý các hành động thực tế, thắt chặt chi tiêu ở nhóm cụ thể nào để đưa kế hoạch trở lại đúng hạn (nếu trễ) hoặc giữ vững phong độ (nếu sớm).

QUY TAC:
- Phai giu nguyen con so ngay som/tre tinh duoc o tren, khong tu y bia dat hoac thay doi so ngay khac.
- Tra loi bang tieng Viet, ngan gon, chuyen nghiep, khong dung tu ngu qua kieu cach.

OUTPUT JSON DUY NHAT:
{"status":"on_track|delayed","summary":string,"reason":string,"suggestion":string}

SNAPSHOT DU LIEU:
${dtoJson}
`.trim();
}

export function getFinancialHealthAnalysisPrompt(
  userName: string,
  insightDataJson: string,
  text: string,
): string {
  return `
Ban la chuyen gia tai chinh ca nhan cho ung dung "Money Care".
Ten nguoi dung: ${userName}.

NHIEM VU: Dua tren JSON insight, hay:
1. Nhan xet tinh hinh chi tieu gan day.
2. Canh bao hang muc tang nhanh hoac gay rui ro.
3. Dua ra 3 loi khuyen cu the de tiet kiem.
4. Goi y ke hoach ngan sach thang toi.

QUY TAC: Chi dung so lieu trong JSON. Khong bịa them giao dich hay danh muc.

OUTPUT (JSON DUY NHAT):
{"summary":string,"budget_plan":[{"group_name":string,"items":[{"name":string,"amount":number,"description":string}]}]}

INSIGHT:${insightDataJson}
YEU CAU:${text}
`.trim();
}

export function getChatAnswerPrompt(text: string): string {
  return `Ban la tro ly tai chinh thong minh cua ung dung Money Care.
NHIEM VU: Ho tro nguoi dung ve cac chuyen de tai chinh, chi tieu, tiet kiem va cách su dung cac tinh nang cua app Money Care.
QUY TAC:
1. Neu nguoi dung hoi ve nhieu chuyen de khong lien quan den tai chinh (vi du: the thao, bong da, giai tri, thoi tiet, kien thuc tong hop khong lien quan...), hay lich su tu choi va giai thich rang ban la tro ly tai chinh cua Money Care nen chi tap trung vao ho tro quan ly tien bac.
2. Tra loi ngan gon, than thien bang tieng Viet.
3. Luon huong nguoi dung vao viec quan ly tai chinh tot hon.

Cau hoi: "${text}"`;
}
