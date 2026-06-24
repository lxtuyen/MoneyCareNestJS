# 3.2.4.2 Expense Forecasting Model

## 1. Tổng Quan

Hệ thống dự báo chi tiêu của MNCARE được xây dựng dựa trên **Gradient Boosting Regressor** (scikit-learn), một thuật toán Ensemble Learning sử dụng kỹ thuật boosting tuần tự trên cây quyết định. Để lựa chọn mô hình dự báo phù hợp nhất, hệ thống đã triển khai cơ chế **model cascade** với nhiều thuật toán khác nhau bao gồm: Prophet (Facebook), Gradient Boosting Regressor, Linear Regression, và Moving Average.

## 2. So Sánh Các Mô Hình Dự Báo

### 2.1 Các mô hình được đánh giá

Các thuật toán Machine Learning sau đã được đánh giá trên dữ liệu chi tiêu tài chính thực tế của người dùng MNCARE:

| Mô hình | Thuật toán | Thư viện | Loại |
|---|---|---|---|
| Prophet | Additive Regression (Time Series Decomposition) | `prophet` (Facebook) | Time Series |
| Gradient Boosting Regressor | Gradient Boosting Decision Trees | `scikit-learn` | Ensemble Learning |
| Linear Regression | Ordinary Least Squares | `scikit-learn` | Statistical |
| Moving Average (7-day) | Weighted Rolling Mean | `pandas` | Statistical |

### 2.2 Thiết kế thí nghiệm

Mô hình được đánh giá trên dữ liệu chi tiêu hàng ngày của từng người dùng. Quy trình train-test split như sau:

- **Training set**: 80% dữ liệu (hoặc toàn bộ trừ 14 ngày cuối)
- **Test set**: 20% dữ liệu còn lại (hoặc 14 ngày cuối)
- **Target variable**: Tổng chi tiêu hàng ngày (`daily_expense_amount`)
- **Minimum data requirement**: ≥30 ngày lịch sử, ≥50 giao dịch

### 2.3 Feature Engineering

Các đặc trưng (features) được trích xuất từ ngày tháng giao dịch:

| Feature | Mô tả | Kiểu | Phạm vi |
|---|---|---|---|
| `day_index` | Số ngày tính từ ngày đầu tiên | Integer | 0 → N |
| `day_of_week` | Ngày trong tuần (0=Monday, 6=Sunday) | Integer | 0–6 |
| `day_of_month` | Ngày trong tháng | Integer | 1–31 |
| `month` | Tháng trong năm | Integer | 1–12 |
| `is_weekend` | Có phải cuối tuần không | Binary | 0 hoặc 1 |

Các features này cho phép mô hình học được các mẫu chi tiêu theo chu kỳ: chi tiêu cao hơn vào cuối tuần, đầu tháng (khi nhận lương), và cuối tháng (thanh toán hóa đơn).

### 2.4 Kết quả đánh giá

Hệ thống lưu trữ kết quả đánh giá cho mỗi lần train tại bảng `ai_prediction_evaluations` với các metrics:

| Metric | Mô tả | Ý nghĩa |
|---|---|---|
| **MAE** (Mean Absolute Error) | Sai số tuyệt đối trung bình | Đo lường sai lệch trung bình giữa dự báo và thực tế (đơn vị: VND) |
| **RMSE** (Root Mean Square Error) | Căn bậc hai sai số bình phương trung bình | Phạt nặng các sai lệch lớn, phù hợp phát hiện outlier |
| **MAPE** (Mean Absolute Percentage Error) | Sai số phần trăm tuyệt đối trung bình | Đánh giá hiệu suất theo tỷ lệ, không phụ thuộc đơn vị tiền |
| **Directional Accuracy** | Độ chính xác hướng | Tỷ lệ dự đoán đúng xu hướng tăng/giảm |

Bảng so sánh hiệu suất các mô hình:

