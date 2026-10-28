# Kiến trúc Ứng dụng Quản lý Thu Chi Phòng Khám Bách Bảo (pkbbtinhtien)

Tài liệu này ghi chú lại toàn bộ cấu trúc mã nguồn, cơ sở dữ liệu và quy trình triển khai của ứng dụng `pkbbtinhtien`, giúp dễ dàng nắm bắt khi cần bảo trì hoặc nâng cấp sau này.

## 1. Tổng quan Công nghệ
- **Framework:** React (viết dưới dạng functional components với Hooks), chạy trực tiếp trên trình duyệt thông qua thẻ `<script type="text/babel">`.
- **Giao diện:** Tailwind CSS (load qua CDN).
- **Cơ sở dữ liệu:** Firebase Realtime Database (phiên bản Web Compat 10.8.0).
- **Export Excel:** Thư viện `xlsx` (SheetJS).
- **Hosting:** GitHub Pages.
- **Cấu trúc tệp:** 100% logic, giao diện, CSS đều được gom vào duy nhất một tệp HTML (`index.html`).

## 2. Quy trình Cập nhật và Triển khai (Deployment)
- **Thư mục làm việc (Dev):** `f:\Luan van ck2\pkbb_hosting\index.html`
- **Thư mục triển khai (Prod):** `f:\Luan van ck2\pkbbtinhtien_deploy\`
- **Quy trình:**
  1. Chỉnh sửa code trong tệp `pkbb_hosting/index.html`.
  2. Copy đè tệp `index.html` sang thư mục `pkbbtinhtien_deploy`.
  3. Dùng Git add, commit và push lên nhánh `main` của repo GitHub `kieuviettienhung-coder/pkbbtinhtien`.
  4. Github Pages sẽ tự động cập nhật web tại địa chỉ: `https://kieuviettienhung-coder.github.io/pkbbtinhtien/`

## 3. Cấu trúc Firebase Realtime Database
Ứng dụng sử dụng cấu trúc Firebase với các node chính sau:

- `settings_v2/`
  - `adminPassword`, `adminNgaBayPassword`, `ngaBayPassword`, `thotNotPassword`: Mật khẩu của các phân quyền.
  - `medicineList`: Mảng chứa danh mục thuốc và giá bán mặc định (dùng để tra cứu nhanh).
  - `customPrices/{branch}`: Các mức giá khám tùy chỉnh mà người dùng tự thêm (khác với `DEFAULT_PRICE_LEVELS`).

- `passwords_v2/`
  - (Cấu trúc tương tự settings_v2, dùng cho tính năng Đổi mật khẩu)

- `daily_v2/{branch}/{dateKey}` (VD: `daily_v2/thot-not/20261005`)
  - Node lưu dữ liệu thu chi hàng ngày của chi nhánh. 
  - Gồm: `examinations` (số lượng ca mỗi mức giá), `patientDetails` (danh sách tên bé và STT toa theo mức giá), `doctorFees`, `expenses`, `medicines`.

- `printLogs_v2/{branch}/{dateKey}` (VD: `printLogs_v2/nga-bay/20261028`)
  - Node lưu toàn bộ lịch sử các lần bấm in bill nhiệt (K80 / K58). Mỗi lần bấm in là một push-entry độc lập kèm `prescriptionNo`, `name`, `price`, `paymentMethod`, `branch`, `date`, `printedAt`, `printedTime`, `timestamp`, `note`, `paperSize`.
  - Lưu trữ bất biến (append-only) giúp theo dõi chính xác từng lượt in và phát hiện bill nào bị in nhiều lần (in trùng / in lại).

- `monthlyMedicines/{branch}/{monthKey}`
  - Dữ liệu tiền thuốc lưu theo tháng.

## 4. Các Thành phần Giao diện chính (React Components)

### `App`
- Quản lý toàn bộ state chính: `user`, `userRole`, `selectedBranch`, `selectedDate`, `dailyData`.
- Xử lý màn hình Đăng nhập (phân 4 quyền: Admin Toàn quyền, Admin Ngã Bảy, NV Ngã Bảy, NV Thốt Nốt):
  - Hỗ trợ form nhập mật khẩu trực tiếp trên giao diện (`<input type="password">`) kèm nút ẩn/hiện mật khẩu và nút submit bằng phím Enter, không phụ thuộc vào popup `window.prompt` (tránh bị chặn trên iOS Safari/Zalo webview).
  - Tích hợp `sessionStorage` (`pkbb_auth_session`) giúp giữ phiên đăng nhập khi tải lại trang hoặc khi chuyển đổi ứng dụng trên điện thoại di động.
  - Tích hợp `ErrorBoundary` cấp cao nhất bao bọc `<App />`, giúp ứng dụng luôn hiển thị thông báo lỗi thân thiện kèm nút xóa cache & tải lại nếu có ngoại lệ bất ngờ xảy ra, triệt tiêu hoàn toàn lỗi màn hình trắng.
