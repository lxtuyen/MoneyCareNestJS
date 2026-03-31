# Migration Guide - Saving Fund Expiration Feature

## Database Changes

Các trường mới đã được thêm vào bảng `saving_funds`:

### 1. `status` (enum)
- Type: ENUM('ACTIVE', 'EXPIRED', 'COMPLETED', 'ARCHIVED')
- Default: 'ACTIVE'
- Mục đích: Theo dõi trạng thái của saving fund

### 2. `completion_notified` (boolean)
- Type: BOOLEAN
- Default: false
- Mục đích: Đánh dấu đã thông báo cho user về fund hết hạn

## Migration SQL (Nếu cần chạy manual)

Nếu `synchronize: true` không tự động tạo, chạy SQL sau:

```sql
-- Add status column
ALTER TABLE saving_funds 
ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE' 
CHECK (status IN ('ACTIVE', 'EXPIRED', 'COMPLETED', 'ARCHIVED'));

-- Add completion_notified column
ALTER TABLE saving_funds 
ADD COLUMN completion_notified BOOLEAN DEFAULT false;

-- Update existing records
UPDATE saving_funds 
SET status = 'EXPIRED' 
WHERE end_date < NOW() AND status = 'ACTIVE';
```

## API Endpoints Mới

### 1. Check Expired Fund
```
GET /saving-fund/check-expired/:userId
```
Response:
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "has_expired_fund": true,
    "expired_fund": {
      "id": 1,
      "name": "Quỹ tháng 3",
      "end_date": "2024-03-31",
      "completion_percentage": 85,
      "total_spent": 8500000,
      "target": 10000000,
      "budget": 10000000
    }
  }
}
```

### 2. Mark as Notified
```
PATCH /saving-fund/:fundId/mark-notified
```

### 3. Extend Fund
```
PATCH /saving-fund/:fundId/extend
Body: {
  "new_end_date": "2024-04-30",
  "new_start_date": "2024-04-01" // optional
}
```

### 4. Get Fund Report
```
GET /saving-fund/:fundId/report
```
Response:
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "fund_id": 1,
    "fund_name": "Quỹ tháng 3",
    "start_date": "2024-03-01",
    "end_date": "2024-03-31",
    "status": "EXPIRED",
    "budget": 10000000,
    "target": 10000000,
    "total_spent": 8500000,
    "remaining_budget": 1500000,
    "budget_usage_percentage": 85,
    "target_completion_percentage": 85,
    "is_over_budget": false,
    "is_target_achieved": false,
    "category_breakdown": [
      {
        "category_id": 1,
        "category_name": "Ăn uống",
        "total_spent": 3000000,
        "transaction_count": 45,
        "percentage": 35
      }
    ],
    "total_transactions": 120,
    "average_transaction_amount": 70833,
    "duration_days": 31,
    "daily_average_spending": 274193
  }
}
```

## Scheduled Job

Hệ thống tự động chạy job mỗi ngày lúc 00:00 để:
- Kiểm tra các fund có `end_date <= today`
- Cập nhật `status` từ 'ACTIVE' sang 'EXPIRED'

## Testing

### 1. Test Manual Update Status
```bash
# Tạo fund với end_date trong quá khứ
POST /saving-fund
{
  "name": "Test Fund",
  "userId": 1,
  "budget": 1000000,
  "target": 1000000,
  "start_date": "2024-03-01",
  "end_date": "2024-03-15"
}

# Chạy update manual (hoặc đợi scheduled job)
# Sau đó check
GET /saving-fund/check-expired/1
```

### 2. Test Extend Fund
```bash
PATCH /saving-fund/1/extend
{
  "new_end_date": "2024-04-30"
}

# Verify status changed back to ACTIVE
GET /saving-fund/1
```

### 3. Test Report
```bash
GET /saving-fund/1/report
```

## Notes

- `synchronize: true` trong TypeORM config sẽ tự động tạo các columns mới
- Scheduled job sẽ tự động chạy khi server start
- Có thể uncomment `@Cron(CronExpression.EVERY_HOUR)` trong scheduler để check mỗi giờ thay vì mỗi ngày
