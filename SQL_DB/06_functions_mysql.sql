USE LMS_BTL2;

DROP FUNCTION IF EXISTS fn_calculate_student;
DROP FUNCTION IF EXISTS fn_calculate_course_completion_rate;

DELIMITER //

--   1. fn_calculate_student (Tính điểm trung bình tích lũy - GPA)
--    - Mục đích: Tính điểm GPA có trọng số (theo tín chỉ) của một sinh viên cụ thể. Điểm này chỉ tính những khóa học có trạng thái 'Completed'.
--    - Đầu vào: ID của sinh viên (p_student_id).
--    - Kiểm tra: ID không được rỗng và sinh viên phải tồn tại trong DB.
--    - Hoạt động (Dùng Con trỏ - CURSOR):
--      - Mở con trỏ quét từng khóa học mà sinh viên này đã học xong.
--      - Vòng lặp (LOOP): Với mỗi khóa học, lấy số Tín chỉ (Credits) và Điểm tổng kết (Final_score).
--      - Cộng dồn điểm: Điểm tích lũy = Điểm tích lũy + (Tín chỉ * Điểm tổng kết).
--      - Cộng dồn tín chỉ: Tổng tín chỉ = Tổng tín chỉ + Tín chỉ.
--    - Trả về: Điểm tích lũy / Tổng tín chỉ (Làm tròn 2 chữ số thập phân). Nếu chưa học xong môn nào thì trả về 0.

CREATE FUNCTION fn_calculate_student (
    p_student_id INT
)
RETURNS DECIMAL(5,2)
READS SQL DATA
BEGIN
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_credit INT DEFAULT 0;
    DECLARE v_score DECIMAL(5,2) DEFAULT 0;

    DECLARE v_total_credits INT DEFAULT 0;
    DECLARE v_total_weighted_score DECIMAL(10,2) DEFAULT 0;
    DECLARE v_result DECIMAL(5,2) DEFAULT 0;

    DECLARE cur_completed_courses CURSOR FOR
        SELECT
            s.Credits,
            e.Final_score
        FROM ENROLL e
        JOIN COURSE c
            ON c.Course_ID = e.Course_ID
        JOIN SUBJECT s
            ON s.Subject_ID = c.Subject_ID
        WHERE e.Student_ID = p_student_id
          AND e.Enroll_status = 'Completed'
          AND e.Final_score IS NOT NULL;

    DECLARE CONTINUE HANDLER FOR NOT FOUND
        SET v_done = 1;

    -- Validate tham số đầu vào
    IF p_student_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Student_ID không được để trống.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM STUDENT
        WHERE User_ID = p_student_id
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Student_ID không tồn tại trong bảng STUDENT.';
    END IF;

    -- Duyệt các khóa học đã hoàn thành bằng cursor
    OPEN cur_completed_courses;

    read_loop: LOOP
        FETCH cur_completed_courses INTO v_credit, v_score;

        IF v_done = 1 THEN
            LEAVE read_loop;
        END IF;

        SET v_total_credits = v_total_credits + v_credit;
        SET v_total_weighted_score = v_total_weighted_score + (v_credit * v_score);
    END LOOP;

    CLOSE cur_completed_courses;

    -- Nếu sinh viên chưa hoàn thành khóa học nào thì trả về 0
    IF v_total_credits = 0 THEN
        SET v_result = 0;
    ELSE
        SET v_result = ROUND(v_total_weighted_score / v_total_credits, 2);
    END IF;

    RETURN v_result;
END //


-- =========================================================
--   2. fn_calculate_course_completion_rate (Tính tỷ lệ hoàn thành khóa học)
--    - Mục đích: Tính xem khóa học đó có bao nhiêu phần trăm (%) sinh viên đăng ký đã học xong ('Completed').
--    - Đầu vào: ID của khóa học (p_course_id).
--    - Kiểm tra: ID không rỗng và khóa học phải tồn tại trong DB.
--    - Hoạt động (Dùng Con trỏ - CURSOR):
--      - Mở con trỏ quét toàn bộ danh sách đăng ký (ENROLL) của khóa học này.
--      - Vòng lặp (LOOP): Với mỗi sinh viên, lấy ra trạng thái đăng ký (Enroll_status).
--      - Tổng sinh viên = Tổng sinh viên + 1.
--      - Nếu trạng thái là 'Completed' thì Sinh viên hoàn thành = Sinh viên hoàn thành + 1.
--    - Trả về: (Sinh viên hoàn thành * 100) / Tổng sinh viên (Làm tròn 2 chữ số thập phân). Trả về % (VD: 85.50). Nếu khóa học vắng tanh (0 sinh viên) thì trả
--      về 0.
-- =========================================================

CREATE FUNCTION fn_calculate_course_completion_rate (
    p_course_id INT
)
RETURNS DECIMAL(5,2)
READS SQL DATA
BEGIN
    DECLARE v_done INT DEFAULT 0;
    DECLARE v_status VARCHAR(20);

    DECLARE v_total_students INT DEFAULT 0;
    DECLARE v_completed_students INT DEFAULT 0;
    DECLARE v_result DECIMAL(5,2) DEFAULT 0;

    DECLARE cur_enrollments CURSOR FOR
        SELECT Enroll_status
        FROM ENROLL
        WHERE Course_ID = p_course_id;

    DECLARE CONTINUE HANDLER FOR NOT FOUND
        SET v_done = 1;

    -- Validate tham số đầu vào
    IF p_course_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Course_ID không được để trống.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM COURSE
        WHERE Course_ID = p_course_id
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Course_ID không tồn tại trong bảng COURSE.';
    END IF;

    -- Duyệt danh sách đăng ký của khóa học bằng cursor
    OPEN cur_enrollments;

    read_loop: LOOP
        FETCH cur_enrollments INTO v_status;

        IF v_done = 1 THEN
            LEAVE read_loop;
        END IF;

        SET v_total_students = v_total_students + 1;

        IF v_status = 'Completed' THEN
            SET v_completed_students = v_completed_students + 1;
        END IF;
    END LOOP;

    CLOSE cur_enrollments;

    -- Nếu chưa có sinh viên đăng ký thì tỷ lệ hoàn thành = 0
    IF v_total_students = 0 THEN
        SET v_result = 0;
    ELSE
        SET v_result = ROUND(v_completed_students * 100.0 / v_total_students, 2);
    END IF;

    RETURN v_result;
END //

DELIMITER ;