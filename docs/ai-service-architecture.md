# 3.2.4.1 AI Service Architecture

## Tổng Quan

Hệ thống AI của MNCARE được tổ chức theo kiến trúc **hai tầng (dual-layer)**, bao gồm:

1. **AI Chatbot Layer** (Backend — NestJS): Xử lý giao tiếp ngôn ngữ tự nhiên với người dùng thông qua Gemini AI API, bao gồm chatbot tài chính, phân loại giao dịch, quét hóa đơn OCR, và tư vấn mục tiêu tiết kiệm.
2. **Analytics Microservice** (Python — FastAPI): Microservice độc lập chuyên tính toán các chỉ số tài chính, dự báo chi tiêu bằng Machine Learning, phát hiện giao dịch định kỳ, và đề xuất ngân sách cá nhân hóa.

Hai tầng giao tiếp với nhau qua HTTP API nội bộ. Analytics Microservice được triển khai dưới dạng Docker container độc lập, bảo mật bằng API Key, và giao tiếp với Backend Layer thông qua HTTP-based APIs.

```
┌─────────────────┐     HTTPS/JSON      ┌───────────────────────────────────┐
│   Frontend      │ ──────────────────►  │   Backend Layer (NestJS)          │
│   (Flutter)     │                      │                                   │
└─────────────────┘                      │   ┌─────────────────────────────┐ │
                                         │   │  AI Chatbot Layer           │ │
                                         │   │  (Gemini 2.5 Flash Lite)    │ │
                                         │   │                             │ │
                                         │   │  - Chat Router              │ │
                                         │   │  - Transaction Chat         │ │
                                         │   │  - Saving Goal Chat         │ │
                                         │   │  - Analysis Chat            │ │
                                         │   │  - Scenario What-If Chat    │ │
                                         │   │  - Budget Recommendation    │ │
                                         │   │  - Goal Achievement Chat    │ │
                                         │   │  - Receipt OCR              │ │
                                         │   └──────────┬──────────────────┘ │
                                         │              │ HTTP/JSON           │
                                         │   ┌──────────▼──────────────────┐ │
                                         │   │  Financial Insights Service │ │
                                         │   │  (Data Aggregation + Cache) │ │
                                         │   └──────────┬──────────────────┘ │
                                         └──────────────┼────────────────────┘
                                                        │ HTTP/JSON (X-API-Key)
                                         ┌──────────────▼────────────────────┐
                                         │  Analytics Microservice (Python)  │
                                         │  (FastAPI + Docker Container)     │
                                         │                                   │
                                         │  - Forecasting Service            │
                                         │  - Budgeting Service              │
                                         │  - Recurring Detection            │
                                         │  - Anomaly Detection              │
                                         │  - Couple Analysis                │
                                         │  - Habit Detection                │
                                         │  - Model Training                 │
                                         └───────────────────────────────────┘
```

---

## Tầng 1: AI Chatbot Layer (NestJS Backend)

### Mô tả chung

AI Chatbot Layer được tích hợp trực tiếp trong Backend NestJS dưới dạng module `AiModule` (đánh dấu `@Global()`). Module này sử dụng **Google Gemini 2.5 Flash Lite** làm LLM chính, kết hợp kỹ thuật **Function Calling** để trích xuất dữ liệu có cấu trúc từ ngôn ngữ tự nhiên của người dùng.

### Kiến trúc thành phần

Thành phần `ai.service.ts` đóng vai trò facade chính, tiếp nhận request từ `ai.controller.ts` và ủy quyền cho `ai-chat-router.service.ts` để phân loại intent và điều hướng đến các service chuyên biệt tương ứng.

Thành phần `ai-chat-router.service.ts` là bộ định tuyến trung tâm, phân loại tin nhắn người dùng và chuyển tiếp đến service phù hợp dựa trên các quy tắc intent detection (prefix matching, keyword matching).

Thành phần `ai-gemini-client.service.ts` là client wrapper cho Google Gemini AI API, hỗ trợ hai chế độ gọi: `generateContent` (text generation thông thường) và `generateToolContent` (Function Calling với schema có cấu trúc).