- Kết nối Firebase Realtime Database thông qua `useEffect`, tự động fetch `dailyData` khi thay đổi ngày/chi nhánh.
- Xử lý gửi báo cáo qua Telegram API (`buildDailyReport` -> `sendTelegram`).

### `ExaminationSection` (Tiền khám bệnh - Nhập thẳng số tiền theo từng toa)
- **Phương thức nhập trực tiếp thống nhất (Direct Prescription Entry):**
  - Không còn chia thành 24 ô mức giá rời rạc (40k, 50k, 60k...) gây khó khăn khi nhập liệu.
  - Thay vào đó là **Bảng danh sách toa khám trực quan**:
    - **STT Toa:** Tự động tăng liên tục (`Toa 1`, `Toa 2`, `Toa 3`...). Có cảnh báo viền đỏ + huy hiệu `⚠️ Trùng` nếu nhập trùng số toa.
    - **Tên bé / Bệnh nhân:** Ô nhập nhanh (tùy chọn).
    - **Số tiền khám (k):** Cho phép nhập thẳng bất kỳ số tiền nào (ví dụ: `70`, `100`, `120`, `85`, `0`...). Đồng thời tích hợp dãy phím chọn nhanh mức giá phổ biến (`70k`, `80k`, `100k`, `120k`, `150k`, `0k`...) để nhân viên bấm 1 click là xong.
    - **Hình thức thanh toán:** Nút bấm trực quan `💵 TM` (mặc định) và `💳 CK`.
    - **Phím tắt Enter:** Nhấn Enter ở ô giá hoặc ô tên sẽ tự động thêm toa mới và focus con trỏ chuột vào dòng kế tiếp, giúp gõ liên tục bằng bàn phím siêu nhanh.
    - **Nút thêm nhanh:** Hỗ trợ nút `➕ Thêm toa khám` và `⚡ +5 toa` liên tiếp.
    - **Sắp xếp theo STT linh hoạt & Tự nhiên:**
      - Hàm so sánh tự nhiên `comparePrescriptionStt`: sắp xếp chuẩn xác theo số tự nhiên (1, 2, 3... 10, 20...) thay vì sắp xếp dạng chữ thuần túy (1, 10, 2).
      - **Nút `🔢 Sắp xếp theo STT`:** Nằm ngay trên thanh công cụ đầu bảng, cho phép 1-click sắp xếp lại toàn bộ danh sách toa theo thứ tự STT tăng dần và lưu vĩnh viễn vào Firebase.
      - **Bộ chọn chiều sắp xếp nhanh:** Chuyển đổi linh hoạt giữa `🔢 STT ↑ (1→N)`, `🔢 STT ↓ (N→1)` và `⏱️ Mới nhập`.
      - **Click tiêu đề cột `STT Toa`:** Cho phép click trực tiếp vào header của bảng để đảo chiều tăng dần/giảm dần nhanh chóng.
      - Hỗ trợ hiển thị sắp xếp đồng bộ trên cả giao diện Bảng (Desktop) và giao diện Thẻ rút gọn (Mobile Card view).
    - **Bộ lọc & Tìm kiếm:** Lọc theo `Tất cả`, `💵 Tiền mặt`, `💳 Chuyển khoản`, `0đ` và tìm kiếm nhanh theo số toa / tên bé.
    - **Xem phân bổ mức giá:** Nút `📊 Xem mức giá` mở rộng bảng thống kê số ca theo từng mức giá để đối chiếu kế toán.
- **Tương thích ngược 100% (Bidirectional Backward Compatibility):**
  - Hàm `convertOldDataToPrescriptions`: Khi mở ngày cũ trong quá khứ, tự động chuyển đổi dữ liệu từ cấu trúc `examinations` và `patientDetails` cũ sang mảng toa thống nhất, đảm bảo lịch sử hiển thị đầy đủ 100% mà không bị mất dữ liệu.
  - Hàm `convertPrescriptionsToOldFormat`: Khi nhân viên lưu hoặc chỉnh sửa toa mới, hệ thống tự động sinh ngược lại `examinations` và `patientDetails`.
  - **Kết quả:** Các module **Báo cáo tháng (`ReportView`)**, **Báo cáo năm (`YearlyReportView`)**, **Báo cáo Telegram**, **Kiểm tra STT toa** và **Xuất Excel** hoạt động chuẩn xác 100% mà không bị gián đoạn hay sai lệch số liệu.