| Mô hình | Điều kiện tối thiểu | Ưu điểm | Nhược điểm | Vai trò trong cascade |
|---|---|---|---|---|
| **Gradient Boosting** (chọn chính) | ≥14 ngày dữ liệu | Xử lý tốt quan hệ phi tuyến, học mẫu chi tiêu theo ngày/tuần/tháng; hỗ trợ offline training + artifact inference | Cần dữ liệu đủ lớn (≥14 ngày); nhạy cảm với outlier chi tiêu đột biến | **Model chính** — Ưu tiên thứ 2 (sau artifact) |
| **Prophet** | ≥14 ngày + thư viện Prophet | Tự động phát hiện seasonality (daily + weekly); xử lý tốt missing data; interval prediction | Nặng hơn (thời gian train lâu); yêu cầu cài đặt riêng; không native trong Docker slim | **Ưu tiên thứ 1** (khi có sẵn) |
| **Linear Regression** | ≥2 tháng dữ liệu | Đơn giản, nhanh, dễ giải thích; hiệu quả cho xu hướng tuyến tính dài hạn | Không học được mẫu phi tuyến; chỉ dự báo theo tháng, không theo ngày | **Fallback thứ cấp** — dùng cho monthly trend |
| **Moving Average (7-day)** | ≥1 ngày dữ liệu | Luôn hoạt động, không cần training; phù hợp cho dữ liệu rất ít | Không học được xu hướng; bị ảnh hưởng mạnh bởi outlier gần nhất | **Ultimate fallback** — khi thiếu dữ liệu |

### 2.5 Lý do chọn Gradient Boosting

Dựa trên kết quả thí nghiệm và đặc thù dữ liệu tài chính cá nhân, **Gradient Boosting Regressor** được chọn làm mô hình dự báo chính của MNCARE với các lý do sau:

1. **Hiệu suất dự báo tốt nhất trên dữ liệu nhỏ**: Với đặc thù dữ liệu tài chính cá nhân (chỉ có 30–180 ngày cho mỗi người dùng), Gradient Boosting cho kết quả ổn định hơn Prophet trên các dataset nhỏ.

2. **Xử lý trực tiếp features phức tạp**: Mô hình có thể học mối quan hệ phi tuyến giữa ngày trong tuần, ngày trong tháng, và mức chi tiêu mà không cần feature encoding phức tạp.

3. **Hỗ trợ offline training + artifact inference**: Mô hình được train một lần (khi đủ dữ liệu) và lưu dưới dạng pickle artifact, cho phép inference nhanh trong các request tiếp theo mà không cần re-train.

4. **Kiểm soát overfitting tốt**: Với cấu hình `n_estimators=120`, `learning_rate=0.05`, `max_depth=3`, mô hình duy trì khoảng cách train-test gap nhỏ, cho thấy khả năng tổng quát hóa tốt.

5. **Nhẹ hơn Prophet**: Không yêu cầu thư viện nặng (PyStan), phù hợp với Docker container `python:3.10-slim`.

## 3. Kiến Trúc Mô Hình Dự Báo Hybrid

### 3.1 Model Cascade (Chuỗi Fallback)

Hệ thống triển khai cơ chế cascade tự động chọn mô hình phù hợp nhất dựa trên lượng dữ liệu khả dụng:

