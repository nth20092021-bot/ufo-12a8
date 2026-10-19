# UFO gọi trả bài

Đây là bản web tĩnh của trò chơi. Mở `ufo.html` để chạy trực tiếp.

## GitHub Pages

Tạo repository với thư mục này làm gốc, đẩy nhánh `main`, rồi bật Pages với nguồn **GitHub Actions**. Workflow tại `.github/workflows/pages.yml` sẽ xuất bản trang và cập nhật sau mỗi lần push.

## Lưu và chia sẻ cấu hình

- Danh sách, trạng thái lớp và bối cảnh được lưu trong `localStorage` của trình duyệt hiện tại.
- Nút **Chia sẻ** tạo link có bối cảnh, tên biển hiệu, thiết lập chọn lượt và roster đang mở (tên, giới tính); mở link sẽ khôi phục các giá trị đó.
- Roster được đóng gói dạng Base64 trong URL fragment (không phải mã hóa bảo mật) và không gửi kèm request tới máy chủ, nhưng bất kỳ ai nhận được link đều có thể xem tên và giới tính. Chia sẻ link đồng nghĩa chia sẻ roster; không dùng với dữ liệu bạn không có quyền chia sẻ.
- Link không chứa thông tin tài khoản, nhân vật/ngoại hình hay lịch sử gọi.
- GitHub Pages không chạy API hoặc cơ sở dữ liệu. Đồng bộ dữ liệu lớp giữa thiết bị, tài khoản, mã mời và điểm danh qua mạng cần backend riêng.

Lớp mặc định của lượt cài mới có 28 tên ẩn danh (`Học sinh 01`–`Học sinh 28`), gồm 26 nữ và 2 nam; không có tên học sinh thật trong mã nguồn. Dữ liệu lớp được giữ trong `localStorage` của trình duyệt. Các lớp đã lưu trước đó không bị thay thế.