Thành phần `ai-transaction-chat.service.ts` xử lý các yêu cầu liên quan đến giao dịch, bao gồm: ghi nhận thu chi từ tin nhắn tự nhiên (sử dụng Function Calling với tool `record_transaction`), truy vấn lịch sử giao dịch (tool `query_transactions`), và xử lý kết quả quét hóa đơn OCR.

Thành phần `ai-saving-goal-chat.service.ts` xử lý các yêu cầu về mục tiêu tiết kiệm, bao gồm: đề xuất mục tiêu mới (tool `propose_saving_goal`), xác nhận tạo mục tiêu (`/confirm_saving_goal`), thay đổi thời hạn (`/change_saving_goal_duration`), và khởi tạo quỹ (`/saving_goal_init_fund`).

Thành phần `ai-analysis-chat.service.ts` phân tích sức khỏe tài chính tổng thể bằng cách kết hợp dữ liệu insight với Gemini AI để tạo báo cáo phân tích và đề xuất kế hoạch ngân sách.

Thành phần `ai-scenario-what-if-chat.service.ts` xử lý các câu hỏi giả định "what-if" (ví dụ: "nếu mua điện thoại 10 triệu thì sao?"), sử dụng Function Calling (tool `parse_what_if_scenario`) để trích xuất tham số kịch bản và gọi `ScenarioPlanningModule` để mô phỏng.

Thành phần `ai-budget-recommendation-chat.service.ts` tạo khuyến nghị ngân sách cá nhân hóa, tổng hợp kết quả từ Analytics Microservice để đưa ra gợi ý điều chỉnh hạn mức chi tiêu theo danh mục.

Thành phần `ai-goal-achievement-chat.service.ts` phân tích tiến độ đạt mục tiêu tiết kiệm, so sánh tốc độ tích lũy thực tế với kế hoạch, và đưa ra insight về khả năng hoàn thành sớm/trễ.

Thành phần `ai-goal-plan-insight.service.ts` tạo báo cáo phân tích chi tiết về tiến độ kế hoạch chi tiêu liên quan đến mục tiêu tiết kiệm, sử dụng Gemini AI để viết nhận xét tự nhiên dựa trên dữ liệu số học đã tính toán.

Thành phần `receipt-ocr.service.ts` xử lý quét hóa đơn từ ảnh chụp, nhận text OCR từ Flutter (Google MLKit) và sử dụng Gemini AI để trích xuất thông tin có cấu trúc (tên cửa hàng, tổng tiền, danh sách món hàng, danh mục).

Thành phần `financial-insights.service.ts` là service tổng hợp dữ liệu tài chính, thu thập và tính toán các chỉ số (tổng thu/chi, top danh mục, so sánh kỳ trước) từ database, hỗ trợ caching với TTL 180 giây.

Ngoài ra, `gemini-tools.config.ts` định nghĩa toàn bộ schema cho Function Calling tools và prompt templates, bao gồm: `record_transaction`, `query_transactions`, `propose_saving_goal`, `parse_what_if_scenario`.

| Thành phần | Trách nhiệm |
|---|---|
| `ai.service.ts` | Facade chính, điểm vào của AI module |
| `ai-chat-router.service.ts` | Bộ định tuyến intent, phân loại và chuyển tiếp tin nhắn |
| `ai-gemini-client.service.ts` | Client wrapper cho Google Gemini AI API |
| `ai-transaction-chat.service.ts` | Ghi nhận giao dịch và truy vấn lịch sử qua chat |
| `ai-saving-goal-chat.service.ts` | Đề xuất và quản lý mục tiêu tiết kiệm qua chat |
| `ai-analysis-chat.service.ts` | Phân tích sức khỏe tài chính tổng thể |
| `ai-scenario-what-if-chat.service.ts` | Mô phỏng kịch bản tài chính giả định |
| `ai-budget-recommendation-chat.service.ts` | Khuyến nghị ngân sách cá nhân hóa |
| `ai-goal-achievement-chat.service.ts` | Phân tích tiến độ đạt mục tiêu tiết kiệm |
| `ai-goal-plan-insight.service.ts` | Báo cáo insight kế hoạch chi tiêu |
| `receipt-ocr.service.ts` | Quét và trích xuất thông tin hóa đơn |
| `financial-insights.service.ts` | Tổng hợp dữ liệu tài chính với caching |
| `gemini-tools.config.ts` | Schema Function Calling tools và prompt templates |
| `chatbot-expense-analysis.mapper.ts` | Mapper chuyển đổi dữ liệu phân tích chi tiêu |

