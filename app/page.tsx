"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type ActiveAttempt, type Exam, type GradeResult, type SavedAttempt, type SavedExam, type UserAnswer, type WrongQuestion, STORAGE_KEYS, gradeMultipleChoice, parseExam, totalPoints } from "@/lib/exam";

const SAMPLE = `{
  "version": "1.0",
  "title": "JavaScript cơ bản",
  "description": "Ôn lại kiến thức nền tảng trước buổi phỏng vấn",
  "durationMinutes": 30,
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "question": "Từ khóa nào dùng để khai báo hằng số trong JavaScript?",
      "options": [
        { "id": "a", "text": "var" },
        { "id": "b", "text": "let" },
        { "id": "c", "text": "const" }
      ],
      "correctAnswer": ["c"],
      "explanation": "const không cho phép gán lại binding sau khi khai báo.",
      "points": 1
    },
    {
      "id": "q2",
      "type": "essay",
      "question": "Giải thích điểm khác nhau chính giữa let và const.",
      "groundTruth": "let cho phép gán lại giá trị, còn const không cho phép gán lại binding. Cả hai đều có phạm vi block.",
      "requiredIdeas": ["let cho phép gán lại", "const không cho phép gán lại binding", "cả hai có phạm vi block"],
      "points": 3
    }
  ]
}`;

