const express = require('express');
const session = require('express-session');
const pool = require('./db');
require('dotenv').config();

const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));


app.use(session({
  secret: process.env.SESSION_SECRET || 'lms_btl2_secret',
  resave: false,
  saveUninitialized: false
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

const PORT = process.env.PORT || 4500;


// Định nghĩa Backend
// Phần 1: Các function bổ trợ

function getMysqlErrorMessage(error) {
  if (error && error.sqlMessage) return error.sqlMessage;
  if (error && error.message) return error.message;
  return 'Đã xảy ra lỗi không xác định.';
}

async function canManageCourse(user, courseId) {
  if (!user) return false;

  if (user.role === 'Admin') {
    return true;
  }

  if (user.role === 'Lecturer') {
    const [rows] = await pool.query(
      `
      SELECT Course_ID
      FROM COURSE
      WHERE Course_ID = ?
        AND Lecturer_ID = ?
      `,
      [courseId, user.id]
    );

    return rows.length > 0;
  }

  return false;
}


function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login?error=Vui lòng đăng nhập để sử dụng hệ thống');
  }
  next();
}

function requireLecturer(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login?error=Vui lòng đăng nhập để sử dụng hệ thống');
  }

  if (req.session.user.role !== 'Lecturer') {
    return res.status(403).render('error', {
      message: 'Bạn không có quyền thực hiện chức năng này. Chỉ giảng viên mới được thêm, sửa, xóa khóa học.'
    });
  }

  next();
}

function requireStudent(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login?error=Vui lòng đăng nhập để sử dụng hệ thống');
  }

  if (req.session.user.role !== 'Student') {
    return res.status(403).render('error', {
      message: 'Chức năng này chỉ dành cho sinh viên.'
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login?error=Vui lòng đăng nhập để sử dụng hệ thống');
  }

  if (req.session.user.role !== 'Admin') {
    return res.status(403).render('error', {
      message: 'Chức năng này chỉ dành cho quản trị viên hệ thống.'
    });
  }

  next();
}


function requireLecturerOrAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login?error=Vui lòng đăng nhập để sử dụng');
  }

  if (!['Lecturer', 'Admin'].includes(req.session.user.role)) {
    return res.status(403).render('error', {
      message: 'Chức năng này chỉ dành cho Giảng viên hoặc Quản trị viên.'
    });
  }

  next();
}

function validatePassword(password) {
  return (
    password &&
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

async function getSubjectsAndLecturers() {
  const [subjects] = await pool.query(`
    SELECT Subject_ID, Subject_name
    FROM SUBJECT
    ORDER BY Subject_name
  `);

  const [lecturers] = await pool.query(`
SELECT
  l.User_ID AS Lecturer_ID,
  ua.Full_name,
  l.Academic_degree,
  l.Academic_title,
  CONCAT(
    CASE
      WHEN l.Academic_title = 'PGS' THEN 'PGS. '
      WHEN l.Academic_title = 'GS' THEN 'GS. '
      ELSE ''
    END,
    CASE
      WHEN l.Academic_degree = 'CN' THEN 'CN. '
      WHEN l.Academic_degree = 'KS' THEN 'KS. '
      WHEN l.Academic_degree = 'ThS' THEN 'ThS. '
      WHEN l.Academic_degree = 'TS' THEN 'TS. '
      ELSE ''
    END,
    ua.Full_name
  ) AS Lecturer_display_name
    FROM LECTURER l
    JOIN USER_ACCOUNT ua ON ua.User_ID = l.User_ID
    ORDER BY ua.Full_name
  `);

  return { subjects, lecturers };
}

async function getDepartments() {
  const [departments] = await pool.query(`
    SELECT Dept_ID, Dept_name
    FROM DEPARTMENT
    ORDER BY Dept_name
  `);

  return departments;
}

async function getMajors() {
  const [majors] = await pool.query(`
    SELECT 
      m.Dept_ID,
      m.Major_ID,
      m.Major_name,
      d.Dept_name
    FROM MAJOR m
    JOIN DEPARTMENT d ON d.Dept_ID = m.Dept_ID
    ORDER BY d.Dept_name, m.Major_name
  `);

  return majors;
}

async function getCourseById(courseId) {
  const [rows] = await pool.query(
    `
    SELECT
      Course_ID,
      Course_name,
      Description,
      Start_date,
      End_date,
      Subject_ID,
      Lecturer_ID
    FROM COURSE
    WHERE Course_ID = ?
    `,
    [courseId]
  );

  return rows[0];
}


async function updateStudentCourseCompletion(conn, studentId, courseId) {
  const [rows] = await conn.query(
    `
    SELECT
      (
        SELECT COUNT(*)
        FROM LECTURE
        WHERE Course_ID = ?
      ) AS total_lectures,

      (
        SELECT COUNT(*)
        FROM LECTURE l
        JOIN INTERACT i ON i.Lecture_ID = l.Lecture_ID
        WHERE l.Course_ID = ?
          AND i.Student_ID = ?
          AND i.Status = 'Completed'
      ) AS completed_lectures,

      (
        SELECT COUNT(*)
        FROM QUIZ
        WHERE Course_ID = ?
      ) AS total_quizzes,

      (
        SELECT COUNT(*)
        FROM QUIZ q
        WHERE q.Course_ID = ?
          AND EXISTS (
            SELECT 1
            FROM ATTEMPT a
            WHERE a.Student_ID = ?
              AND a.Quiz_ID = q.Quiz_ID
              AND a.Total_score >= q.Pass_score
          )
      ) AS passed_quizzes
    `,
    [courseId, courseId, studentId, courseId, courseId, studentId]
  );

  const r = rows[0];

  const totalItems =
    Number(r.total_lectures || 0) + Number(r.total_quizzes || 0);

  const completedItems =
    Number(r.completed_lectures || 0) + Number(r.passed_quizzes || 0);

  if (totalItems > 0 && completedItems === totalItems) {
    const [scoreRows] = await conn.query(
      `
      SELECT ROUND(AVG(best_score), 2) AS final_score
      FROM (
        SELECT q.Quiz_ID, MAX(a.Total_score) AS best_score
        FROM QUIZ q
        LEFT JOIN ATTEMPT a
          ON a.Quiz_ID = q.Quiz_ID
         AND a.Student_ID = ?
        WHERE q.Course_ID = ?
        GROUP BY q.Quiz_ID
      ) x
      `,
      [studentId, courseId]
    );

    await conn.query(
      `
      UPDATE ENROLL
      SET Enroll_status = 'Completed',
          Final_score = ?,
          Completed_at = IFNULL(Completed_at, NOW())
      WHERE Student_ID = ?
        AND Course_ID = ?
      `,
      [scoreRows[0].final_score || 0, studentId, courseId]
    );
  } else {
    await conn.query(
      `
      UPDATE ENROLL
      SET Enroll_status = 'Enrolled',
          Final_score = NULL,
          Completed_at = NULL
      WHERE Student_ID = ?
        AND Course_ID = ?
        AND Enroll_status = 'Completed'
      `,
      [studentId, courseId]
    );
  }
}


// Khi giảng viên thêm section hoặc lecture mới, toàn bộ sinh viên đã
// 'Completed' khoá học này phải bị reset về 'Enrolled' vì tổng số mục tăng lên và họ chưa hoàn thành phần mới.
async function resetCompletedEnrollsForCourse(conn, courseId) {
  // Lấy danh sách sinh viên đang Enrolled (bao gồm cả Completed)
  const [students] = await conn.query(
    `
    SELECT Student_ID
    FROM ENROLL
    WHERE Course_ID = ?
      AND Enroll_status IN ('Enrolled', 'Completed')
    `,
    [courseId]
  );

  for (const { Student_ID } of students) {
    await updateStudentCourseCompletion(conn, Student_ID, courseId);
  }
}

// Cập nhật lại điểm quiz cho toàn bộ sinh viên
async function regradeQuizForAllStudents(conn, quizId) {
  const [quizRows] = await conn.query(
    `
    SELECT Quiz_ID, Course_ID
    FROM QUIZ
    WHERE Quiz_ID = ?
    `,
    [quizId]
  );

  if (quizRows.length === 0) {
    throw new Error('Quiz không tồn tại, không thể chấm lại điểm.');
  }

  const courseId = quizRows[0].Course_ID;

  const [questions] = await conn.query(
    `
    SELECT Quiz_ID, Question_ID
    FROM QUESTION
    WHERE Quiz_ID = ?
    `,
    [quizId]
  );

  const [attempts] = await conn.query(
    `
    SELECT Student_ID, Quiz_ID, Attempt_order
    FROM ATTEMPT
    WHERE Quiz_ID = ?
    `,
    [quizId]
  );

  for (const attempt of attempts) {
    for (const question of questions) {
      await conn.query(
        `
        INSERT INTO ANSWER
        (Student_ID, Quiz_ID, Attempt_order, Question_ID, Student_answer, Earned_score)
        VALUES (?, ?, ?, ?, '', 0)
        ON DUPLICATE KEY UPDATE
          Student_answer = Student_answer
        `,
        [
          attempt.Student_ID,
          quizId,
          attempt.Attempt_order,
          question.Question_ID
        ]
      );
    }
  }

  await conn.query(
    `
    UPDATE ANSWER a
    JOIN QUESTION q
      ON q.Quiz_ID = a.Quiz_ID
     AND q.Question_ID = a.Question_ID
    LEFT JOIN MULTIPLE_CHOICE mc
      ON mc.Quiz_ID = q.Quiz_ID
     AND mc.Question_ID = q.Question_ID
    LEFT JOIN FILL_IN_THE_BLANKS fb
      ON fb.Quiz_ID = q.Quiz_ID
     AND fb.Question_ID = q.Question_ID
    SET a.Earned_score =
      CASE
        WHEN q.Question_type = 'MCQ'
         AND LOWER(TRIM(a.Student_answer)) = LOWER(TRIM(mc.MC_correct_answer))
        THEN mc.Score

        WHEN q.Question_type = 'FILL_BLANK'
         AND EXISTS (
           SELECT 1
           FROM FITB_ANSWERS fa
           WHERE fa.Quiz_ID = a.Quiz_ID
             AND fa.Question_ID = a.Question_ID
             AND LOWER(TRIM(fa.Answer_text)) = LOWER(TRIM(a.Student_answer))
         )
        THEN fb.Score

        ELSE 0
      END
    WHERE a.Quiz_ID = ?
    `,
    [quizId]
  );

  await conn.query(
    `
    UPDATE ATTEMPT a
    LEFT JOIN (
      SELECT
        Student_ID,
        Quiz_ID,
        Attempt_order,
        SUM(Earned_score) AS total_score
      FROM ANSWER
      WHERE Quiz_ID = ?
      GROUP BY Student_ID, Quiz_ID, Attempt_order
    ) x
      ON x.Student_ID = a.Student_ID
     AND x.Quiz_ID = a.Quiz_ID
     AND x.Attempt_order = a.Attempt_order
    SET a.Total_score = IFNULL(x.total_score, 0)
    WHERE a.Quiz_ID = ?
    `,
    [quizId, quizId]
  );

  const [students] = await conn.query(
    `
    SELECT Student_ID
    FROM ENROLL
    WHERE Course_ID = ?
    `,
    [courseId]
  );

  for (const student of students) {
    await updateStudentCourseCompletion(conn, student.Student_ID, courseId);
  }
}



async function syncQuizMaxScore(conn, quizId) {
  const [rows] = await conn.query(
    `
    SELECT
      IFNULL(SUM(question_score), 0) AS total_score
    FROM (
      SELECT mc.Score AS question_score
      FROM MULTIPLE_CHOICE mc
      WHERE mc.Quiz_ID = ?

      UNION ALL

      SELECT fb.Score AS question_score
      FROM FILL_IN_THE_BLANKS fb
      WHERE fb.Quiz_ID = ?
    ) x
    `,
    [quizId, quizId]
  );

  const totalScore = Number(rows[0].total_score || 0);

  await conn.query(
    `
    UPDATE QUIZ
    SET Max_score = ?,
        Pass_score = LEAST(Pass_score, ?)
    WHERE Quiz_ID = ?
    `,
    [totalScore, totalScore, quizId]
  );

  return totalScore;
}


function normalizeDateTimeLocal(value) {
  if (!value) return null;

  const normalized = String(value).replace('T', ' ');

  if (normalized.length === 16) {
    return `${normalized}:00`;
  }

  return normalized;
}

async function getLecturerOwnedCourse(db, lecturerId, courseId) {
  const [rows] = await db.query(
    `
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
      d.Dept_name
    FROM COURSE c
    JOIN SUBJECT s
      ON s.Subject_ID = c.Subject_ID
    JOIN DEPARTMENT d
      ON d.Dept_ID = s.Dept_ID
    WHERE c.Course_ID = ?
      AND c.Lecturer_ID = ?
    `,
    [courseId, lecturerId]
  );

  return rows[0] || null;
}

async function getLecturerOwnedQuiz(db, lecturerId, quizId) {
  const [rows] = await db.query(
    `
    SELECT
      q.*,
      c.Course_ID,
      c.Course_name,
      c.Lecturer_ID
    FROM QUIZ q
    JOIN COURSE c
      ON c.Course_ID = q.Course_ID
    WHERE q.Quiz_ID = ?
      AND c.Lecturer_ID = ?
    `,
    [quizId, lecturerId]
  );

  return rows[0] || null;
}


// =========================================================
// AUTH
// =========================================================

app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  if (req.session.user.role === 'Student') {
    return res.redirect('/student/dashboard');
  }

  if (req.session.user.role === 'Lecturer') {
    return res.redirect('/lecturer/dashboard');
  }

  if (req.session.user.role === 'Admin') {
    return res.redirect('/admin/dashboard');
  }

  return res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('login', {
    error: req.query.error || null,
    success: req.query.success || null
  });
});

