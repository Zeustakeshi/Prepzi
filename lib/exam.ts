import { z } from "zod";

const optionSchema = z.object({
  id: z.string().trim().min(1, "ID lựa chọn không được trống"),
  text: z.string().trim().min(1, "Nội dung lựa chọn không được trống"),
});

const baseQuestionSchema = z.object({
  id: z.string().trim().min(1, "ID câu hỏi không được trống"),
  question: z.string().trim().min(1, "Nội dung câu hỏi không được trống"),
  points: z.number().positive("Điểm phải lớn hơn 0").default(1),
  explanation: z.string().trim().optional(),
});

const multipleChoiceSchema = baseQuestionSchema.extend({
  type: z.literal("multiple_choice"),
  options: z.array(optionSchema).min(2, "Câu trắc nghiệm cần ít nhất 2 lựa chọn"),
  correctAnswer: z.array(z.string().trim().min(1)).min(1, "Cần ít nhất một đáp án đúng"),
});

const essaySchema = baseQuestionSchema.extend({
  type: z.literal("essay"),
  groundTruth: z.string().trim().min(1, "Câu tự luận cần groundTruth"),
  requiredIdeas: z.array(z.string().trim().min(1)).optional(),
});

export const examSchema = z
  .object({
    version: z.string().default("1.0"),
    title: z.string().trim().min(1, "Tên bài ôn tập không được trống"),
    description: z.string().trim().optional(),
    durationMinutes: z.number().int().min(1).max(120, "Thời gian tối đa là 120 phút").default(30),
    questions: z.array(z.discriminatedUnion("type", [multipleChoiceSchema, essaySchema])).min(1, "Đề phải có ít nhất một câu hỏi"),
  })
  .superRefine((exam, ctx) => {
    const ids = new Set<string>();
    exam.questions.forEach((question, questionIndex) => {
      if (ids.has(question.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["questions", questionIndex, "id"], message: `ID câu hỏi “${question.id}” bị trùng` });
      }
      ids.add(question.id);
      if (question.type === "multiple_choice") {
        const optionIds = new Set<string>();
        question.options.forEach((option, optionIndex) => {
          if (optionIds.has(option.id)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["questions", questionIndex, "options", optionIndex, "id"], message: `ID lựa chọn “${option.id}” bị trùng` });
          }
          optionIds.add(option.id);
        });
        question.correctAnswer.forEach((answer) => {
          if (!optionIds.has(answer)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["questions", questionIndex, "correctAnswer"], message: `Đáp án “${answer}” không tồn tại trong options` });
          }
        });
      }
    });
  });

export type Exam = z.infer<typeof examSchema>;
export type Question = Exam["questions"][number];
export type UserAnswer = string[] | string;

export type GradeResult = {
  questionId: string;
  isCorrect: boolean;
  score: number;
  matchedIdeas: string[];
  missingIdeas: string[];
  feedback: string;
  confidence: number;
};

export type SavedExam = {
  id: string;
  exam: Exam;
  addedAt: number;
  lastStudiedAt?: number;
  attemptCount: number;
  bestPercentage?: number;
};

export type SavedAttempt = {
  id: string;
  examId: string;
  examTitle: string;
  startedAt: number;
  submittedAt: number;
  answers: Record<string, UserAnswer>;
  grades: Record<string, GradeResult>;
  score: number;
  maxScore: number;
  percentage: number;
};

export type WrongQuestion = {
  id: string;
  sourceExamId: string;
  sourceExamTitle: string;
  sourceQuestionId: string;
  question: Question;
  mistakeCount: number;
  firstWrongAt: number;
  lastWrongAt: number;
};

export type ActiveAttempt = {
  id: string;
  examId: string;
  startedAt: number;
  deadline: number;
  answers: Record<string, UserAnswer>;
  flaggedQuestionIds: string[];
  examSnapshot?: Exam;
  isPaused?: boolean;
  pausedAt?: number;
  remainingSeconds?: number;
};

export const STORAGE_KEYS = {
  exams: "on-tap-ai:exams",
  attempts: "on-tap-ai:attempts",
  active: "on-tap-ai:active-attempt",
  wrongQuestions: "on-tap-ai:wrong-questions",
} as const;

export function parseExam(raw: string): { exam?: Exam; error?: string } {
  try {
    const data: unknown = JSON.parse(raw);
    const result = examSchema.safeParse(data);
    if (!result.success) {
      const issue = result.error.issues[0];
      const location = issue.path.length ? ` tại ${issue.path.join(" → ")}` : "";
      return { error: `${issue.message}${location}` };
    }
    return { exam: result.data };
  } catch (error) {
    return { error: error instanceof Error ? `JSON không hợp lệ: ${error.message}` : "JSON không hợp lệ" };
  }
}

export function totalPoints(exam: Exam) {
  return exam.questions.reduce((sum, question) => sum + question.points, 0);
}

export function gradeMultipleChoice(correct: string[], answer: UserAnswer | undefined, points: number) {
  const selected = Array.isArray(answer) ? answer : [];
  const isCorrect = selected.length === correct.length && [...selected].sort().every((value, index) => value === [...correct].sort()[index]);
  return { isCorrect, score: isCorrect ? points : 0 };
}