- **Tách Tiền mặt & Chuyển khoản ở phần Còn lại cuối ngày:**
  - `netCash = examCash - doctor - expense - medicine`: Số tiền mặt thực tế còn lại trong két sau khi đã chi trả lương bác sĩ, chi phí và tiền thuốc.
  - `netTransfer = examTransfer`: Toàn bộ số tiền khám qua chuyển khoản ngân hàng.
  - Đảm bảo công thức kế toán luôn cân bằng tuyệt đối: `netCash + netTransfer = branchOwnNet` (+ `transferredMedicine` đối với Thốt Nốt).

### `PrescriptionSequenceModal` (Hộp thoại Tra cứu & Kiểm tra STT toa)
- Phân tích dãy số thứ tự từ toa 1 (hoặc số nhỏ nhất) đến số lớn nhất.
- Liệt kê trực quan các số thứ tự toa bị nhảy (thiếu) dạng thẻ nổi bật, kèm nút sao chép danh sách số thiếu.
- Chế độ xem dãy số tuần tự (Timeline): phân biệt rõ số đã nhập (kèm tên bé, mức giá, hình thức thanh toán) và các vị trí bị nhảy số.
- **Bộ lọc nâng cao:**
  - Lọc theo tình trạng số (Tất cả, Chỉ số bị nhảy, Chỉ số đã có).
  - **Lọc theo hình thức thanh toán:** Mọi thanh toán, `💳 Chỉ Chuyển khoản`, `💵 Chỉ Tiền mặt`.
  - Lọc theo mức giá khám và ô tìm kiếm nhanh (theo tên hoặc số toa).
- **Thống kê thanh toán:** Hiển thị số lượng toa `💵 TM` và `💳 CK` trực quan ngay trong thẻ thông kê đầu modal, badge nổi bật trên từng dòng bệnh nhân.
- Nút bấm chuyển trực tiếp sang modal mức giá tương ứng để chỉnh sửa nhanh.

### `Thiết kế Giao diện Tiền mặt (TM) & Chuyển khoản (CK)`
- Định dạng huy hiệu (Badges) nổi bật, chữ to rõ, tương phản cao trên toàn hệ thống:
  - `💵 Tiền mặt (TM)`: Tông xanh lá (Emerald) viền rõ ràng.
  - `💳 Chuyển khoản (CK)`: Tông tím (Purple) viền rõ ràng.
- Áp dụng đồng bộ tại: Modal danh sách toa thuốc, Hộp thoại kiểm tra STT toa, Thẻ tổng kết ngày, Báo cáo tháng (Summary & Table), Báo cáo năm (Summary & Table).

### `DoctorFeesSection`, `ExpensesSection`, `MedicineSection`
- Các module nhập liệu dạng mảng: Lương bác sĩ, Chi phí, Tiền thuốc. Tính năng thêm dòng mới, xóa dòng, chỉnh sửa trực tiếp.

