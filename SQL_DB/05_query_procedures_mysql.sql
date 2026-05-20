USE LMS_BTL2;

DROP PROCEDURE IF EXISTS sp_search_courses;
DROP PROCEDURE IF EXISTS sp_report_course_learning_result;
DROP PROCEDURE IF EXISTS sp_get_course_details;
DROP PROCEDURE IF EXISTS sp_get_student_dashboard;
DROP PROCEDURE IF EXISTS sp_get_student_course_progress;
DROP PROCEDURE IF EXISTS sp_get_quiz_to_take;

DELIMITER //

--   1. sp_search_courses
--    - Mục đích: Tìm kiếm và lọc danh sách khóa học (dùng ở trang "Khóa học").
--    - Đầu vào: Từ khóa, ID khoa, ID giảng viên, khoảng tín chỉ (min/max), kiểu sắp xếp.
--    - Hoạt động: Gom dữ liệu từ 5 bảng (COURSE, SUBJECT, DEPARTMENT, LECTURER, USER_ACCOUNT). Lọc bằng WHERE theo các biến truyền vào. Đếm tổng số sinh viên
--      đang học bằng COUNT. Sắp xếp động bằng ORDER BY IF().

CREATE PROCEDURE sp_search_courses (    IN p_keyword      VARCHAR(150),
    IN p_dept_id      INT,
    IN p_lecturer_id  INT,
    IN p_min_credits  INT,
    IN p_max_credits  INT,
    IN p_sort_option  VARCHAR(30)
)
BEGIN
    SELECT
        c.Course_ID,
        c.Course_name,
        c.Description,
        c.Start_date,
        c.End_date,
        -- FIX: Bỏ c.Lecturer_ID thừa (duplicate với l.User_ID AS Lecturer_ID bên dưới,
        --      gây ambiguous alias và lỗi GROUP BY)
        s.Subject_ID,
        s.Subject_name,
        s.Credits,

        d.Dept_ID,
        d.Dept_name,

        l.User_ID    AS Lecturer_ID,
        ua.Full_name AS Lecturer_name,

        COUNT(DISTINCT e.Student_ID) AS Number_of_students
    FROM COURSE c
    JOIN SUBJECT s
        ON s.Subject_ID = c.Subject_ID
    JOIN DEPARTMENT d
        ON d.Dept_ID = s.Dept_ID
    JOIN LECTURER l
        ON l.User_ID = c.Lecturer_ID
    JOIN USER_ACCOUNT ua
        ON ua.User_ID = l.User_ID
    LEFT JOIN ENROLL e
        ON e.Course_ID = c.Course_ID
    WHERE
        (
            p_keyword IS NULL
            OR TRIM(p_keyword) = ''
            OR c.Course_name   LIKE CONCAT('%', TRIM(p_keyword), '%')
            OR s.Subject_name  LIKE CONCAT('%', TRIM(p_keyword), '%')
            OR ua.Full_name    LIKE CONCAT('%', TRIM(p_keyword), '%')
        )
        AND (p_dept_id     IS NULL OR d.Dept_ID  = p_dept_id)
        AND (p_lecturer_id IS NULL OR l.User_ID  = p_lecturer_id)
        AND (p_min_credits IS NULL OR s.Credits >= p_min_credits)
        AND (p_max_credits IS NULL OR s.Credits <= p_max_credits)
    GROUP BY
        c.Course_ID,
        c.Course_name,
        c.Description,
        c.Start_date,
        c.End_date,
        s.Subject_ID,
        s.Subject_name,
        s.Credits,
        d.Dept_ID,
        d.Dept_name,
        l.User_ID,
        ua.Full_name
    -- FIX: ORDER BY với nhiều CASE ASC/DESC riêng lẻ không hoạt động đúng trong MySQL.
    --      Dùng IF() cho từng tiêu chí, kết hợp ASC/DESC bằng dấu âm (trick chuẩn MySQL).
    --      Với TEXT không thể dùng dấu âm nên dùng 2 IF: một cho ASC, một cho DESC đảo chiều.
    ORDER BY
        -- COURSE_NAME
        IF(p_sort_option = 'COURSE_NAME_ASC',  c.Course_name, NULL) ASC,
        IF(p_sort_option = 'COURSE_NAME_DESC', c.Course_name, NULL) DESC,
        -- START_DATE
        IF(p_sort_option = 'START_DATE_ASC',  c.Start_date, NULL) ASC,
        IF(p_sort_option = 'START_DATE_DESC', c.Start_date, NULL) DESC,
        -- STUDENTS (dùng âm để đảo DESC thành ASC trên số)
        IF(p_sort_option = 'STUDENTS_ASC',  -COUNT(DISTINCT e.Student_ID), NULL) ASC,
        IF(p_sort_option = 'STUDENTS_DESC',  COUNT(DISTINCT e.Student_ID), NULL) DESC,
        -- Tie-break mặc định
        c.Course_ID ASC;