// Cần thay bằng Call Procedure
app.post('/login', async (req, res) => {
  try {
    const { username_or_email, password } = req.body;

    if (!username_or_email || !password) {
      return res.status(400).render('login', {
        error: 'Vui lòng nhập tên đăng nhập/email và mật khẩu.',
        success: null
      });
    }

    const [rows] = await pool.query(
      `
      SELECT User_ID, Username, Password, Email, User_role, Full_name
      FROM USER_ACCOUNT
      WHERE Username = ? OR Email = ?
      LIMIT 1
      `,
      [username_or_email, username_or_email]
    );

    if (rows.length === 0) {
      return res.status(401).render('login', {
        error: 'Tài khoản không tồn tại.',
        success: null
      });
    }

    const user = rows[0];

    if (user.Password !== password) {
      return res.status(401).render('login', {
        error: 'Mật khẩu không đúng.',
        success: null
      });
    }

    req.session.user = {
      id: user.User_ID,
      username: user.Username,
      email: user.Email,
      role: user.User_role,
      fullName: user.Full_name
    };

if (user.User_role === 'Student') {
  return res.redirect('/student/dashboard');
}

if (user.User_role === 'Lecturer') {
  return res.redirect('/lecturer/dashboard');
}

if (user.User_role === 'Admin') {
  return res.redirect('/admin/dashboard');
}

return res.redirect('/login');


  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});

app.get('/register', async (req, res) => {
  try {
    const departments = await getDepartments();
    const majors = await getMajors();

    res.render('register', {
      departments,
      majors,
      form: {},
      error: null,
      success: null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});


// Cần thay bằng Call Procedure
app.post('/register', async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const {
      Username,
      Password,
      Confirm_password,
      Email,
      User_role,
      SSN,
      Phone_number,
      Full_name,
      Address,
      Dept_ID,
      Major_ID,
      Teaching_experience,
      Academic_degree,
      Academic_title
    } = req.body;
    const departments = await getDepartments();
    const majors = await getMajors();

    if (!Username || !Password || !Confirm_password || !Email || !User_role || !SSN || !Full_name) {
      return res.status(400).render('register', {
        departments,
        majors,
        form: req.body,
        success: null,
        error: 'Vui lòng nhập đầy đủ thông tin bắt buộc.'
      });
    }

    if (Password !== Confirm_password) {
      return res.status(400).render('register', {
        departments,
        majors,
        form: req.body,
        success: null,
        error: 'Mật khẩu xác nhận không khớp.'
      });
    }

    if (!/^[A-Za-z0-9_]+$/.test(Username)) {
      return res.status(400).render('register', {
        departments,
        majors,
        form: req.body,
        success: null,
        error: 'Username chỉ được chứa chữ cái, chữ số và dấu gạch dưới.'
      });
    }

    if (!/^[0-9]{12}$/.test(SSN)) {
      return res.status(400).render('register', {
        departments,
        majors,
        form: req.body,
        success: null,
        error: 'SSN/CCCD phải gồm đúng 12 chữ số.'
      });
    }

    if (Phone_number && !/^0[0-9]{9}$/.test(Phone_number)) {
      return res.status(400).render('register', {
        departments,
        majors,
        form: req.body,
        success: null,
        error: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0.'
      });
    }

    if (!validatePassword(Password)) {
      return res.status(400).render('register', {
        departments,
        majors,
        form: req.body,
        success: null,
        error: 'Mật khẩu phải có ít nhất 12 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt.'
      });
    }

    if (!['Student', 'Lecturer'].includes(User_role)) {
      return res.status(400).render('register', {
        departments,
        majors,
        form: req.body,
        success: null,
        error: 'Vai trò tài khoản không hợp lệ.'
      });
    }

    if (User_role === 'Student' && (!Dept_ID || !Major_ID)) {
      return res.status(400).render('register', {
        departments,
        majors,
        form: req.body,
        success: null,
        error: 'Sinh viên phải chọn khoa và chuyên ngành.'
      });
    }

    if (User_role === 'Lecturer' && !Dept_ID) {
      return res.status(400).render('register', {
        departments,
        majors,
        form: req.body,
        success: null,
        error: 'Giảng viên phải chọn khoa công tác.'
      });
    }
    if (User_role === 'Lecturer' && !['CN', 'KS', 'ThS', 'TS'].includes(Academic_degree)) {
  return res.status(400).render('register', {
    departments,
    majors,
    form: req.body,
    success: null,
    error: 'Giảng viên phải chọn học vị hợp lệ.'
  });
}

if (
  User_role === 'Lecturer' &&
  Academic_title &&
  !['PGS', 'GS'].includes(Academic_title)
) {
  return res.status(400).render('register', {
    departments,
    majors,
    form: req.body,
    success: null,
    error: 'Học hàm không hợp lệ.'
  });
}

    await conn.beginTransaction();

    const [duplicated] = await conn.query(
      `
      SELECT User_ID
      FROM USER_ACCOUNT
      WHERE Username = ? OR Email = ? OR SSN = ?
      LIMIT 1
      `,
      [Username, Email, SSN]
    );

    if (duplicated.length > 0) {
      await conn.rollback();

      return res.status(400).render('register', {
        departments,
        majors,
        form: req.body,
        success: null,
        error: 'Username, email hoặc SSN đã tồn tại.'
      });
    }

    const [result] = await conn.query(
      `
      INSERT INTO USER_ACCOUNT
      (Username, Password, Email, User_role, SSN, Full_name, Address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Username.trim(),
        Password,
        Email.trim(),
        User_role,
        SSN,
        Full_name.trim(),
        Address || null
      ]
    );

    const newUserId = result.insertId;

    if (Phone_number) {
      await conn.query(
        `
        INSERT INTO PHONE_NUMBERS
        (User_ID, Phone_number)
        VALUES (?, ?)
        `,
        [newUserId, Phone_number.trim()]
      );
    }

    if (User_role === 'Student') {
      await conn.query(
        `
        INSERT INTO STUDENT
        (User_ID, Dept_ID, Major_ID)
        VALUES (?, ?, ?)
        `,
        [newUserId, Number(Dept_ID), Number(Major_ID)]
      );
    }

    if (User_role === 'Lecturer') {
      await conn.query(
        `
        INSERT INTO LECTURER
        (User_ID, Teaching_experience, Academic_degree, Academic_title)
        VALUES (?, ?, ?, ?)
        `,
        [
          newUserId,
          Number(Teaching_experience || 0),
          Academic_degree || 'ThS',
          Academic_title || null
        ]
      );

      await conn.query(
        `
        INSERT INTO WORK_FOR
        (Lecturer_ID, Dept_ID)
        VALUES (?, ?)
        `,
        [newUserId, Number(Dept_ID)]
      );

      // Lưu danh sách văn bằng (nếu có)
      const rawDegrees = req.body.degrees || [];
      const degreeList = (Array.isArray(rawDegrees) ? rawDegrees : [rawDegrees])
        .map(d => d.trim())
        .filter(d => d.length > 0 && d.length <= 100);

      for (const deg of degreeList) {
        await conn.query(
          `INSERT IGNORE INTO DEGREES (Lecturer_ID, Degree) VALUES (?, ?)`,
          [newUserId, deg]
        );
      }
    }

    await conn.commit();

    res.redirect('/login?success=Tạo tài khoản thành công. Vui lòng đăng nhập.');
  } catch (error) {
    await conn.rollback();

    const departments = await getDepartments();
    const majors = await getMajors();

    res.status(400).render('register', {
      departments,
      majors,
      form: req.body,
      success: null,
      error: getMysqlErrorMessage(error)
    });
  } finally {
    conn.release();
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login?success=Bạn đã đăng xuất khỏi hệ thống.');
  });
});




// =========================================================
// COURSES
// =========================================================


// Gọi ra ở Dashboard (và 1 vài tính năng khác trong route này)
// Có sử dụng PROCEDURE 
// Route này thuyết trình
app.get('/courses', requireLogin, async (req, res) => {
    if (req.session.user.role === 'Student') {
        return res.redirect('/student/dashboard'); } 
  try {
    const {
      keyword = '',
      dept_id = '',
      lecturer_id = '',
      min_credits = '',
      max_credits = '',
      sort_option = 'COURSE_NAME_ASC'
    } = req.query;

    const params = [
      keyword || null,
      dept_id ? Number(dept_id) : null,
      lecturer_id ? Number(lecturer_id) : null,
      min_credits ? Number(min_credits) : null,
      max_credits ? Number(max_credits) : null,
      sort_option || 'COURSE_NAME_ASC'
    ];

    const [resultSets] = await pool.query(
      'CALL sp_search_courses(?, ?, ?, ?, ?, ?)',
      params
    ); // gọi ra ở dashboard

    let courses = resultSets[0] || [];

    const courseIds = courses.map(c => Number(c.Course_ID)).filter(Boolean);

    let studentCountMap = new Map();

    if (courseIds.length > 0) {
      const placeholders = courseIds.map(() => '?').join(',');

      const [studentCountRows] = await pool.query(
        `
        SELECT
          Course_ID,
          COUNT(DISTINCT Student_ID) AS Total_students
        FROM ENROLL
        WHERE Course_ID IN (${placeholders})
        GROUP BY Course_ID
        `,
        courseIds
      );

      studentCountMap = new Map(
        studentCountRows.map(r => [
          Number(r.Course_ID),
          Number(r.Total_students || 0)
        ])
      );
    }

    courses = courses.map(c => ({
      ...c,
      Total_students: studentCountMap.get(Number(c.Course_ID)) || 0
    }));

    const departments = await getDepartments();

    const [lecturers] = await pool.query(`
SELECT
  l.User_ID AS Lecturer_ID,
  ua.Full_name,
  l.Academic_degree,
  l.Academic_title,
  CONCAT(
    CASE
      WHEN l.Academic_title = 'PGS' THEN 'PGS. '
      WHEN l.Academic_title = 'GS' THEN 'GS. '
      ELSE ''
    END,
    CASE
      WHEN l.Academic_degree = 'CN' THEN 'CN. '
      WHEN l.Academic_degree = 'KS' THEN 'KS. '
      WHEN l.Academic_degree = 'ThS' THEN 'ThS. '
      WHEN l.Academic_degree = 'TS' THEN 'TS. '
      ELSE ''
    END,
    ua.Full_name
  ) AS Lecturer_display_name
FROM LECTURER l
JOIN USER_ACCOUNT ua
  ON ua.User_ID = l.User_ID
ORDER BY ua.Full_name
    `);

    res.render('courses', {
      courses,
      departments,
      lecturers,
      query: req.query,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});



// Có sử dụng call Procedure
app.get('/courses/new', requireLecturer, async (req, res) => {
  try {
    const [subjects] = await pool.query(`
      SELECT Subject_ID, Subject_name
      FROM SUBJECT
      ORDER BY Subject_name
    `);

    const [lecturers] = await pool.query(
      `
      SELECT
        l.User_ID AS Lecturer_ID,
        ua.Full_name
      FROM LECTURER l
      JOIN USER_ACCOUNT ua
        ON ua.User_ID = l.User_ID
      WHERE l.User_ID = ?
      `,
      [req.session.user.id]
    );

    res.render('course_form', {
      mode: 'create',
      course: {
        Lecturer_ID: req.session.user.id
      },
      subjects,
      lecturers,
      success: null,
      error: null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});


// Có sử dụng call Procedure
// Route này của phần 2.1
app.post('/courses', requireLecturer, async (req, res) => {
  try {
const {
  Course_name,
  Description,
  Start_date,
  End_date,
  Subject_ID
} = req.body;

const Lecturer_ID = req.session.user.id;

    await pool.query(
      'CALL sp_insert_course(?, ?, ?, ?, ?, ?)',
      [
        Course_name,
        Description,
        Start_date,
        End_date,
        Number(Subject_ID),
        Number(Lecturer_ID)
      ]
    );

    res.redirect('/courses?success=Thêm khóa học thành công');
  } catch (error) {
    const { subjects, lecturers } = await getSubjectsAndLecturers();

    res.status(400).render('course_form', {
      mode: 'create',
      course: req.body,
      subjects,
      lecturers,
      success: null,
      error: getMysqlErrorMessage(error)
    });
  }
});


// Cần thay bằng phiên bản call procedure
app.get('/courses/:id/edit', requireLecturerOrAdmin, async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const allowed = await canManageCourse(req.session.user, courseId);

    if (!allowed) {
      return res.status(403).render('error', {
        message: 'Bạn không có quyền chỉnh sửa khóa học này.'
      });
    }

    const course = await getCourseById(courseId);

    if (!course) {
      return res.status(404).render('error', {
        message: 'Không tìm thấy khóa học cần cập nhật.'
      });
    }

    const [subjects] = await pool.query(`
      SELECT Subject_ID, Subject_name
      FROM SUBJECT
      ORDER BY Subject_name
    `);

    let lecturers = [];

    if (req.session.user.role === 'Admin') {
      const [rows] = await pool.query(`
SELECT
  l.User_ID AS Lecturer_ID,
  ua.Full_name,
  l.Academic_degree,
  l.Academic_title,
  CONCAT(
    CASE
      WHEN l.Academic_title = 'PGS' THEN 'PGS. '
      WHEN l.Academic_title = 'GS' THEN 'GS. '
      ELSE ''
    END,
    CASE
      WHEN l.Academic_degree = 'CN' THEN 'CN. '
      WHEN l.Academic_degree = 'KS' THEN 'KS. '
      WHEN l.Academic_degree = 'ThS' THEN 'ThS. '
      WHEN l.Academic_degree = 'TS' THEN 'TS. '
      ELSE ''
    END,
    ua.Full_name
  ) AS Lecturer_display_name
FROM LECTURER l
JOIN USER_ACCOUNT ua
  ON ua.User_ID = l.User_ID
ORDER BY ua.Full_name
      `);
      lecturers = rows;
    } else {
const [rows] = await pool.query(
  `
  SELECT
    l.User_ID AS Lecturer_ID,
    ua.Full_name,
    l.Academic_degree,
    l.Academic_title,
    CONCAT(
      CASE
        WHEN l.Academic_title = 'PGS' THEN 'PGS. '
        WHEN l.Academic_title = 'GS' THEN 'GS. '
        ELSE ''
      END,
      CASE
        WHEN l.Academic_degree = 'CN' THEN 'CN. '
        WHEN l.Academic_degree = 'KS' THEN 'KS. '
        WHEN l.Academic_degree = 'ThS' THEN 'ThS. '
        WHEN l.Academic_degree = 'TS' THEN 'TS. '
        ELSE ''
      END,
      ua.Full_name
    ) AS Lecturer_display_name
  FROM LECTURER l
  JOIN USER_ACCOUNT ua
    ON ua.User_ID = l.User_ID
  WHERE l.User_ID = ?
  `,
  [req.session.user.id]
);
      lecturers = rows;
      course.Lecturer_ID = req.session.user.id;
    }

    res.render('course_form', {
      mode: 'edit',
      course,
      subjects,
      lecturers,
      success: null,
      error: null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});


// Update (Edit) khóa học (gọi Procedure sp_update_course)
// Phần 2.1
app.post('/courses/:id', requireLecturerOrAdmin, async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const allowed = await canManageCourse(req.session.user, courseId);

    if (!allowed) {
      return res.status(403).render('error', {
        message: 'Bạn không có quyền truy cập khóa học này.'
      });
    }

    const {
      Course_name,
      Description,
      Start_date,
      End_date,
      Subject_ID,
      Lecturer_ID
    } = req.body;

    const finalLecturerId =
      req.session.user.role === 'Admin'
        ? Number(Lecturer_ID)
        : Number(req.session.user.id);

    await pool.query(
      'CALL sp_update_course(?, ?, ?, ?, ?, ?, ?)',
      [
        courseId,
        Course_name,
        Description,
        Start_date,
        End_date,
        Number(Subject_ID),
        finalLecturerId
      ]
    );

    if (req.session.user.role === 'Admin') {
      return res.redirect('/admin/dashboard?success=Cập nhật khóa học thành công');
    }

    res.redirect('/courses?success=Cập nhật khóa học thành công');
  } catch (error) {
    const { subjects, lecturers } = await getSubjectsAndLecturers();

    res.status(400).render('course_form', {
      mode: 'edit',
      course: {
        Course_ID: req.params.id,
        ...req.body
      },
      subjects,
      lecturers,
      success: null,
      error: getMysqlErrorMessage(error)
    });
  }
});


// Delete khóa học
// Phần này 2.1
app.post('/courses/:id/delete', requireLecturerOrAdmin, async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const allowed = await canManageCourse(req.session.user, courseId);

    if (!allowed) {
      return res.status(403).render('error', {
        message: 'Bạn không có quyền xóa khóa học này.'
      });
    }

    await pool.query('CALL sp_delete_course(?)', [courseId]);

    if (req.session.user.role === 'Admin') {
      return res.redirect('/admin/dashboard?success=Xóa khóa học thành công');
    }

    res.redirect('/courses?success=Xóa khóa học thành công');
  } catch (error) {
    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    res.redirect(`/courses?error=${msg}`);
  }
});

// =========================================================
// REPORTS
// =========================================================


// Đã thay bằng phiên bản Call Procedure
app.get('/reports', requireLogin, async (req, res) => {
  try {
    const {
      dept_id = '',
      from_date = '',
      to_date = '',
      min_students = '0',
      min_avg_final_score = '',
      student_id = '',
      course_id = ''
    } = req.query;

    const departments = await getDepartments();

    const reportParams = [
      dept_id ? Number(dept_id) : null,
      from_date || null,
      to_date || null,
      min_students ? Number(min_students) : 0,
      min_avg_final_score ? Number(min_avg_final_score) : null
    ];

    const [reportResultSets] = await pool.query(
      'CALL sp_report_course_learning_result(?, ?, ?, ?, ?)',
      reportParams
    );

    const reports = reportResultSets[0] || [];

    let gpaResult = null;
    let completionRateResult = null;
    let functionError = null;

    if (student_id) {
      try {
        const [rows] = await pool.query(
          'SELECT fn_calculate_student(?) AS Weighted_GPA',
          [Number(student_id)]
        );
        gpaResult = rows[0];
      } catch (error) {
        functionError = getMysqlErrorMessage(error);
      }
    }

    if (course_id) {
      try {
        const [rows] = await pool.query(
          'SELECT fn_calculate_course_completion_rate(?) AS Completion_rate_percent',
          [Number(course_id)]
        );
        completionRateResult = rows[0];
      } catch (error) {
        functionError = getMysqlErrorMessage(error);
      }
    }

    res.render('reports', {
      departments,
      reports,
      query: req.query,
      gpaResult,
      completionRateResult,
      functionError
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});



// =========================================================
// STUDENT DASHBOARD
// Sinh viên xem khóa học đã đăng ký và khóa học có thể đăng ký
// =========================================================


// Đã thay bằng phiên bản Call Procedure
// Route này dùng để thuyết trình
app.get('/student/dashboard', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const status = req.query.status || 'active';

    const [resultSets] = await pool.query(
      'CALL sp_get_student_dashboard(?)',
      [studentId]
    );

    // Result set 1: khóa học đã đăng ký (kèm tiến độ)
    const enrolledCourses = Array.isArray(resultSets[0]) ? resultSets[0] : [];
    // Result set 2: khóa học có thể đăng ký
    const availableCourses = Array.isArray(resultSets[1]) ? resultSets[1] : [];

    let filteredEnrolledCourses = enrolledCourses;

    if (status === 'active') {
      filteredEnrolledCourses = enrolledCourses.filter(c => c.Enroll_status === 'Enrolled');
    }

    if (status === 'completed') {
      filteredEnrolledCourses = enrolledCourses.filter(c => c.Enroll_status === 'Completed');
    }

    res.render('student_dashboard', {
      enrolledCourses: filteredEnrolledCourses,
      allEnrolledCourses: enrolledCourses,
      selectedStatus: status,
      availableCourses,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});





// ==========================================================
// STUDENT ENROLL COURSE
// Sinh viên đăng ký khóa học
// Trigger môn tiên quyết sẽ chạy ngầm và tự kiểm tra nếu lỗi
// ==========================================================

// Đừng đụng đến
app.post('/student/courses/:courseId/enroll', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const courseId = Number(req.params.courseId);

    // Kiểm tra ngày kết thúc của khóa học
    const [courseRows] = await pool.query(
      `SELECT End_date FROM COURSE WHERE Course_ID = ?`,
      [courseId]
    );

    if (courseRows.length === 0) {
      return res.redirect('/student/dashboard?error=' + encodeURIComponent('Khóa học không tồn tại.'));
    }

    const endDate = new Date(courseRows[0].End_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Không cho đăng ký nếu khóa học đã hết hạn (curdate >= end_date)
    if (today >= endDate) {
      return res.redirect('/student/dashboard?error=' + encodeURIComponent('Không thể đăng ký: khóa học này đã hết hạn.'));
    }

    await pool.query(
      `
      INSERT INTO ENROLL
      (Student_ID, Course_ID, Enrolled_at, Enroll_status, Final_score, Completed_at)
      VALUES (?, ?, NOW(), 'Enrolled', NULL, NULL)
      `,
      [studentId, courseId]
    );

    // Kiểm tra xem khóa học có sắp kết thúc trong vòng 7 ngày không
    const diffDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) {
      return res.redirect(
        '/student/dashboard?success=' +
        encodeURIComponent(`Đăng ký thành công! ⚠️ Lưu ý: Khóa học sắp bị đóng lại (còn ${diffDays} ngày).`)
      );
    }

    res.redirect('/student/dashboard?success=Đăng ký khóa học thành công');
  } catch (error) {
    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    res.redirect(`/student/dashboard?error=${msg}`);
  }
});


// Đừng đụng đến
app.post('/student/courses/:courseId/drop', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const courseId = Number(req.params.courseId);

    const [enrollRows] = await pool.query(
      `
      SELECT Enroll_status
      FROM ENROLL
      WHERE Student_ID = ? AND Course_ID = ?
      `,
      [studentId, courseId]
    );

    if (enrollRows.length === 0) {
      return res.status(404).render('error', { message: 'Bạn chưa đăng ký khóa học này.' });
    }

    if (enrollRows[0].Enroll_status !== 'Enrolled') {
      return res.status(400).render('error', { message: 'Chỉ có thể rút môn học khi đang ở trạng thái tham gia.' });
    }

    await pool.query(
      `
      DELETE FROM ENROLL
      WHERE Student_ID = ? AND Course_ID = ?
      `,
      [studentId, courseId]
    );

    res.redirect('/student/dashboard?success=Rút môn học thành công');
  } catch (error) {
    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    res.redirect(`/student/dashboard?error=${msg}`);
  }
});


// Đã thay bằng phiên bản Call Procedure
app.get('/student/courses/:courseId/details', requireStudent, async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);

    const [resultSets] = await pool.query('CALL sp_get_course_details(?)', [courseId]);

    if (!Array.isArray(resultSets) || resultSets.length < 4) {
      return res.status(404).render('error', { message: 'Không thể tải thông tin khóa học.' });
    }

    const courseRows = Array.isArray(resultSets[0]) ? resultSets[0] : [];
    const prereqRows = Array.isArray(resultSets[1]) ? resultSets[1] : [];
    const sectionsRows = Array.isArray(resultSets[2]) ? resultSets[2] : [];
    const quizzesRows = Array.isArray(resultSets[3]) ? resultSets[3] : [];

    if (courseRows.length === 0) {
      return res.status(404).render('error', { message: 'Không tìm thấy khóa học.' });
    }

    const course = courseRows[0];

    const groupedSections = [];
    sectionsRows.forEach(row => {
      const sectionOrder = row.Section_order ?? row.section_order;
      const sectionName = row.Section_name ?? row.section_name;
      const lectureTitle = row.Lecture_title ?? row.Title;

      if (!sectionOrder) return;

      let sec = groupedSections.find(s => s.Section_order === sectionOrder);
      if (!sec) {
        sec = { Section_order: sectionOrder, Section_name: sectionName, lectures: [] };
        groupedSections.push(sec);
      }

      if (lectureTitle) sec.lectures.push(lectureTitle);
    });

    const prerequisites = prereqRows.map(r => r.Subject_name ?? r.subject_name);

    res.json({
      course,
      prerequisites,
      sections: groupedSections,
      quizzes: quizzesRows
    });

  } catch (error) {
    console.error('Error in /student/courses/:courseId/details:', error);
    res.status(500).json({ error: getMysqlErrorMessage(error) });
  }
});

// =========================================================
// STUDENT COURSE DETAIL
// Sinh viên xem bài giảng, tài liệu, quiz, tiến độ
// =========================================================


// Đã thay bằng phiên bản Call Procedure
app.get('/student/courses/:courseId', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const courseId = Number(req.params.courseId);

    const [resultSets] = await pool.query(
      'CALL sp_get_student_course_progress(?, ?)',
      [studentId, courseId]
    );

    if (!Array.isArray(resultSets) || resultSets.length === 0) {
      return res.status(403).render('error', {
        message: 'Khóa học không tồn tại hoặc bạn chưa đăng ký.'
      });
    }

    const courseRows = resultSets[0] || [];
    const lectures = resultSets[1] || [];
    const materials = resultSets[2] || [];
    const quizzes = resultSets[3] || [];
    const questions = resultSets[4] || [];

    if (courseRows.length === 0) {
      return res.status(403).render('error', {
        message: 'Bạn chưa đăng ký khóa học này hoặc khóa học không tồn tại.'
      });
    }

    const course = courseRows[0];

    const totalLectures = lectures.length;
    const completedLectures = lectures.filter(l => l.Interaction_status === 'Completed').length;
    const totalQuizzes = quizzes.length;
    const passedQuizzes = quizzes.filter(q => q.Quiz_status === 'Passed').length;

    const totalItems = totalLectures + totalQuizzes;
    const completedItems = completedLectures + passedQuizzes;
    const progressPercent = totalItems === 0
      ? 0
      : Math.round((completedItems * 10000) / totalItems) / 100;

    res.render('student_course_detail', {
      course,
      lectures,
      materials,
      quizzes,
      progress: {
        totalLectures,
        completedLectures,
        totalQuizzes,
        passedQuizzes,
        totalItems,
        completedItems,
        progressPercent
      },
      success: req.query.success || null,
      error: req.query.error || null
    });

  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});




// =========================================================
// STUDENT COMPLETE LECTURE
// Sinh viên đánh dấu hoàn thành bài giảng
// =========================================================


// Cần thay đổi bằng phiên bản Call Procedure
app.post('/student/lectures/:lectureId/complete', requireStudent, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const studentId = req.session.user.id;
    const lectureId = Number(req.params.lectureId);

    await conn.beginTransaction();

    const [lectureRows] = await conn.query(
      `
      SELECT Lecture_ID, Course_ID
      FROM LECTURE
      WHERE Lecture_ID = ?
      `,
      [lectureId]
    );

    if (lectureRows.length === 0) {
      throw new Error('Bài giảng không tồn tại.');
    }

    const courseId = lectureRows[0].Course_ID;

    const [enrollRows] = await conn.query(
      `
      SELECT 1
      FROM ENROLL
      WHERE Student_ID = ?
        AND Course_ID = ?
      `,
      [studentId, courseId]
    );

    if (enrollRows.length === 0) {
      throw new Error('Bạn chưa đăng ký khóa học chứa bài giảng này.');
    }

    await conn.query(
      `
      INSERT INTO INTERACT
      (Student_ID, Lecture_ID, Status, Interacted_at)
      VALUES (?, ?, 'Completed', NOW())
      ON DUPLICATE KEY UPDATE
        Status = 'Completed',
        Interacted_at = NOW()
      `,
      [studentId, lectureId]
    );

    await updateStudentCourseCompletion(conn, studentId, courseId);

    await conn.commit();

    res.redirect(`/student/courses/${courseId}?success=Đã đánh dấu hoàn thành bài giảng`);
  } catch (error) {
    await conn.rollback();

    res.status(400).render('error', {
      message: getMysqlErrorMessage(error)
    });
  } finally {
    conn.release();
  }
});


// =========================================================
// STUDENT TAKE QUIZ PAGE
// Sinh viên mở trang làm quiz
// =========================================================

// Cần thay bằng phiên bản Call Procedure
app.get('/student/quizzes/:quizId/take', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const quizId = Number(req.params.quizId);

    const [quizRows] = await pool.query(
      `
      SELECT
        q.*,
        c.Course_ID,
        c.Course_name
      FROM QUIZ q
      JOIN COURSE c
        ON c.Course_ID = q.Course_ID
      JOIN ENROLL e
        ON e.Course_ID = c.Course_ID
       AND e.Student_ID = ?
      WHERE q.Quiz_ID = ?
      `,
      [studentId, quizId]
    );

    if (quizRows.length === 0) {
      return res.status(403).render('error', {
        message: 'Bạn chưa đăng ký khóa học chứa bài kiểm tra này.'
      });
    }

    const quiz = quizRows[0];

    const [attemptRows] = await pool.query(
      `
      SELECT COUNT(*) AS attempt_count
      FROM ATTEMPT
      WHERE Student_ID = ?
        AND Quiz_ID = ?
      `,
      [studentId, quizId]
    );

    const attemptCount = attemptRows[0].attempt_count || 0;

    if (attemptCount >= quiz.Max_attempts) {
      return res.redirect(`/student/quizzes/${quizId}/results?error=Bạn đã dùng hết số lần làm bài`);
    }

    const now = new Date();

    if (now < new Date(quiz.Open_time) || now > new Date(quiz.Close_time)) {
      return res.status(400).render('error', {
        message: 'Bài kiểm tra chưa mở hoặc đã đóng.'
      });
    }

    const [questions] = await pool.query(
      `
      SELECT
        q.Quiz_ID,
        q.Question_ID,
        q.Content,
        q.Question_type,
        mc.Score AS MCQ_score,
        fb.Score AS FITB_score
      FROM QUESTION q
      LEFT JOIN MULTIPLE_CHOICE mc
        ON mc.Quiz_ID = q.Quiz_ID
       AND mc.Question_ID = q.Question_ID
      LEFT JOIN FILL_IN_THE_BLANKS fb
        ON fb.Quiz_ID = q.Quiz_ID
       AND fb.Question_ID = q.Question_ID
      WHERE q.Quiz_ID = ?
      ORDER BY q.Question_ID ASC
      `,
      [quizId]
    );

    const [options] = await pool.query(
      `
      SELECT Quiz_ID, Question_ID, Option_text
      FROM MC_OPTIONS
      WHERE Quiz_ID = ?
      ORDER BY Question_ID ASC, Option_text ASC
      `,
      [quizId]
    );

    res.render('student_take_quiz', {
      quiz,
      questions,
      options,
      attemptCount,
      error: req.query.error || null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});


// =========================================================
// STUDENT SUBMIT QUIZ
// Sinh viên nộp bài, hệ thống chấm điểm và lưu ANSWER/ATTEMPT
// =========================================================

// Earned_score (Điểm từng câu hỏi)
// - Logic: so sánh chuỗi studentAnswer vs correctAnswer. Đúng → lấy Score của câu hỏi. Sai → 0.

// Cần thay bằng phiên bản Call Procedure
app.post('/student/quizzes/:quizId/submit', requireStudent, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const studentId = req.session.user.id;
    const quizId = Number(req.params.quizId);

    await conn.beginTransaction();

    const [quizRows] = await conn.query(
      `
      SELECT
        q.*,
        c.Course_ID
      FROM QUIZ q
      JOIN COURSE c
        ON c.Course_ID = q.Course_ID
      JOIN ENROLL e
        ON e.Course_ID = c.Course_ID
       AND e.Student_ID = ?
      WHERE q.Quiz_ID = ?
      `,
      [studentId, quizId]
    );

    if (quizRows.length === 0) {
      throw new Error('Bạn chưa đăng ký khóa học chứa bài kiểm tra này.');
    }

    const quiz = quizRows[0];
    const courseId = quiz.Course_ID;

    const [attemptRows] = await conn.query(
      `
      SELECT IFNULL(MAX(Attempt_order), 0) + 1 AS next_attempt
      FROM ATTEMPT
      WHERE Student_ID = ?
        AND Quiz_ID = ?
      `,
      [studentId, quizId]
    );

    const attemptOrder = attemptRows[0].next_attempt;

    if (attemptOrder > quiz.Max_attempts) {
      throw new Error('Bạn đã vượt quá số lần làm bài tối đa.');
    }

    const now = new Date();

    if (now < new Date(quiz.Open_time) || now > new Date(quiz.Close_time)) {
      throw new Error('Bài kiểm tra chưa mở hoặc đã đóng.');
    }

    await conn.query(
      `
      INSERT INTO ATTEMPT
      (Student_ID, Quiz_ID, Attempt_order, Start_time, Submit_time, Total_score)
      VALUES (?, ?, ?, NOW(), NOW(), 0)
      `,
      [studentId, quizId, attemptOrder]
    );

    const [questions] = await conn.query(
      `
      SELECT
        q.Question_ID,
        q.Question_type,
        q.Content,
        mc.MC_correct_answer,
        mc.Score AS MCQ_score,
        fb.Score AS FITB_score
      FROM QUESTION q
      LEFT JOIN MULTIPLE_CHOICE mc
        ON mc.Quiz_ID = q.Quiz_ID
       AND mc.Question_ID = q.Question_ID
      LEFT JOIN FILL_IN_THE_BLANKS fb
        ON fb.Quiz_ID = q.Quiz_ID
       AND fb.Question_ID = q.Question_ID
      WHERE q.Quiz_ID = ?
      ORDER BY q.Question_ID ASC
      `,
      [quizId]
    );

    for (const question of questions) {
      const fieldName = `answer_${question.Question_ID}`;
      const rawAnswer = req.body[fieldName];
      const studentAnswer = Array.isArray(rawAnswer)
        ? rawAnswer[0]
        : (rawAnswer || '');

      let earnedScore = 0;

      if (question.Question_type === 'MCQ') {
        const correct = String(question.MC_correct_answer || '').trim().toLowerCase();
        const submitted = String(studentAnswer || '').trim().toLowerCase();

        if (submitted !== '' && submitted === correct) {
          earnedScore = Number(question.MCQ_score || 0);
        }
      }

      if (question.Question_type === 'FILL_BLANK') {
        const [answerRows] = await conn.query(
          `
          SELECT Answer_text
          FROM FITB_ANSWERS
          WHERE Quiz_ID = ?
            AND Question_ID = ?
          `,
          [quizId, question.Question_ID]
        );

        const submitted = String(studentAnswer || '').trim().toLowerCase();

        const isCorrect = answerRows.some(row =>
          String(row.Answer_text || '').trim().toLowerCase() === submitted
        );

        if (submitted !== '' && isCorrect) {
          earnedScore = Number(question.FITB_score || 0);
        }
      }

      await conn.query(
        `
        INSERT INTO ANSWER
        (Student_ID, Quiz_ID, Attempt_order, Question_ID, Student_answer, Earned_score)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          studentId,
          quizId,
          attemptOrder,
          question.Question_ID,
          studentAnswer || '',
          earnedScore
        ]
      );
    }

    await updateStudentCourseCompletion(conn, studentId, courseId);

    await conn.commit();

    res.redirect(`/student/quizzes/${quizId}/results?attempt=${attemptOrder}`);
  } catch (error) {
    await conn.rollback();

    res.status(400).render('error', {
      message: getMysqlErrorMessage(error)
    });
  } finally {
    conn.release();
  }
});


