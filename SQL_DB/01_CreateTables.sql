DROP DATABASE IF EXISTS LMS_BTL2;
CREATE DATABASE LMS_BTL2
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE LMS_BTL2;

-- =========================================================
-- 1. USER, STUDENT, LECTURER
-- =========================================================

CREATE TABLE USER_ACCOUNT (
    User_ID INT AUTO_INCREMENT,
    Username VARCHAR(50) NOT NULL,
    `Password` VARCHAR(100) NOT NULL,
    Email VARCHAR(100) NOT NULL,
    User_role VARCHAR(20) NOT NULL,
    SSN CHAR(12) NOT NULL,
    Full_name VARCHAR(100) NOT NULL,
    Address VARCHAR(255),

    CONSTRAINT PK_USER_ACCOUNT
        PRIMARY KEY (User_ID),

    CONSTRAINT UQ_USER_ACCOUNT_USERNAME
        UNIQUE (Username),

    CONSTRAINT UQ_USER_ACCOUNT_EMAIL
        UNIQUE (Email),

    CONSTRAINT UQ_USER_ACCOUNT_SSN
        UNIQUE (SSN),

    CONSTRAINT UQ_USER_ACCOUNT_ID_ROLE
        UNIQUE (User_ID, User_role),

    CONSTRAINT CK_USER_ACCOUNT_USERNAME
        CHECK (Username REGEXP '^[A-Za-z0-9_]+$'),

    CONSTRAINT CK_USER_ACCOUNT_EMAIL
        CHECK (Email REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'),

    CONSTRAINT CK_USER_ACCOUNT_PASSWORD
        CHECK (
            CHAR_LENGTH(`Password`) >= 12
            AND `Password` REGEXP '[[:upper:]]'
            AND `Password` REGEXP '[[:lower:]]'
            AND `Password` REGEXP '[0-9]'
            AND `Password` REGEXP '[^A-Za-z0-9]'
        ),

    CONSTRAINT CK_USER_ACCOUNT_ROLE
        CHECK (User_role IN ('Student', 'Lecturer')),

    CONSTRAINT CK_USER_ACCOUNT_SSN
        CHECK (SSN REGEXP '^[0-9]{12}$')
) ENGINE = InnoDB;


CREATE TABLE LECTURER (
    User_ID INT,
    User_role VARCHAR(20) NOT NULL DEFAULT 'Lecturer',
    Teaching_experience INT NOT NULL DEFAULT 0,
    Academic_degree ENUM('CN', 'KS', 'ThS', 'TS') NOT NULL DEFAULT 'ThS',
    Academic_title ENUM('PGS', 'GS') NULL,

    CONSTRAINT PK_LECTURER
        PRIMARY KEY (User_ID),

    CONSTRAINT CK_LECTURER_ROLE
        CHECK (User_role = 'Lecturer'),
        
	CONSTRAINT CK_LECTURER_ACADEMIC_DEGREE
        CHECK (Academic_degree IN ('CN', 'KS', 'ThS', 'TS')),

    CONSTRAINT CK_LECTURER_EXPERIENCE
        CHECK (Teaching_experience >= 0),

    CONSTRAINT FK_LECTURER_USER
        FOREIGN KEY (User_ID, User_role)
        REFERENCES USER_ACCOUNT(User_ID, User_role)
        ON DELETE CASCADE
) ENGINE = InnoDB;


CREATE TABLE DEPARTMENT (
    Dept_ID INT AUTO_INCREMENT,
    Dept_name VARCHAR(100) NOT NULL,
    Founding_date DATE NOT NULL,

    CONSTRAINT PK_DEPARTMENT
        PRIMARY KEY (Dept_ID),

    CONSTRAINT UQ_DEPARTMENT_NAME
        UNIQUE (Dept_name)
) ENGINE = InnoDB;


CREATE TABLE MAJOR (
    Dept_ID INT,
    Major_ID INT,
    Major_name VARCHAR(100) NOT NULL,

    CONSTRAINT PK_MAJOR
        PRIMARY KEY (Dept_ID, Major_ID),

    CONSTRAINT UQ_MAJOR_NAME
        UNIQUE (Dept_ID, Major_name),

    CONSTRAINT FK_MAJOR_DEPARTMENT
        FOREIGN KEY (Dept_ID)
        REFERENCES DEPARTMENT(Dept_ID)
        ON DELETE CASCADE
) ENGINE = InnoDB;


CREATE TABLE STUDENT (
    User_ID INT,
    User_role VARCHAR(20) NOT NULL DEFAULT 'Student',
    Dept_ID INT NOT NULL,
    Major_ID INT NOT NULL,

    CONSTRAINT PK_STUDENT
        PRIMARY KEY (User_ID),

    CONSTRAINT CK_STUDENT_ROLE
        CHECK (User_role = 'Student'),

    CONSTRAINT FK_STUDENT_USER
        FOREIGN KEY (User_ID, User_role)
        REFERENCES USER_ACCOUNT(User_ID, User_role)
        ON DELETE CASCADE,

    CONSTRAINT FK_STUDENT_MAJOR
        FOREIGN KEY (Dept_ID, Major_ID)
        REFERENCES MAJOR(Dept_ID, Major_ID)
) ENGINE = InnoDB;


CREATE TABLE PHONE_NUMBERS (
    User_ID INT,
    Phone_number CHAR(10),

    CONSTRAINT PK_PHONE_NUMBERS
        PRIMARY KEY (User_ID, Phone_number),

    CONSTRAINT FK_PHONE_USER
        FOREIGN KEY (User_ID)
        REFERENCES USER_ACCOUNT(User_ID)
        ON DELETE CASCADE,

    CONSTRAINT CK_PHONE_NUMBER
        CHECK (Phone_number REGEXP '^0[0-9]{9}$')
) ENGINE = InnoDB;


CREATE TABLE DEGREES (
    Lecturer_ID INT,
    Degree VARCHAR(100),

    CONSTRAINT PK_DEGREES
        PRIMARY KEY (Lecturer_ID, Degree),

    CONSTRAINT FK_DEGREES_LECTURER
        FOREIGN KEY (Lecturer_ID)
        REFERENCES LECTURER(User_ID)
        ON DELETE CASCADE
) ENGINE = InnoDB;


-- =========================================================
-- 2. WORK_FOR, TERMS
-- =========================================================

CREATE TABLE WORK_FOR (
    Lecturer_ID INT,
    Dept_ID INT,

    CONSTRAINT PK_WORK_FOR
        PRIMARY KEY (Lecturer_ID, Dept_ID),

    CONSTRAINT UQ_WORK_FOR_LECTURER
        UNIQUE (Lecturer_ID),

    CONSTRAINT FK_WORK_FOR_LECTURER
        FOREIGN KEY (Lecturer_ID)
        REFERENCES LECTURER(User_ID)
        ON DELETE CASCADE,

    CONSTRAINT FK_WORK_FOR_DEPARTMENT
        FOREIGN KEY (Dept_ID)
        REFERENCES DEPARTMENT(Dept_ID)
        ON DELETE CASCADE
) ENGINE = InnoDB;


CREATE TABLE TERMS (
    Dept_ID INT,
    Lecturer_ID INT NOT NULL,
    Start_date DATE NOT NULL,
    End_date DATE NOT NULL,

    CONSTRAINT PK_TERMS
        PRIMARY KEY (Dept_ID),

    CONSTRAINT UQ_TERMS_LECTURER
        UNIQUE (Lecturer_ID),

    CONSTRAINT FK_TERMS_DEPARTMENT
        FOREIGN KEY (Dept_ID)
        REFERENCES DEPARTMENT(Dept_ID)
        ON DELETE CASCADE,

    CONSTRAINT FK_TERMS_WORK_FOR
        FOREIGN KEY (Lecturer_ID, Dept_ID)
        REFERENCES WORK_FOR(Lecturer_ID, Dept_ID),

    CONSTRAINT CK_TERMS_DATE
        CHECK (End_date > Start_date)
) ENGINE = InnoDB;


-- =========================================================
-- 3. SUBJECT, PREREQUISITE, COURSE, ENROLL
-- =========================================================

CREATE TABLE SUBJECT (
    Subject_ID INT AUTO_INCREMENT,
    Subject_name VARCHAR(100) NOT NULL,
    Credits INT NOT NULL,
    Syllabus VARCHAR(500) NOT NULL,
    Dept_ID INT NOT NULL,

    CONSTRAINT PK_SUBJECT
        PRIMARY KEY (Subject_ID),

    CONSTRAINT FK_SUBJECT_DEPARTMENT
        FOREIGN KEY (Dept_ID)
        REFERENCES DEPARTMENT(Dept_ID),

    CONSTRAINT CK_SUBJECT_CREDITS
        CHECK (Credits BETWEEN 1 AND 4),

    CONSTRAINT CK_SUBJECT_SYLLABUS
        CHECK (
            Syllabus LIKE 'http://%'
            OR Syllabus LIKE 'https://%'
            OR Syllabus LIKE 'file://%'
            OR Syllabus LIKE '%.pdf'
        )
) ENGINE = InnoDB;


CREATE TABLE PREREQUISITE (
    Prerequisite_subject_ID INT,
    Advanced_subject_ID INT,

    CONSTRAINT PK_PREREQUISITE
        PRIMARY KEY (Prerequisite_subject_ID, Advanced_subject_ID),

    CONSTRAINT FK_PREREQUISITE_BASE_SUBJECT
        FOREIGN KEY (Prerequisite_subject_ID)
        REFERENCES SUBJECT(Subject_ID),

    CONSTRAINT FK_PREREQUISITE_ADVANCED_SUBJECT
        FOREIGN KEY (Advanced_subject_ID)
        REFERENCES SUBJECT(Subject_ID),

    CONSTRAINT CK_PREREQUISITE_NOT_SELF
        CHECK (Prerequisite_subject_ID <> Advanced_subject_ID)
) ENGINE = InnoDB;


CREATE TABLE COURSE (
    Course_ID INT AUTO_INCREMENT,
    Course_name VARCHAR(150) NOT NULL,
    Description VARCHAR(1000),
    Start_date DATE NOT NULL,
    End_date DATE NOT NULL,
    Subject_ID INT NOT NULL,
    Lecturer_ID INT NOT NULL,

    CONSTRAINT PK_COURSE
        PRIMARY KEY (Course_ID),

    CONSTRAINT FK_COURSE_SUBJECT
        FOREIGN KEY (Subject_ID)
        REFERENCES SUBJECT(Subject_ID),

    CONSTRAINT FK_COURSE_LECTURER
        FOREIGN KEY (Lecturer_ID)
        REFERENCES LECTURER(User_ID),

    CONSTRAINT CK_COURSE_DATE
        CHECK (End_date >= Start_date),

    CONSTRAINT UQ_COURSE_OFFERING
        UNIQUE (Subject_ID, Lecturer_ID, Course_name, Start_date)
) ENGINE = InnoDB;


CREATE TABLE ENROLL (
    Student_ID INT,
    Course_ID INT,
    Enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Enroll_status VARCHAR(20) NOT NULL DEFAULT 'Enrolled',
    Final_score DECIMAL(5,2),
    Completed_at DATETIME,

    CONSTRAINT PK_ENROLL
        PRIMARY KEY (Student_ID, Course_ID),

    CONSTRAINT FK_ENROLL_STUDENT
        FOREIGN KEY (Student_ID)
        REFERENCES STUDENT(User_ID)
        ON DELETE CASCADE,

    CONSTRAINT FK_ENROLL_COURSE
        FOREIGN KEY (Course_ID)
        REFERENCES COURSE(Course_ID)
        ON DELETE CASCADE,

    CONSTRAINT CK_ENROLL_STATUS
        CHECK (Enroll_status IN ('Enrolled', 'Completed', 'Dropped')),

    CONSTRAINT CK_ENROLL_FINAL_SCORE
        CHECK (Final_score IS NULL OR Final_score BETWEEN 0 AND 10),

    CONSTRAINT CK_ENROLL_COMPLETED_AT
        CHECK (
            (Enroll_status = 'Completed' AND Completed_at IS NOT NULL)
            OR
            (Enroll_status <> 'Completed' AND Completed_at IS NULL)
        )
) ENGINE = InnoDB;


-- =========================================================
-- 4. SECTION, LECTURE, INTERACT, MATERIAL_LINKS
-- =========================================================

CREATE TABLE SECTION (
    Course_ID INT,
    Section_order INT,
    Section_name VARCHAR(150) NOT NULL,
    Num_of_lectures INT NOT NULL DEFAULT 0,
    Creator_ID INT NOT NULL,

    CONSTRAINT PK_SECTION
        PRIMARY KEY (Course_ID, Section_order),

    CONSTRAINT FK_SECTION_COURSE
        FOREIGN KEY (Course_ID)
        REFERENCES COURSE(Course_ID)
        ON DELETE CASCADE,

    CONSTRAINT FK_SECTION_CREATOR
        FOREIGN KEY (Creator_ID)
        REFERENCES LECTURER(User_ID),

    CONSTRAINT CK_SECTION_ORDER
        CHECK (Section_order > 0),

    CONSTRAINT CK_SECTION_NUM_LECTURES
        CHECK (Num_of_lectures >= 0)
) ENGINE = InnoDB;


CREATE TABLE LECTURE (
    Lecture_ID INT AUTO_INCREMENT,
    Title VARCHAR(150) NOT NULL,
    Created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Course_ID INT NOT NULL,
    Section_order INT NOT NULL,
    Creator_ID INT NOT NULL,

    CONSTRAINT PK_LECTURE
        PRIMARY KEY (Lecture_ID),

    CONSTRAINT FK_LECTURE_SECTION
        FOREIGN KEY (Course_ID, Section_order)
        REFERENCES SECTION(Course_ID, Section_order)
        ON DELETE CASCADE,

    CONSTRAINT FK_LECTURE_CREATOR
        FOREIGN KEY (Creator_ID)
        REFERENCES LECTURER(User_ID)
) ENGINE = InnoDB;


CREATE TABLE INTERACT (
    Student_ID INT,
    Lecture_ID INT,
    Status VARCHAR(20) NOT NULL DEFAULT 'Not Started',
    Interacted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT PK_INTERACT
        PRIMARY KEY (Student_ID, Lecture_ID),

    CONSTRAINT FK_INTERACT_STUDENT
        FOREIGN KEY (Student_ID)
        REFERENCES STUDENT(User_ID)
        ON DELETE CASCADE,

    CONSTRAINT FK_INTERACT_LECTURE
        FOREIGN KEY (Lecture_ID)
        REFERENCES LECTURE(Lecture_ID)
        ON DELETE CASCADE,

    CONSTRAINT CK_INTERACT_STATUS
        CHECK (Status IN ('Not Started', 'In Progress', 'Completed'))
) ENGINE = InnoDB;


CREATE TABLE MATERIAL_LINKS (
    Lecture_ID INT,
    Link VARCHAR(500),

    CONSTRAINT PK_MATERIAL_LINKS
        PRIMARY KEY (Lecture_ID, Link),

    CONSTRAINT FK_MATERIAL_LINKS_LECTURE
        FOREIGN KEY (Lecture_ID)
        REFERENCES LECTURE(Lecture_ID)
        ON DELETE CASCADE,

    CONSTRAINT CK_MATERIAL_LINKS_URL
        CHECK (
            Link LIKE 'http://%'
            OR Link LIKE 'https://%'
            OR Link LIKE 'file://%'
        )
) ENGINE = InnoDB;


-- =========================================================
-- 5. QUIZ, QUESTION, MULTIPLE_CHOICE, FILL_IN_THE_BLANKS
-- =========================================================

CREATE TABLE QUIZ (
    Quiz_ID INT AUTO_INCREMENT,
    Max_attempts INT NOT NULL,
    Pass_score DECIMAL(6,2) NOT NULL,
    Duration INT NOT NULL,
    Max_score DECIMAL(6,2) NOT NULL,
    Close_time DATETIME NOT NULL,
    Open_time DATETIME NOT NULL,
    Creator_ID INT NOT NULL,
    Course_ID INT NOT NULL,

    CONSTRAINT PK_QUIZ
        PRIMARY KEY (Quiz_ID),

    CONSTRAINT FK_QUIZ_CREATOR
        FOREIGN KEY (Creator_ID)
        REFERENCES LECTURER(User_ID),

    CONSTRAINT FK_QUIZ_COURSE
        FOREIGN KEY (Course_ID)
        REFERENCES COURSE(Course_ID)
        ON DELETE CASCADE,

    CONSTRAINT CK_QUIZ_MAX_ATTEMPTS
        CHECK (Max_attempts >= 1),

    CONSTRAINT CK_QUIZ_DURATION
        CHECK (Duration > 0),

    CONSTRAINT CK_QUIZ_MAX_SCORE
        CHECK (Max_score > 0),

    CONSTRAINT CK_QUIZ_PASS_SCORE
        CHECK (Pass_score BETWEEN 0 AND Max_score),

    CONSTRAINT CK_QUIZ_TIME
        CHECK (Close_time >= DATE_ADD(Open_time, INTERVAL Duration MINUTE))
) ENGINE = InnoDB;


CREATE TABLE QUESTION (
    Quiz_ID INT,
    Question_ID INT,
    Creator_ID INT NOT NULL,
    Content VARCHAR(1000) NOT NULL,
    Question_type VARCHAR(20) NOT NULL,

    CONSTRAINT PK_QUESTION
        PRIMARY KEY (Quiz_ID, Question_ID),

    CONSTRAINT UQ_QUESTION_TYPE
        UNIQUE (Quiz_ID, Question_ID, Question_type),

    CONSTRAINT FK_QUESTION_QUIZ
        FOREIGN KEY (Quiz_ID)
        REFERENCES QUIZ(Quiz_ID)
        ON DELETE CASCADE,

    CONSTRAINT FK_QUESTION_CREATOR
        FOREIGN KEY (Creator_ID)
        REFERENCES LECTURER(User_ID),

    CONSTRAINT CK_QUESTION_TYPE
        CHECK (Question_type IN ('MCQ', 'FILL_BLANK')),

    CONSTRAINT CK_QUESTION_FILL_BLANK_CONTENT
        CHECK (
            Question_type = 'MCQ'
            OR Content LIKE '%{blank}%'
        )
) ENGINE = InnoDB;


CREATE TABLE MULTIPLE_CHOICE (
    Quiz_ID INT,
    Question_ID INT,
    Question_type VARCHAR(20) NOT NULL DEFAULT 'MCQ',
    MC_correct_answer VARCHAR(500) NOT NULL,
    Score DECIMAL(6,2) NOT NULL,
    Shuffle_flag BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT PK_MULTIPLE_CHOICE
        PRIMARY KEY (Quiz_ID, Question_ID),

    CONSTRAINT CK_MULTIPLE_CHOICE_TYPE
        CHECK (Question_type = 'MCQ'),

    CONSTRAINT CK_MULTIPLE_CHOICE_SCORE
        CHECK (Score > 0),

    CONSTRAINT FK_MULTIPLE_CHOICE_QUESTION
        FOREIGN KEY (Quiz_ID, Question_ID, Question_type)
        REFERENCES QUESTION(Quiz_ID, Question_ID, Question_type)
        ON DELETE CASCADE
) ENGINE = InnoDB;


CREATE TABLE FILL_IN_THE_BLANKS (
    Quiz_ID INT,
    Question_ID INT,
    Question_type VARCHAR(20) NOT NULL DEFAULT 'FILL_BLANK',
    Score DECIMAL(6,2) NOT NULL,

    CONSTRAINT PK_FILL_IN_THE_BLANKS
        PRIMARY KEY (Quiz_ID, Question_ID),

    CONSTRAINT CK_FILL_BLANK_TYPE
        CHECK (Question_type = 'FILL_BLANK'),

    CONSTRAINT CK_FILL_BLANK_SCORE
        CHECK (Score > 0),

    CONSTRAINT FK_FILL_BLANK_QUESTION
        FOREIGN KEY (Quiz_ID, Question_ID, Question_type)
        REFERENCES QUESTION(Quiz_ID, Question_ID, Question_type)
        ON DELETE CASCADE
) ENGINE = InnoDB;


CREATE TABLE MC_OPTIONS (
    Quiz_ID INT,
    Question_ID INT,
    Option_text VARCHAR(500),

    CONSTRAINT PK_MC_OPTIONS
        PRIMARY KEY (Quiz_ID, Question_ID, Option_text),

    CONSTRAINT FK_MC_OPTIONS_MULTIPLE_CHOICE
        FOREIGN KEY (Quiz_ID, Question_ID)
        REFERENCES MULTIPLE_CHOICE(Quiz_ID, Question_ID)
        ON DELETE CASCADE
) ENGINE = InnoDB;


CREATE TABLE FITB_ANSWERS (
    Quiz_ID INT,
    Question_ID INT,
    Answer_text VARCHAR(500),

    CONSTRAINT PK_FITB_ANSWERS
        PRIMARY KEY (Quiz_ID, Question_ID, Answer_text),

    CONSTRAINT FK_FITB_ANSWERS_FILL_BLANK
        FOREIGN KEY (Quiz_ID, Question_ID)
        REFERENCES FILL_IN_THE_BLANKS(Quiz_ID, Question_ID)
        ON DELETE CASCADE
) ENGINE = InnoDB;


-- =========================================================
-- 6. ATTEMPT, ANSWER
-- =========================================================

CREATE TABLE ATTEMPT (
    Student_ID INT,
    Quiz_ID INT,
    Attempt_order INT,
    Start_time DATETIME NOT NULL,
    Submit_time DATETIME,
    Total_score DECIMAL(6,2) NOT NULL DEFAULT 0,

    CONSTRAINT PK_ATTEMPT
        PRIMARY KEY (Student_ID, Quiz_ID, Attempt_order),

    CONSTRAINT FK_ATTEMPT_STUDENT
        FOREIGN KEY (Student_ID)
        REFERENCES STUDENT(User_ID)
        ON DELETE CASCADE,

    CONSTRAINT FK_ATTEMPT_QUIZ
        FOREIGN KEY (Quiz_ID)
        REFERENCES QUIZ(Quiz_ID)
        ON DELETE CASCADE,

    CONSTRAINT CK_ATTEMPT_ORDER
        CHECK (Attempt_order > 0),

    CONSTRAINT CK_ATTEMPT_TIME
        CHECK (Submit_time IS NULL OR Submit_time >= Start_time),

    CONSTRAINT CK_ATTEMPT_TOTAL_SCORE
        CHECK (Total_score >= 0)
) ENGINE = InnoDB;


CREATE TABLE ANSWER (
    Student_ID INT,
    Quiz_ID INT,
    Attempt_order INT,
    Question_ID INT,
    Student_answer VARCHAR(1000) NOT NULL,
    Earned_score DECIMAL(6,2) NOT NULL DEFAULT 0,

    CONSTRAINT PK_ANSWER
        PRIMARY KEY (Student_ID, Quiz_ID, Attempt_order, Question_ID),

    CONSTRAINT FK_ANSWER_ATTEMPT
        FOREIGN KEY (Student_ID, Quiz_ID, Attempt_order)
        REFERENCES ATTEMPT(Student_ID, Quiz_ID, Attempt_order)
        ON DELETE CASCADE,

    CONSTRAINT FK_ANSWER_QUESTION
        FOREIGN KEY (Quiz_ID, Question_ID)
        REFERENCES QUESTION(Quiz_ID, Question_ID)
        ON DELETE CASCADE,

    CONSTRAINT CK_ANSWER_EARNED_SCORE
        CHECK (Earned_score >= 0)
) ENGINE = InnoDB;

-- Cho phép USER_ACCOUNT có thêm role Admin
ALTER TABLE USER_ACCOUNT
DROP CHECK CK_USER_ACCOUNT_ROLE;

ALTER TABLE USER_ACCOUNT
ADD CONSTRAINT CK_USER_ACCOUNT_ROLE
CHECK (User_role IN ('Student', 'Lecturer', 'Admin'));

-- Tạo tài khoản admin mặc định
INSERT INTO USER_ACCOUNT
(User_ID, Username, `Password`, Email, User_role, SSN, Full_name, Address)
VALUES
(100, 'admin', 'Admin@12345678', 'admin@lms.edu.vn', 'Admin', '999999999999', 'System Administrator', 'LMS System')
ON DUPLICATE KEY UPDATE
Username = Username;


ALTER TABLE DEPARTMENT
ADD COLUMN Head_ID INT NULL;

ALTER TABLE DEPARTMENT
ADD CONSTRAINT FK_DEPARTMENT_HEAD
FOREIGN KEY (Head_ID)
REFERENCES LECTURER(User_ID)
ON UPDATE CASCADE
ON DELETE SET NULL;

ALTER TABLE DEPARTMENT
ADD CONSTRAINT UQ_DEPARTMENT_HEAD
UNIQUE (Head_ID);



ALTER TABLE QUIZ
ADD COLUMN Quiz_title VARCHAR(255) NOT NULL DEFAULT 'Bài kiểm tra'
AFTER Quiz_ID;


SET SQL_SAFE_UPDATES = 0;
UPDATE QUIZ
SET Quiz_title = CONCAT('Quiz ', Quiz_ID)
WHERE Quiz_title = 'Bài kiểm tra';
SET SQL_SAFE_UPDATES = 1;