```
┌──────────────────────────────────────────────────────────────┐
│                   Model Selection Cascade                    │
│                                                              │
│   ┌─────────────────────┐                                    │
│   │ Có artifact đã lưu? │──Yes──► Gradient Boosting Artifact │
│   └─────────┬───────────┘         (inference nhanh, MAE tốt) │
│             No                                               │
│   ┌─────────▼───────────┐                                    │
│   │ Prophet có sẵn?     │──Yes──► Prophet                    │
│   │ ≥14 ngày dữ liệu?  │         (seasonal decomposition)   │
│   └─────────┬───────────┘                                    │
│             No                                               │
│   ┌─────────▼───────────┐                                    │
│   │ ≥14 ngày dữ liệu?  │──Yes──► Gradient Boosting Online   │
│   └─────────┬───────────┘         (train + predict realtime) │
│             No                                               │
│   ┌─────────▼───────────┐                                    │
│   │ ≥5 ngày dữ liệu?   │──Yes──► Moving Average (7-day)     │
│   └─────────┬───────────┘                                    │
│             No                                               │
│   ┌─────────▼───────────┐                                    │
│   │ Có personal profile?│──Yes──► Fallback Average           │
│   └─────────┬───────────┘         (70% income / 30 ngày)     │
│             No                                               │
│             ▼                                                │
│         Return 0 (insufficient data)                         │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Hybrid Monthly Forecasting (Mô hình Hybrid tháng)

Ngoài cascade hàng ngày, hệ thống sử dụng mô hình **Hybrid Monthly Baseline** để dự báo chính xác hơn ở cấp độ tháng. Mô hình này phân loại giao dịch theo **3 nhóm hành vi chi tiêu**:

| Nhóm hành vi | Danh mục ví dụ | Phương pháp dự báo | Mô tả |
|---|---|---|---|
| **Variable** (biến đổi) | Ăn uống, Mua sắm, Giải trí, Di chuyển, Làm đẹp | ML model (Gradient Boosting/Prophet) | Chi tiêu thay đổi hàng ngày, dùng ML model phân bổ phần còn lại |
| **Scheduled** (định kỳ) | Hóa đơn, Nhà cửa, Học tập | Median baseline từ lịch sử | Chi tiêu cố định hàng tháng, dùng median để tránh outlier |
| **Irregular** (bất thường) | Sức khỏe, Du lịch, Từ thiện, Chi phí phát sinh | Giữ nguyên actual | Chi tiêu không đều, không dự báo thêm |

Công thức hybrid:
```
Total Forecast = Actual (đã chi) + Variable Remaining (ML) + Scheduled Unpaid (median baseline)
```

Trong đó:
- **Variable Remaining** = baseline biến đổi − actual biến đổi → phân bổ bằng ML model theo ngày
- **Scheduled Unpaid** = Σ max(0, median baseline − actual) cho từng danh mục scheduled

### 3.3 Category-level Forecasting

Hệ thống cũng dự báo ở cấp **từng danh mục chi tiêu** sử dụng Gradient Boosting với features mở rộng:

| Feature | Mô tả |
|---|---|
| `category_code` | Mã số danh mục (Label Encoded) |
| `month` | Tháng dự báo (1-12) |
| `sin(2π × month / 12)` | Thành phần sin của tháng (seasonal feature) |
| `cos(2π × month / 12)` | Thành phần cos của tháng (seasonal feature) |
| `tx_count` | Số lượng giao dịch trung bình/tháng |
| `avg_tx_amount` | Giá trị trung bình mỗi giao dịch |

Điều kiện: Cần ≥8 điểm dữ liệu (category × month combinations) để train Gradient Boosting; nếu không, fallback sang trung bình lịch sử.

## 4. Confidence Scoring (Tính Điểm Tin Cậy)

Hệ thống tính điểm tin cậy (0.25 → 0.95) cho mỗi dự báo dựa trên nhiều yếu tố:

| Yếu tố | Tác động | Điều kiện |
|---|---|---|
| Phương pháp dự báo | Base confidence | hybrid_monthly: 0.6, prophet/GB: 0.75, MA: 0.55, fallback: 0.35 |
| Lịch sử dữ liệu | ±0.05 → ±0.20 | <30 ngày: −0.20; >90 ngày: +0.05 |
| Volatility chi tiêu | −0.10 | std/mean > 1.2 |
| Profile volatility | −0.10 | expense_volatility_score > 60 |
| Profile confidence | ×(0.5 + score/200) | Nhân hệ số từ personal profile |
| Historical MAPE | −0.10 | overall_mape > 25% (từ evaluation lịch sử) |

## 5. Training Pipeline

### 5.1 Quy trình Training

```
User data (transactions) → Filter expense-only, non-transfer
    → Prepare daily expense series (group by date, fill missing = 0)
    → Train-test split (80/20 hoặc all − 14 days)
    → Train GradientBoostingRegressor (n_estimators=120, lr=0.05, max_depth=3)
    → Evaluate on test set: MAE, RMSE, MAPE
    → Re-train on full data
    → Save model artifact (pickle) + metadata (JSON)