// =========================================================
// STUDENT QUIZ RESULTS
// Sinh viên xem điểm và chi tiết câu trả lời
// =========================================================

// Đã thay bằng phiên bản Call Procedure
app.get('/student/quizzes/:quizId/results', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const quizId    = Number(req.params.quizId);
    const requestedAttempt = req.query.attempt ? Number(req.query.attempt) : null;

    const results = await pool.query(
      'CALL sp_get_student_quiz_results(?, ?, ?)',
      [studentId, quizId, requestedAttempt]
    );


    const resultSets = results[0];
    const quizRows   = resultSets[0];
    const attemptsRS = resultSets[1];

    if (requestedAttempt === null && attemptsRS && attemptsRS.length > 0) {
      return res.redirect(`/student/quizzes/${quizId}/results?attempt=${attemptsRS[0].Attempt_order}`);
    }

    const quiz     = quizRows[0];
    const attempts = attemptsRS;
    const selectedAttempt = requestedAttempt
      ?? (attempts[0] ? attempts[0].Attempt_order : null);

    let reviewQuestions  = [];
    let currentQuestion  = null;

    if (requestedAttempt !== null && resultSets.length >= 5) {
      const questionRows = resultSets[2];
      const optionRows   = resultSets[3];
      const fitbRows     = resultSets[4];

      reviewQuestions = questionRows.map((q) => {
        const maxScore = Number(
          q.Question_type === 'MCQ' ? (q.MCQ_score || 0) : (q.FITB_score || 0)
        );

        const options = optionRows
          .filter(o => Number(o.Question_ID) === Number(q.Question_ID))
          .map(o => o.Option_text);

        const correctAnswers = q.Question_type === 'MCQ'
          ? [q.MC_correct_answer].filter(Boolean)
          : fitbRows
              .filter(a => Number(a.Question_ID) === Number(q.Question_ID))
              .map(a => a.Answer_text);

        const earnedScore    = Number(q.Earned_score || 0);
        const studentAnswer  = q.Student_answer || '';

        return {
          Question_ID:    q.Question_ID,
          Content:        q.Content,
          Question_type:  q.Question_type,
          Student_answer: studentAnswer,
          Earned_score:   earnedScore,
          Max_score:      maxScore,
          Options:        options,
          Correct_answers: correctAnswers,
          Is_correct:     maxScore > 0 ? earnedScore >= maxScore : false
        };
      });

      const selectedQuestionId = req.query.question
        ? Number(req.query.question)
        : (reviewQuestions[0] ? reviewQuestions[0].Question_ID : null);

      currentQuestion =
        reviewQuestions.find(q => Number(q.Question_ID) === Number(selectedQuestionId))
        ?? reviewQuestions[0]
        ?? null;
    }

    res.render('student_quiz_results', {
      quiz,
      attempts,
      selectedAttempt,
      reviewQuestions,
      currentQuestion,
      success: req.query.success || null,
      error:   req.query.error   || null
    });
  } catch (error) {
    if (error.sqlState === '45000') {
      return res.status(403).render('error', { message: error.sqlMessage });
    }
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});