END //


--   2. sp_report_course_learning_result
--    - Mục đích: Xuất báo cáo thống kê kết quả học tập cho Admin/Giảng viên (dùng ở trang "Báo cáo").
--    - Đầu vào: ID khoa, khoảng thời gian (từ ngày - đến ngày), số sinh viên tối thiểu, điểm trung bình tối thiểu.
--    - Hoạt động: Gom dữ liệu từ 8 bảng. Dùng GROUP BY để nhóm theo từng khóa học. Dùng hàm gom nhóm (COUNT, AVG, ROUND) để tính: tổng sinh viên đăng ký, tổng
--      sinh viên hoàn thành, tỷ lệ hoàn thành (%), điểm trung bình cuối kỳ, số bài quiz đã thi. Dùng HAVING để lọc kết quả sau khi đã gom nhóm.


CREATE PROCEDURE sp_report_course_learning_result (
    IN p_dept_id               INT,
    IN p_from_date             DATE,
    IN p_to_date               DATE,
    IN p_min_students          INT,
    IN p_min_avg_final_score   DECIMAL(5,2)
)
BEGIN
    SELECT
        c.Course_ID,
        c.Course_name,

        s.Subject_ID,
        s.Subject_name,
        s.Credits,

        d.Dept_ID,
        d.Dept_name,

        ua.Full_name AS Lecturer_name,

        COUNT(DISTINCT e.Student_ID) AS Total_enrolled_students,

        COUNT(
            DISTINCT CASE
                WHEN e.Enroll_status = 'Completed' THEN e.Student_ID
            END
        ) AS Total_completed_students,

        ROUND(
            COUNT(
                DISTINCT CASE
                    WHEN e.Enroll_status = 'Completed' THEN e.Student_ID
                END
            ) * 100.0 / NULLIF(COUNT(DISTINCT e.Student_ID), 0),
            2
        ) AS Completion_rate_percent,

        ROUND(AVG(e.Final_score), 2) AS Avg_final_score,

        COUNT(DISTINCT q.Quiz_ID) AS Total_quizzes,

        COUNT(DISTINCT CONCAT(a.Student_ID, '-', a.Quiz_ID, '-', a.Attempt_order)) AS Total_attempts,

        ROUND(AVG(a.Total_score), 2) AS Avg_quiz_attempt_score
    FROM COURSE c
    JOIN SUBJECT s
        ON s.Subject_ID = c.Subject_ID
    JOIN DEPARTMENT d
        ON d.Dept_ID = s.Dept_ID
    JOIN LECTURER l
        ON l.User_ID = c.Lecturer_ID
    JOIN USER_ACCOUNT ua
        ON ua.User_ID = l.User_ID
    LEFT JOIN ENROLL e
        ON e.Course_ID = c.Course_ID
    LEFT JOIN QUIZ q
        ON q.Course_ID = c.Course_ID
    LEFT JOIN ATTEMPT a
        ON a.Quiz_ID = q.Quiz_ID
    WHERE
        (p_dept_id    IS NULL OR d.Dept_ID      = p_dept_id)
        AND (p_from_date IS NULL OR c.Start_date >= p_from_date)
        AND (p_to_date   IS NULL OR c.End_date   <= p_to_date)
    GROUP BY
        c.Course_ID,
        c.Course_name,
        s.Subject_ID,
        s.Subject_name,
        s.Credits,
        d.Dept_ID,
        d.Dept_name,
        ua.Full_name
    HAVING
        COUNT(DISTINCT e.Student_ID) >= IFNULL(p_min_students, 0)
        AND (
            p_min_avg_final_score IS NULL
            OR IFNULL(AVG(e.Final_score), 0) >= p_min_avg_final_score
        )
    ORDER BY
        Completion_rate_percent  DESC,
        Avg_final_score          DESC,
        Total_enrolled_students  DESC,
        c.Course_ID              ASC;
END //


