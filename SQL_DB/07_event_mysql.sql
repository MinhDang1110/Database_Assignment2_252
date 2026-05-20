-- 1. Bật trình quản lý Event của MySQL lên
SET GLOBAL event_scheduler = ON;
    
-- 2. Chọn database
USE LMS_BTL2;
    
-- 3. Xóa event cũ nếu đã tồn tại (để tránh lỗi khi chạy lại code nhiều lần)
DROP EVENT IF EXISTS ev_check_expired_terms;
    
-- 4. Tạo Event quét mỗi ngày
CREATE EVENT ev_check_expired_terms
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO
    UPDATE DEPARTMENT d
    JOIN TERMS t ON d.Dept_ID = t.Dept_ID
    SET d.Head_ID = NULL
    WHERE t.End_date < CURDATE();