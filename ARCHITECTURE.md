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

- `monthlyMedicines/{branch}/{monthKey}`
  - Dữ liệu tiền thuốc lưu theo tháng.

## 4. Các Thành phần Giao diện chính (React Components)

### `App`
- Quản lý toàn bộ state chính: `user`, `userRole`, `selectedBranch`, `selectedDate`, `dailyData`.
- Xử lý màn hình Đăng nhập (phân 4 quyền: Admin Toàn quyền, Admin Ngã Bảy, NV Ngã Bảy, NV Thốt Nốt).
- Kết nối Firebase Realtime Database thông qua `useEffect`, tự động fetch `dailyData` khi thay đổi ngày/chi nhánh.
- Xử lý gửi báo cáo qua Telegram API (`buildDailyReport` -> `sendTelegram`).

### `ExaminationSection` (Tiền khám bệnh)
- Render danh sách các mức giá khám (bao gồm giá mặc định và giá tùy chỉnh).
- Mỗi mức giá có ô nhập số lượng ca và một nút `📝` để mở Modal nhập chi tiết danh sách toa thuốc.
- **Cảnh báo lệch số ca (Viền đỏ):** So sánh `validPatientsCount` (số bé hợp lệ trong danh sách) với `inputCount` (số ca gõ bên ngoài). Nếu lệch nhau (mismatch), ô nhập liệu sẽ tự động chuyển viền đỏ, nền đỏ để cảnh báo (áp dụng cho cả 2 chi nhánh Ngã Bảy và Thốt Nốt).
- **Kiểm tra STT toa thuốc & Cảnh báo nhảy số:** Tự động tổng hợp toàn bộ số thứ tự (STT) toa trong ngày. Hiển thị banner trạng thái (xanh nếu liên tục, đỏ/cam nếu có STT bị nhảy/thiếu). Có nút bấm `🔍 Kiểm tra STT toa` để mở hộp thoại kiểm tra chi tiết.

### `PatientDetailsModal` (Hộp thoại Danh sách toa thuốc)
- Cho phép thêm/xóa/sửa danh sách bệnh nhân (`name` và `prescriptionNo`).
- **Hình thức thanh toán (Tiền mặt / Chuyển khoản):** Mặc định mỗi toa là `Tiền mặt` không cần thao tác thêm. Nếu khách chuyển khoản, nhân viên chỉ cần click chọn ô `CK` (nút sẽ chuyển sang màu tím `💳 CK`).
- Có thanh tóm tắt hiển thị tổng số toa `💵 TM` và `💳 CK` ngay trong modal.
- Hiển thị tách biệt số tiền khám bằng Tiền mặt và Chuyển khoản ở `Tổng kết ngày` và `Báo cáo Telegram`.
- **Tách Tiền mặt & Chuyển khoản ở phần Còn lại cuối ngày:**
  - `netCash = examCash - doctor - expense - medicine`: Số tiền mặt thực tế còn lại trong két sau khi đã chi trả lương bác sĩ, chi phí và tiền thuốc.
  - `netTransfer = examTransfer`: Toàn bộ số tiền khám qua chuyển khoản ngân hàng.
  - Tổng kết ngày và Báo cáo Telegram hiển thị rõ: `💵 Còn lại: +Xk (💵 TM: Yk, 💳 CK: Zk)` (và đối với Thốt Nốt có thêm `📦 Thuốc NB: +Tk`). Đảm bảo công thức kế toán luôn cân bằng tuyệt đối: `netCash + netTransfer = branchOwnNet` (+ `transferredMedicine` đối với Thốt Nốt).
- Loại bỏ các dòng trống khi lưu.
- **Auto update:** Tự động đếm số lượng bệnh nhân và điền vào ô "số ca" bên ngoài khi nhấn Lưu.
- **Cảnh báo trùng STT & Khóa nút Lưu:** Phát hiện thời gian thực nếu STT bị trùng (cùng mức giá hoặc khác mức giá). Nếu có STT trùng, nút "Lưu" bị vô hiệu hóa (xám) để ngăn lưu sai sót.
- **Gợi ý & Kiểm tra STT nhảy:** Hiển thị STT toa cao nhất đã nhập trong ngày (`Toa cao nhất: #X`) và banner cảnh báo nếu đang có số bị nhảy, tích hợp nút mở tra cứu ngay bên trong modal.

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

## 5. Những lưu ý khi chỉnh sửa
- **Tránh ghi đè State:** Khi cần cập nhật State từ bên trong Component con, luôn dùng Functional State Update để tránh race-condition (Ví dụ: `setDailyData(prev => ({...prev, examinations: exams}))`).
- **Telegram Bot:** Token bot và Chat ID hiện đang được hardcode trong hàm `TELEGRAM`.
- **CSS Classes:** Giao diện rất phụ thuộc vào Tailwind CSS, khi sửa đổi UI cần chú ý dùng đúng utility classes của Tailwind.

