import Link from "next/link";
import { Button } from "@/components/ui/button";

// 404 — 존재하지 않는 경로 안내
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-background">
      <div className="text-6xl font-black text-primary">404</div>
      <div>
        <h2 className="text-xl font-bold text-foreground">페이지를 찾을 수 없어요</h2>
        <p className="mt-1 text-sm text-muted-foreground">주소가 바뀌었거나 삭제된 페이지일 수 있어요.</p>
      </div>
      <Link href="/">
        <Button>처음으로</Button>
      </Link>
    </div>
  );
}
