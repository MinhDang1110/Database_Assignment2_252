
# LMS BTL2 Project

Hệ thống Quản lý Học tập (Learning Management System) - Đồ án cơ sở dữ liệu.

## Yêu cầu hệ thống
- **Node.js** (v14 trở lên)
- **MySQL** (v8.0 trở lên)

## Hướng dẫn cài đặt và chạy local

### 1. Khởi tạo Cơ sở dữ liệu (Database)
Mở MySQL Workbench (hoặc tool quản lý database bất kỳ) và thực thi các file SQL trong thư mục `SQL_DB/` theo đúng thứ tự sau:
1. `01_CreateTables.sql`: Tạo database `LMS_BTL2`, cấu trúc các bảng và khởi tạo tài khoản Admin mặc định.
2. `02_insert_sample_data_mysql.sql`: Đổ dữ liệu mẫu vào các bảng.
3. Chạy tiếp các file cấu hình logic nghiệp vụ: (không chạy thì web sẽ báo lỗi thiếu thủ tục để gọi ra)
   - `03_ins_upd_del_procedures_mysql.sql`: chưa các thủ tục insert, update, delete của các chức năng trong backend.
   - `04_triggers_mysql.sql`: các trigger kiểm tra ràng buộc 1 cách tự động
   - `05_query_procedures_mysql.sql`: các thủ tục truy xuất bảng
   - `06_functions_mysql.sql`: các hàm hỗ trợ


### 2. Cài đặt Backend (Web App)
Mở terminal, di chuyển vào thư mục code web:
```bash
cd lms_bt2_web
```

Cài đặt các gói thư viện (dependencies) cần thiết:
```bash
npm install
```

### 3. Cấu hình Biến môi trường
Tạo một file có tên là `.env` nằm ngang hàng với file `app.js` trong thư mục `lms_bt2_web`. Copy nội dung sau vào file `.env` và thay đổi `DB_USER`, `DB_PASSWORD` cho khớp với MySQL trên máy của bạn:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=LMS_BTL2
DB_PORT=3306
SESSION_SECRET=secret_key_lms_btl2
```

### 4. Khởi chạy hệ thống
Tại terminal đang ở thư mục `lms_bt2_web`, chạy lệnh:
```bash
npm start
```

Mở trình duyệt và truy cập: [http://localhost:3000](http://localhost:3000)

### 5. Tài khoản Đăng nhập mẫu
- **Quản trị viên (Admin):**
  - Username: `admin`
  - Password: `Admin@12345678`
- Hoặc bạn có thể chọn Đăng ký tài khoản mới (Giảng viên/Sinh viên) trên giao diện web.
