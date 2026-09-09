import curriculum from "@/data/curriculum-achievements.json";
import { QUESTION_TEACHING_EXAMPLE_TOPICS } from "@/data/question-teaching-example-topics";
import type { TeachingExamplesData } from "./question-teaching-examples-types";

export function primaryTeachingGrades(grades: readonly string[]): string[] {
  return [...new Set(grades.flatMap(grade => {
    const match = grade.trim().match(/^([1-6])(?:학년)?$/);
    return match ? [match[1]] : [];
  }))].sort();
}

export function questionTeachingExamplesForGrades(input: readonly string[]): TeachingExamplesData {
  const grades = primaryTeachingGrades(input);
  if (!grades.length) return { status: "unassigned", grades: [], topics: [] };
  const standardsByBand = curriculum as Record<string, Record<string, Record<string, { achievements: Array<{ code: string; content: string }> }>>>;
  const topics = QUESTION_TEACHING_EXAMPLE_TOPICS.filter(topic => grades.includes(topic.grade)).map(({ codes, ...topic }) => {
    const band = Number(topic.grade) <= 2 ? "1-2" : Number(topic.grade) <= 4 ? "3-4" : "5-6";
    const standards = Object.values(standardsByBand[band]).flatMap(subject => Object.values(subject).flatMap(area => area.achievements));
    return { ...topic, standards: codes.map(code => {
      const standard = standards.find(item => item.code === code);
      if (!standard) throw new Error(`수업 예시의 성취기준을 찾을 수 없습니다: ${code}`);
      return { code: standard.code, content: standard.content };
    }) };
  });
  return { status: "ready", grades, topics };
}
