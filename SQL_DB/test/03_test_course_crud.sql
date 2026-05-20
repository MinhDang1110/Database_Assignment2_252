USE LMS_BTL2;

-- =========================================================
-- TEST 1: Thêm khóa học hợp lệ
-- =========================================================

CALL sp_insert_course(
    'Lập trình Python cơ bản - HK252',
    'Khóa học Python nhập môn cho sinh viên kỹ thuật.',
    '2026-03-01',
    '2026-07-01',
    1,
    6
);

-- =========================================================
-- TEST 2: Thêm khóa học sai vì ngày kết thúc < ngày bắt đầu
-- Kỳ vọng: báo lỗi cụ thể
-- =========================================================

CALL sp_insert_course(
    'Khóa học lỗi ngày',
    'Dữ liệu test lỗi ngày.',
    '2026-07-01',
    '2026-03-01',
    1,
    6
);

-- =========================================================
-- TEST 3: Thêm khóa học sai vì Subject_ID không tồn tại
-- Kỳ vọng: báo lỗi cụ thể
-- =========================================================

CALL sp_insert_course(
    'Khóa học lỗi môn học',
    'Dữ liệu test lỗi subject.',
    '2026-03-01',
    '2026-07-01',
    999,
    6
);

-- =========================================================
-- TEST 4: Cập nhật khóa học hợp lệ
-- Lưu ý: sửa Course_ID theo Course_ID vừa thêm nếu cần.
-- Nếu test sau khi insert thành công thì thường Course_ID mới là 6.
-- =========================================================

CALL sp_update_course(
    6,
    'Lập trình Python cơ bản - cập nhật',
    'Khóa học Python đã cập nhật mô tả.',
    '2026-03-01',
    '2026-07-15',
    1,
    6
);

-- =========================================================
-- TEST 5: Cập nhật sai vì Course_ID không tồn tại
-- Kỳ vọng: báo lỗi cụ thể
-- =========================================================

CALL sp_update_course(
    999,
    'Khóa học không tồn tại',
    'Test update lỗi.',
    '2026-03-01',
    '2026-07-01',
    1,
    6
);

-- =========================================================
-- TEST 6: Xóa khóa học không được vì đã có sinh viên đăng ký
-- Course_ID = 1 đang có dữ liệu ENROLL
-- Kỳ vọng: báo lỗi cụ thể
-- =========================================================

CALL sp_delete_course(1);

-- =========================================================
-- TEST 7: Xóa khóa học hợp lệ
-- Course_ID = 6 là khóa học mới thêm, chưa có ENROLL, SECTION, QUIZ.
-- Kỳ vọng: xóa thành công
-- =========================================================

CALL sp_delete_course(6);