### `ReportView` & `YearlyReportView`
- Query dữ liệu Firebase theo khoảng thời gian (theo tháng hoặc cả năm).
- Tổng hợp và tính toán tổng thu, chi, lãi ròng, và đếm số lượng ca (kể cả 0đ).
- **Tách Tiền mặt (TM) & Chuyển khoản (CK):** Tự động phân tách doanh thu Tiền khám và số tiền Còn lại thành `💵 TM` và `💳 CK` trên cả thẻ tóm tắt (Summary Cards), bảng chi tiết theo ngày/tháng, và các cột trong file Excel xuất ra (`Khám TM`, `Khám CK`, `Còn lại TM`, `Còn lại CK`).
- **💊 Bảng tổng hợp số lượng các loại thuốc đã bán (Ngã Bảy & Thốt Nốt):**
  - Tự động gom nhóm toàn bộ thuốc đã bán theo tên loại thuốc: tính tổng số lượng bán, đơn giá, tổng thành tiền và số ngày phát sinh bán.
  - **🔍 Xem chi tiết ngày bán & số lượng cụ thể:**
    - Người dùng có thể click trực tiếp vào dòng của bất kỳ loại thuốc nào (hoặc click vào nút `📅 X ngày ▼`) để mở rộng danh sách chi tiết các ngày bán.
    - Hiển thị dạng thẻ (Cards) trực quan liệt kê từng ngày cụ thể, số lượng thuốc bán trong ngày đó, đơn giá và doanh thu tương ứng của ngày.
    - Hỗ trợ cho cả Báo cáo tháng (`ReportView`) và Báo cáo năm (`YearlyReportView` có thanh cuộn mượt mà).
  - Phục vụ kiểm tra số lượng thuốc Thốt Nốt chuyển xuống Ngã Bảy đã bán được bao nhiêu (tab chuyển đổi giữa `📦 Thuốc bán cho Ngã Bảy` và `💊 Thuốc tại Thốt Nốt`).
  - Thanh tìm kiếm thuốc nhanh, sắp xếp theo số lượng bán nhiều nhất, kèm các thẻ thống kê tổng số loại thuốc, tổng số lượng đơn vị và tổng doanh thu thuốc.
  - Tích hợp xuất bảng tổng hợp số lượng thuốc vào file Excel (`Tổng hợp thuốc NB` / `Tổng hợp thuốc`) cho cả báo cáo tháng và báo cáo năm, kèm cột `Chi tiết các ngày bán (Ngày: Số lượng)`.
- Chức năng xuất dữ liệu ra file Excel đa sheet.
- **📅 Báo cáo tùy chọn nhiều tháng linh hoạt (`ReportView`):**
  - Cho phép người dùng chọn xem báo cáo theo một hoặc nhiều tháng bất kỳ trong năm được chọn:
    - 12 nút bấm tháng (`T01` - `T12`) dạng toggle linh hoạt, cho phép chọn bất kỳ tổ hợp tháng nào (VD: T08, T09, T10).
    - Các nút chọn nhanh tiện lợi: `Tháng này`, `Quý 1 (T1-3)`, `Quý 2 (T4-6)`, `Quý 3 (T7-9)`, `Quý 4 (T10-12)`, `6T đầu (T1-6)`, `6T cuối (T7-12)`, `Cả năm (12T)`.
    - Khoảng tháng tùy chọn: `Từ tháng X đến tháng Y` với nút `Áp dụng`.
  - **Tối ưu truy vấn dữ liệu:** Sử dụng `Promise.all` song song truy vấn Firebase Realtime Database theo dải khóa ngày `.startAt(mKey + '01').endAt(mKey + '31')` cho từng tháng được chọn, tốc độ phản hồi cực nhanh (~100ms) và tiết kiệm băng thông.
  - **📊 Bảng đối chiếu so sánh từng tháng (Month-by-Month Comparison):** Tự động hiển thị khi chọn từ 2 tháng trở lên, đối chiếu trực quan doanh thu khám bệnh (TM/CK), số ca khám, lương bác sĩ, chi phí, tiền thuốc và kết quả còn lại (TM/CK) giữa các tháng và tổng cộng giai đoạn.
  - **Dòng phân cách tháng:** Bảng chi tiết từng ngày tự động chèn dòng phân cách giữa các tháng để dễ dàng quan sát.
  - **Tự động đồng bộ:** Thẻ tổng hợp tiền thuốc đã bán, tóm tắt thu chi và file Excel xuất ra tự động cập nhật tiêu đề và nội dung theo các tháng được chọn (VD: `BaoCao_thot-not_T08-T09-T10_2026.xlsx`).

### `Điều chuyển Tiền thuốc Liên chi nhánh (Ngã Bảy -> Thốt Nốt)`
- **Bối cảnh nghiệp vụ:** Thuốc tại chi nhánh Ngã Bảy là thuốc do Thốt Nốt chuyển xuống. Do đó, khi Ngã Bảy nhập tiền thuốc bán ra, khoản doanh thu tiền thuốc này sẽ được cộng trực tiếp vào thu nhập (`Còn lại`) của Thốt Nốt.
- **Quy tắc tính toán:**
  - **Ngã Bảy:** `Còn lại = Tiền khám - Lương BS - Chi phí - Tiền thuốc` (Tiền thuốc bị trừ ra để chuyển về Thốt Nốt).
  - **Thốt Nốt:** `Còn lại = (Tiền khám - Lương BS - Chi phí - Tiền thuốc tại chỗ) + Tiền thuốc nhận từ Ngã Bảy`.
  - **Toàn hệ thống (Telegram):** Khoản chuyển bù trừ cho nhau, bảo toàn đúng tổng thu nhập của cả 2 cơ sở.
