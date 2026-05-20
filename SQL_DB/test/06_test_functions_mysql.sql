USE LMS_BTL2;

-- =========================================================
-- TEST 1:
-- Tính GPA có trọng số của Student_ID = 1.
-- Student 1 đã hoàn thành Course 1, 2, 3.
-- Kỳ vọng: trả về GPA trung bình theo tín chỉ.
-- =========================================================

SELECT
    1 AS Student_ID,
    fn_calculate_student_weighted_gpa(1) AS Weighted_GPA;


-- =========================================================
-- TEST 2:
-- Tính GPA có trọng số của Student_ID = 5.
-- Student 5 mới hoàn thành Course 1.
-- Kỳ vọng: trả về điểm trung bình dựa trên khóa đã hoàn thành.
-- =========================================================

SELECT
    5 AS Student_ID,
    fn_calculate_student_weighted_gpa(5) AS Weighted_GPA;


-- =========================================================
-- TEST 3:
-- Tính tỷ lệ hoàn thành của Course_ID = 1.
-- Course 1 có 5 sinh viên và cả 5 đã Completed.
-- Kỳ vọng: 100.00
-- =========================================================

SELECT
    1 AS Course_ID,
    fn_calculate_course_completion_rate(1) AS Completion_rate_percent;


-- =========================================================
-- TEST 4:
-- Tính tỷ lệ hoàn thành của Course_ID = 4.
-- Course 4 có sinh viên đăng ký nhưng chưa Completed.
-- Kỳ vọng: 0.00
-- =========================================================

SELECT
    4 AS Course_ID,
    fn_calculate_course_completion_rate(4) AS Completion_rate_percent;


-- =========================================================
-- TEST 5:
-- Gọi hàm với Student_ID không tồn tại.
-- Kỳ vọng: báo lỗi Student_ID không tồn tại.
-- Nên chạy riêng block này khi demo.
-- =========================================================

SELECT fn_calculate_student_weighted_gpa(999) AS Invalid_student_test;


-- =========================================================
-- TEST 6:
-- Gọi hàm với Course_ID không tồn tại.
-- Kỳ vọng: báo lỗi Course_ID không tồn tại.
-- Nên chạy riêng block này khi demo.
-- =========================================================

SELECT fn_calculate_course_completion_rate(999) AS Invalid_course_test;