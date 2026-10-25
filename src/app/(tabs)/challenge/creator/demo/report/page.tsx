import { CreatorReport } from "@/components/challenge/creator/creator-report";
import { demoView } from "../demo-view";

export const dynamic = "force-dynamic";

/** 성과 리포트 미리보기 (시안 1 축소판). */
export default function CreatorDemoReport() {
  const { challenge, snapshot, daily } = demoView();
  return <CreatorReport challenge={challenge} snapshot={snapshot} daily={daily} />;
}
