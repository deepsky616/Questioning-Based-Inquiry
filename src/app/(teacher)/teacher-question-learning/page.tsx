import { QuestionLearningExperience } from "@/components/shared/QuestionLearningExperience";
import { loadTeacherQuestionExamples } from "@/lib/load-teacher-question-examples";

export default async function TeacherQuestionLearningPage() {
  const teachingExamples = await loadTeacherQuestionExamples();
  return <QuestionLearningExperience audience="teacher" teachingExamples={teachingExamples} />;
}
