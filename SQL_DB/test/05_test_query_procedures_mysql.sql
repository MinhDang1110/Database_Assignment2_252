USE LMS_BTL2;

-- =========================================================
-- TEST 1:
-- Tìm tất cả khóa học có từ khóa "Lập trình"
-- Kỳ vọng: trả về khóa học Lập trình căn bản.
-- =========================================================

CALL sp_search_courses(
    'Lập trình',
    NULL,
    NULL,
    NULL,
    NULL,
    'COURSE_NAME_ASC'
);


-- =========================================================
-- TEST 2:
-- Tìm khóa học thuộc khoa Khoa học và Kỹ thuật Máy tính.
-- Dept_ID = 1
-- Kỳ vọng: trả về các khóa học thuộc department 1.
-- =========================================================

CALL sp_search_courses(
    NULL,
    1,
    NULL,
    NULL,
    NULL,
    'START_DATE_DESC'
);


-- =========================================================
-- TEST 3:
-- Tìm khóa học do Lecturer_ID = 6 phụ trách
-- và số tín chỉ từ 3 đến 4.
-- =========================================================

CALL sp_search_courses(
    NULL,
    NULL,
    6,
    3,
    4,
    'STUDENTS_DESC'
);


-- =========================================================
-- TEST 4:
-- Báo cáo kết quả học tập toàn bộ khóa học.
-- Không lọc khoa, không lọc ngày, không giới hạn số SV.
-- =========================================================

CALL sp_report_course_learning_result(
    NULL,
    NULL,
    NULL,
    0,
    NULL
);


-- =========================================================
-- TEST 5:
-- Báo cáo khóa học thuộc Dept_ID = 1,
-- trong học kỳ từ 2026-02-01 đến 2026-06-30,
-- có ít nhất 1 sinh viên đăng ký.
-- =========================================================

CALL sp_report_course_learning_result(
    1,
    '2026-02-01',
    '2026-06-30',
    1,
    NULL
);


-- =========================================================
-- TEST 6:
-- Báo cáo khóa học có điểm trung bình cuối kỳ >= 8.00.
-- Đây là test cho điều kiện HAVING.
-- =========================================================

CALL sp_report_course_learning_result(
    NULL,
    NULL,
    NULL,
    1,
    8.00
);