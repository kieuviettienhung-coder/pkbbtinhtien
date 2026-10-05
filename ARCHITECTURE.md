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
- **Tính năng đặc biệt (Dành riêng chi nhánh Thốt Nốt):** So sánh `validPatientsCount` (số bé hợp lệ trong danh sách) với `inputCount` (số ca gõ bên ngoài). Nếu lệch nhau (mismatch), ô nhập liệu sẽ tự động chuyển viền đỏ, nền đỏ để cảnh báo.

### `PatientDetailsModal` (Hộp thoại Danh sách toa thuốc)
- Cho phép thêm/xóa/sửa danh sách bệnh nhân (`name` và `prescriptionNo`).
- Loại bỏ các dòng trống khi lưu.
- **Auto update:** Tự động đếm số lượng bệnh nhân và điền vào ô "số ca" bên ngoài khi nhấn Lưu.

### `DoctorFeesSection`, `ExpensesSection`, `MedicineSection`
- Các module nhập liệu dạng mảng: Lương bác sĩ, Chi phí, Tiền thuốc. Tính năng thêm dòng mới, xóa dòng, chỉnh sửa trực tiếp.

### `ReportView` & `YearlyReportView`
- Query dữ liệu Firebase theo khoảng thời gian (theo tháng hoặc cả năm).
- Tổng hợp và tính toán tổng thu, chi, lãi ròng, và đếm số lượng ca (kể cả 0đ).
- Chức năng xuất dữ liệu ra file Excel.

### `MedicineManagement`
- Module dành riêng cho Admin để thiết lập Danh mục thuốc và giá thuốc mặc định (sẽ được tải vào `MedicineSection` qua danh sách xổ xuống).

## 5. Những lưu ý khi chỉnh sửa
- **Tránh ghi đè State:** Khi cần cập nhật State từ bên trong Component con, luôn dùng Functional State Update để tránh race-condition (Ví dụ: `setDailyData(prev => ({...prev, examinations: exams}))`).
- **Telegram Bot:** Token bot và Chat ID hiện đang được hardcode trong hàm `TELEGRAM`.
- **CSS Classes:** Giao diện rất phụ thuộc vào Tailwind CSS, khi sửa đổi UI cần chú ý dùng đúng utility classes của Tailwind.