// =========================================================
// LECTURER DASHBOARD
// Giảng viên xem các khóa học mình dạy
// =========================================================

// Đã thay bằng phiên bản Call Procedure
app.get('/lecturer/dashboard', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;

    const results = await pool.query(
      'CALL sp_get_lecturer_dashboard(?)',
      [lecturerId]
    );

    // results[0] = [coursesRS, summaryRS, OkPacket]
    const [courses, summaryRows] = results[0];

    const dashboardStats = summaryRows[0] || {
      Total_courses:  0,
      Total_students: 0,
      Total_lectures: 0,
      Total_quizzes:  0
    };

    res.render('lecturer_dashboard', {
      courses,
      dashboardStats,
      success: req.query.success || null,
      error:   req.query.error   || null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});


// =========================================================
// LECTURER COURSE DETAIL
// Giảng viên xem nội dung khóa học mình dạy
// =========================================================

// Đã thay bằng phiên bản Call Procedure
app.get('/lecturer/courses/:courseId', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const courseId   = Number(req.params.courseId);

    const course = await getLecturerOwnedCourse(pool, lecturerId, courseId);

    // Gọi procedure — trả về 6 result sets
    const results = await pool.query(
      'CALL sp_get_lecturer_course_detail(?, ?)',
      [lecturerId, courseId]
    );

    // mysql2 trả về: [[rs0, rs1, rs2, rs3, rs4, rs5], fields]
    const [sections, lectures, materials, quizzes, questions, students] = results[0];

    res.render('lecturer_course_detail', {
      course,
      sections,
      lectures,
      materials,
      quizzes,
      questions,
      students,
      success: req.query.success || null,
      error:   req.query.error   || null
    });
  } catch (error) {
    // Lỗi SIGNAL từ procedure (quyền truy cập) sẽ bắt vào đây
    if (error.sqlState === '45000') {
      return res.status(403).render('error', { message: error.sqlMessage });
    }
    res.status(500).render('error', { message: getMysqlErrorMessage(error) });
  }
});