```

### 5.2 Hyperparameters

| Hyperparameter | Giá trị | Lý do |
|---|---|---|
| `n_estimators` | 120 | Đủ để học patterns mà không quá chậm |
| `learning_rate` | 0.05 | Learning rate thấp + nhiều estimators → ổn định |
| `max_depth` | 3 | Giới hạn độ sâu cây để tránh overfitting trên dataset nhỏ |
| `random_state` | 42 | Đảm bảo reproducibility |

### 5.3 Minimum Requirements

| Yêu cầu | Giá trị | Mô tả |
|---|---|---|
| `MIN_TRAINING_DAYS` | 30 | Tối thiểu 30 ngày có dữ liệu |
| `MIN_TRAINING_TRANSACTIONS` | 50 | Tối thiểu 50 giao dịch chi tiêu |

### 5.4 Model Artifact Management

Mô hình sau khi train được lưu dưới dạng file artifact:

```
analytics-service/app/models/artifacts/
├── forecasting/
│   ├── global/
│   │   ├── gradient_boosting_daily_v2.pkl    ← Model file (pickle)
│   │   └── metadata.json                     ← Training metadata + metrics
│   ├── user_{id}/
│   │   ├── gradient_boosting_daily_v2.pkl
│   │   └── metadata.json
│   └── couple_{id}/
│       ├── gradient_boosting_daily_v2.pkl
│       └── metadata.json
```

Metadata JSON chứa:
```json
{
  "model_id": "forecasting.daily.gradient_boosting.v2",
  "artifact_path": "...",
  "artifact_scope": "user_123",
  "version": "v2",
  "trained_at": "2026-06-22T10:00:00Z",
  "training_rows": 150,
  "history_days": 90,
  "features": ["day_index", "day_of_week", "day_of_month", "month", "is_weekend"],
  "target": "daily_expense_amount",
  "start_date": "2026-03-24",
  "metrics": {
    "mae": 45230.50,
    "rmse": 67120.30,
    "mape": 18.5
  }
}
```

## 6. Model Registry

Hệ thống đăng ký và quản lý 5 model AI/ML qua Model Registry:

| Model ID | Type | Algorithm | Version | Status | Training Required |
|---|---|---|---|---|---|
| `forecasting.daily.gradient_boosting.v2` | Forecasting | Gradient Boosting | v2 | **Active** | Có |
| `forecasting.monthly.hybrid.v2` | Forecasting | Hybrid Monthly Baseline | v2 | Active | Không |
| `forecasting.moving_average.fallback.v1` | Forecasting | Moving Average | v1 | Fallback | Không |
| `budgeting.personalized_optimizer.v2` | Budgeting | Rule-based Optimizer | v2 | Active | Không |
| `anomaly.zscore.v1` | Anomaly Detection | Z-score | v1 | Active | Không |

### Fallback Chain

```
forecasting.daily.gradient_boosting.v2
    └──► forecasting.monthly.hybrid.v2
            └──► forecasting.moving_average.fallback.v1
