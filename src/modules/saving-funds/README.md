# Saving Funds Module - Expired Fund Handling

## Tổng quan

Module này xử lý việc quản lý saving funds và tự động xử lý khi fund hết hạn.

## Flow hoạt động

### 1. Khi user mở app (Frontend)

```typescript
// Call API khi app start hoặc user login
const response = await checkExpiredFund(userId);

if (response.data.has_expired_fund) {
  const fund = response.data.expired_fund;
  
  // Show popup với thông tin:
  // - Tên fund
  // - % hoàn thành mục tiêu
  // - Tổng chi tiêu
  // - 2 buttons: "Xem báo cáo" và "Gia hạn"
  
  showExpiredFundPopup(fund);
}
```

### 2. User chọn "Xem báo cáo"

```typescript
// Navigate to report screen
const report = await getFundReport(fundId);

// Display:
// - Chi tiêu theo category (pie chart)
// - Timeline chi tiêu
// - So sánh budget vs actual
// - Các metrics khác

// Sau khi xem xong, mark as notified
await markAsNotified(fundId);
```

### 3. User chọn "Gia hạn"

```typescript
// Show date picker
const newEndDate = await showDatePicker();

// Call API extend
await extendFund(fundId, {
  new_end_date: newEndDate,
  new_start_date: optionalNewStartDate
});

// Fund status sẽ chuyển về ACTIVE
// completion_notified reset về false
```

### 4. Backend tự động (Scheduled Job)

```typescript
// Chạy mỗi ngày lúc 00:00
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async handleExpiredFunds() {
  // Tìm tất cả funds có end_date <= today và status = ACTIVE
  // Update status sang EXPIRED
  // Log số lượng funds đã update
}
```

## API Endpoints

### Check Expired Fund
```
GET /saving-fund/check-expired/:userId
```
- Kiểm tra xem user có fund nào hết hạn chưa được thông báo
- Trả về thông tin fund và % hoàn thành

### Mark as Notified
```
PATCH /saving-fund/:fundId/mark-notified
```
- Đánh dấu fund đã được thông báo
- Tránh hiện popup nhiều lần

### Extend Fund
```
PATCH /saving-fund/:fundId/extend
Body: {
  "new_end_date": "2024-04-30",
  "new_start_date": "2024-04-01" // optional
}
```
- Gia hạn fund
- Reset status về ACTIVE
- Reset completion_notified về false

### Get Fund Report
```
GET /saving-fund/:fundId/report
```
- Lấy báo cáo chi tiết
- Bao gồm breakdown theo category
- Các metrics: budget usage, target completion, daily average, etc.

## Database Schema

### SavingFund Entity

```typescript
{
  id: number;
  name: string;
  budget: number;
  target: number;
  start_date: Date;
  end_date: Date;
  status: 'ACTIVE' | 'EXPIRED' | 'COMPLETED' | 'ARCHIVED';
  completion_notified: boolean;
  is_selected: boolean;
  user: User;
  categories: Category[];
}
```

## Status Flow

```
ACTIVE → EXPIRED (tự động khi hết hạn)
       ↓
       → ACTIVE (khi user gia hạn)
       → ARCHIVED (khi user archive)
       → COMPLETED (khi đạt mục tiêu và user đánh dấu)
```

## Testing Checklist

- [ ] Tạo fund với end_date trong quá khứ
- [ ] Check API check-expired trả về đúng fund
- [ ] Test extend fund
- [ ] Test mark as notified
- [ ] Test report API với nhiều categories
- [ ] Test scheduled job (có thể trigger manual)
- [ ] Test với fund không có transactions
- [ ] Test với fund không có target

## Notes

- Popup chỉ hiện 1 lần cho mỗi expired fund (dựa vào completion_notified)
- Nếu user không chọn gì, lần sau mở app vẫn sẽ hiện popup
- Scheduled job chạy tự động, không cần trigger manual
- Report tính toán real-time từ transactions