// =========================================================
// LECTURER ADD MATERIAL
// Giảng viên thêm tài liệu cho bài giảng thuộc khóa mình dạy
// =========================================================

// Đừng đụng đến
app.post('/lecturer/lectures/:lectureId/materials', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const lectureId = Number(req.params.lectureId);
    const { Link } = req.body;

    if (!Link || !/^https?:\/\/|^file:\/\//.test(Link)) {
      throw new Error('Link tài liệu phải bắt đầu bằng http://, https:// hoặc file://');
    }

    const [lectureRows] = await pool.query(
      `
      SELECT
        l.Lecture_ID,
        l.Course_ID,
        c.Lecturer_ID
      FROM LECTURE l
      JOIN COURSE c
        ON c.Course_ID = l.Course_ID
      WHERE l.Lecture_ID = ?
        AND c.Lecturer_ID = ?
      `,
      [lectureId, lecturerId]
    );

    if (lectureRows.length === 0) {
      return res.status(403).render('error', {
        message: 'Bạn không có quyền thêm tài liệu cho bài giảng này.'
      });
    }

    const courseId = lectureRows[0].Course_ID;

    await pool.query(
      `
      INSERT INTO MATERIAL_LINKS
      (Lecture_ID, Link)
      VALUES (?, ?)
      `,
      [lectureId, Link.trim()]
    );

    res.redirect(`/lecturer/courses/${courseId}?success=Thêm tài liệu thành công`);
  } catch (error) {
    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    res.redirect(`/lecturer/dashboard?error=${msg}`);
  }
});



// =========================================================
// LECTURER CREATE SECTION
// =========================================================

// Đừng đụng đến
app.post('/lecturer/courses/:courseId/sections', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const courseId = Number(req.params.courseId);
    const { Section_name } = req.body;

    const course = await getLecturerOwnedCourse(pool, lecturerId, courseId);

    if (!course) {
      return res.status(403).render('error', {
        message: 'Bạn không có quyền tạo section cho khóa học này.'
      });
    }

    if (!Section_name || Section_name.trim() === '') {
      throw new Error('Tên section không được để trống.');
    }

    const [rows] = await pool.query(
      `
      SELECT IFNULL(MAX(Section_order), 0) + 1 AS next_order
      FROM SECTION
      WHERE Course_ID = ?
      `,
      [courseId]
    );

    const nextOrder = rows[0].next_order;

    const conn2 = await pool.getConnection();
    try {
      await conn2.beginTransaction();

      await conn2.query(
        `
        INSERT INTO SECTION
        (Course_ID, Section_order, Section_name, Num_of_lectures, Creator_ID)
        VALUES (?, ?, ?, 0, ?)
        `,
        [courseId, nextOrder, Section_name.trim(), lecturerId]
      );

      // Thêm section mới → sinh viên đã Completed phải được re-evaluate
      await resetCompletedEnrollsForCourse(conn2, courseId);

      await conn2.commit();
    } catch (err) {
      await conn2.rollback();
      throw err;
    } finally {
      conn2.release();
    }

    res.redirect(`/lecturer/courses/${courseId}?success=Tạo section thành công`);
  } catch (error) {
    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    res.redirect(`/lecturer/courses/${req.params.courseId}?error=${msg}`);
  }
});


// =========================================================
// LECTURER CREATE LECTURE
// =========================================================


// Đừng đụng đến
app.post('/lecturer/courses/:courseId/lectures', requireLecturer, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const lecturerId = req.session.user.id;
    const courseId = Number(req.params.courseId);
    const { Section_order, Title } = req.body;

    const course = await getLecturerOwnedCourse(conn, lecturerId, courseId);

  if (!course) {
    throw new Error('Bạn không có quyền tạo bài giảng cho khóa học này.');
  }

  if (!Section_order) {
    throw new Error('Vui lòng chọn section.');
  }

  if (!Title || Title.trim() === '') {
    throw new Error('Tiêu đề bài giảng không được để trống.');
  }

    await conn.beginTransaction();

    await conn.query(
      `
      INSERT INTO LECTURE
      (Title, Created_at, Course_ID, Section_order, Creator_ID)
      VALUES (?, NOW(), ?, ?, ?)
      `,
      [Title.trim(), courseId, Number(Section_order), lecturerId]
    );

    await conn.query(
      `
      UPDATE SECTION
      SET Num_of_lectures = (
        SELECT COUNT(*)
        FROM LECTURE
        WHERE Course_ID = ?
          AND Section_order = ?
      )
      WHERE Course_ID = ?
        AND Section_order = ?
      `,
      [courseId, Number(Section_order), courseId, Number(Section_order)]
    );

    // Thêm bài giảng mới → sinh viên đã Completed phải được re-evaluate
    await resetCompletedEnrollsForCourse(conn, courseId);

    await conn.commit();

    res.redirect(`/lecturer/courses/${courseId}?success=Tạo bài giảng thành công`);
  } catch (error) {
    await conn.rollback();
    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    res.redirect(`/lecturer/courses/${req.params.courseId}?error=${msg}`);
  } finally {
    conn.release();
  }
});


// =========================================================
// LECTURER CREATE QUIZ FORM
// =========================================================

// Không cần đụng đến
app.get('/lecturer/courses/:courseId/quizzes/new', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const courseId = Number(req.params.courseId);

    const course = await getLecturerOwnedCourse(pool, lecturerId, courseId);

    if (!course) {
      return res.status(403).render('error', {
        message: 'Bạn không có quyền tạo quiz cho khóa học này.'
      });
    }

    res.render('quiz_form', {
      mode: 'create',
      course,
      quiz: {},
      error: null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});


// =========================================================
// LECTURER CREATE QUIZ
// =========================================================


// Đã thay bằng phiên bản Call Procedure
app.post('/lecturer/courses/:courseId/quizzes', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const courseId = Number(req.params.courseId);

    const course = await getLecturerOwnedCourse(pool, lecturerId, courseId);

    if (!course) {
      return res.status(403).render('error', {
        message: 'Bạn không có quyền tạo quiz cho khóa học này.'
      });
    }

    const {
      Quiz_title,
      Open_time,
      Close_time,
      Duration,
      Max_attempts,
      Max_score,
      Pass_score
    } = req.body;

    const openTime  = normalizeDateTimeLocal(Open_time);
    const closeTime = normalizeDateTimeLocal(Close_time);

    await pool.query(
      'CALL sp_create_quiz(?, ?, ?, ?, ?, ?, ?, ?, ?, @new_quiz_id)',
      [
        Quiz_title,
        openTime,
        closeTime,
        Number(Duration),
        Number(Max_attempts),
        Number(Max_score),
        Number(Pass_score),
        lecturerId,
        courseId
      ]
    );

    const [[{ new_quiz_id }]] = await pool.query('SELECT @new_quiz_id AS new_quiz_id');

    res.redirect(`/lecturer/quizzes/${new_quiz_id}/questions/new?success=Tạo quiz thành công. Hãy thêm câu hỏi cho quiz.`);
  } catch (error) {
    const lecturerId = req.session.user.id;
    const courseId   = Number(req.params.courseId);
    const course     = await getLecturerOwnedCourse(pool, lecturerId, courseId);

    res.status(400).render('quiz_form', {
      mode: 'create',
      course,
      quiz: req.body,
      error: getMysqlErrorMessage(error)
    });
  }
});



// =========================================================
// LECTURER DELETE QUIZ
// Chỉ được xóa quiz khi chưa có học sinh nào làm (không có ATTEMPT)
// =========================================================


// Đã thay bằng phiên bản Call Procedure
app.post('/lecturer/quizzes/:quizId/delete', requireLecturer, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const lecturerId = req.session.user.id;
    const quizId = Number(req.params.quizId);

    // Lấy courseId trước khi xóa (để redirect về đúng trang)
    const quiz = await getLecturerOwnedQuiz(pool, lecturerId, quizId);
    if (!quiz) {
      return res.status(403).render('error', {
        message: 'Bạn không có quyền xóa quiz này.'
      });
    }
    const courseId = quiz.Course_ID;

    await conn.beginTransaction();

    await conn.query('CALL sp_delete_quiz(?, ?)', [quizId, lecturerId]);

    // Sau khi xóa quiz → cập nhật lại trạng thái hoàn thành của sinh viên
    await resetCompletedEnrollsForCourse(conn, courseId);

    await conn.commit();

    res.redirect(`/lecturer/courses/${courseId}?success=Xóa quiz thành công`);
  } catch (error) {
    await conn.rollback();
    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    // Cố gắng redirect về đúng course
    try {
      const quiz = await getLecturerOwnedQuiz(pool, req.session.user.id, Number(req.params.quizId));
      if (quiz) return res.redirect(`/lecturer/courses/${quiz.Course_ID}?error=${msg}`);
    } catch (_) {}
    res.redirect(`/lecturer/dashboard?error=${msg}`);
  } finally {
    conn.release();
  }
});


// =========================================================
// LECTURER DELETE LECTURE
// Giảng viên xóa bài giảng
// Xóa bài giảng + materials + interact, cập nhật Num_of_lectures
// =========================================================


// Đã thay bằng phiên bản Call Procedure
app.post('/lecturer/lectures/:lectureId/delete', requireLecturer, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const lecturerId = req.session.user.id;
    const lectureId = Number(req.params.lectureId);

    // Lấy courseId trước khi xóa
    const [lectureRows] = await pool.query(
      `SELECT l.Lecture_ID, l.Course_ID, c.Lecturer_ID
       FROM LECTURE l
       JOIN COURSE c ON c.Course_ID = l.Course_ID
       WHERE l.Lecture_ID = ? AND c.Lecturer_ID = ?`,
      [lectureId, lecturerId]
    );

    if (lectureRows.length === 0) {
      return res.status(403).render('error', {
        message: 'Bài giảng không tồn tại hoặc bạn không có quyền xóa.'
      });
    }
    const courseId = lectureRows[0].Course_ID;

    await conn.beginTransaction();

    await conn.query('CALL sp_delete_lecture(?, ?)', [lectureId, lecturerId]);

    // Sau khi xóa lecture → cập nhật lại trạng thái hoàn thành của sinh viên
    await resetCompletedEnrollsForCourse(conn, courseId);

    await conn.commit();

    res.redirect(`/lecturer/courses/${courseId}?success=Xóa bài giảng thành công`);
  } catch (error) {
    await conn.rollback();
    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    try {
      const [rows] = await pool.query(
        `SELECT l.Course_ID FROM LECTURE l JOIN COURSE c ON c.Course_ID = l.Course_ID
         WHERE l.Lecture_ID = ? AND c.Lecturer_ID = ?`,
        [Number(req.params.lectureId), req.session.user.id]
      );
      if (rows.length > 0) return res.redirect(`/lecturer/courses/${rows[0].Course_ID}?error=${msg}`);
    } catch (_) {}
    res.redirect(`/lecturer/dashboard?error=${msg}`);
  } finally {
    conn.release();
  }
});


// =========================================================
// LECTURER DELETE SECTION
// Xóa section + cascade lectures + materials + interact
// =========================================================


