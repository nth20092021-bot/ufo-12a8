# UFO gọi trả bài

Đây là bản web tĩnh của trò chơi. Mở `ufo.html` để chạy trực tiếp.

## GitHub Pages

Tạo repository với thư mục này làm gốc, đẩy nhánh `main`, rồi bật Pages với nguồn **GitHub Actions**. Workflow tại `.github/workflows/pages.yml` sẽ xuất bản trang và cập nhật sau mỗi lần push.

## Lưu và chia sẻ cấu hình

- Danh sách, trạng thái lớp và bối cảnh được lưu trong `localStorage` của trình duyệt hiện tại.
- Nút **Chia sẻ** tạo link có bối cảnh, tên biển hiệu và các thiết lập chọn lượt; mở link sẽ khôi phục các giá trị đó.
- Link không chứa roster, thông tin tài khoản hay lịch sử gọi. Ai có link vẫn có thể xem cấu hình trong đó.
- GitHub Pages không chạy API hoặc cơ sở dữ liệu. Đồng bộ dữ liệu lớp giữa thiết bị, tài khoản, mã mời và điểm danh qua mạng cần backend riêng.

Danh sách học sinh mẫu đã được bỏ khỏi mã nguồn để tránh công khai tên học sinh. Nhập roster sau khi mở trang.