### Công nghệ sử dụng

| Thành phần | Công nghệ | Phiên bản |
|---|---|---|
| LLM Provider | Google Gemini AI | `@google/genai` |
| Model mặc định | `gemini-2.5-flash-lite` | — |
| Kỹ thuật AI | Function Calling (Structured Output) | — |
| Framework | NestJS | v11 |
| Caching | Redis + In-Memory Fallback | — |

### API Endpoints

| Endpoint | Method | Mô tả |
|---|---|---|
| `/ai/chat` | POST | Chatbot tài chính tổng hợp (tự động route theo intent) |
| `/ai/goal-plan-insight` | POST | Phân tích insight kế hoạch mục tiêu tiết kiệm |
| `/ai/receipt/scan` | POST | Quét hóa đơn từ text OCR |

---

## Tầng 2: Analytics Microservice (Python FastAPI)

### Mô tả chung

Analytics Microservice là microservice độc lập, triển khai bằng Python FastAPI, chuyên xử lý các tính toán ML/thống kê nặng mà không phù hợp chạy trong NestJS. Service này được deploy dưới dạng Docker container riêng biệt và giao tiếp với Backend thông qua HTTP API được bảo vệ bằng `X-API-Key` header.

### Kiến trúc thành phần

Thành phần `main.py` là điểm vào của FastAPI application, đăng ký tất cả API endpoints, middleware bảo mật `X-API-Key`, và health check.

Thành phần `schemas.py` định nghĩa toàn bộ cấu trúc Request/Response bằng Pydantic BaseModel, bao gồm: `AnalyzeRequest`, `AnalyzeResponse`, `CoupleAnalyzeRequest`, `CoupleAnalyzeResponse`, `RecurringDetectRequest`, `RecurringDetectResponse`, `TrainForecastingRequest`, `TrainForecastingResponse`.

Thành phần `algorithms.py` triển khai các thuật toán ML cốt lõi: Moving Average Forecast (dự báo trung bình trượt), Linear Regression Forecast (dự báo hồi quy tuyến tính), Gradient Boosting category-level forecasting (dự báo theo danh mục), và Z-score Anomaly Detection (phát hiện bất thường).

Thành phần `rules.py` chứa hệ thống luật đánh giá sức khỏe tài chính, phân tích dòng tiền, tạo cảnh báo ngân sách, và dự báo tiến độ mục tiêu tiết kiệm — tất cả bằng tiếng Việt.

Thành phần `forecasting_service.py` là service dự báo chi tiêu phức tạp nhất (~1070 dòng), triển khai mô hình hybrid đa tầng: (1) Phân loại giao dịch theo hành vi chi tiêu (variable/scheduled/irregular), (2) Tính baseline tháng hoàn chỉnh, (3) Cascade model: Prophet → Gradient Boosting → Moving Average fallback, (4) Hỗ trợ model artifact đã train sẵn, (5) Dự báo theo danh mục với risk level.

Thành phần `budgeting_service.py` tạo đề xuất ngân sách cá nhân hóa (~767 dòng), bao gồm: Personalized Budget Optimizer v2, phân loại elasticity danh mục (low/medium/high), tích hợp feedback người dùng, tính toán xác suất vượt ngân sách, và bảo vệ chi phí cố định (recurring floor).