// Đã thay bằng phiên bản Call Procedure
app.post('/lecturer/courses/:courseId/sections/:sectionOrder/delete', requireLecturer, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const lecturerId    = req.session.user.id;
    const courseId      = Number(req.params.courseId);
    const sectionOrder  = Number(req.params.sectionOrder);

    await getLecturerOwnedCourse(pool, lecturerId, courseId); // throws if not owner

    await conn.beginTransaction();

    await conn.query('CALL sp_delete_section(?, ?, ?)', [courseId, sectionOrder, lecturerId]);

    // Sau khi xóa section (và các lecture trong đó) → cập nhật lại trạng thái hoàn thành của sinh viên
    await resetCompletedEnrollsForCourse(conn, courseId);

    await conn.commit();

    res.redirect(`/lecturer/courses/${courseId}?success=Xóa học phần thành công`);
  } catch (error) {
    await conn.rollback();
    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    res.redirect(`/lecturer/courses/${req.params.courseId}?error=${msg}`);
  } finally {
    conn.release();
  }
});


// =========================================================
// LECTURER QUIZ INFO
// =========================================================

app.get('/lecturer/quizzes/:quizId/info', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const quizId = Number(req.params.quizId);

    const quiz = await getLecturerOwnedQuiz(pool, lecturerId, quizId);

if (!quiz) {
  return res.status(403).render('error', {
    message: 'Bạn không có quyền xem quiz này.'
  });
}

    res.render('lecturer_quiz_info', {
      quiz,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});


// =========================================================
// LECTURER CREATE QUIZ QUESTIONS
// =========================================================


// Cần thay bằng phiên bản Call Procedure
app.get('/lecturer/quizzes/:quizId/questions', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const quizId = Number(req.params.quizId);

    const quiz = await getLecturerOwnedQuiz(pool, lecturerId, quizId);

if (!quiz) {
  return res.status(403).render('error', {
    message: 'Bạn không có quyền xem câu hỏi của quiz này.'
  });
}
    const [questions] = await pool.query(
      `
      SELECT
        q.Question_ID,
        q.Content,
        q.Question_type,
        mc.Score AS MCQ_score,
        mc.MC_correct_answer,
        fb.Score AS FITB_score,

        CASE
          WHEN q.Question_type = 'MCQ' THEN mc.Score
          ELSE fb.Score
        END AS Question_score,

        (
          SELECT GROUP_CONCAT(mo.Option_text ORDER BY mo.Option_text SEPARATOR ' | ')
          FROM MC_OPTIONS mo
          WHERE mo.Quiz_ID = q.Quiz_ID
            AND mo.Question_ID = q.Question_ID
        ) AS MCQ_options,

        (
          SELECT GROUP_CONCAT(fa.Answer_text ORDER BY fa.Answer_text SEPARATOR ' | ')
          FROM FITB_ANSWERS fa
          WHERE fa.Quiz_ID = q.Quiz_ID
            AND fa.Question_ID = q.Question_ID
        ) AS FITB_correct_answers
      FROM QUESTION q
      LEFT JOIN MULTIPLE_CHOICE mc
        ON mc.Quiz_ID = q.Quiz_ID
       AND mc.Question_ID = q.Question_ID
      LEFT JOIN FILL_IN_THE_BLANKS fb
        ON fb.Quiz_ID = q.Quiz_ID
       AND fb.Question_ID = q.Question_ID
      WHERE q.Quiz_ID = ?
      ORDER BY q.Question_ID ASC
      `,
      [quizId]
    );

    const selectedQuestionId = req.query.question
      ? Number(req.query.question)
      : (questions[0] ? questions[0].Question_ID : null);

    const currentQuestion =
      questions.find(q => Number(q.Question_ID) === Number(selectedQuestionId)) ||
      questions[0] ||
      null;

    res.render('lecturer_quiz_questions', {
      quiz,
      questions,
      currentQuestion,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});


// =========================================================
// LECTURER EDIT QUIZ FORM
// =========================================================


// Đừng đụng đến cái này
app.get('/lecturer/quizzes/:quizId/edit', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const quizId = Number(req.params.quizId);

    const quiz = await getLecturerOwnedQuiz(pool, lecturerId, quizId);

    if (!quiz) {
      return res.status(403).render('error', {
        message: 'Bạn không có quyền chỉnh sửa quiz này.'
      });
    }

    const course = await getLecturerOwnedCourse(pool, lecturerId, quiz.Course_ID);

    res.render('quiz_form', {
      mode: 'edit',
      course,
      quiz,
      error: null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});


// =========================================================
// LECTURER UPDATE QUIZ
// =========================================================
// sử dụng syncquiz
// Đừng đụng đến cái này
app.post('/lecturer/quizzes/:quizId', requireLecturer, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const lecturerId = req.session.user.id;
    const quizId = Number(req.params.quizId);

    const oldQuiz = await getLecturerOwnedQuiz(conn, lecturerId, quizId);

    if (!oldQuiz) {
      return res.status(403).render('error', {
        message: 'Bạn không có quyền chỉnh sửa quiz này.'
      });
    }

    const {
      Quiz_title,
      Open_time,
      Close_time,
      Duration,
      Max_attempts,
      Max_score,
      Pass_score
    } = req.body;

    const openTime = normalizeDateTimeLocal(Open_time);
    const closeTime = normalizeDateTimeLocal(Close_time);

    if (!Quiz_title || Quiz_title.trim() === '') {
      throw new Error('Tên quiz không được để trống.');
    }

    if (!openTime || !closeTime) {
      throw new Error('Thời gian mở và đóng quiz không được để trống.');
    }

    if (new Date(openTime) >= new Date(closeTime)) {
      throw new Error('Thời gian đóng quiz phải sau thời gian mở quiz.');
    }

    if (Number(Duration) <= 0) {
      throw new Error('Thời lượng làm bài phải lớn hơn 0.');
    }

    if (Number(Max_attempts) < 1) {
      throw new Error('Số lần làm bài tối đa phải lớn hơn hoặc bằng 1.');
    }

    const maxScore = Number(Max_score);
    const passScore = Number(Pass_score);

    if (maxScore <= 0) {
      throw new Error('Max score phải lớn hơn 0.');
    }

    if (passScore < 0 || passScore > maxScore) {
      throw new Error('Pass score phải nằm trong khoảng từ 0 đến Max score.');
    }

    await conn.beginTransaction();

    await conn.query(
      `
      UPDATE QUIZ
      SET
        Quiz_title = ?,
        Max_attempts = ?,
        Pass_score = ?,
        Duration = ?,
        Max_score = ?,
        Close_time = ?,
        Open_time = ?
      WHERE Quiz_ID = ?
      `,
      [
        Quiz_title.trim(),
        Number(Max_attempts),
        passScore,
        Number(Duration),
        maxScore,
        closeTime,
        openTime,
        quizId
      ]
    );

    await syncQuizMaxScore(conn, quizId);
    await regradeQuizForAllStudents(conn, quizId);

    await conn.commit();

    res.redirect(`/lecturer/courses/${oldQuiz.Course_ID}?success=Cập nhật quiz thành công. Điểm sinh viên đã được cập nhật lại.`);
  } catch (error) {
    await conn.rollback();

    res.status(400).render('error', {
      message: getMysqlErrorMessage(error)
    });
  } finally {
    conn.release();
  }
});

// =========================================================
// LECTURER ADD QUESTION FORM
// =========================================================


// đừng đụng đến cái này
app.get('/lecturer/quizzes/:quizId/questions/new', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const quizId = Number(req.params.quizId);

    const quiz = await getLecturerOwnedQuiz(pool, lecturerId, quizId);

    if (!quiz) {
      return res.status(403).render('error', {
        message: 'Bạn không có quyền thêm câu hỏi cho quiz này.'
      });
    }

    res.render('question_form', {
      quiz,
      form: {},
      success: req.query.success || null,
      error: null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});


// =========================================================
// LECTURER ADD QUESTION
// Hỗ trợ MCQ và FILL_BLANK
// =========================================================

// đừng đụng đến cái này
app.post('/lecturer/quizzes/:quizId/questions', requireLecturer, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const lecturerId = req.session.user.id;
    const quizId = Number(req.params.quizId);

    const quiz = await getLecturerOwnedQuiz(conn, lecturerId, quizId);

    if (!quiz) {
      throw new Error('Bạn không có quyền thêm câu hỏi cho quiz này.');
    }

    const {
      Question_type,
      Content,
      Score,
      MC_correct_answer,
      Option_1,
      Option_2,
      Option_3,
      Option_4,
      FITB_answers
    } = req.body;

    if (!Question_type || !['MCQ', 'FILL_BLANK'].includes(Question_type)) {
      throw new Error('Loại câu hỏi không hợp lệ.');
    }

    if (!Content || Content.trim() === '') {
      throw new Error('Nội dung câu hỏi không được để trống.');
    }

    if (Number(Score) <= 0) {
      throw new Error('Điểm câu hỏi phải lớn hơn 0.');
    }

    await conn.beginTransaction();

    const [maxRows] = await conn.query(
      `
      SELECT IFNULL(MAX(Question_ID), 0) + 1 AS next_question_id
      FROM QUESTION
      WHERE Quiz_ID = ?
      `,
      [quizId]
    );

    const questionId = maxRows[0].next_question_id;

    await conn.query(
      `
      INSERT INTO QUESTION
      (Quiz_ID, Question_ID, Creator_ID, Content, Question_type)
      VALUES (?, ?, ?, ?, ?)
      `,
      [quizId, questionId, lecturerId, Content.trim(), Question_type]
    );

    if (Question_type === 'MCQ') {
      const options = [Option_1, Option_2, Option_3, Option_4]
        .map(x => String(x || '').trim())
        .filter(x => x !== '');

      if (options.length < 2) {
        throw new Error('Câu hỏi trắc nghiệm phải có ít nhất 2 lựa chọn.');
      }

      if (!MC_correct_answer || !options.includes(MC_correct_answer.trim())) {
        throw new Error('Đáp án đúng phải trùng với một trong các lựa chọn trắc nghiệm.');
      }

      await conn.query(
        `
        INSERT INTO MULTIPLE_CHOICE
        (Quiz_ID, Question_ID, MC_correct_answer, Score, Shuffle_flag)
        VALUES (?, ?, ?, ?, FALSE)
        `,
        [quizId, questionId, MC_correct_answer.trim(), Number(Score)]
      );

      for (const option of options) {
        await conn.query(
          `
          INSERT INTO MC_OPTIONS
          (Quiz_ID, Question_ID, Option_text)
          VALUES (?, ?, ?)
          `,
          [quizId, questionId, option]
        );
      }
    }

    if (Question_type === 'FILL_BLANK') {
      if (!Content.includes('{blank}')) {
        throw new Error('Câu hỏi điền khuyết phải chứa ký hiệu {blank}.');
      }

      const answers = String(FITB_answers || '')
        .split(/\r?\n|,/)
        .map(x => x.trim())
        .filter(x => x !== '');

      if (answers.length === 0) {
        throw new Error('Câu hỏi điền khuyết phải có ít nhất 1 đáp án đúng.');
      }

      await conn.query(
        `
        INSERT INTO FILL_IN_THE_BLANKS
        (Quiz_ID, Question_ID, Score)
        VALUES (?, ?, ?)
        `,
        [quizId, questionId, Number(Score)]
      );

      for (const answer of answers) {
        await conn.query(
          `
          INSERT INTO FITB_ANSWERS
          (Quiz_ID, Question_ID, Answer_text)
          VALUES (?, ?, ?)
          `,
          [quizId, questionId, answer]
        );
      }
    }

    await syncQuizMaxScore(conn, quizId);
    await regradeQuizForAllStudents(conn, quizId);
    await conn.commit();

    res.redirect(`/lecturer/quizzes/${quizId}/questions/new?success=Thêm câu hỏi thành công. Điểm của sinh viên đã được cập nhật lại.`);
  } catch (error) {
    await conn.rollback();

    try {
      const quiz = await getLecturerOwnedQuiz(pool, req.session.user.id, Number(req.params.quizId));

      res.status(400).render('question_form', {
        quiz,
        form: req.body,
        success: null,
        error: getMysqlErrorMessage(error)
      });
    } catch (innerError) {
      res.status(500).render('error', {
        message: getMysqlErrorMessage(innerError)
      });
    }
  } finally {
    conn.release();
  }
});

// =========================================================
// LECTURER EDIT QUESTION FORM
// =========================================================