type Provider = "ollama" | "gemini" | "openrouter";
type ConfigState = { configured: boolean; provider?: Provider; model?: string };

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch { return fallback; }
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function Home() {
  const [view, setView] = useState<"home" | "quiz" | "result">("home");
  const [json, setJson] = useState("");
  const [importError, setImportError] = useState("");
  const [savedExams, setSavedExams] = useState<SavedExam[]>([]);
  const [attempts, setAttempts] = useState<SavedAttempt[]>([]);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [exam, setExam] = useState<Exam | null>(null);
  const [active, setActive] = useState<ActiveAttempt | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState<SavedAttempt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [pendingStart, setPendingStart] = useState<{ exam: Exam; existingId?: string; saveExam?: boolean } | null>(null);
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [showPracticeSetup, setShowPracticeSetup] = useState(false);
  const [selectedPracticeCount, setSelectedPracticeCount] = useState(1);
  const [config, setConfig] = useState<ConfigState>({ configured: false });
  const [provider, setProvider] = useState<Provider>("gemini");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [configStatus, setConfigStatus] = useState("");

  useEffect(() => {
    const exams = readStored<SavedExam[]>(STORAGE_KEYS.exams, []);
    const history = readStored<SavedAttempt[]>(STORAGE_KEYS.attempts, []);
    const storedWrongQuestions = readStored<WrongQuestion[]>(STORAGE_KEYS.wrongQuestions, []);
    setSavedExams(exams);
    setAttempts(history);
    setWrongQuestions(storedWrongQuestions);
    fetch("/api/config").then((response) => response.json()).then((data: ConfigState) => {
      setConfig(data);
      if (data.provider) setProvider(data.provider);
      if (data.model) setModel(data.model);
    }).catch(() => undefined);
    const storedActive = readStored<ActiveAttempt | null>(STORAGE_KEYS.active, null);
    if (storedActive) {
      const restoredExam = storedActive.examSnapshot || exams.find((item) => item.id === storedActive.examId)?.exam;
      if (restoredExam) {
        setExam(restoredExam);
        const restored = { ...storedActive, flaggedQuestionIds: storedActive.flaggedQuestionIds || [] };
        setActive(restored);
        const restoredSeconds = storedActive.isPaused
          ? storedActive.remainingSeconds ?? Math.max(0, Math.ceil((storedActive.deadline - Date.now()) / 1000))
          : Math.max(0, Math.ceil((storedActive.deadline - Date.now()) / 1000));
        setSecondsLeft(restoredSeconds);
        setView(storedActive.isPaused ? "home" : "quiz");
      }
    }
  }, []);

  const persistExams = (next: SavedExam[]) => { setSavedExams(next); localStorage.setItem(STORAGE_KEYS.exams, JSON.stringify(next)); };
  const persistAttempts = (next: SavedAttempt[]) => { setAttempts(next); localStorage.setItem(STORAGE_KEYS.attempts, JSON.stringify(next)); };
  const persistWrongQuestions = (next: WrongQuestion[]) => { setWrongQuestions(next); localStorage.setItem(STORAGE_KEYS.wrongQuestions, JSON.stringify(next)); };

  const requestStart = (nextExam: Exam, existingId?: string) => {
    setPendingStart({ exam: nextExam, existingId });
    setSelectedDuration(nextExam.durationMinutes);
    if (nextExam.questions.some((question) => question.type === "essay") && !config.configured) {
      setConfigStatus("Bạn cần lưu API key trước khi bắt đầu làm bài.");
      setShowConfig(true);
    }
  };

  const beginExam = (nextExam: Exam, durationMinutes: number, existingId?: string, saveExam = true) => {
    if (nextExam.questions.some((question) => question.type === "essay") && !config.configured) {
      requestStart(nextExam, existingId);
      return;
    }
    const examId = existingId || crypto.randomUUID();
    const examForAttempt = { ...nextExam, durationMinutes };
    if (!existingId && saveExam) persistExams([{ id: examId, exam: examForAttempt, addedAt: Date.now(), attemptCount: 0 }, ...savedExams]);
    const startedAt = Date.now();
    const nextActive: ActiveAttempt = { id: crypto.randomUUID(), examId, startedAt, deadline: startedAt + durationMinutes * 60_000, answers: {}, flaggedQuestionIds: [], examSnapshot: examForAttempt };
    localStorage.setItem(STORAGE_KEYS.active, JSON.stringify(nextActive));
    setExam(examForAttempt); setActive(nextActive); setCurrentIndex(0); setSecondsLeft(durationMinutes * 60); setSubmitError(""); setPendingStart(null); setView("quiz");
  };

  const importAndStart = () => {
    const parsed = parseExam(json);
    if (!parsed.exam) { setImportError(parsed.error || "Không thể đọc đề"); return; }
    setImportError(""); requestStart(parsed.exam);
  };

  const startWrongQuestionPractice = () => {
    if (!wrongQuestions.length) return;
    const count = Math.max(1, Math.min(selectedPracticeCount, wrongQuestions.length));
    const selected = [...wrongQuestions]
      .map((item) => ({ item, order: Math.random() }))
      .sort((a, b) => a.order - b.order)
      .slice(0, count)
      .map(({ item }) => item.question);
    const practiceExam: Exam = {
      version: "1.0",
      title: "Luyện lại câu đã sai",
      description: `${count} câu được chọn ngẫu nhiên từ bộ câu sai của bạn.`,
      durationMinutes: Math.min(120, Math.max(5, count * 2)),
      questions: selected,
    };
    setShowPracticeSetup(false);
    setPendingStart({ exam: practiceExam, saveExam: false });
    setSelectedDuration(practiceExam.durationMinutes);
  };

  const updateAnswer = (questionId: string, answer: UserAnswer) => {
    if (!active) return;
    const next = { ...active, answers: { ...active.answers, [questionId]: answer } };
    setActive(next); localStorage.setItem(STORAGE_KEYS.active, JSON.stringify(next));
  };

  const toggleFlag = (questionId: string) => {
    if (!active) return;
    const flagged = active.flaggedQuestionIds || [];
    const nextFlags = flagged.includes(questionId) ? flagged.filter((id) => id !== questionId) : [...flagged, questionId];
    const next = { ...active, flaggedQuestionIds: nextFlags };
    setActive(next);
    localStorage.setItem(STORAGE_KEYS.active, JSON.stringify(next));
  };

  const pauseAttempt = (exitToHome = false) => {
    if (!active) return;
    const remainingSeconds = active.isPaused
      ? active.remainingSeconds ?? secondsLeft
      : Math.max(0, Math.ceil((active.deadline - Date.now()) / 1000));
    const next: ActiveAttempt = { ...active, isPaused: true, pausedAt: Date.now(), remainingSeconds };
    setSecondsLeft(remainingSeconds);
    setActive(next);
    localStorage.setItem(STORAGE_KEYS.active, JSON.stringify(next));
    if (exitToHome) setView("home");
  };

  const resumeAttempt = () => {
    if (!active) return;
    const remainingSeconds = Math.max(0, active.remainingSeconds ?? secondsLeft);
    const next: ActiveAttempt = { ...active, deadline: Date.now() + remainingSeconds * 1000, isPaused: false, pausedAt: undefined, remainingSeconds: undefined };
    setActive(next);
    setSecondsLeft(remainingSeconds);
    localStorage.setItem(STORAGE_KEYS.active, JSON.stringify(next));
    setView("quiz");
  };

  const submitExam = useCallback(async (auto = false) => {
    if (!exam || !active || submitting) return;
    const essayQuestions = exam.questions.filter((question) => question.type === "essay");
    if (essayQuestions.length > 0 && !config.configured) {
      setSubmitError("Đề có câu tự luận. Hãy cấu hình AI để chấm trước khi nộp bài.");
      if (!auto) setShowConfig(true);
      return;
    }
    setSubmitting(true); setSubmitError("");
    try {
      const grades: Record<string, GradeResult> = {};
      exam.questions.forEach((question) => {
        if (question.type !== "multiple_choice") return;
        const grade = gradeMultipleChoice(question.correctAnswer, active.answers[question.id], question.points);
        grades[question.id] = { questionId: question.id, ...grade, matchedIdeas: [], missingIdeas: [], feedback: grade.isCorrect ? "Chính xác." : question.explanation || "Đáp án chưa chính xác.", confidence: 1 };
      });
      if (essayQuestions.length > 0) {
        const response = await fetch("/api/grade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: essayQuestions.map((question) => ({ questionId: question.id, question: question.question, groundTruth: question.groundTruth, requiredIdeas: question.requiredIdeas, userAnswer: typeof active.answers[question.id] === "string" ? active.answers[question.id] : "", maxPoints: question.points })) }) });
        const data = (await response.json()) as { grades?: GradeResult[]; error?: string };
        if (!response.ok || !data.grades) throw new Error(data.error || "Không thể chấm câu tự luận");
        data.grades.forEach((grade) => (grades[grade.questionId] = grade));
      }
      const maxScore = totalPoints(exam);
      const score = Object.values(grades).reduce((sum, grade) => sum + grade.score, 0);
      const percentage = maxScore ? Math.round((score / maxScore) * 100) : 0;
      const completed: SavedAttempt = { id: active.id, examId: active.examId, examTitle: exam.title, startedAt: active.startedAt, submittedAt: Date.now(), answers: active.answers, grades, score, maxScore, percentage };
      const now = Date.now();
      const nextWrongQuestions = [...wrongQuestions];
      exam.questions.forEach((question) => {
        const grade = grades[question.id];
        if (!grade || grade.isCorrect) return;
        const existingIndex = nextWrongQuestions.findIndex((item) =>
          item.question.id === question.id || (item.sourceExamId === active.examId && item.sourceQuestionId === question.id)
        );
        if (existingIndex >= 0) {
          const existing = nextWrongQuestions[existingIndex];
          nextWrongQuestions[existingIndex] = { ...existing, mistakeCount: existing.mistakeCount + 1, lastWrongAt: now };
        } else {
          const id = crypto.randomUUID();
          nextWrongQuestions.unshift({
            id,
            sourceExamId: active.examId,
            sourceExamTitle: exam.title,
            sourceQuestionId: question.id,
            question: { ...question, id },
            mistakeCount: 1,
            firstWrongAt: now,
            lastWrongAt: now,
          });
        }
      });
      persistWrongQuestions(nextWrongQuestions);
      persistAttempts([completed, ...attempts].slice(0, 100));
      persistExams(savedExams.map((item) => item.id === active.examId ? { ...item, lastStudiedAt: Date.now(), attemptCount: item.attemptCount + 1, bestPercentage: Math.max(item.bestPercentage || 0, percentage) } : item));
      localStorage.removeItem(STORAGE_KEYS.active); setActive(null); setResult(completed); setView("result");
    } catch (error) { setSubmitError(error instanceof Error ? error.message : "Không thể nộp bài. Hãy thử lại."); }
    finally { setSubmitting(false); }
  }, [active, attempts, config.configured, exam, savedExams, submitting, wrongQuestions]);

  useEffect(() => {
    if (view !== "quiz" || !active || active.isPaused) return;
    const tick = () => { const next = Math.max(0, Math.ceil((active.deadline - Date.now()) / 1000)); setSecondsLeft(next); if (next === 0) void submitExam(true); };
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [active, submitExam, view]);

  const saveConfig = async () => {
    if (!model.trim() || !apiKey.trim()) { setConfigStatus("Hãy nhập model name và API key."); return; }
    setConfigStatus("Đang lưu…");
    try {
      const response = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, model: model.trim(), apiKey: apiKey.trim() }) });
      const data = (await response.json()) as ConfigState & { error?: string };
      if (!response.ok) throw new Error(data.error || "Không thể lưu cấu hình");
      setConfig(data); setApiKey(""); setConfigStatus("Đã lưu an toàn trong cookie của trình duyệt.");
      if (pendingStart) setShowConfig(false);
    } catch (error) { setConfigStatus(error instanceof Error ? error.message : "Không thể lưu cấu hình"); }
  };

  const testConfig = async () => {
    setConfigStatus("Đang kiểm tra kết nối…");
    try {
      const response = await fetch("/api/provider-test", { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "Kết nối thất bại");
      setConfigStatus("Kết nối thành công.");
    } catch (error) { setConfigStatus(error instanceof Error ? error.message : "Kết nối thất bại"); }
  };

  const removeConfig = async () => { await fetch("/api/config", { method: "DELETE" }); setConfig({ configured: false }); setModel(""); setApiKey(""); setConfigStatus("Đã xóa API key."); };
  const goHome = () => { if (view === "quiz" && active) { pauseAttempt(true); return; } setView("home"); setResult(null); setImportError(""); };
  const openSettings = () => { if (view === "quiz" && active && !active.isPaused) pauseAttempt(false); setShowConfig(true); setConfigStatus(""); };
  const deleteExam = (id: string) => { persistExams(savedExams.filter((item) => item.id !== id)); persistAttempts(attempts.filter((item) => item.examId !== id)); };

  const answeredCount = active && exam ? exam.questions.filter((question) => { const answer = active.answers[question.id]; return Array.isArray(answer) ? answer.length > 0 : Boolean(answer?.trim()); }).length : 0;
  const currentQuestion = exam?.questions[currentIndex];
  const recentForResult = useMemo(() => result && exam ? exam.questions.map((question) => ({ question, grade: result.grades[question.id] })) : [], [exam, result]);

  return (
    <main className="shell">
      <nav className="nav">
        <button className="brand" onClick={goHome}>ÔN TẬP<span>AI</span></button>
        <div className="navActions">
          {config.configured && <span className="providerPill"><i />{config.provider} · {config.model}</span>}
          <button className="textButton" onClick={goHome}>Ngân hàng đề</button>
          <button className="iconButton" onClick={openSettings} aria-label="Cấu hình AI">⚙</button>
        </div>
      </nav>

      {view === "home" && <>
        {active && exam && <section className="resumeBanner">
          <div><span>BÀI ĐANG TẠM DỪNG</span><h2>{exam.title}</h2><p>{answeredCount}/{exam.questions.length} câu đã trả lời · còn {formatTime(secondsLeft)}</p></div>
          <button className="practiceButton" onClick={resumeAttempt}>Tiếp tục bài <span>→</span></button>
        </section>}
        <section className="hero"><div className="eyebrow"><i /> HỌC THEO CÁCH CỦA BẠN</div><h1>Biến ghi chú thành<br/><em>một bài ôn tập.</em></h1><p>Dán đề dạng JSON, làm bài ngay và để AI hỗ trợ chấm phần tự luận theo đúng ý nghĩa.</p></section>
        <section className="importCard">
          <div className="cardTop"><div><span className="step">01</span><h2>Nhập nội dung đề</h2></div><button className="sampleButton" onClick={() => { setJson(SAMPLE); setImportError(""); }}>Dùng JSON mẫu</button></div>
          <textarea className="jsonInput" value={json} onChange={(event) => { setJson(event.target.value); setImportError(""); }} placeholder={'{\n  "title": "Tên bài ôn tập",\n  "durationMinutes": 30,\n  "questions": [...]\n}'} spellCheck={false} />
          {importError && <div className="errorBanner">{importError}</div>}
          <div className="cardFooter">
            <label className="uploadButton">↑ Tải file JSON<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; file.text().then((content) => { setJson(content); setImportError(""); }); event.target.value = ""; }} /></label>
            <button className="primaryButton" onClick={importAndStart} disabled={!json.trim()}>Kiểm tra &amp; bắt đầu <span>→</span></button>
          </div>
        </section>
        {wrongQuestions.length > 0 && <section className="practiceSection">
          <div className="practiceCard">
            <div className="practiceIcon">↻</div>
            <div className="practiceCopy"><span>BỘ ĐỀ TỰ ĐỘNG</span><h2>Luyện lại những câu bạn từng sai</h2><p><b>{wrongQuestions.length} câu</b> đang chờ bạn chinh phục. Mỗi lượt luyện sẽ lấy ngẫu nhiên theo số lượng bạn chọn.</p></div>
            <button className="practiceButton" onClick={() => { setSelectedPracticeCount(Math.min(10, wrongQuestions.length)); setShowPracticeSetup(true); }}>Luyện thi <span>→</span></button>
          </div>
        </section>}
        {savedExams.length > 0 && <section className="bankSection">
          <div className="sectionHeading"><div><span className="sectionNumber">03</span><h2>Ngân hàng đề của bạn</h2></div><small>{savedExams.length} đề đã lưu trên thiết bị</small></div>
          <div className="bankGrid">{savedExams.map((saved) => <article className="examCard" key={saved.id}>
            <div className="examMeta"><span>{saved.exam.questions.length} câu</span><span>{saved.exam.durationMinutes} phút</span></div><h3>{saved.exam.title}</h3><p>{saved.exam.description || "Sẵn sàng để ôn lại."}</p>
            <div className="examStats"><span>Đã làm <b>{saved.attemptCount}</b> lần</span><span>Điểm cao <b>{saved.bestPercentage ?? "—"}{saved.bestPercentage !== undefined ? "%" : ""}</b></span></div>
            <div className="examActions"><button onClick={() => requestStart(saved.exam, saved.id)}>Ôn lại →</button><button className="dangerButton" onClick={() => deleteExam(saved.id)} aria-label={`Xóa ${saved.exam.title}`}>Xóa</button></div>
          </article>)}</div>
        </section>}
        {attempts.length > 0 && <section className="historySection"><div className="sectionHeading"><div><span className="sectionNumber">04</span><h2>Lịch sử gần đây</h2></div></div><div className="historyList">{attempts.slice(0, 5).map((attempt) => <div key={attempt.id}><div><strong>{attempt.examTitle}</strong><small>{new Date(attempt.submittedAt).toLocaleString("vi-VN")}</small></div><b>{attempt.percentage}%</b></div>)}</div></section>}
        <footer><span>Dữ liệu chỉ được lưu trên thiết bị này</span><span>Tối đa 120 phút · Nộp bài bất cứ lúc nào</span></footer>
      </>}

      {view === "quiz" && exam && active && currentQuestion && <section className="quizLayout">
        <aside className="quizSidebar">
          <div className="quizTitle"><span>BÀI ÔN TẬP</span><h2>{exam.title}</h2><p>{exam.description}</p></div>
          <div className={`timer ${secondsLeft < 300 ? "urgent" : ""}`}><small>THỜI GIAN CÒN LẠI</small><strong>{formatTime(secondsLeft)}</strong></div>
          <div className="progressText"><span>Tiến độ</span><b>{answeredCount}/{exam.questions.length}</b></div><div className="progressBar"><i style={{ width: `${(answeredCount / exam.questions.length) * 100}%` }} /></div>
          <div className="flagSummary">⚑ {active.flaggedQuestionIds?.length || 0} câu đã gắn cờ</div>
          <div className="questionMap">{exam.questions.map((question, index) => { const answer = active.answers[question.id]; const done = Array.isArray(answer) ? answer.length > 0 : Boolean(answer?.trim()); const flagged = active.flaggedQuestionIds?.includes(question.id); return <button key={question.id} onClick={() => setCurrentIndex(index)} aria-label={`Câu ${index + 1}${flagged ? ", đã gắn cờ" : ""}`} className={`${index === currentIndex ? "current" : ""} ${done ? "done" : ""} ${flagged ? "flagged" : ""}`}>{index + 1}{flagged && <i>⚑</i>}</button>; })}</div>
          <div className="quizTools"><button onClick={() => pauseAttempt(false)}>Ⅱ Tạm dừng</button><button onClick={openSettings}>⚙ Cài đặt</button><button className="exitButton" onClick={() => pauseAttempt(true)}>Thoát</button></div>
          <button className="submitButton" onClick={() => void submitExam(false)} disabled={submitting}>{submitting ? "AI đang chấm…" : "Nộp bài"}</button>{submitError && <p className="sideError">{submitError}</p>}
        </aside>
        <div className="questionStage">
          <div className="questionHeader"><span>CÂU {currentIndex + 1} / {exam.questions.length}</span><div><span>{currentQuestion.type === "essay" ? "TỰ LUẬN" : "TRẮC NGHIỆM"} · {currentQuestion.points} ĐIỂM</span><button className={`flagButton ${active.flaggedQuestionIds?.includes(currentQuestion.id) ? "active" : ""}`} onClick={() => toggleFlag(currentQuestion.id)}>{active.flaggedQuestionIds?.includes(currentQuestion.id) ? "⚑ Hủy cờ" : "⚐ Gắn cờ"}</button></div></div><h2>{currentQuestion.question}</h2>
          {currentQuestion.type === "multiple_choice" ? <div className="optionsList">{currentQuestion.options.map((option) => {
            const answer = Array.isArray(active.answers[currentQuestion.id]) ? active.answers[currentQuestion.id] as string[] : [];
            const checked = answer.includes(option.id); const multiple = currentQuestion.correctAnswer.length > 1;
            return <label className={`option ${checked ? "selected" : ""}`} key={option.id}><input type={multiple ? "checkbox" : "radio"} name={currentQuestion.id} checked={checked} onChange={() => { const next = multiple ? (checked ? answer.filter((id) => id !== option.id) : [...answer, option.id]) : [option.id]; updateAnswer(currentQuestion.id, next); }} /><span className="optionKey">{option.id.toUpperCase()}</span><span>{option.text}</span></label>;
          })}{currentQuestion.correctAnswer.length > 1 && <small className="hint">Bạn có thể chọn nhiều đáp án.</small>}</div> : <div className="essayBox"><textarea value={typeof active.answers[currentQuestion.id] === "string" ? active.answers[currentQuestion.id] as string : ""} onChange={(event) => updateAnswer(currentQuestion.id, event.target.value)} placeholder="Viết câu trả lời theo cách hiểu của bạn…" /><small>AI sẽ đối chiếu ý nghĩa với đáp án chuẩn, không yêu cầu giống từng chữ.</small></div>}
          <div className="quizNav"><button onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>← Câu trước</button><button className="nextButton" onClick={() => currentIndex === exam.questions.length - 1 ? void submitExam(false) : setCurrentIndex(currentIndex + 1)}>{currentIndex === exam.questions.length - 1 ? "Nộp bài" : "Câu tiếp →"}</button></div>
        </div>
      </section>}

      {view === "quiz" && active?.isPaused && !showConfig && <div className="modalBackdrop pauseBackdrop" role="presentation"><section className="modal pauseModal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <div className="pauseIcon">Ⅱ</div><span className="modalEyebrow">BÀI LÀM ĐÃ ĐƯỢC LƯU</span><h2 id="pause-title">Bạn đang tạm dừng</h2><p>Đồng hồ đã dừng ở {formatTime(secondsLeft)}. Toàn bộ câu trả lời hiện tại được lưu trên thiết bị.</p>
        <button className="primaryButton fullButton" onClick={resumeAttempt}>Tiếp tục làm bài <span>→</span></button>
        <button className="secondaryButton fullButton pauseExit" onClick={() => setView("home")}>Thoát về trang chủ</button>
      </section></div>}

      {view === "result" && result && exam && <section className="resultPage">
        <div className="resultHero"><div><span>KẾT QUẢ BÀI ÔN</span><h1>{result.percentage}<small>%</small></h1></div><div className="resultCopy"><h2>{result.percentage >= 80 ? "Rất tốt — bạn đã nắm chắc phần lớn nội dung." : result.percentage >= 50 ? "Khá ổn — ôn thêm những ý còn thiếu nhé." : "Cứ tiếp tục — mỗi lần làm là một lần nhớ lâu hơn."}</h2><p>{result.score.toFixed(1)} / {result.maxScore} điểm · {exam.title}</p><button className="primaryButton" onClick={() => requestStart(exam, result.examId)}>Làm lại <span>→</span></button></div></div>
        <div className="reviewList">{recentForResult.map(({ question, grade }, index) => <article className="reviewCard" key={question.id}>
          <div className="reviewTop"><span className={grade?.isCorrect ? "correct" : "wrong"}>{grade?.isCorrect ? "ĐÚNG" : "CẦN ÔN LẠI"}</span><b>{grade?.score.toFixed(1) || 0}/{question.points} điểm</b></div><h3><small>Câu {index + 1}</small>{question.question}</h3>
          <div className="answerBlock"><small>CÂU TRẢ LỜI CỦA BẠN</small><p>{Array.isArray(result.answers[question.id]) ? (question.type === "multiple_choice" ? question.options.filter((option) => (result.answers[question.id] as string[]).includes(option.id)).map((option) => option.text).join(", ") : "") : result.answers[question.id] || "Chưa trả lời"}</p></div>
          {question.type === "essay" && <div className="answerBlock truth"><small>ĐÁP ÁN THAM KHẢO</small><p>{question.groundTruth}</p></div>}<p className="feedback">{grade?.feedback}</p>{grade?.missingIdeas?.length > 0 && <div className="missingIdeas"><small>Ý còn thiếu</small>{grade.missingIdeas.map((idea) => <span key={idea}>{idea}</span>)}</div>}
        </article>)}</div><div className="resultActions"><button className="secondaryButton" onClick={goHome}>← Về ngân hàng đề</button></div>
      </section>}

      {showConfig && <div className="modalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowConfig(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="config-title">
        <button className="modalClose" onClick={() => setShowConfig(false)} aria-label="Đóng">×</button><span className="modalEyebrow">CẤU HÌNH RIÊNG TƯ</span><h2 id="config-title">Kết nối AI của bạn</h2><p>API key được mã hóa trong cookie HttpOnly và không xuất hiện trong ngân hàng đề.</p>
        <label>Provider<select value={provider} onChange={(event) => { setProvider(event.target.value as Provider); setModel(""); }}><option value="gemini">Gemini</option><option value="openrouter">OpenRouter</option><option value="ollama">Ollama Cloud</option></select></label>
        <label>Model name<input value={model} onChange={(event) => setModel(event.target.value)} placeholder={provider === "gemini" ? "gemini-2.5-flash" : provider === "openrouter" ? "google/gemini-2.5-flash" : "gpt-oss:120b"} /></label>
        <label>API key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" placeholder={config.configured ? "Nhập key mới để thay đổi" : "Dán API key tại đây"} autoComplete="off" /></label>
        {configStatus && <div className="configStatus">{configStatus}</div>}<div className="modalActions"><button className="primaryButton" onClick={() => void saveConfig()}>Lưu cấu hình</button>{config.configured && <button className="secondaryButton" onClick={() => void testConfig()}>Kiểm tra kết nối</button>}</div>{config.configured && <button className="deleteKey" onClick={() => void removeConfig()}>Xóa API key đã lưu</button>}
      </section></div>}

      {showPracticeSetup && <div className="modalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPracticeSetup(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="practice-title">
        <button className="modalClose" onClick={() => setShowPracticeSetup(false)} aria-label="Đóng">×</button><span className="modalEyebrow">LUYỆN TẬP CÁ NHÂN HÓA</span><h2 id="practice-title">Bạn muốn luyện bao nhiêu câu?</h2><p>Hệ thống sẽ chọn ngẫu nhiên trong {wrongQuestions.length} câu bạn từng làm sai.</p>
        <label>Số lượng câu hỏi<input type="number" min="1" max={wrongQuestions.length} value={selectedPracticeCount} onChange={(event) => setSelectedPracticeCount(Math.max(1, Math.min(wrongQuestions.length, Number(event.target.value) || 1)))} /></label>
        <div className="practicePresets">{[5, 10, 20].filter((count) => count <= wrongQuestions.length).map((count) => <button key={count} className={selectedPracticeCount === count ? "active" : ""} onClick={() => setSelectedPracticeCount(count)}>{count} câu</button>)}<button className={selectedPracticeCount === wrongQuestions.length ? "active" : ""} onClick={() => setSelectedPracticeCount(wrongQuestions.length)}>Tất cả</button></div>
        <button className="primaryButton fullButton" onClick={startWrongQuestionPractice}>Tạo đề ngẫu nhiên <span>→</span></button>
      </section></div>}

      {pendingStart && !showConfig && <div className="modalBackdrop" role="presentation"><section className="modal startModal" role="dialog" aria-modal="true" aria-labelledby="start-title">
        <button className="modalClose" onClick={() => setPendingStart(null)} aria-label="Đóng">×</button><span className="modalEyebrow">SẴN SÀNG BẮT ĐẦU</span><h2 id="start-title">{pendingStart.exam.title}</h2><p>Chọn thời gian cho lượt ôn này. Khi bắt đầu, đồng hồ sẽ tiếp tục chạy kể cả khi bạn tải lại trang.</p>
        <label>Thời gian làm bài (phút)<input type="number" min="1" max="120" value={selectedDuration} onChange={(event) => setSelectedDuration(Math.max(1, Math.min(120, Number(event.target.value) || 1)))} /></label>
        <div className="startFacts"><span>{pendingStart.exam.questions.length} câu hỏi</span><span>{totalPoints(pendingStart.exam)} điểm</span><span>Tối đa 120 phút</span></div>
        <button className="primaryButton fullButton" onClick={() => beginExam(pendingStart.exam, selectedDuration, pendingStart.existingId, pendingStart.saveExam ?? true)}>Bắt đầu làm bài <span>→</span></button>
      </section></div>}
    </main>
  );
}
