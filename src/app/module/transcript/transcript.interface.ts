export interface CourseResultSummary {
  courseCode: string;
  courseTitle: string;
  credits: number;
  percentage: number;
  letterGrade: string;
  gradePoint: number;
}

export interface SemesterTranscript {
  semesterName: string;
  courses: CourseResultSummary[];
  semesterGpa: number;
  semesterCredits: number;
}

export interface TranscriptData {
  studentName: string;
  studentId: string;
  programName: string;
  semesters: SemesterTranscript[];
  cumulativeGpa: number;
  totalCreditsEarned: number;
}
