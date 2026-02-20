---
description: Cách deploy game Tiến Lên Miền Nam lên Internet (Render.com)
---

# Hướng dẫn Deploy Game lên Internet (Miễn phí)

Để đưa game Tiến Lên Miền Nam lên Internet để bạn bè có thể cùng chơi, bạn nên sử dụng **Render.com** (dễ nhất và miễn phí).

## Bước 1: Đưa code lên GitHub
1. Tạo một tài khoản [GitHub](https://github.com/) nếu bạn chưa có.
2. Tạo một repository mới (ví dụ: `tien-len-online`).
3. Tải lên toàn bộ file trong thư mục này (trừ thư mục `node_modules`) lên GitHub.
   - Các file quan trọng: `index.html`, `style.css`, `script.js`, `server.js`, `package.json`.

## Bước 2: Deploy lên Render.com
1. Truy cập [Render.com](https://render.com/) và đăng nhập bằng tài khoản GitHub.
2. Nhấn nút **New +** -> chọn **Web Service**.
3. Chọn repository bạn vừa tạo ở Bước 1.
4. Cấu hình các thông số sau:
   - **Name**: Tên game của bạn (ví dụ: `tienlen-mien-nam`).
   - **Environment**: `Node`.
   - **Build Command**: `npm install`.
   - **Start Command**: `npm start`.
   - **Plan**: Chọn `Free`.
5. Nhấn **Deploy Web Service**.

## Bước 3: Kiểm tra và Chia sẻ
- Sau ván vài phút, Render sẽ cung cấp cho bạn một đường link (ví dụ: `https://tienlen-mien-nam.onrender.com`).
- Bạn và bạn bè chỉ cần truy cập vào link đó để vào chơi cùng nhau.

## Lưu ý quan trọng:
- **Socket.io**: Vì game chạy qua Socket.io, Render (bản miễn phí) có thể mất khoảng 30s để khởi động lại nếu lâu không có người chơi.
- **Mobile**: Sau khi deploy, bạn chỉ cần gửi link này qua Zalo/Facebook để bạn bè mở trực tiếp trên điện thoại là chơi được luôn.

// turbo
3. Đã cập nhật file `package.json` để sẵn sàng cho việc deploy. Bạn chỉ việc thực hiện theo các bước trên!