--   3. sp_get_course_details
--    - Mục đích: Lấy thông tin chi tiết của 1 khóa học để hiển thị lên Modal (cửa sổ nổi) cho Sinh viên coi trước khi quyết định Đăng ký.
--    - Đầu vào: ID khóa học.
--    - Hoạt động: Chạy 4 lệnh SELECT liên tiếp trả về 4 bảng kết quả (Result Sets):
--      1. Thông tin cơ bản (Tên, ngày, tín chỉ...).
--      2. Môn tiên quyết.
--      3. Danh sách chương và bài giảng (SECTION & LECTURE).
--      4. Danh sách các bài Quiz.
-- Sử dụng cho button chi tiết của giao diện sinh viên 
CREATE PROCEDURE sp_get_course_details (
    IN p_course_id INT
)
BEGIN
    -- 1. Basic Info
    SELECT
        c.Course_ID,
        c.Course_name,
        c.Description,
        c.Start_date,
        c.End_date,
        s.Subject_name,
        s.Credits,
        d.Dept_name,
        ua.Full_name AS Lecturer_name
    FROM COURSE c
    JOIN SUBJECT s  ON s.Subject_ID = c.Subject_ID
    JOIN DEPARTMENT d ON d.Dept_ID  = s.Dept_ID
    JOIN USER_ACCOUNT ua ON ua.User_ID = c.Lecturer_ID
    WHERE c.Course_ID = p_course_id;

    -- 2. Prerequisites
    SELECT s.Subject_name
    FROM PREREQUISITE p
    JOIN SUBJECT s ON s.Subject_ID = p.Prerequisite_subject_ID
    JOIN COURSE c  ON c.Subject_ID = p.Advanced_subject_ID
    WHERE c.Course_ID = p_course_id;

    -- 3. Sections & Lectures
    SELECT
        sec.Section_order,
        sec.Section_name,
        l.Title AS Lecture_title
    FROM SECTION sec
    LEFT JOIN LECTURE l
        ON l.Course_ID     = sec.Course_ID
       AND l.Section_order = sec.Section_order
    WHERE sec.Course_ID = p_course_id
    ORDER BY sec.Section_order ASC, l.Lecture_ID ASC;

    -- 4. Quizzes
    SELECT Quiz_title, Max_score, Duration
    FROM QUIZ
    WHERE Course_ID = p_course_id
    ORDER BY Quiz_ID ASC;
END //


--   4. sp_get_student_dashboard
--    - Mục đích: Đổ dữ liệu trang chủ (Dashboard) của Sinh viên.
--    - Đầu vào: ID sinh viên.
--    - Hoạt động: Trả về 2 bảng kết quả:
--      1. Các khóa học đã đăng ký: Kèm theo tiến độ học (đã xem bao nhiêu bài, đậu bao nhiêu quiz).
--      2. Các khóa học có thể đăng ký: Lọc ra những khóa học mà sinh viên này chưa có tên trong bảng ENROLL.

CREATE PROCEDURE sp_get_student_dashboard (
    IN p_student_id INT
)
BEGIN
    -- 1. Các khóa học đã đăng ký (kèm tiến độ)
    SELECT
        c.Course_ID,
        c.Course_name,
        c.Description,
        c.Start_date,
        c.End_date,
        s.Subject_name,
        s.Credits,
        d.Dept_name,
        ua.Full_name AS Lecturer_name,
        e.Enroll_status,
        e.Final_score,
        e.Completed_at,

        (
            SELECT COUNT(*)
            FROM LECTURE lec
            WHERE lec.Course_ID = c.Course_ID
        ) AS Total_lectures,

        (
            SELECT COUNT(*)
            FROM LECTURE lec
            JOIN INTERACT i
                ON i.Lecture_ID  = lec.Lecture_ID
            WHERE lec.Course_ID  = c.Course_ID
              AND i.Student_ID   = p_student_id
              AND i.Status       = 'Completed'
        ) AS Completed_lectures,

        (
            SELECT COUNT(*)
            FROM QUIZ q
            WHERE q.Course_ID = c.Course_ID
        ) AS Total_quizzes,

        (
            SELECT COUNT(*)
            FROM QUIZ q
            WHERE q.Course_ID = c.Course_ID
              AND EXISTS (
                  SELECT 1
                  FROM ATTEMPT a
                  WHERE a.Student_ID   = p_student_id
                    AND a.Quiz_ID      = q.Quiz_ID
                    AND a.Total_score >= q.Pass_score
              )
        ) AS Passed_quizzes

    FROM ENROLL e
    JOIN COURSE c
        ON c.Course_ID = e.Course_ID
    JOIN SUBJECT s
        ON s.Subject_ID = c.Subject_ID
    JOIN DEPARTMENT d
        ON d.Dept_ID = s.Dept_ID
    -- FIX: alias 'l' conflict — bảng LECTURER dùng alias 'lect' tránh trùng với
    --      alias 'l' (LECTURE) trong subquery bên trên
    JOIN LECTURER lect
        ON lect.User_ID = c.Lecturer_ID
    JOIN USER_ACCOUNT ua
        ON ua.User_ID = lect.User_ID
    WHERE e.Student_ID = p_student_id
    ORDER BY c.Start_date DESC, c.Course_ID DESC;

    -- 2. Các khóa học có thể đăng ký (chưa đăng ký)
    SELECT
        c.Course_ID,
        c.Course_name,
        c.Description,
        c.Start_date,
        c.End_date,
        s.Subject_name,
        s.Credits,
        d.Dept_name,
        ua.Full_name AS Lecturer_name
    FROM COURSE c
    JOIN SUBJECT s
        ON s.Subject_ID = c.Subject_ID
    JOIN DEPARTMENT d
        ON d.Dept_ID = s.Dept_ID
    JOIN LECTURER lect
        ON lect.User_ID = c.Lecturer_ID
    JOIN USER_ACCOUNT ua
        ON ua.User_ID = lect.User_ID
    WHERE NOT EXISTS (
        SELECT 1
        FROM ENROLL e
        WHERE e.Student_ID = p_student_id
          AND e.Course_ID  = c.Course_ID
    )
    ORDER BY c.Start_date DESC, c.Course_ID DESC;
