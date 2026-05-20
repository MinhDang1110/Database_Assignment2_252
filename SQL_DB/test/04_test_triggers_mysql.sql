USE LMS_BTL2;

-- =========================================================
-- TEST 1: Trigger môn tiên quyết - trường hợp SAI
-- Student 5 chưa hoàn thành môn "Cấu trúc Dữ liệu và Giải thuật"
-- nhưng đăng ký Course 3: "Hệ Cơ sở Dữ liệu"
-- Kỳ vọng: báo lỗi môn tiên quyết.
-- =========================================================

INSERT INTO ENROLL
(Student_ID, Course_ID, Enrolled_at, Enroll_status, Final_score, Completed_at)
VALUES
(5, 3, '2026-03-01 08:00:00', 'Enrolled', NULL, NULL);


-- =========================================================
-- TEST 2: Trigger môn tiên quyết - trường hợp ĐÚNG
-- Student 2 đã hoàn thành Course 1 và Course 2.
-- Course 3 thuộc môn Hệ Cơ sở Dữ liệu, có tiên quyết là Course 2.
-- Kỳ vọng: insert thành công.
-- =========================================================

INSERT INTO ENROLL
(Student_ID, Course_ID, Enrolled_at, Enroll_status, Final_score, Completed_at)
VALUES
(2, 3, '2026-03-01 08:00:00', 'Enrolled', NULL, NULL);

SELECT *
FROM ENROLL
WHERE Student_ID = 2
  AND Course_ID = 3;


-- =========================================================
-- TEST 3: Trigger ATTEMPT - vượt quá số lần làm bài tối đa
-- Quiz 2 có Max_attempts = 2.
-- Attempt_order = 3 là sai.
-- Kỳ vọng: báo lỗi.
-- =========================================================

INSERT INTO ATTEMPT
(Student_ID, Quiz_ID, Attempt_order, Start_time, Submit_time, Total_score)
VALUES
(2, 2, 3, '2026-03-10 08:00:00', '2026-03-10 08:30:00', 0.00);


-- =========================================================
-- TEST 4: Trigger ATTEMPT - thời gian làm bài ngoài thời gian mở quiz
-- Kỳ vọng: báo lỗi.
-- =========================================================

INSERT INTO ATTEMPT
(Student_ID, Quiz_ID, Attempt_order, Start_time, Submit_time, Total_score)
VALUES
(2, 2, 1, '2026-04-10 08:00:00', '2026-04-10 08:30:00', 0.00);


-- =========================================================
-- TEST 5: Trigger tính Total_score từ ANSWER
-- Tạo 1 attempt mới với Total_score ban đầu = 0.
-- Sau đó insert ANSWER: trigger tự cộng điểm.
-- =========================================================

INSERT INTO ATTEMPT
(Student_ID, Quiz_ID, Attempt_order, Start_time, Submit_time, Total_score)
VALUES
(2, 2, 1, '2026-03-10 08:00:00', '2026-03-10 08:30:00', 0.00);

INSERT INTO ANSWER
(Student_ID, Quiz_ID, Attempt_order, Question_ID, Student_answer, Earned_score)
VALUES
(2, 2, 1, 1, 'Linked list', 6.00);

SELECT *
FROM ATTEMPT
WHERE Student_ID = 2
  AND Quiz_ID = 2
  AND Attempt_order = 1;


-- =========================================================
-- TEST 6: Insert thêm câu trả lời thứ 2, Total_score phải tăng tiếp.
-- Kỳ vọng: Total_score = 10.00
-- =========================================================

INSERT INTO ANSWER
(Student_ID, Quiz_ID, Attempt_order, Question_ID, Student_answer, Earned_score)
VALUES
(2, 2, 1, 2, 'next', 4.00);

SELECT *
FROM ATTEMPT
WHERE Student_ID = 2
  AND Quiz_ID = 2
  AND Attempt_order = 1;


-- =========================================================
-- TEST 7: UPDATE Earned_score, Total_score phải tự cập nhật.
-- Kỳ vọng: Total_score từ 10.00 thành 9.00
-- =========================================================

UPDATE ANSWER
SET Earned_score = 3.00
WHERE Student_ID = 2
  AND Quiz_ID = 2
  AND Attempt_order = 1
  AND Question_ID = 2;

SELECT *
FROM ATTEMPT
WHERE Student_ID = 2
  AND Quiz_ID = 2
  AND Attempt_order = 1;


-- =========================================================
-- TEST 8: DELETE ANSWER, Total_score phải tự giảm.
-- Kỳ vọng: Total_score từ 9.00 thành 6.00
-- =========================================================

DELETE FROM ANSWER
WHERE Student_ID = 2
  AND Quiz_ID = 2
  AND Attempt_order = 1
  AND Question_ID = 2;

SELECT *
FROM ATTEMPT
WHERE Student_ID = 2
  AND Quiz_ID = 2
  AND Attempt_order = 1;


-- =========================================================
-- TEST 9: Earned_score vượt quá điểm tối đa của câu hỏi
-- Quiz 2 Question 2 là FILL_BLANK, Score = 4.
-- Earned_score = 9 là sai.
-- Kỳ vọng: báo lỗi.
-- =========================================================

INSERT INTO ANSWER
(Student_ID, Quiz_ID, Attempt_order, Question_ID, Student_answer, Earned_score)
VALUES
(2, 2, 1, 2, 'next', 9.00);