Thành phần `recurring_service.py` phát hiện giao dịch định kỳ (~419 dòng) sử dụng pipeline hybrid: (1) Preprocessing: chuẩn hóa tiếng Việt, loại bỏ dấu, (2) DBSCAN clustering: nhóm giao dịch tương tự, (3) Rule-based frequency detection: monthly/weekly/bi_weekly, (4) Confidence scoring: 40% amount consistency + 40% timing consistency + 20% occurrence factor.

Thành phần `couple_service.py` phân tích tài chính cho cặp đôi, bao gồm: xây dựng profile chung, dự báo chi tiêu, và tính tỷ lệ đóng góp của từng thành viên.

Thành phần `habit_detection_service.py` phát hiện thói quen chi tiêu và đề xuất điều chỉnh, phân tích tần suất và mức chi tiêu theo danh mục để gợi ý cắt giảm.

Thành phần `model_artifact_service.py` quản lý model artifacts (lưu/tải model Gradient Boosting đã train), hỗ trợ inference nhanh mà không cần re-train.

Thành phần `forecasting_trainer.py` training pipeline cho Gradient Boosting model, nhận dữ liệu giao dịch và tạo model artifact có thể tái sử dụng.

Thành phần `registry.py` đăng ký metadata của các AI model (model ID, version, description) phục vụ truy xuất và đánh giá.

Thành phần `date_utils.py` tiện ích xử lý ngày tháng theo múi giờ Việt Nam (Asia/Ho_Chi_Minh).

| Thành phần | Trách nhiệm |
|---|---|
| `main.py` | Điểm vào FastAPI, đăng ký endpoints và middleware |
| `schemas.py` | Định nghĩa cấu trúc Request/Response (Pydantic) |
| `algorithms.py` | Thuật toán ML cốt lõi (MA, LR, GB, Z-score) |
| `rules.py` | Hệ thống luật đánh giá sức khỏe tài chính |
| `forecasting_service.py` | Dự báo chi tiêu hybrid đa tầng |
| `budgeting_service.py` | Đề xuất ngân sách cá nhân hóa |
| `recurring_service.py` | Phát hiện giao dịch định kỳ (DBSCAN + rules) |
| `couple_service.py` | Phân tích tài chính cặp đôi |
| `habit_detection_service.py` | Phát hiện thói quen chi tiêu |
| `model_artifact_service.py` | Quản lý model artifacts |
| `forecasting_trainer.py` | Training pipeline cho forecasting model |
| `registry.py` | Model registry và metadata |
| `date_utils.py` | Tiện ích xử lý ngày giờ Việt Nam |

### Công nghệ sử dụng

| Thành phần | Công nghệ | Phiên bản |
|---|---|---|
| Core Framework | FastAPI + Uvicorn | ≥0.100.0 |
| Data Validation | Pydantic | ≥2.0.0 |
| Data Processing | Pandas + NumPy | ≥2.0.0 / ≥1.24.0 |
| Machine Learning | Scikit-learn (Gradient Boosting, Linear Regression, DBSCAN, TF-IDF) | ≥1.2.0 |
| Time Series | Prophet (Facebook) | ≥1.1.5 |
| Deployment | Docker (python:3.10-slim) | — |
| Hosting | Railway (cloud) | — |

### API Endpoints

| Endpoint | Method | Mô tả |
|---|---|---|
| `/health` | GET | Health check |
| `/v1/models/registry` | GET | Danh sách model đã đăng ký |
| `/v1/models/train/forecasting` | POST | Train forecasting model cho user |
| `/v1/models/train/couple-forecasting` | POST | Train forecasting model cho couple |
| `/v1/financial/analyze` | POST | Phân tích tài chính tổng hợp (forecast + budget + anomaly) |
| `/v1/couple/analyze` | POST | Phân tích tài chính cặp đôi |
| `/v1/financial/recurring-detect` | POST | Phát hiện giao dịch định kỳ |

---

## Các Thuật Toán AI/ML Được Sử Dụng

### 1. Expense Forecasting (Dự báo chi tiêu)

Hệ thống sử dụng mô hình cascade với cơ chế fallback tự động:

