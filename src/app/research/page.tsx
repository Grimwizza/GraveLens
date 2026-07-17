import { Suspense } from "react";
import ResearchPage from "@/components/research/ResearchPage";

export default function Page() {
  return (
    <Suspense>
      <ResearchPage />
    </Suspense>
  );
}