// Cần thay bằng phiên bản call procedure
app.get('/lecturer/quizzes/:quizId/questions/:questionId/edit', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const quizId = Number(req.params.quizId);
    const questionId = Number(req.params.questionId);

    const quiz = await getLecturerOwnedQuiz(pool, lecturerId, quizId);

    if (!quiz) {
      return res.status(403).render('error', {
        message: 'Bạn không có quyền chỉnh sửa câu hỏi này.'
      });
    }

    const [questionRows] = await pool.query(
      `
      SELECT
        q.Quiz_ID,
        q.Question_ID,
        q.Content,
        q.Question_type,
        mc.MC_correct_answer,
        mc.Score AS MCQ_score,
        fb.Score AS FITB_score
      FROM QUESTION q
      LEFT JOIN MULTIPLE_CHOICE mc
        ON mc.Quiz_ID = q.Quiz_ID
       AND mc.Question_ID = q.Question_ID
      LEFT JOIN FILL_IN_THE_BLANKS fb
        ON fb.Quiz_ID = q.Quiz_ID
       AND fb.Question_ID = q.Question_ID
      WHERE q.Quiz_ID = ?
        AND q.Question_ID = ?
      `,
      [quizId, questionId]
    );

    if (questionRows.length === 0) {
      return res.status(404).render('error', {
        message: 'Không tìm thấy câu hỏi cần chỉnh sửa.'
      });
    }

    const question = questionRows[0];

    const [optionRows] = await pool.query(
      `
      SELECT Option_text
      FROM MC_OPTIONS
      WHERE Quiz_ID = ?
        AND Question_ID = ?
      ORDER BY Option_text ASC
      `,
      [quizId, questionId]
    );

    const [fitbRows] = await pool.query(
      `
      SELECT Answer_text
      FROM FITB_ANSWERS
      WHERE Quiz_ID = ?
        AND Question_ID = ?
      ORDER BY Answer_text ASC
      `,
      [quizId, questionId]
    );

    res.render('question_edit_form', {
      quiz,
      question,
      options: optionRows,
      fitbAnswers: fitbRows,
      error: null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});


// =========================================================
// LECTURER UPDATE QUESTION
// Sau khi update câu hỏi/đáp án: regrade toàn bộ sinh viên
// =========================================================

// không đụng đến cái này
app.post('/lecturer/quizzes/:quizId/questions/:questionId', requireLecturer, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const lecturerId = req.session.user.id;
    const quizId = Number(req.params.quizId);
    const questionId = Number(req.params.questionId);

    const quiz = await getLecturerOwnedQuiz(conn, lecturerId, quizId);

    if (!quiz) {
      throw new Error('Bạn không có quyền chỉnh sửa câu hỏi này.');
    }

    const {
      Content,
      Score,
      MC_correct_answer,
      Option_1,
      Option_2,
      Option_3,
      Option_4,
      FITB_answers
    } = req.body;

    if (!Content || Content.trim() === '') {
      throw new Error('Nội dung câu hỏi không được để trống.');
    }

    if (Number(Score) <= 0) {
      throw new Error('Điểm câu hỏi phải lớn hơn 0.');
    }

    await conn.beginTransaction();

    const [questionRows] = await conn.query(
      `
      SELECT Question_type
      FROM QUESTION
      WHERE Quiz_ID = ?
        AND Question_ID = ?
      `,
      [quizId, questionId]
    );

    if (questionRows.length === 0) {
      throw new Error('Không tìm thấy câu hỏi cần cập nhật.');
    }

    const questionType = questionRows[0].Question_type;

    await conn.query(
      `
      UPDATE QUESTION
      SET Content = ?
      WHERE Quiz_ID = ?
        AND Question_ID = ?
      `,
      [Content.trim(), quizId, questionId]
    );

    if (questionType === 'MCQ') {
      const options = [Option_1, Option_2, Option_3, Option_4]
        .map(x => String(x || '').trim())
        .filter(x => x !== '');

      if (options.length < 2) {
        throw new Error('Câu hỏi trắc nghiệm phải có ít nhất 2 lựa chọn.');
      }

      if (!MC_correct_answer || !options.includes(MC_correct_answer.trim())) {
        throw new Error('Đáp án đúng phải trùng chính xác với một trong các lựa chọn.');
      }

      await conn.query(
        `
        UPDATE MULTIPLE_CHOICE
        SET MC_correct_answer = ?,
            Score = ?
        WHERE Quiz_ID = ?
          AND Question_ID = ?
        `,
        [MC_correct_answer.trim(), Number(Score), quizId, questionId]
      );

      await conn.query(
        `
        DELETE FROM MC_OPTIONS
        WHERE Quiz_ID = ?
          AND Question_ID = ?
        `,
        [quizId, questionId]
      );

      for (const option of options) {
        await conn.query(
          `
          INSERT INTO MC_OPTIONS
          (Quiz_ID, Question_ID, Option_text)
          VALUES (?, ?, ?)
          `,
          [quizId, questionId, option]
        );
      }
    }

    if (questionType === 'FILL_BLANK') {
      if (!Content.includes('{blank}')) {
        throw new Error('Câu hỏi điền khuyết phải chứa ký hiệu {blank}.');
      }

      const answers = String(FITB_answers || '')
        .split(/\r?\n|,/)
        .map(x => x.trim())
        .filter(x => x !== '');

      if (answers.length === 0) {
        throw new Error('Câu hỏi điền khuyết phải có ít nhất 1 đáp án đúng.');
      }

      await conn.query(
        `
        UPDATE FILL_IN_THE_BLANKS
        SET Score = ?
        WHERE Quiz_ID = ?
          AND Question_ID = ?
        `,
        [Number(Score), quizId, questionId]
      );

      await conn.query(
        `
        DELETE FROM FITB_ANSWERS
        WHERE Quiz_ID = ?
          AND Question_ID = ?
        `,
        [quizId, questionId]
      );

      for (const answer of answers) {
        await conn.query(
          `
          INSERT INTO FITB_ANSWERS
          (Quiz_ID, Question_ID, Answer_text)
          VALUES (?, ?, ?)
          `,
          [quizId, questionId, answer]
        );
      }
    }

    await syncQuizMaxScore(conn, quizId);
    await regradeQuizForAllStudents(conn, quizId);

    await conn.commit();

    res.redirect(`/lecturer/quizzes/${quizId}/questions/${questionId}/edit?success=Cập nhật câu hỏi thành công. Điểm sinh viên đã được cập nhật lại.`);
  } catch (error) {
    await conn.rollback();

    res.status(400).render('error', {
      message: getMysqlErrorMessage(error)
    });
  } finally {
    conn.release();
  }
});


// =========================================================
// ADMIN DASHBOARD
// Admin xem user, tạo môn học, tạo khóa học
// =========================================================


// Cần thay bằng phiên bản Call Procedure
app.get('/admin/dashboard', requireAdmin, async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT
        User_ID,
        Username,
        Email,
        User_role,
        Full_name,
        Address
      FROM USER_ACCOUNT
      WHERE User_role IN ('Student', 'Lecturer')
      ORDER BY User_role, Full_name
    `);

    const [departments] = await pool.query(`
      SELECT
        d.Dept_ID,
        d.Dept_name,
        d.Founding_date,
        d.Head_ID,
        ua.Full_name AS Head_name,
        t.Start_date AS Head_start_date,
        t.End_date AS Head_end_date
      FROM DEPARTMENT d
      LEFT JOIN LECTURER l
        ON l.User_ID = d.Head_ID
      LEFT JOIN USER_ACCOUNT ua
        ON ua.User_ID = l.User_ID
      LEFT JOIN TERMS t
        ON t.Dept_ID = d.Dept_ID AND t.Lecturer_ID = d.Head_ID
      ORDER BY d.Dept_name
    `);

    const [subjects] = await pool.query(`
      SELECT
        s.Subject_ID,
        s.Subject_name,
        s.Credits,
        s.Syllabus,
        d.Dept_name,
        COUNT(c.Course_ID) AS Total_courses
      FROM SUBJECT s
      JOIN DEPARTMENT d
        ON d.Dept_ID = s.Dept_ID
      LEFT JOIN COURSE c
        ON c.Subject_ID = s.Subject_ID
      GROUP BY
        s.Subject_ID,
        s.Subject_name,
        s.Credits,
        s.Syllabus,
        d.Dept_name
      ORDER BY s.Subject_ID DESC
    `);

    const [lecturers] = await pool.query(`
      SELECT
        l.User_ID AS Lecturer_ID,
        ua.Full_name,
        ua.Email
      FROM LECTURER l
      JOIN USER_ACCOUNT ua
        ON ua.User_ID = l.User_ID
      ORDER BY ua.Full_name
    `);

    res.render('admin_dashboard', {
      users,
      departments,
      subjects,
      lecturers,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});


// =========================================================
// ADMIN CREATE SUBJECT
// Admin tạo môn học và chọn môn tiên quyết
// =========================================================

// không đụng đến cái này
app.post('/admin/subjects', requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const {
      Subject_name,
      Credits,
      Syllabus,
      Dept_ID,
      Prerequisites
    } = req.body;

    if (!Subject_name || Subject_name.trim() === '') {
      throw new Error('Tên môn học không được để trống.');
    }

    if (!Credits || Number(Credits) < 1 || Number(Credits) > 4) {
      throw new Error('Số tín chỉ phải từ 1 đến 4.');
    }

    if (!Syllabus || Syllabus.trim() === '') {
      throw new Error('Syllabus không được để trống.');
    }

    if (!Dept_ID) {
      throw new Error('Vui lòng chọn khoa phụ trách môn học.');
    }

    await conn.beginTransaction();

    const [result] = await conn.query(
      `
      INSERT INTO SUBJECT
      (Subject_name, Credits, Syllabus, Dept_ID)
      VALUES (?, ?, ?, ?)
      `,
      [
        Subject_name.trim(),
        Number(Credits),
        Syllabus.trim(),
        Number(Dept_ID)
      ]
    );

    const newSubjectId = result.insertId;

    const prerequisiteList = Array.isArray(Prerequisites)
      ? Prerequisites
      : (Prerequisites ? [Prerequisites] : []);

    for (const preId of prerequisiteList) {
      if (Number(preId) !== newSubjectId) {
        await conn.query(
          `
          INSERT INTO PREREQUISITE
          (Prerequisite_subject_ID, Advanced_subject_ID)
          VALUES (?, ?)
          `,
          [Number(preId), newSubjectId]
        );
      }
    }

    await conn.commit();

    res.redirect('/admin/dashboard?success=Tạo môn học thành công');
  } catch (error) {
    await conn.rollback();

    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    res.redirect(`/admin/dashboard?error=${msg}`);
  } finally {
    conn.release();
  }
});


// =========================================================
// ADMIN CREATE COURSE
// Admin tạo khóa học và chỉ định giảng viên
// =========================================================


// Đã thay bằng phiên bản Call Procedure
// Route này của phần 2.1
app.post('/admin/courses', requireAdmin, async (req, res) => {
  try {
    const {
      Course_name,
      Description,
      Start_date,
      End_date,
      Subject_ID,
      Lecturer_ID
    } = req.body;

    await pool.query(
      'CALL sp_insert_course(?, ?, ?, ?, ?, ?)',
      [
        Course_name,
        Description || null,
        Start_date,
        End_date,
        Number(Subject_ID),
        Number(Lecturer_ID)
      ]
    );

    res.redirect('/admin/dashboard?success=Tạo khóa học thành công');
  } catch (error) {
    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    res.redirect(`/admin/dashboard?error=${msg}`);
  }
});


// =========================================================
// ADMIN SUBJECT COURSES
// Quản lý môn học: xem tất cả khóa học của một môn
// =========================================================


// Cần thay bằng Call Procedure
app.get('/admin/subjects/:subjectId/courses', requireAdmin, async (req, res) => {
  try {
    const subjectId = Number(req.params.subjectId);

    const [subjectRows] = await pool.query(
      `
      SELECT
        s.Subject_ID,
        s.Subject_name,
        s.Credits,
        s.Syllabus,
        d.Dept_name
      FROM SUBJECT s
      JOIN DEPARTMENT d
        ON d.Dept_ID = s.Dept_ID
      WHERE s.Subject_ID = ?
      `,
      [subjectId]
    );

    if (subjectRows.length === 0) {
      return res.status(404).render('error', {
        message: 'Không tìm thấy môn học.'
      });
    }

    const [courses] = await pool.query(
      `
      SELECT
        c.Course_ID,
        c.Course_name,
        c.Description,
        c.Start_date,
        c.End_date,
        ua.Full_name AS Lecturer_name,
        COUNT(e.Student_ID) AS Total_students
      FROM COURSE c
      JOIN LECTURER l
        ON l.User_ID = c.Lecturer_ID
      JOIN USER_ACCOUNT ua
        ON ua.User_ID = l.User_ID
      LEFT JOIN ENROLL e
        ON e.Course_ID = c.Course_ID
      WHERE c.Subject_ID = ?
      GROUP BY
        c.Course_ID,
        c.Course_name,
        c.Description,
        c.Start_date,
        c.End_date,
        ua.Full_name
      ORDER BY c.Start_date DESC, c.Course_ID DESC
      `,
      [subjectId]
    );

    res.render('admin_subject_courses', {
      subject: subjectRows[0],
      courses,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});


// không đụng đến cái này
app.get('/student/profile', requireStudent, async (req, res) => {
  return res.redirect('/profile');
});

// không đụng đến cái này
app.post('/student/profile/password', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const { old_password, new_password, confirm_password } = req.body;

    if (!old_password || !new_password || !confirm_password) {
      throw new Error('Vui lòng nhập đầy đủ thông tin đổi mật khẩu.');
    }

    if (new_password !== confirm_password) {
      throw new Error('Mật khẩu mới và xác nhận mật khẩu không khớp.');
    }

    if (!validatePassword(new_password)) {
      throw new Error('Mật khẩu mới phải có ít nhất 12 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt.');
    }

    const [rows] = await pool.query(
      `
      SELECT Password
      FROM USER_ACCOUNT
      WHERE User_ID = ?
      `,
      [studentId]
    );

    if (rows.length === 0 || rows[0].Password !== old_password) {
      throw new Error('Mật khẩu hiện tại không đúng.');
    }

    await pool.query(
      `
      UPDATE USER_ACCOUNT
      SET Password = ?
      WHERE User_ID = ?
      `,
      [new_password, studentId]
    );

    res.redirect('/student/profile?success=Đổi mật khẩu thành công');
  } catch (error) {
    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    res.redirect(`/student/profile?error=${msg}`);
  }
});


// =========================================================
// COMMON PROFILE
// Student / Lecturer / Admin xem và cập nhật thông tín cá nhân
// =========================================================


// Cần thay bằng phiên bản Call Procedure
app.get('/profile', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const [userRows] = await pool.query(
      `
      SELECT
        User_ID,
        Username,
        Email,
        User_role,
        SSN,
        Full_name,
        Address
      FROM USER_ACCOUNT
      WHERE User_ID = ?
      `,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).render('error', {
        message: 'Không tìm thấy thông tin tài khoản.'
      });
    }

    const [phones] = await pool.query(
      `
      SELECT Phone_number
      FROM PHONE_NUMBERS
      WHERE User_ID = ?
      ORDER BY Phone_number
      `,
      [userId]
    );

    let studentInfo = null;
    let lecturerInfo = null;
    let academic = null;
    let courses = [];

    if (req.session.user.role === 'Student') {
      const [studentRows] = await pool.query(
        `
        SELECT
          s.Dept_ID,
          s.Major_ID,
          d.Dept_name,
          m.Major_name
        FROM STUDENT s
        JOIN DEPARTMENT d
          ON d.Dept_ID = s.Dept_ID
        JOIN MAJOR m
          ON m.Dept_ID = s.Dept_ID
         AND m.Major_ID = s.Major_ID
        WHERE s.User_ID = ?
        `,
        [userId]
      );

      studentInfo = studentRows[0] || null;

      const [academicRows] = await pool.query(
        `
        SELECT
          fn_calculate_student(?) AS GPA,

          IFNULL(SUM(
            CASE
              WHEN e.Enroll_status = 'Completed' THEN sub.Credits
              ELSE 0
            END
          ), 0) AS Accumulated_credits,

          COUNT(e.Course_ID) AS Total_courses
        FROM ENROLL e
        JOIN COURSE c
          ON c.Course_ID = e.Course_ID
        JOIN SUBJECT sub
          ON sub.Subject_ID = c.Subject_ID
        WHERE e.Student_ID = ?
        `,
        [userId, userId]
      );

      academic = academicRows[0] || null;

      const [courseRows] = await pool.query(
        `
        SELECT
          c.Course_ID,
          c.Course_name,
          sub.Subject_name,
          sub.Credits,
          e.Enroll_status,
          e.Final_score
        FROM ENROLL e
        JOIN COURSE c
          ON c.Course_ID = e.Course_ID
        JOIN SUBJECT sub
          ON sub.Subject_ID = c.Subject_ID
        WHERE e.Student_ID = ?
        ORDER BY c.Start_date DESC
        `,
        [userId]
      );

      courses = courseRows;
    }

    if (req.session.user.role === 'Lecturer') {
      const [lecturerRows] = await pool.query(
        `
        SELECT
          l.Teaching_experience,
          l.Academic_degree,
          l.Academic_title,
          d.Dept_name
        FROM LECTURER l
        LEFT JOIN WORK_FOR wf
          ON wf.Lecturer_ID = l.User_ID
        LEFT JOIN DEPARTMENT d
          ON d.Dept_ID = wf.Dept_ID
        WHERE l.User_ID = ?
        LIMIT 1
        `,
        [userId]
      );

      lecturerInfo = lecturerRows[0] || null;

      // Lấy danh sách văn bằng
      const [degreeRows] = await pool.query(
        `SELECT Degree FROM DEGREES WHERE Lecturer_ID = ? ORDER BY Degree`,
        [userId]
      );
      if (lecturerInfo) lecturerInfo.degrees = degreeRows.map(r => r.Degree);
    }

    res.render('profile', {
      user: userRows[0],
      phones,
      studentInfo,
      lecturerInfo,
      academic,
      courses,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    res.status(500).render('error', {
      message: getMysqlErrorMessage(error)
    });
  }
});





// Đã thay bằng phiên bản Call Procedure
app.post('/profile', requireLogin, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const role   = req.session.user.role;
    const {
      Email,
      Full_name,
      Address,
      SSN,
      Phone_numbers,
      Academic_degree,
      Academic_title,
      Teaching_experience,
      old_password,
      new_password,
      confirm_password
    } = req.body;

    // ── Validate format ở Node (regex – không thể làm trong SQL) ──

    if (!Email || !Full_name || !SSN) {
      throw new Error('Email, họ tên và SSN/CCCD không được để trống.');
    }

    if (!/^[0-9]{12}$/.test(SSN)) {
      throw new Error('Số SSN/CCCD không hợp lệ. Phải bao gồm đúng 12 chữ số.');
    }

    // Xử lý + validate danh sách số điện thoại
    const phoneList = String(Phone_numbers || '')
      .split(/\r?\n|,/)
      .map(x => x.trim())
      .filter(x => x !== '');

    for (const phone of phoneList) {
      if (!/^[0-9]{8,15}$/.test(phone)) {
        throw new Error('Số điện thoại không hợp lệ (8-15 chữ số).');
      }
    }

    const phoneCsv = phoneList.join(','); // truyền vào procedure dưới dạng CSV

    // Validate mật khẩu nếu có yêu cầu đổi
    let oldPwd = null;
    let newPwd = null;

    if (old_password || new_password || confirm_password) {
      if (!old_password || !new_password || !confirm_password) {
        throw new Error('Vui lòng nhập đầy đủ thông tin để đổi mật khẩu.');
      }
      if (new_password !== confirm_password) {
        throw new Error('Mật khẩu mới và xác nhận mật khẩu không khớp.');
      }
      if (!validatePassword(new_password)) {
        throw new Error('Mật khẩu mới không đủ mạnh (ít nhất 12 ký tự, có hoa, thường, số, ký tự đặc biệt).');
      }
      oldPwd = old_password;
      newPwd = new_password;
    }

    // ── Gọi procedure – toàn bộ business logic + DML nằm trong SP ──
    await pool.query(
      `CALL sp_update_profile(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        role,
        Email.trim(),
        Full_name.trim(),
        Address || null,
        SSN.trim(),
        phoneCsv,
        role === 'Lecturer' ? (Academic_degree || null) : null,
        role === 'Lecturer' ? (Academic_title  || null) : null,
        role === 'Lecturer' ? Number(Teaching_experience || 0) : null,
        oldPwd,
        newPwd
      ]
    );

    req.session.user.fullName = Full_name.trim();
    req.session.user.email    = Email.trim();

    res.redirect('/profile?success=Cập nhật thông tin cá nhân thành công');
  } catch (error) {
    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    res.redirect(`/profile?error=${msg}`);
  }
});