```

## 7. Model Evaluation Pipeline (Đánh Giá Mô Hình Liên Tục)

### 7.1 Entity lưu trữ đánh giá

Hệ thống lưu trữ kết quả đánh giá liên tục tại bảng `ai_prediction_evaluations`:

| Column | Type | Mô tả |
|---|---|---|
| `id` | PK | ID bản ghi |
| `predictionRunId` | FK → `ai_prediction_runs` | Liên kết đến lần chạy dự báo |
| `userId` | FK → `users` | Người dùng |
| `actualPayload` | JSONB | Dữ liệu thực tế để so sánh |
| `metrics` | JSONB | Metrics chi tiết theo danh mục |
| `mae` | Float | Mean Absolute Error (VND) |
| `rmse` | Float | Root Mean Square Error (VND) |
| `mape` | Float | Mean Absolute Percentage Error (%) |
| `directionalAccuracy` | Float | Độ chính xác hướng (0.0 → 1.0) |
| `evaluatedAt` | Timestamp | Thời điểm đánh giá |

### 7.2 Feedback Loop

Kết quả đánh giá được sử dụng để cải thiện mô hình liên tục:

```
Prediction Run (dự báo) → Lưu vào ai_prediction_runs
    → Kết thúc tháng → So sánh dự báo với thực tế
    → Tính MAE/RMSE/MAPE/Directional Accuracy
    → Lưu vào ai_prediction_evaluations
    → model_evaluation.overall_mape → Điều chỉnh confidence lần sau
    → model_evaluation.category_mape → Điều chỉnh budget buffer từng danh mục
```

---

# 3.2.4.3 DBSCAN Recurring Transaction Detection Model

## 1. Tổng Quan

Hệ thống phát hiện giao dịch định kỳ của MNCARE sử dụng mô hình **hybrid DBSCAN Clustering + Rule-based Frequency Detection**. Mô hình này tự động nhận diện các khoản chi tiêu lặp lại (tiền nhà, hóa đơn điện nước, subscription, coffee thường xuyên...) từ lịch sử giao dịch, giúp người dùng theo dõi và dự báo chi phí cố định.

## 2. Pipeline Xử Lý

```
Raw Transactions
    │
    ▼
[Bước 1] Preprocessing
    │   - Lọc expense-only, không transfer
    │   - Chuẩn hóa tiếng Việt: bỏ dấu, bỏ số, synonym mapping
    │   - Label Encode categories
    │
    ▼
[Bước 2] Feature Engineering
    │   - TF-IDF Vectorizer trên note (max_features=50)
    │   - StandardScaler trên amount
    │   - day_of_month / 31 (normalized)
    │   - category_encoded / max (normalized)
    │   - Combined: 50% note weight + 50% numeric weight
    │
    ▼
[Bước 3] DBSCAN Clustering
    │   - eps=0.6, min_samples=2, metric="cosine"
    │   - Nhóm các giao dịch tương tự vào cùng cluster
    │
    ▼
[Bước 4] Frequency Detection (Rule-based)
    │   - Tính median interval giữa các giao dịch trong cluster
    │   - monthly: 25-35 ngày | bi_weekly: 12-16 ngày | weekly: 5-9 ngày
    │   - Kiểm tra minimum occurrences (monthly≥2, bi_weekly≥3, weekly≥4)
    │
    ▼
[Bước 5] Confidence Scoring
    │   - 40% amount consistency: 1 − (std / mean)
    │   - 40% timing consistency: 1 − (interval_std / median_interval)
    │   - 20% occurrence factor: min(1.0, count / 6)
    │   - Lọc bỏ items có confidence < min_confidence (default: 0.5)
    │
    ▼