END //


--   5. sp_get_student_course_progress
--    - Mục đích: Lấy toàn bộ dữ liệu để sinh viên vào học 1 khóa học cụ thể.
--    - Đầu vào: ID sinh viên, ID khóa học.
--    - Hoạt động: Trả về 5 bảng kết quả:
--      1. Thông tin khóa + Trạng thái hoàn thành.
--      2. Danh sách bài giảng + Đã đánh dấu xem xong chưa (INTERACT).
--      3. Link tài liệu (MATERIAL_LINKS).
--      4. Danh sách Quiz + Trạng thái (Đã làm/Đã đậu).
--      5. Chi tiết câu hỏi của các Quiz đó.

CREATE PROCEDURE sp_get_student_course_progress (
    IN p_student_id INT,
    IN p_course_id  INT
)
BEGIN
    -- 1. Course Info & Enroll Status
    SELECT
        c.Course_ID,
        c.Course_name,
        c.Description,
        c.Start_date,
        c.End_date,
        s.Subject_name,
        s.Credits,
        d.Dept_name,
        ua.Full_name AS Lecturer_name,
        e.Enroll_status,
        e.Final_score,
        e.Completed_at
    FROM COURSE c
    JOIN SUBJECT s
        ON s.Subject_ID = c.Subject_ID
    JOIN DEPARTMENT d
        ON d.Dept_ID = s.Dept_ID
    JOIN LECTURER lect
        ON lect.User_ID = c.Lecturer_ID
    JOIN USER_ACCOUNT ua
        ON ua.User_ID = lect.User_ID
    JOIN ENROLL e
        ON e.Course_ID  = c.Course_ID
       AND e.Student_ID = p_student_id
    WHERE c.Course_ID = p_course_id;

    -- 2. Lectures & Interaction
    SELECT
        l.Lecture_ID,
        l.Title,
        l.Created_at,
        sec.Section_order,
        sec.Section_name,
        COALESCE(i.Status, 'Not Started') AS Interaction_status,
        i.Interacted_at
    FROM LECTURE l
    JOIN SECTION sec
        ON sec.Course_ID     = l.Course_ID
       AND sec.Section_order = l.Section_order
    LEFT JOIN INTERACT i
        ON i.Lecture_ID  = l.Lecture_ID
       AND i.Student_ID  = p_student_id
    WHERE l.Course_ID = p_course_id
    ORDER BY sec.Section_order ASC, l.Lecture_ID ASC;

    -- 3. Materials
    SELECT ml.Lecture_ID, ml.Link
    FROM MATERIAL_LINKS ml
    JOIN LECTURE l ON l.Lecture_ID = ml.Lecture_ID
    WHERE l.Course_ID = p_course_id
    ORDER BY ml.Lecture_ID ASC;

    -- 4. Quizzes & Progress
    SELECT
        q.Quiz_ID,
        q.Quiz_title,
        q.Open_time,
        q.Close_time,
        q.Duration,
        q.Max_attempts,
        q.Max_score,
        q.Pass_score,

        COUNT(a.Attempt_order)  AS Attempt_count,
        MAX(a.Total_score)      AS Best_score,

        CASE
            WHEN MAX(a.Total_score) >= q.Pass_score THEN 'Passed'
            WHEN COUNT(a.Attempt_order) > 0         THEN 'Attempted'
            ELSE 'Not Attempted'
        END AS Quiz_status

    FROM QUIZ q
    LEFT JOIN ATTEMPT a
        ON a.Quiz_ID    = q.Quiz_ID
       AND a.Student_ID = p_student_id
    WHERE q.Course_ID = p_course_id
    GROUP BY
        q.Quiz_ID,
        q.Quiz_title,
        q.Open_time,
        q.Close_time,
        q.Duration,
        q.Max_attempts,
        q.Max_score,
        q.Pass_score
    ORDER BY q.Quiz_ID ASC;

    -- 5. Questions for all Quizzes in Course
    SELECT
        q.Quiz_ID,
        q.Question_ID,
        q.Content,
        q.Question_type,
        mc.Score           AS MCQ_score,
        mc.MC_correct_answer,
        fb.Score           AS FITB_score,
        CASE
            WHEN q.Question_type = 'MCQ' THEN mc.Score
            ELSE fb.Score
        END                AS Question_score,
        (
            SELECT COUNT(*)
            FROM MC_OPTIONS mo
            WHERE mo.Quiz_ID     = q.Quiz_ID
              AND mo.Question_ID = q.Question_ID
        ) AS Option_count,
        (
            SELECT GROUP_CONCAT(mo.Option_text ORDER BY mo.Option_text SEPARATOR ' | ')
            FROM MC_OPTIONS mo
            WHERE mo.Quiz_ID     = q.Quiz_ID
              AND mo.Question_ID = q.Question_ID
        ) AS MCQ_options,
        (
            SELECT GROUP_CONCAT(fa.Answer_text ORDER BY fa.Answer_text SEPARATOR ' | ')
            FROM FITB_ANSWERS fa
            WHERE fa.Quiz_ID     = q.Quiz_ID
              AND fa.Question_ID = q.Question_ID
        ) AS FITB_correct_answers
    FROM QUESTION q
    LEFT JOIN MULTIPLE_CHOICE mc
        ON mc.Quiz_ID     = q.Quiz_ID
       AND mc.Question_ID = q.Question_ID
    LEFT JOIN FILL_IN_THE_BLANKS fb
        ON fb.Quiz_ID     = q.Quiz_ID
       AND fb.Question_ID = q.Question_ID
    JOIN QUIZ quiz
        ON quiz.Quiz_ID = q.Quiz_ID
    WHERE quiz.Course_ID = p_course_id
    ORDER BY q.Quiz_ID ASC, q.Question_ID ASC;
