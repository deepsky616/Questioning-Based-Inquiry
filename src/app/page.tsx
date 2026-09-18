import { redirect } from "next/navigation";

// Proxy normally resolves the JWT and redirects before this page renders.
// Keep a dependency-free fallback for environments that do not run Proxy.
export default function Home() {
  redirect("/login");
}