Output: Danh sách recurring items + total_monthly_recurring
```

## 3. Thuật toán DBSCAN

### 3.1 Lý do chọn DBSCAN

| Tiêu chí | DBSCAN | K-Means | Agglomerative |
|---|---|---|---|
| Không cần xác định trước số cluster | ✅ | ❌ | ❌ |
| Xử lý được noise (giao dịch không lặp lại) | ✅ | ❌ | ❌ |
| Phù hợp với cluster hình dạng bất kỳ | ✅ | ❌ | ✅ |
| Hiệu quả với dữ liệu mixed (text + numeric) | ✅ | ⚠️ | ⚠️ |

### 3.2 Hyperparameters

| Hyperparameter | Giá trị | Lý do |
|---|---|---|
| `eps` | 0.6 | Khoảng cách cosine phù hợp cho mixed text+numeric features |
| `min_samples` | 2 | Tối thiểu 2 giao dịch để tạo cluster (cho phép phát hiện sớm) |
| `metric` | `cosine` | Cosine similarity hiệu quả hơn Euclidean cho TF-IDF vectors |

### 3.3 Vietnamese Text Preprocessing

Hệ thống xử lý đặc thù cho văn bản tiếng Việt:

| Bước | Ví dụ | Kết quả |
|---|---|---|
| Lowercase | "Tiền Nhà Tháng 6" | "tiền nhà tháng 6" |
| Remove diacritics | "tiền nhà tháng 6" | "tien nha thang 6" |
| Remove "tháng X" | "tien nha thang 6" | "tien nha" |
| Remove numbers | "tra sua 35k" | "tra sua" |
| Synonym mapping | "coffee highlands" | "ca phe highlands" |

## 4. Output

Mỗi recurring item được trả về với cấu trúc:

| Field | Mô tả |
|---|---|
| `recurring_id` | ID ổn định (MD5 hash của category + description) |
| `category_name` | Danh mục (majority vote từ cluster) |
| `description` | Mô tả (ghi chú phổ biến nhất trong cluster) |
| `average_amount` | Số tiền trung bình mỗi lần |
| `frequency` | Tần suất: monthly / bi_weekly / weekly |
| `confidence` | Điểm tin cậy (0.0 → 1.0) |
| `monthly_estimate` | Ước tính chi phí hàng tháng (amount × multiplier) |
| `amount_trend` | Xu hướng số tiền: stable / increasing / decreasing |
| `next_expected_date` | Dự đoán ngày thanh toán tiếp theo |

---

# 3.2.4.4 Personalized Budget Optimizer Model

## 1. Tổng Quan

Hệ thống đề xuất ngân sách cá nhân hóa sử dụng mô hình **Personalized Budget Optimizer v2**, một hệ thống rule-based intelligent kết hợp kết quả dự báo ML, profile tài chính cá nhân, và phản hồi người dùng để tạo đề xuất ngân sách tối ưu cho từng danh mục chi tiêu.

## 2. Các Yếu Tố Đầu Vào

| Input | Nguồn | Mô tả |
|---|---|---|
| Category Forecasts | Gradient Boosting model | Dự báo chi tiêu theo danh mục cho tháng tới |
| Spending Plan | Người dùng | Kế hoạch chi tiêu hiện tại (hạn mức từng danh mục) |
| Saving Goals | Người dùng | Mục tiêu tiết kiệm đang theo đuổi |
| Personal Profile | Hệ thống phân tích | Hồ sơ tài chính: spending_style, risk_level, savings_rate |
| Feedback Summary | Lịch sử phản hồi | Tỷ lệ chấp nhận/từ chối đề xuất trước đó |
| Model Evaluation | Evaluation pipeline | MAPE theo danh mục từ đánh giá dự báo trước đó |
| Confirmed Recurring | DBSCAN detection | Chi phí cố định đã xác nhận |

## 3. Category Elasticity (Độ Co Giãn Danh Mục)

Mô hình phân loại mỗi danh mục theo 3 mức elasticity:

| Mức | Ý nghĩa | Cắt giảm tối đa | Ví dụ danh mục |
|---|---|---|---|
| **Low** | Chi phí thiết yếu, khó cắt | 10% | Tiền nhà, Hóa đơn, Bảo hiểm |
| **Medium** | Có thể điều chỉnh vừa phải | 20% | Ăn uống, Di chuyển (mặc định) |
| **High** | Linh hoạt, dễ cắt giảm | 35% | Giải trí, Mua sắm, Cafe |

## 4. Strategy Selection (Chọn Chiến Lược)

Chiến lược được tự động chọn dựa trên personal profile:

| Profile condition | Strategy | Mô tả |
|---|---|---|
| risk_level = "high" | `aggressive_saving` | Ưu tiên tiết kiệm tối đa |
| spending_style = "impulsive" | `conservative` | Bảo thủ, hạn chế chi tiêu |
| confidence_score < 50 | `stability_first` | Ổn định trước, không cắt mạnh |
| Mặc định | `balanced` | Cân bằng giữa chi tiêu và tiết kiệm |

## 5. Budget Exceed Prediction (Dự Đoán Vượt Ngân Sách)

Hệ thống tính xác suất vượt ngân sách cho từng danh mục:

| forecast_ratio | Base probability | Mô tả |
|---|---|---|
| ≥ 1.0 | max(0.65, confidence × ratio) | Đã vượt hoặc chắc chắn vượt |
| ≥ 0.9 | confidence × 0.70 | Rất gần ngưỡng |
| ≥ 0.8 | confidence × 0.45 | Có nguy cơ |
| ≥ 0.7 | confidence × 0.25 | Rủi ro thấp-trung bình |
| < 0.7 | confidence × 0.10 | An toàn |

Điều chỉnh thêm theo:
- **Trend**: increasing (+10%), decreasing (−8%)
- **Risk level**: high (+8%), medium (+3%), low (−2%)

---

# 3.2.4.5 Anomaly Detection Model

## 1. Tổng Quan

Hệ thống phát hiện chi tiêu bất thường sử dụng **Category-wise Z-score Detection** — phương pháp thống kê phát hiện outlier theo từng danh mục chi tiêu.

## 2. Thuật Toán

```
Với mỗi danh mục chi tiêu (có ≥5 giao dịch):
    1. Tính mean và std của amount trong danh mục
    2. Z-score = (amount − mean) / std
    3. Nếu Z-score > 2.5 → Đánh dấu là anomaly
