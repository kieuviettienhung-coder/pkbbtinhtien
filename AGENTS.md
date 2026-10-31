# Hướng Dẫn Dành Cho Antigravity Agent - Dự Án Phòng Khám Bách Bảo (pkbbtinhtien)

Dự án này là Web App Quản Lý Thu Chi, In Hóa Đơn Nhiệt & Báo Cáo Doanh Thu của **Phòng Khám Bách Bảo** (2 chi nhánh: Ngã Bảy & Thốt Nốt).

---

## 1. Đọc Tài Liệu Kiến Trúc Bắt Buộc
Trước khi thực hiện bất kỳ chỉnh sửa nào, Agent **BẮT BUỘC PHẢI ĐỌC** file `ARCHITECTURE.md` cùng thư mục.
Trong file `ARCHITECTURE.md` đã có đầy đủ:
- Chi tiết toàn bộ các node Firebase Realtime Database (`daily_v2`, `accounts_v2`, `settings_v2`, `passwords_v2`, `printLogs_v2`).
- Danh sách 7 tài khoản đăng nhập và mật khẩu riêng biệt.
- Cơ chế nhập toa khám trực tiếp (`prescriptions`), in bill nhiệt RawBT K80/K58, tự động lưu tức thì (Instant Auto-Save).
- Hệ thống gửi báo cáo Telegram tự động và thủ công.

---

## 2. Cấu Trúc Mã Nguồn (Single-file Web App)
- **Tệp nguồn chính:** `index.html`
- **Công nghệ:** React (Babel standalone inline) + Tailwind CSS (CDN) + Firebase Database (Compat 10.8.0) + SheetJS + html2canvas.
- **Quy tắc quan trọng:** Toàn bộ UI, logic, style đều nằm trong **duy nhất tệp `index.html`**. Không tự ý chia nhỏ thành nhiều module file riêng biệt trừ khi người dùng yêu cầu rõ ràng.

---

## 3. Quy Trình Kiểm Thử & Triển Khai (Deploy)
1. **Chỉnh sửa:** Thực hiện trên `pkbb_hosting/index.html`.
2. **Kiểm tra cú pháp:** Chạy Babel chuyển đổi thử để đảm bảo 0 lỗi cú pháp JSX trước khi deploy.
3. **Đồng bộ sang thư mục deploy:**
   - Copy `index.html`, `ARCHITECTURE.md`, `AGENTS.md` sang thư mục `pkbbtinhtien_deploy/`.
4. **Đẩy lên GitHub Pages:**
   - Chuyển vào thư mục `pkbbtinhtien_deploy`.
   - Chạy lệnh Git:
     ```bash
     git add index.html ARCHITECTURE.md AGENTS.md
     git commit -m "mô tả thay đổi"
     git push origin main
     ```
   - Ứng dụng sẽ tự động cập nhật trực tiếp tại:
     `https://kieuviettienhung-coder.github.io/pkbbtinhtien/`