- **Phạm vi hiển thị & áp dụng:**
  - `Tổng kết ngày`: Thốt Nốt tự động đồng bộ thời gian thực tiền thuốc Ngã Bảy và cộng vào ô `💵 Còn lại`.
  - `Báo cáo Telegram`: Thêm mục `📦 Thuốc nhận từ Ngã Bảy: +Xk` (Thốt Nốt) và chú thích `💊 Tiền thuốc (chuyển về Thốt Nốt)` (Ngã Bảy).
  - `Báo cáo Tháng (ReportView)`: Thêm thẻ tóm tắt và cột `📦 Thuốc nhận từ NB` trong bảng cũng như xuất file Excel.
  - `Báo cáo Năm (YearlyReportView)`: Tự động tổng hợp tiền thuốc Ngã Bảy theo từng tháng, cộng vào lãi Thốt Nốt và xuất file Excel tương ứng.

### `MedicineManagement`
- Module dành riêng cho Admin để thiết lập Danh mục thuốc và giá thuốc mặc định (sẽ được tải vào `MedicineSection` qua danh sách xổ xuống).

### `BillPrintModal` (Hộp thoại In Bill Nhiệt K80/K58)
- Hỗ trợ in hóa đơn tính tiền nhiệt trực tiếp từ trình duyệt cho máy in nhiệt (khổ 80mm và 58mm).
- Tích hợp số điện thoại Hotline `0939 994 992` và lời nhắc khách hàng `(Quý khách lưu ý chỉ thanh toán đúng số tiền trong bill)`.
- Khi bấm `Bấm In Bill`, hệ thống tự động ghi nhật ký (audit log) lên Firebase node `printLogs_v2/{branch}/{dateKey}` để tài khoản Admin theo dõi và phát hiện các bill in nhiều lần.

### `PrintSummaryReportView` (Tổng Hợp & Giám Sát Bill In Trong Ngày - Tài khoản Admin)
- Dành riêng cho tài khoản Admin (nút điều hướng `🖨️ Tổng hợp bill in` trên thanh menu chính).
- Đồng bộ thời gian thực (Real-time Sync) với Firebase Database khi có bất kỳ nhân viên nào bấm in bill.
- **Thẻ KPI tổng hợp:**
  - Tổng số lượt in (kể cả in lại).
  - Số toa khám thực tế đã in.
  - Số lượng bill in nhiều lần (kèm số lượt in trùng).
  - Doanh thu bill đã in (phân tách Tiền mặt và Chuyển khoản).
- **Cảnh báo đặc biệt: Danh sách bill in từ 2 lần trở lên:**
  - Tự động gom nhóm theo số toa để phát hiện chính xác toa nào bị in từ 2 lần trở lên.
  - Hiển thị huy hiệu đỏ nổi bật `⚠️ ĐÃ IN X LẦN` kèm timeline chi tiết các lần bấm in (giờ in, khổ giấy, khoảng cách thời gian giữa các lần in, lời dặn).
  - Nút xem lại và in lại bill trực tiếp.
- **Đối chiếu sổ khám:** Tự động phát hiện các toa khám đã lưu trong sổ khám ngày nhưng chưa được bấm in bill nhiệt.
- **Bảng kê chi tiết từng lượt in:**
  - Hỗ trợ đầy đủ giao diện Desktop Table và Mobile Cards.
  - Bộ lọc tabs: `Tất cả`, `⚠️ In nhiều lần`, `💵 Tiền mặt`, `💳 Chuyển khoản`.
  - Ô tìm kiếm tức thì theo số toa, tên bệnh nhân, số tiền, giờ in, lời dặn.
  - Chức năng xuất dữ liệu ra file Excel (`XLSX`).
  - Hỗ trợ xem lại mẫu bill và in lại ngay từ bảng kê.

## 5. Những lưu ý khi chỉnh sửa
- **Tránh ghi đè State:** Khi cần cập nhật State từ bên trong Component con, luôn dùng Functional State Update để tránh race-condition (Ví dụ: `setDailyData(prev => ({...prev, examinations: exams}))`).
- **Telegram Bot:** Token bot và Chat ID hiện đang được hardcode trong hàm `TELEGRAM`.
- **CSS Classes:** Giao diện rất phụ thuộc vào Tailwind CSS, khi sửa đổi UI cần chú ý dùng đúng utility classes của Tailwind.

