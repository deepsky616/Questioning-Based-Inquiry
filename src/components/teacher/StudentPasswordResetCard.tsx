"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validatePasswordPolicy } from "@/lib/password-policy";

interface StudentRow {
  id: string;
  name: string;
  grade: string;
  className: string;
  studentNumber: string;
}

export function StudentPasswordResetCard() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classKey, setClassKey] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/teacher/students")
      .then((r) => r.json())
      .then((d) => setStudents(Array.isArray(d.students) ? d.students : []))
      .catch(() => {});
  }, []);

  // 학급 옵션(학생 데이터에서 추출, 학년·반 순)
  const classOptions = useMemo(() => {
    const map = new Map<string, { grade: string; className: string }>();
    for (const s of students) {
      const key = `${s.grade}|${s.className}`;
      if (!map.has(key)) map.set(key, { grade: s.grade, className: s.className });
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (a.grade + a.className < b.grade + b.className ? -1 : 1));
  }, [students]);

  useEffect(() => {
    if (classOptions.length > 0 && !classOptions.some((c) => c.key === classKey)) {
      setClassKey(classOptions[0].key);
    }
  }, [classOptions, classKey]);

  const classStudents = useMemo(
    () =>
      students
        .filter((s) => `${s.grade}|${s.className}` === classKey)
        .sort((a, b) => (parseInt(a.studentNumber || "0", 10) - parseInt(b.studentNumber || "0", 10))),
    [students, classKey],
  );

  // 학급이 바뀌면 선택 초기화
  useEffect(() => { setChecked(new Set()); }, [classKey]);

  const allChecked = classStudents.length > 0 && classStudents.every((s) => checked.has(s.id));
  const toggleAll = () =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) classStudents.forEach((s) => next.delete(s.id));
      else classStudents.forEach((s) => next.add(s.id));
      return next;
    });
  const toggleOne = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  async function handleReset() {
    setMsg(null);
    const ids = Array.from(checked);
    if (ids.length === 0) {
      setMsg({ type: "error", text: "비밀번호를 재설정할 학생을 선택하세요" });
      return;
    }
    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      setMsg({ type: "error", text: policyError });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/teacher/students/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentIds: ids, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "재설정에 실패했습니다");
      setMsg({ type: "success", text: `${data.count}명의 비밀번호를 재설정했어요. 학생들에게 새 비밀번호를 알려주세요.` });
      setChecked(new Set());
      setNewPassword("");
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "재설정에 실패했습니다" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>학생 비밀번호 재설정</CardTitle>
        <CardDescription>비밀번호를 잊은 담당 학생을 골라(여러 명 가능) 새 비밀번호로 재설정해요</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {students.length === 0 ? (
          <p className="text-sm text-muted-foreground">담당 학생이 없습니다.</p>
        ) : (
          <>
            {classOptions.length > 1 && (
              <div className="space-y-2">
                <Label>학급 선택</Label>
                <Select value={classKey} onValueChange={setClassKey}>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="학급 선택" /></SelectTrigger>
                  <SelectContent>
                    {classOptions.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.grade}학년 {c.className}반</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                  전체 선택
                </label>
                <span className="text-xs text-muted-foreground">{checked.size}명 선택</span>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y">
                {classStudents.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/40 cursor-pointer">
                    <input type="checkbox" checked={checked.has(s.id)} onChange={() => toggleOne(s.id)} />
                    <span className="w-10 text-muted-foreground">{s.studentNumber || "-"}번</span>
                    <span className="font-medium text-foreground">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resetPw">새 비밀번호</Label>
              <Input id="resetPw" type="text" value={newPassword} placeholder="예: Hanbit2026!"
                onChange={(e) => setNewPassword(e.target.value)} />
              <div className="rounded-md border bg-muted/40 p-2.5 text-xs leading-5 text-muted-foreground space-y-0.5">
                <p>숫자 + 영문 대/소문자 + 특수문자, 3가지를 조합하여 8~16자 (사용 가능 특수문자: <span className="font-mono">! @ # $ % ^ &amp; * ( ) _ +</span>)</p>
                <p className="text-amber-600">💡 선택한 학생 전원이 같은 비밀번호로 바뀌니, 학생들이 로그인 후 [설정]에서 각자 변경하도록 안내해 주세요.</p>
              </div>
            </div>

            {msg && (
              <p className={`text-sm ${msg.type === "success" ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>
            )}
            <Button onClick={handleReset} disabled={saving} className="font-semibold">
              {saving ? "재설정 중..." : `${checked.size}명 비밀번호 재설정`}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