END //


--   6. sp_get_quiz_to_take
--    - Mục đích: Lấy đề thi để sinh viên bắt đầu làm bài.
--    - Đầu vào: ID sinh viên, ID quiz.
--    - Hoạt động: Kiểm tra quyền (có đăng ký khóa học không). Đếm số lần đã làm xem bị lố chưa. Trả về thông tin Quiz, Câu hỏi và Các đáp án lựa chọn
--      (MC_OPTIONS).

CREATE PROCEDURE sp_get_quiz_to_take (
    IN p_student_id INT,
    IN p_quiz_id    INT
)
BEGIN
    -- 1. Quiz Info & Auth Check
    SELECT
        q.*,
        c.Course_ID,
        c.Course_name
    FROM QUIZ q
    JOIN COURSE c
        ON c.Course_ID = q.Course_ID
    JOIN ENROLL e
        ON e.Course_ID  = c.Course_ID
       AND e.Student_ID = p_student_id
    WHERE q.Quiz_ID = p_quiz_id;

    -- 2. Attempt Count
    SELECT COUNT(*) AS attempt_count
    FROM ATTEMPT
    WHERE Student_ID = p_student_id
      AND Quiz_ID    = p_quiz_id;

    -- 3. Questions
    SELECT
        q.Quiz_ID,
        q.Question_ID,
        q.Content,
        q.Question_type,
        mc.Score AS MCQ_score,
        fb.Score AS FITB_score
    FROM QUESTION q
    LEFT JOIN MULTIPLE_CHOICE mc
        ON mc.Quiz_ID     = q.Quiz_ID
       AND mc.Question_ID = q.Question_ID
    LEFT JOIN FILL_IN_THE_BLANKS fb
        ON fb.Quiz_ID     = q.Quiz_ID
       AND fb.Question_ID = q.Question_ID
    WHERE q.Quiz_ID = p_quiz_id
    ORDER BY q.Question_ID ASC;

    -- 4. Options
    SELECT Quiz_ID, Question_ID, Option_text
    FROM MC_OPTIONS
    WHERE Quiz_ID = p_quiz_id
    ORDER BY Question_ID ASC, Option_text ASC;
END //

DELIMITER ;


--   7. sp_get_student_quiz_results
--    - Mục đích: Xem lại bài thi và đáp án sau khi nộp.
--    - Đầu vào: ID sinh viên, ID quiz, Số thứ tự lần thi (Attempt_order).
--    - Hoạt động: Trả về lịch sử các lần thi. NẾU truyền vào số lần thi cụ thể $\rightarrow$ trả thêm chi tiết từng câu hỏi sinh viên đã chọn gì, điểm bao
--      nhiêu, đáp án đúng là gì.


DROP PROCEDURE IF EXISTS sp_get_student_quiz_results;

DELIMITER //