| Ưu tiên | Phương pháp | Điều kiện | Mô tả |
|---|---|---|---|
| 1 | Trained Artifact | Có model artifact đã lưu | Gradient Boosting đã train offline, inference nhanh |
| 2 | Prophet | ≥14 ngày dữ liệu, có Prophet | Time series với xu hướng ngày + mùa vụ tuần |
| 3 | Gradient Boosting | ≥14 ngày dữ liệu | Học mẫu chi tiêu phi tuyến theo features: day_index, day_of_week, day_of_month, month, is_weekend |
| 4 | Moving Average | <14 ngày dữ liệu | Trung bình trượt 7 ngày gần nhất |
| 5 | Fallback Average | <5 ngày hoặc không có dữ liệu | Ước tính từ profile (70% thu nhập / 30 ngày) |

Mô hình hybrid tháng hoàn chỉnh phân loại giao dịch theo 3 nhóm hành vi:
- **Variable** (biến đổi): Ăn uống, mua sắm, giải trí — dự báo bằng ML model
- **Scheduled** (định kỳ): Hóa đơn, nhà cửa, học tập — dùng median baseline
- **Irregular** (bất thường): Sức khỏe, du lịch, từ thiện — giữ nguyên actual

### 2. AI Budget Recommendation (Đề xuất ngân sách)

Sử dụng Personalized Budget Optimizer v2 với các yếu tố:

- **Category Elasticity**: Phân loại danh mục theo mức linh hoạt (low/medium/high)
- **Feedback Loop**: Tích hợp phản hồi người dùng (accepted/rejected/modified) để điều chỉnh
- **Savings Optimization**: Tối ưu hóa ngân sách để đạt mục tiêu tiết kiệm
- **Risk Assessment**: Tính xác suất vượt ngân sách cho từng danh mục
- **Recurring Floor Protection**: Bảo vệ chi phí cố định không bị cắt dưới mức confirmed recurring

### 3. Recurring Transaction Detection (Phát hiện giao dịch định kỳ)

Pipeline hybrid DBSCAN + Rule-based:

| Bước | Phương pháp | Mô tả |
|---|---|---|
| 1 | Text Preprocessing | Chuẩn hóa tiếng Việt, loại dấu, synonym mapping |
| 2 | Feature Engineering | TF-IDF(note) + StandardScaler(amount) + day_of_month + category_encoded |
| 3 | DBSCAN Clustering | eps=0.6, min_samples=2, cosine metric |
| 4 | Frequency Detection | Rule-based: monthly (25-35 ngày) / bi_weekly (12-16 ngày) / weekly (5-9 ngày) |
| 5 | Confidence Scoring | 40% amount consistency + 40% timing consistency + 20% occurrence factor |

### 4. Anomaly Detection (Phát hiện bất thường)

Sử dụng Z-score theo danh mục (category-wise Z-score) với threshold = 2.5. Yêu cầu tối thiểu 5 giao dịch trong cùng danh mục để phát hiện.

### 5. Financial Health Scoring (Đánh giá sức khỏe tài chính)

Hệ thống luật (rule-based) đánh giá dựa trên:
- Tỷ lệ tiết kiệm (savings rate)
- Xu hướng dòng tiền (cash flow trend)
- Rủi ro ngân sách theo danh mục
- Tiến độ mục tiêu tiết kiệm

### 6. Gemini Function Calling (Trích xuất dữ liệu có cấu trúc)

Sử dụng `FunctionCallingConfigMode.ANY` với 4 tool schemas chính:

| Tool | Mục đích | Output Fields chính |
|---|---|---|
| `record_transaction` | Ghi nhận giao dịch từ tin nhắn | amount, type, category_name, sub_category_name, description, time, wallet_name |
| `query_transactions` | Truy vấn lịch sử giao dịch | type, startDate, endDate, category_name, limit |
| `propose_saving_goal` | Đề xuất mục tiêu tiết kiệm | name, target, months_estimate, requested_months, requested_days |
| `parse_what_if_scenario` | Trích xuất kịch bản giả định | scenarioType, amount, categoryName, itemName, incomeDropPct, frequencies |

---

## Luồng Dữ Liệu Chính

### Luồng 1: Chat AI tài chính