// =========================================================
// DEGREES CRUD (Lecturer only)
// =========================================================

// POST /profile/degrees  → thêm một văn bằng
// Đừng đụng đến
app.post('/profile/degrees', requireLogin, async (req, res) => {
  if (req.session.user.role !== 'Lecturer') {
    return res.status(403).json({ error: 'Chỉ giảng viên mới có thể thêm văn bằng.' });
  }
  const lecturerId = req.session.user.id;
  const degree = (req.body.degree || '').trim();
  if (!degree || degree.length > 100) {
    return res.status(400).json({ error: 'Tên văn bằng không hợp lệ (1–100 ký tự).' });
  }
  try {
    await pool.query(
      `INSERT IGNORE INTO DEGREES (Lecturer_ID, Degree) VALUES (?, ?)`,
      [lecturerId, degree]
    );
    return res.json({ ok: true, degree });
  } catch (err) {
    return res.status(500).json({ error: getMysqlErrorMessage(err) });
  }
});

// PUT /profile/degrees/:oldDegree  → sửa tên văn bằng
// Đừng đụng đến
app.put('/profile/degrees/:oldDegree', requireLogin, async (req, res) => {
  if (req.session.user.role !== 'Lecturer') {
    return res.status(403).json({ error: 'Chỉ giảng viên mới có thể sửa văn bằng.' });
  }
  const lecturerId = req.session.user.id;
  const oldDegree  = decodeURIComponent(req.params.oldDegree).trim();
  const newDegree  = (req.body.degree || '').trim();
  if (!newDegree || newDegree.length > 100) {
    return res.status(400).json({ error: 'Tên văn bằng mới không hợp lệ (1–100 ký tự).' });
  }
  try {
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.query(
      `DELETE FROM DEGREES WHERE Lecturer_ID = ? AND Degree = ?`,
      [lecturerId, oldDegree]
    );
    await conn.query(
      `INSERT IGNORE INTO DEGREES (Lecturer_ID, Degree) VALUES (?, ?)`,
      [lecturerId, newDegree]
    );
    await conn.commit();
    conn.release();
    return res.json({ ok: true, degree: newDegree });
  } catch (err) {
    return res.status(500).json({ error: getMysqlErrorMessage(err) });
  }
});

// DELETE /profile/degrees/:degree  → xóa văn bằng
// Đừng đụng đến
app.delete('/profile/degrees/:degree', requireLogin, async (req, res) => {
  if (req.session.user.role !== 'Lecturer') {
    return res.status(403).json({ error: 'Chỉ giảng viên mới có thể xóa văn bằng.' });
  }
  const lecturerId = req.session.user.id;
  const degree = decodeURIComponent(req.params.degree).trim();
  try {
    await pool.query(
      `DELETE FROM DEGREES WHERE Lecturer_ID = ? AND Degree = ?`,
      [lecturerId, degree]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: getMysqlErrorMessage(err) });
  }
});

// =========================================================
// ADMIN CREATE DEPARTMENT
// Admin tạo khoa mới
// =========================================================


// Cần thay bằng phiên bản call procedure
app.post('/admin/departments', requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      Dept_ID,
      Dept_name,
      Founding_date,
      Head_ID
    } = req.body;

    if (!Dept_name || Dept_name.trim() === '') {
      throw new Error('Tên khoa không được để trống.');
    }

    await conn.beginTransaction();

    const [duplicated] = await conn.query(
      `
      SELECT Dept_ID
      FROM DEPARTMENT
      WHERE LOWER(TRIM(Dept_name)) = LOWER(TRIM(?))
      LIMIT 1
      `,
      [Dept_name]
    );

    if (duplicated.length > 0) {
      throw new Error('Tên khoa đã tồn tại trong hệ thống.');
    }

    const finalFoundingDate = Founding_date || null;
    const finalHeadId = Head_ID ? Number(Head_ID) : null;

    if (finalHeadId) {
      const [headCheck] = await conn.query(
        `SELECT Dept_name FROM DEPARTMENT WHERE Head_ID = ? LIMIT 1`,
        [finalHeadId]
      );
      if (headCheck.length > 0) {
        throw new Error(`Giảng viên này hiện đang làm trưởng khoa "${headCheck[0].Dept_name}". Một người chỉ được làm trưởng của 1 khoa.`);
      }
    }

    let insertId;

    if (Dept_ID && String(Dept_ID).trim() !== '') {
      await conn.query(
        `
        INSERT INTO DEPARTMENT
        (Dept_ID, Dept_name, Founding_date, Head_ID)
        VALUES (?, ?, ?, ?)
        `,
        [
          Number(Dept_ID),
          Dept_name.trim(),
          finalFoundingDate,
          finalHeadId
        ]
      );
      insertId = Number(Dept_ID);
    } else {
      const [result] = await conn.query(
        `
        INSERT INTO DEPARTMENT
        (Dept_name, Founding_date, Head_ID)
        VALUES (?, ?, ?)
        `,
        [
          Dept_name.trim(),
          finalFoundingDate,
          finalHeadId
        ]
      );
      insertId = result.insertId;
    }

    if (finalHeadId) {
      await conn.query(
        `
        DELETE FROM WORK_FOR
        WHERE Lecturer_ID = ?
        `,
        [finalHeadId]
      );

      await conn.query(
        `
        INSERT INTO WORK_FOR
        (Lecturer_ID, Dept_ID)
        VALUES (?, ?)
        `,
        [finalHeadId, insertId]
      );

      await conn.query(
        `
        INSERT INTO TERMS
        (Dept_ID, Lecturer_ID, Start_date, End_date)
        VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 5 YEAR))
        `,
        [insertId, finalHeadId]
      );
    }

    await conn.commit();
    res.redirect('/admin/dashboard?success=Tạo khoa thành công');
  } catch (error) {
    await conn.rollback();
    const msg = encodeURIComponent(getMysqlErrorMessage(error));
    res.redirect(`/admin/dashboard?error=${msg}`);
  } finally {
    conn.release();
  }
});


app.listen(PORT, () => {
  console.log(`LMS BTL2 web app is running at http://localhost:${PORT}`);
});