CREATE PROCEDURE sp_get_student_quiz_results (
    IN p_Student_ID    INT,
    IN p_Quiz_ID       INT,
    IN p_Attempt_order INT   -- NULL nếu chưa có attempt nào
)
BEGIN
    -- ── 1. Quiz info + kiểm tra quyền truy cập ───────────────
    IF NOT EXISTS (
        SELECT 1
        FROM QUIZ q
        JOIN COURSE c ON c.Course_ID  = q.Course_ID
        JOIN ENROLL e ON e.Course_ID  = c.Course_ID
                     AND e.Student_ID = p_Student_ID
        WHERE q.Quiz_ID = p_Quiz_ID
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Bạn chưa đăng ký khóa học chứa bài kiểm tra này.';
    END IF;

    SELECT
        q.*,
        c.Course_ID,
        c.Course_name
    FROM QUIZ q
    JOIN COURSE c ON c.Course_ID  = q.Course_ID
    JOIN ENROLL e ON e.Course_ID  = c.Course_ID
                 AND e.Student_ID = p_Student_ID
    WHERE q.Quiz_ID = p_Quiz_ID;

    -- ── 2. Danh sách attempts ────────────────────────────────
    SELECT
        Student_ID,
        Quiz_ID,
        Attempt_order,
        Start_time,
        Submit_time,
        Total_score,
        CASE
            WHEN Total_score >= (
                SELECT Pass_score FROM QUIZ WHERE Quiz_ID = p_Quiz_ID
            ) THEN 'Passed'
            ELSE 'Failed'
        END AS Result_status
    FROM ATTEMPT
    WHERE Student_ID = p_Student_ID
      AND Quiz_ID    = p_Quiz_ID
    ORDER BY Attempt_order DESC;

    -- ── 3-5. Chi tiết attempt (chỉ chạy nếu có attempt) ─────
    IF p_Attempt_order IS NOT NULL THEN

        -- 3. Questions + answers
        SELECT
            q.Question_ID,
            q.Content,
            q.Question_type,
            ans.Student_answer,
            ans.Earned_score,
            mc.MC_correct_answer,
            mc.Score AS MCQ_score,
            fb.Score AS FITB_score
        FROM QUESTION q
        LEFT JOIN ANSWER ans
            ON ans.Quiz_ID       = q.Quiz_ID
           AND ans.Question_ID   = q.Question_ID
           AND ans.Student_ID    = p_Student_ID
           AND ans.Attempt_order = p_Attempt_order
        LEFT JOIN MULTIPLE_CHOICE mc
            ON mc.Quiz_ID      = q.Quiz_ID
           AND mc.Question_ID  = q.Question_ID
        LEFT JOIN FILL_IN_THE_BLANKS fb
            ON fb.Quiz_ID      = q.Quiz_ID
           AND fb.Question_ID  = q.Question_ID
        WHERE q.Quiz_ID = p_Quiz_ID
        ORDER BY q.Question_ID ASC;

        -- 4. MC options
        SELECT Quiz_ID, Question_ID, Option_text
        FROM MC_OPTIONS
        WHERE Quiz_ID = p_Quiz_ID
        ORDER BY Question_ID ASC, Option_text ASC;

        -- 5. FITB answers
        SELECT Quiz_ID, Question_ID, Answer_text
        FROM FITB_ANSWERS
        WHERE Quiz_ID = p_Quiz_ID
        ORDER BY Question_ID ASC, Answer_text ASC;

    END IF;
END //

DELIMITER ;

--   8. sp_get_lecturer_dashboard
--    - Mục đích: Đổ dữ liệu trang chủ (Dashboard) của Giảng viên.
--    - Đầu vào: ID giảng viên.
--    - Hoạt động: Trả về 2 bảng kết quả:
--      1. Danh sách các khóa học giảng viên đang dạy (kèm đếm số học sinh, số bài giảng,số bài test).
--      2. Thống kê tổng quan: Tổng số khóa học, tổng số học sinh, tổng bài giảng, tổng bài test.

DROP PROCEDURE IF EXISTS sp_get_lecturer_dashboard;

DELIMITER //

CREATE PROCEDURE sp_get_lecturer_dashboard (
    IN p_Lecturer_ID INT
)
BEGIN
    -- Validate lecturer tồn tại
    IF NOT EXISTS (
        SELECT 1 FROM LECTURER WHERE User_ID = p_Lecturer_ID
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Không tìm thấy giảng viên.';
    END IF;

    -- ── 1. Danh sách courses ──────────────────────────────────
    SELECT
        c.Course_ID,
        c.Course_name,
        c.Description,
        c.Start_date,
        c.End_date,
        c.Subject_ID,
        c.Lecturer_ID,
        s.Subject_name,
        s.Credits,
        d.Dept_name,
        (
            SELECT COUNT(DISTINCT e.Student_ID)
            FROM ENROLL e
            WHERE e.Course_ID = c.Course_ID
        ) AS Total_students,
        (
            SELECT COUNT(DISTINCT lec.Lecture_ID)
            FROM LECTURE lec
            WHERE lec.Course_ID = c.Course_ID
        ) AS Total_lectures,
        (
            SELECT COUNT(DISTINCT q.Quiz_ID)
            FROM QUIZ q
            WHERE q.Course_ID = c.Course_ID
        ) AS Total_quizzes
    FROM COURSE c
    JOIN SUBJECT    s ON s.Subject_ID = c.Subject_ID
    JOIN DEPARTMENT d ON d.Dept_ID    = s.Dept_ID
    WHERE c.Lecturer_ID = p_Lecturer_ID
    ORDER BY c.Start_date DESC, c.Course_ID DESC;

    -- ── 2. Dashboard summary (1 row) ─────────────────────────
    SELECT
        COUNT(DISTINCT c.Course_ID)   AS Total_courses,
        COUNT(DISTINCT e.Student_ID)  AS Total_students,
        COUNT(DISTINCT lec.Lecture_ID) AS Total_lectures,
        COUNT(DISTINCT q.Quiz_ID)     AS Total_quizzes
    FROM COURSE c
    LEFT JOIN ENROLL  e   ON e.Course_ID   = c.Course_ID
    LEFT JOIN LECTURE lec ON lec.Course_ID = c.Course_ID
    LEFT JOIN QUIZ    q   ON q.Course_ID   = c.Course_ID
    WHERE c.Lecturer_ID = p_Lecturer_ID;
END //

DELIMITER ;


--   9. sp_get_lecturer_course_detail
--    - Mục đích: Lấy toàn bộ dữ liệu để giảng viên vào Quản lý 1 khóa học.
--    - Đầu vào: ID giảng viên, ID khóa học.
--    - Hoạt động: Siêu to khổng lồ. Trả về 6 bảng kết quả:
--      1. Chương học (SECTION).
--      2. Bài giảng (LECTURE).
--      3. Tài liệu (MATERIAL_LINKS).
--      4. Các bài Test (QUIZ).
--      5. Ngân hàng câu hỏi của khóa học.
--      6. Danh sách lớp (Sinh viên, trạng thái Enroll, điểm số, học tình hình làm Quiz).

DROP PROCEDURE IF EXISTS sp_get_lecturer_course_detail;

DELIMITER //

CREATE PROCEDURE sp_get_lecturer_course_detail (
    IN p_Lecturer_ID INT,
    IN p_Course_ID   INT
)
BEGIN
    -- Validate: lecturer có sở hữu course này không
    IF NOT EXISTS (
        SELECT 1
        FROM COURSE
        WHERE Course_ID   = p_Course_ID
          AND Lecturer_ID = p_Lecturer_ID
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Bạn không có quyền xem hoặc quản lý khóa học này.';
    END IF;

    -- ── 1. Sections ──────────────────────────────────────────
    SELECT
        sec.Course_ID,
        sec.Section_order,
        sec.Section_name,
        sec.Num_of_lectures,
        COUNT(l.Lecture_ID) AS Actual_lecture_count
    FROM SECTION sec
    LEFT JOIN LECTURE l
        ON l.Course_ID     = sec.Course_ID
       AND l.Section_order = sec.Section_order
    WHERE sec.Course_ID = p_Course_ID
    GROUP BY
        sec.Course_ID,
        sec.Section_order,
        sec.Section_name,
        sec.Num_of_lectures
    ORDER BY sec.Section_order ASC;

    -- ── 2. Lectures ──────────────────────────────────────────
    SELECT
        l.Lecture_ID,
        l.Title,
        l.Created_at,
        l.Section_order,
        sec.Section_name,
        COUNT(ml.Link) AS Material_count
    FROM LECTURE l
    JOIN SECTION sec
        ON sec.Course_ID     = l.Course_ID
       AND sec.Section_order = l.Section_order
    LEFT JOIN MATERIAL_LINKS ml
        ON ml.Lecture_ID = l.Lecture_ID
    WHERE l.Course_ID = p_Course_ID
    GROUP BY
        l.Lecture_ID,
        l.Title,
        l.Created_at,
        l.Section_order,
        sec.Section_name
    ORDER BY l.Section_order ASC, l.Lecture_ID ASC;

    -- ── 3. Materials ─────────────────────────────────────────
    SELECT
        ml.Lecture_ID,
        ml.Link
    FROM MATERIAL_LINKS ml
    JOIN LECTURE l ON l.Lecture_ID = ml.Lecture_ID
    WHERE l.Course_ID = p_Course_ID
    ORDER BY ml.Lecture_ID ASC, ml.Link ASC;

    -- ── 4. Quizzes ───────────────────────────────────────────
    SELECT
        q.Quiz_ID,
        q.Quiz_title,
        q.Open_time,
        q.Close_time,
        q.Duration,
        q.Max_attempts,
        q.Max_score,
        q.Pass_score,
        COUNT(DISTINCT ques.Question_ID)                            AS Total_questions,
        COUNT(DISTINCT CONCAT(a.Student_ID, '-', a.Attempt_order)) AS Total_attempts
    FROM QUIZ q
    LEFT JOIN QUESTION ques ON ques.Quiz_ID = q.Quiz_ID
    LEFT JOIN ATTEMPT  a    ON a.Quiz_ID    = q.Quiz_ID
    WHERE q.Course_ID = p_Course_ID
    GROUP BY
        q.Quiz_ID,
        q.Quiz_title,
        q.Open_time,
        q.Close_time,
        q.Duration,
        q.Max_attempts,
        q.Max_score,
        q.Pass_score
    ORDER BY q.Quiz_ID ASC;

    -- ── 5. Questions ─────────────────────────────────────────
    SELECT
        q.Quiz_ID,
        q.Question_ID,
        q.Content,
        q.Question_type,
        mc.Score             AS MCQ_score,
        mc.MC_correct_answer,
        fb.Score             AS FITB_score,
        CASE
            WHEN q.Question_type = 'MCQ' THEN mc.Score
            ELSE fb.Score
        END                  AS Question_score,
        (
            SELECT COUNT(*)
            FROM MC_OPTIONS mo
            WHERE mo.Quiz_ID     = q.Quiz_ID
              AND mo.Question_ID = q.Question_ID
        )                    AS Option_count,
        (
            SELECT GROUP_CONCAT(mo.Option_text ORDER BY mo.Option_text SEPARATOR ' | ')
            FROM MC_OPTIONS mo
            WHERE mo.Quiz_ID     = q.Quiz_ID
              AND mo.Question_ID = q.Question_ID
        )                    AS MCQ_options,
        (
            SELECT GROUP_CONCAT(fa.Answer_text ORDER BY fa.Answer_text SEPARATOR ' | ')
            FROM FITB_ANSWERS fa
            WHERE fa.Quiz_ID     = q.Quiz_ID
              AND fa.Question_ID = q.Question_ID
        )                    AS FITB_correct_answers
    FROM QUESTION q
    LEFT JOIN MULTIPLE_CHOICE mc
        ON mc.Quiz_ID     = q.Quiz_ID
       AND mc.Question_ID = q.Question_ID
    LEFT JOIN FILL_IN_THE_BLANKS fb
        ON fb.Quiz_ID     = q.Quiz_ID
       AND fb.Question_ID = q.Question_ID
    JOIN QUIZ quiz ON quiz.Quiz_ID = q.Quiz_ID
    WHERE quiz.Course_ID = p_Course_ID
    ORDER BY q.Quiz_ID ASC, q.Question_ID ASC;

    -- ── 6. Students ──────────────────────────────────────────
    SELECT
        ua.User_ID       AS Student_ID,
        ua.Full_name,
        ua.Email,
        e.Enroll_status,
        e.Final_score,
        e.Completed_at,
        (
            SELECT COUNT(*)
            FROM QUIZ q
            WHERE q.Course_ID = e.Course_ID
        )                AS Total_quizzes,
        (
            SELECT COUNT(DISTINCT q.Quiz_ID)
            FROM QUIZ q
            JOIN ATTEMPT a
                ON a.Quiz_ID    = q.Quiz_ID
               AND a.Student_ID = e.Student_ID
            WHERE q.Course_ID = e.Course_ID
        )                AS Attempted_quizzes,
        (
            SELECT COUNT(DISTINCT q.Quiz_ID)
            FROM QUIZ q
            JOIN ATTEMPT a
                ON a.Quiz_ID      = q.Quiz_ID
               AND a.Student_ID   = e.Student_ID
               AND a.Total_score >= q.Pass_score
            WHERE q.Course_ID = e.Course_ID
        )                AS Passed_quizzes,
        (
            SELECT ROUND(AVG(best_score), 2)
            FROM (
                SELECT MAX(a2.Total_score) AS best_score
                FROM QUIZ q2
                JOIN ATTEMPT a2
                    ON a2.Quiz_ID    = q2.Quiz_ID
                   AND a2.Student_ID = e.Student_ID
                WHERE q2.Course_ID = e.Course_ID
                GROUP BY q2.Quiz_ID
            ) x
        )                AS Avg_best_quiz_score,
        CASE
            WHEN (SELECT COUNT(*) FROM QUIZ q WHERE q.Course_ID = e.Course_ID) = 0
                THEN 'NO_QUIZ'
            WHEN (
                SELECT COUNT(*)
                FROM ATTEMPT a
                JOIN QUIZ q ON q.Quiz_ID = a.Quiz_ID
                WHERE q.Course_ID  = e.Course_ID
                  AND a.Student_ID = e.Student_ID
            ) = 0
                THEN 'NOT_ATTEMPTED'
            WHEN (
                SELECT COUNT(DISTINCT q.Quiz_ID)
                FROM QUIZ q
                JOIN ATTEMPT a
                    ON a.Quiz_ID      = q.Quiz_ID
                   AND a.Student_ID   = e.Student_ID
                   AND a.Total_score >= q.Pass_score
                WHERE q.Course_ID = e.Course_ID
            ) = (SELECT COUNT(*) FROM QUIZ q WHERE q.Course_ID = e.Course_ID)
                THEN 'PASSED'
            ELSE 'FAILED'
        END              AS Quiz_learning_status
    FROM ENROLL e
    JOIN USER_ACCOUNT ua ON ua.User_ID = e.Student_ID
    WHERE e.Course_ID = p_Course_ID
    ORDER BY ua.Full_name ASC;
END //

DELIMITER ;