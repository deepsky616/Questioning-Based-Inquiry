// teacher-students 페이지와 하위 컴포넌트가 공유하는 타입
export interface Student {
  id: string; name: string; grade: string; className: string;
  studentNumber: string; school: string;
  questionCount: number; commentCount: number; pointLogCount: number; totalPoints: number;
  lastActivityAt?: string | null;
  sessionProgress?: { total: number; completed: number; remaining: number; percent: number };
}
export interface TeacherClass { grade: string; className: string }