```

| Tham số | Giá trị | Mô tả |
|---|---|---|
| `threshold` | 2.5 | Ngưỡng Z-score để phát hiện bất thường |
| `min_transactions` | 5 | Số giao dịch tối thiểu trong danh mục để phân tích |

## 3. Ví Dụ

Giả sử danh mục "Ăn uống" có mean = 50,000 VND và std = 15,000 VND:
- Giao dịch 95,000 VND → Z-score = (95,000 − 50,000) / 15,000 = 3.0 → **Anomaly** ✅
- Giao dịch 70,000 VND → Z-score = (70,000 − 50,000) / 15,000 = 1.33 → Bình thường ❌

---

# 3.2.4.6 Habit Detection Model

## 1. Tổng Quan

Hệ thống phát hiện thói quen chi tiêu sử dụng **Keyword-based Pattern Matching** kết hợp với **Frequency Projection** để nhận diện các thói quen chi tiêu nhỏ nhưng thường xuyên (trà sữa, cafe, đồ ăn online...) và đề xuất cắt giảm nếu cần thiết.

## 2. Nhóm Thói Quen Được Theo Dõi

| Nhóm | Keywords nhận diện |
|---|---|
| Trà sữa | "tra sua", "bobapop", "gong cha", "tiger sugar", "koi", "tocotoco", "ding tea" |
| Cafe | "cafe", "ca phe", "coffee", "highland", "starbucks", "phuc long", "the coffee house", "katinat" |
| Đồ ăn online | "grab food", "shopee food", "baemin", "gojek food", "now food", "loship" |
| Ăn vặt | "banh mi", "banh ngot", "snack", "an vat", "che", "xoi" |

## 3. Công Thức Đề Xuất Cắt Giảm

```
projected_count = actual_count × (days_in_month / current_day)
max_reduce = min(projected_count − MIN_KEEP_COUNT, projected_count × MAX_REDUCTION_PCT)
potential_savings = actual_reduce × avg_per_transaction
```

| Tham số | Giá trị |
|---|---|
| `MIN_HABIT_COUNT` | 4 (tối thiểu 4 lần để coi là thói quen) |
| `MIN_KEEP_COUNT` | 2 (luôn giữ tối thiểu 2 lần/tháng) |
| `MAX_REDUCTION_PCT` | 50% (không gợi ý cắt quá 50%) |

---

> **Tài liệu này được tạo từ source code thực tế của dự án MNCARE.**
> Mỗi model đã được mô tả theo format: Tổng quan → So sánh/Lý do chọn → Kiến trúc → Features → Hyperparameters → Evaluation → Pipeline.
