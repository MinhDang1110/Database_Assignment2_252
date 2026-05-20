USE LMS_BTL2;

DROP TRIGGER IF EXISTS trg_enroll_check_prerequisite_bi;
DROP TRIGGER IF EXISTS trg_enroll_check_prerequisite_bu;

DROP TRIGGER IF EXISTS trg_attempt_validate_bi;
DROP TRIGGER IF EXISTS trg_attempt_validate_bu;

DROP TRIGGER IF EXISTS trg_answer_validate_bi;
DROP TRIGGER IF EXISTS trg_answer_validate_bu;

DROP TRIGGER IF EXISTS trg_answer_update_attempt_total_ai;
DROP TRIGGER IF EXISTS trg_answer_update_attempt_total_au;
DROP TRIGGER IF EXISTS trg_answer_update_attempt_total_ad;

DELIMITER //

-- =========================================================
--   1.Trigger kiểm tra Môn tiên quyết
--   Gồm: trg_enroll_check_prerequisite_bi (Trước khi Insert) và trg_enroll_check_prerequisite_bu (Trước khi Update).
--    - Mục đích: Ngăn sinh viên "nhảy cóc" đăng ký môn học khi chưa học xong môn tiên quyết.
--    - Cách hoạt động: Khi sinh viên cố gắng đăng ký (INSERT INTO ENROLL), nó sẽ tự động dò xem khóa học đó thuộc Môn học nào. Rồi nó kiểm tra tiếp xem môn đó
--      có yêu cầu Môn tiên quyết không.
--    - Nếu có, nó lục lại lịch sử điểm của sinh viên xem đã Completed môn tiên quyết đó chưa. Chưa qua -> Chặn lại báo lỗi ngay: "Không thể đăng
--      ký... Sinh viên chưa hoàn thành môn tiên quyết:..."
-- =========================================================

