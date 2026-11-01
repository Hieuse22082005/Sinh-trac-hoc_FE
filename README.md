# 🎨 Hush - Frontend (Client-side E2EE Vault)

Giao diện người dùng cho hệ thống két sắt lưu trữ ảnh/video bảo mật cao. Frontend của Hush không chỉ đóng vai trò hiển thị mà còn gánh vác toàn bộ quy trình mã hóa đầu cuối (E2EE), đảm bảo dữ liệu luôn được khóa kín trước khi rời khỏi thiết bị.

## ✨ Tính năng nổi bật
* **Mã hóa đầu cuối (Client-Side Encryption):** Sử dụng `crypto-js` mã hóa AES-256 cho file và thumbnail ngay trên RAM trình duyệt trước khi upload.
* **Xác thực sinh trắc học:** Tích hợp WebAuthn API (`@simplewebauthn/browser`) cho phép đăng nhập bằng FaceID/TouchID.
* **Bảo vệ phiên bản thời gian thực (Realtime Protection):** Lắng nghe webhook từ Supabase để tự động Force Logout nếu phát hiện thiết bị lạ đăng nhập.
* **Quản lý OTP cục bộ:** Cửa sổ Modal xác thực mã OTP độc lập cho phép xác minh đổi email hoặc thiết bị mà không cần tải lại trang.
* **Giao diện Glassmorphism:** UI/UX hiện đại thiết kế bằng Tailwind CSS, hỗ trợ Dark/Light mode và tương tác kéo thả mượt mà.

## 🛠 Công nghệ sử dụng
* **Framework:** Next.js (React)
* **Styling:** Tailwind CSS, Lucide React (Icons)
* **Bảo mật:** `crypto-js`, `@simplewebauthn/browser`
* **Database Client:** `@supabase/supabase-js`

## 🚀 Hướng dẫn cài đặt

1. Cài đặt các thư viện cần thiết:
   ```bash
   npm install

2. Tạo file .env.local ở thư mục gốc và thêm các biến môi trường:

Ini, TOML
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_DELETE_PASSWORD=your_system_delete_password

3.Chạy môi trường phát triển:

Bash
npm run dev

Ứng dụng sẽ chạy tại: http://localhost:3000