```
Flutter App → POST /ai/chat (message, userId)
    → AiController → AiService → AiChatRouterService
        → [Intent Detection] → Route đến service chuyên biệt
            → Gemini AI (Function Calling) → Trích xuất dữ liệu
            → Xử lý business logic (query DB, tạo giao dịch, tạo mục tiêu...)
    ← JSON Response (text + structured data)
```

### Luồng 2: Phân tích tài chính tổng hợp

```
NestJS Backend (Cron/User trigger)
    → Thu thập giao dịch + spending plan + saving goals + personal profile
    → POST /v1/financial/analyze (HTTP, X-API-Key)
        → Analytics Microservice (FastAPI)
            → Forecasting Service (cascade: Prophet/GB/MA)
            → Budgeting Service (personalized optimizer)
            → Anomaly Detection (Z-score)
            → Rules Engine (health score + insights)
        ← AnalyzeResponse (forecasting, ai_budgeting, anomalies, insights)
    → Lưu vào monthly_analytics_snapshots + ai_prediction_runs
    ← Push insights qua Notification/WebSocket
```

### Luồng 3: Phát hiện giao dịch định kỳ

```
NestJS Backend (User trigger)
    → Thu thập giao dịch 3-6 tháng gần nhất
    → POST /v1/financial/recurring-detect (HTTP, X-API-Key)
        → Analytics Microservice
            → Recurring Service (DBSCAN + rule-based)
        ← RecurringDetectResponse (recurring_items, total_monthly)
    → Lưu vào recurring_transactions table
    ← Hiển thị cho user xác nhận/dismiss
```

### Luồng 4: Quét hóa đơn

```
Flutter App → Chụp ảnh hóa đơn
    → Google MLKit OCR (on-device) → Trích xuất text + lines
    → POST /ai/receipt/scan (ocrText, ocrLines, userId)
        → ReceiptOcrService → Gemini AI (text parsing)
    ← ScanReceiptResponse (merchant, total, items, category)
    → User xác nhận → Tạo transaction(s)
```

---

## Triển Khai (Deployment)

### AI Chatbot Layer
- Được tích hợp trực tiếp trong NestJS Backend, deploy cùng một container/instance.
- Yêu cầu biến môi trường: `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL` (optional), `GEMINI_PARSE_MODEL` (optional), `GEMINI_ANALYSIS_MODEL` (optional).

### Analytics Microservice
- Deploy dưới dạng Docker container độc lập (`python:3.10-slim`).
- Chạy trên cổng 8000 bằng Uvicorn.
- Hỗ trợ deploy lên Railway với cấu hình Root Directory là `analytics-service`.
- Yêu cầu biến môi trường: `ANALYTICS_API_KEY` (bắt buộc cho production), `APP_ENV` (optional), `ANALYTICS_ALLOW_INSECURE_LOCAL` (optional cho dev).

```dockerfile
FROM python:3.10-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Thống Kê Tổng Hợp

| Metric | Giá trị |
|---|---|
| Tổng số service components (NestJS AI Layer) | 14 |
| Tổng số service components (Analytics Microservice) | 13 |
| AI/ML models sử dụng | 5 (Prophet, Gradient Boosting, Linear Regression, DBSCAN, Z-score) |
| LLM Provider | Google Gemini (gemini-2.5-flash-lite) |
| Function Calling tools | 4 (record_transaction, query_transactions, propose_saving_goal, parse_what_if_scenario) |
| Chat intent handlers | 7 (transaction, saving_goal, analysis, scenario, budget_recommendation, goal_achievement, receipt_ocr) |
| Analytics API endpoints | 7 |
| Tổng dòng code AI module (NestJS) | ~180,000+ bytes |
| Tổng dòng code Analytics service (Python) | ~160,000+ bytes |
| Deployment method | Docker container (Analytics) + Integrated module (AI Chatbot) |

---

> **Tài liệu này được tạo từ source code thực tế của dự án MNCARE.**
> Mọi thay đổi trong AI module hoặc Analytics service cần cập nhật lại tài liệu này.