CREATE TRIGGER trg_enroll_check_prerequisite_bi
BEFORE INSERT ON ENROLL
FOR EACH ROW
BEGIN
    DECLARE v_advanced_subject_id INT;
    DECLARE v_missing_subjects VARCHAR(500);
    DECLARE v_error_message VARCHAR(600);

    IF NOT EXISTS (
        SELECT 1
        FROM STUDENT
        WHERE User_ID = NEW.Student_ID
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Student_ID không tồn tại trong bảng STUDENT.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM COURSE
        WHERE Course_ID = NEW.Course_ID
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Course_ID không tồn tại trong bảng COURSE.';
    END IF;

    IF NEW.Enroll_status <> 'Dropped' THEN
        SELECT Subject_ID
        INTO v_advanced_subject_id
        FROM COURSE
        WHERE Course_ID = NEW.Course_ID;

        SELECT GROUP_CONCAT(s.Subject_name SEPARATOR ', ')
        INTO v_missing_subjects
        FROM PREREQUISITE p
        JOIN SUBJECT s
            ON s.Subject_ID = p.Prerequisite_subject_ID
        WHERE p.Advanced_subject_ID = v_advanced_subject_id
          AND NOT EXISTS (
              SELECT 1
              FROM ENROLL e
              JOIN COURSE c
                  ON c.Course_ID = e.Course_ID
              WHERE e.Student_ID = NEW.Student_ID
                AND c.Subject_ID = p.Prerequisite_subject_ID
                AND e.Enroll_status = 'Completed'
          );

        IF v_missing_subjects IS NOT NULL THEN
            SET v_error_message = CONCAT(
                'Không thể đăng ký khóa học. Sinh viên chưa hoàn thành môn tiên quyết: ',
                v_missing_subjects
            );

            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = v_error_message;
        END IF;
    END IF;
END //


CREATE TRIGGER trg_enroll_check_prerequisite_bu
BEFORE UPDATE ON ENROLL
FOR EACH ROW
BEGIN
    DECLARE v_advanced_subject_id INT;
    DECLARE v_missing_subjects VARCHAR(500);
    DECLARE v_error_message VARCHAR(600);

    IF NOT EXISTS (
        SELECT 1
        FROM STUDENT
        WHERE User_ID = NEW.Student_ID
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Student_ID không tồn tại trong bảng STUDENT.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM COURSE
        WHERE Course_ID = NEW.Course_ID
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Course_ID không tồn tại trong bảng COURSE.';
    END IF;

    IF NEW.Enroll_status <> 'Dropped' THEN
        SELECT Subject_ID
        INTO v_advanced_subject_id
        FROM COURSE
        WHERE Course_ID = NEW.Course_ID;

        SELECT GROUP_CONCAT(s.Subject_name SEPARATOR ', ')
        INTO v_missing_subjects
        FROM PREREQUISITE p
        JOIN SUBJECT s
            ON s.Subject_ID = p.Prerequisite_subject_ID
        WHERE p.Advanced_subject_ID = v_advanced_subject_id
          AND NOT EXISTS (
              SELECT 1
              FROM ENROLL e
              JOIN COURSE c
                  ON c.Course_ID = e.Course_ID
              WHERE e.Student_ID = NEW.Student_ID
                AND c.Subject_ID = p.Prerequisite_subject_ID
                AND e.Enroll_status = 'Completed'
          );

        IF v_missing_subjects IS NOT NULL THEN
            SET v_error_message = CONCAT(
                'Không thể cập nhật đăng ký khóa học. Sinh viên chưa hoàn thành môn tiên quyết: ',
                v_missing_subjects
            );

            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = v_error_message;
        END IF;
    END IF;
END //


-- =========================================================
--   2. Nhóm Trigger kiểm tra Lượt làm bài (Attempt)
--   Gồm: trg_attempt_validate_bi và trg_attempt_validate_bu.
--    - Mục đích: Đảm bảo tính hợp lệ của một lượt thi trắc nghiệm.
--    - Cách hoạt động: Khi có 1 lượt thi mới được lưu vào bảng ATTEMPT:
--      - Nó check xem số thứ tự của lượt thi này có vượt quá số lần thi tối đa (Max_attempts) mà Giảng viên cài đặt cho bài Quiz không. Vượt $\rightarrow$
--        Chặn.
--      - Nó check thời gian bắt đầu và nộp bài có nằm gọn trong khoảng thời gian mở/đóng của bài Quiz không. Thi ngoài giờ $\rightarrow$ Chặn.
--      - Nó check tổng điểm của lượt thi có lố điểm tối đa của bài Quiz không -> Chặn.
-- =========================================================

CREATE TRIGGER trg_attempt_validate_bi
BEFORE INSERT ON ATTEMPT
FOR EACH ROW
BEGIN
    DECLARE v_open_time DATETIME;
    DECLARE v_close_time DATETIME;
    DECLARE v_max_attempts INT;
    DECLARE v_max_score DECIMAL(6,2);

    IF NOT EXISTS (
        SELECT 1
        FROM QUIZ
        WHERE Quiz_ID = NEW.Quiz_ID
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Quiz_ID không tồn tại trong bảng QUIZ.';
    END IF;

    SELECT Open_time, Close_time, Max_attempts, Max_score
    INTO v_open_time, v_close_time, v_max_attempts, v_max_score
    FROM QUIZ
    WHERE Quiz_ID = NEW.Quiz_ID;

    IF NEW.Attempt_order > v_max_attempts THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Số thứ tự lượt làm bài vượt quá số lần làm bài tối đa của Quiz.';
    END IF;

    IF NEW.Start_time < v_open_time OR NEW.Start_time > v_close_time THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Thời gian bắt đầu làm bài phải nằm trong thời gian mở và đóng của Quiz.';
    END IF;

    IF NEW.Submit_time IS NOT NULL
       AND (NEW.Submit_time < v_open_time OR NEW.Submit_time > v_close_time) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Thời gian nộp bài phải nằm trong thời gian mở và đóng của Quiz.';
    END IF;

    IF NEW.Total_score > v_max_score THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Tổng điểm của lượt làm bài không được vượt quá điểm tối đa của Quiz.';
    END IF;
END //


CREATE TRIGGER trg_attempt_validate_bu
BEFORE UPDATE ON ATTEMPT
FOR EACH ROW
BEGIN
    DECLARE v_open_time DATETIME;
    DECLARE v_close_time DATETIME;
    DECLARE v_max_attempts INT;
    DECLARE v_max_score DECIMAL(6,2);

    IF NOT EXISTS (
        SELECT 1
        FROM QUIZ
        WHERE Quiz_ID = NEW.Quiz_ID
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Quiz_ID không tồn tại trong bảng QUIZ.';
    END IF;

    SELECT Open_time, Close_time, Max_attempts, Max_score
    INTO v_open_time, v_close_time, v_max_attempts, v_max_score
    FROM QUIZ
    WHERE Quiz_ID = NEW.Quiz_ID;

    IF NEW.Attempt_order > v_max_attempts THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Số thứ tự lượt làm bài vượt quá số lần làm bài tối đa của Quiz.';
    END IF;

    IF NEW.Start_time < v_open_time OR NEW.Start_time > v_close_time THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Thời gian bắt đầu làm bài phải nằm trong thời gian mở và đóng của Quiz.';
    END IF;

    IF NEW.Submit_time IS NOT NULL
       AND (NEW.Submit_time < v_open_time OR NEW.Submit_time > v_close_time) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Thời gian nộp bài phải nằm trong thời gian mở và đóng của Quiz.';
    END IF;

    IF NEW.Total_score > v_max_score THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Tổng điểm của lượt làm bài không được vượt quá điểm tối đa của Quiz.';
    END IF;
END //


-- =========================================================
--   3. Nhóm Trigger kiểm tra Điểm câu trả lời
--   Gồm: trg_answer_validate_bi và trg_answer_validate_bu.
--    - Mục đích: Ngăn chặn việc gian lận/lỗi hệ thống ghi điểm sai cho từng câu hỏi.
--    - Cách hoạt động: Khi sinh viên nộp đáp án 1 câu (INSERT INTO ANSWER), nó soi lại xem câu đó là trắc nghiệm (MCQ) hay điền khuyết (FILL_BLANK) và có điểm
--      tối đa là bao nhiêu. Nếu điểm sinh viên đạt được (`Earned_score`) lại cao hơn điểm tối đa của câu hỏi đó $\rightarrow$ Báo lỗi và chặn lưu.
-- =========================================================

CREATE TRIGGER trg_answer_validate_bi
BEFORE INSERT ON ANSWER
FOR EACH ROW
BEGIN
    DECLARE v_question_type VARCHAR(20);
    DECLARE v_question_score DECIMAL(6,2);

    IF NOT EXISTS (
        SELECT 1
        FROM QUESTION
        WHERE Quiz_ID = NEW.Quiz_ID
          AND Question_ID = NEW.Question_ID
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Câu hỏi không tồn tại trong bảng QUESTION.';
    END IF;

    SELECT Question_type
    INTO v_question_type
    FROM QUESTION
    WHERE Quiz_ID = NEW.Quiz_ID
      AND Question_ID = NEW.Question_ID;

    IF v_question_type = 'MCQ' THEN
        SELECT Score
        INTO v_question_score
        FROM MULTIPLE_CHOICE
        WHERE Quiz_ID = NEW.Quiz_ID
          AND Question_ID = NEW.Question_ID;
    ELSE
        SELECT Score
        INTO v_question_score
        FROM FILL_IN_THE_BLANKS
        WHERE Quiz_ID = NEW.Quiz_ID
          AND Question_ID = NEW.Question_ID;
    END IF;

    IF NEW.Earned_score > v_question_score THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Điểm đạt được của câu trả lời không được vượt quá điểm tối đa của câu hỏi.';
    END IF;
END //


CREATE TRIGGER trg_answer_validate_bu
BEFORE UPDATE ON ANSWER
FOR EACH ROW
BEGIN
    DECLARE v_question_type VARCHAR(20);
    DECLARE v_question_score DECIMAL(6,2);

    IF NOT EXISTS (
        SELECT 1
        FROM QUESTION
        WHERE Quiz_ID = NEW.Quiz_ID
          AND Question_ID = NEW.Question_ID
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Câu hỏi không tồn tại trong bảng QUESTION.';
    END IF;

    SELECT Question_type
    INTO v_question_type
    FROM QUESTION
    WHERE Quiz_ID = NEW.Quiz_ID
      AND Question_ID = NEW.Question_ID;

    IF v_question_type = 'MCQ' THEN
        SELECT Score
        INTO v_question_score
        FROM MULTIPLE_CHOICE
        WHERE Quiz_ID = NEW.Quiz_ID
          AND Question_ID = NEW.Question_ID;
    ELSE
        SELECT Score
        INTO v_question_score
        FROM FILL_IN_THE_BLANKS
        WHERE Quiz_ID = NEW.Quiz_ID
          AND Question_ID = NEW.Question_ID;
    END IF;

    IF NEW.Earned_score > v_question_score THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Điểm đạt được của câu trả lời không được vượt quá điểm tối đa của câu hỏi.';
    END IF;
END //


-- =========================================================
--   4. Nhóm Trigger tự động tính Thuộc tính dẫn xuất
--   Gồm: trg_answer_update_attempt_total_ai, _au, và _ad.
--    - Mục đích: Tự động tính tổng điểm (Total_score) cho một lượt làm bài.
--    - Cách hoạt động:
--      - _ai (Sau khi Insert): Cứ mỗi lần lưu điểm 1 câu trả lời mới, nó tự động cộng dồn điểm đó vào cột Total_score của lượt thi tương ứng bên bảng ATTEMPT.
--      - _au (Sau khi Update): Nếu điểm của 1 câu trả lời bị sửa lại, nó tự lấy tổng điểm trừ đi điểm cũ, cộng vô điểm mới.
--      - _ad (Sau khi Delete): Nếu xóa 1 câu trả lời, nó tự động trừ điểm câu đó khỏi tổng điểm.
-- =========================================================

CREATE TRIGGER trg_answer_update_attempt_total_ai
AFTER INSERT ON ANSWER
FOR EACH ROW
BEGIN
    UPDATE ATTEMPT
    SET Total_score = Total_score + NEW.Earned_score
    WHERE Student_ID = NEW.Student_ID
      AND Quiz_ID = NEW.Quiz_ID
      AND Attempt_order = NEW.Attempt_order;
END //


CREATE TRIGGER trg_answer_update_attempt_total_au
AFTER UPDATE ON ANSWER
FOR EACH ROW
BEGIN
    UPDATE ATTEMPT
    SET Total_score = Total_score - OLD.Earned_score + NEW.Earned_score
    WHERE Student_ID = NEW.Student_ID
      AND Quiz_ID = NEW.Quiz_ID
      AND Attempt_order = NEW.Attempt_order;
END //


CREATE TRIGGER trg_answer_update_attempt_total_ad
AFTER DELETE ON ANSWER
FOR EACH ROW
BEGIN
    UPDATE ATTEMPT
    SET Total_score = GREATEST(Total_score - OLD.Earned_score, 0)
    WHERE Student_ID = OLD.Student_ID
      AND Quiz_ID = OLD.Quiz_ID
      AND Attempt_order = OLD.Attempt_order;
END //

DELIMITER ;


-- =========================================================
-- ĐỒNG BỘ LẠI TOTAL_SCORE CHO DỮ LIỆU ĐÃ INSERT TRƯỚC KHI TẠO TRIGGER
-- Nếu bạn chạy trigger sau file insert mẫu, câu này giúp đảm bảo Total_score đúng.
-- =========================================================

SET SQL_SAFE_UPDATES = 0;

UPDATE ATTEMPT a
LEFT JOIN (
    SELECT
        Student_ID,
        Quiz_ID,
        Attempt_order,
        SUM(Earned_score) AS Sum_score
    FROM ANSWER
    GROUP BY Student_ID, Quiz_ID, Attempt_order
) x
    ON x.Student_ID = a.Student_ID
   AND x.Quiz_ID = a.Quiz_ID
   AND x.Attempt_order = a.Attempt_order
SET a.Total_score = IFNULL(x.Sum_score, 0);

SET SQL_SAFE_UPDATES = 1;