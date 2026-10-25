import { CreatorHome } from "@/components/challenge/creator/creator-home";
import { demoView } from "./demo-view";

export const dynamic = "force-dynamic";

/** 운영 홈 미리보기 (시안 4). `layout.tsx`가 운영 빌드에서 404로 막는다. */
export default function CreatorDemoHome() {
  const { challenge, snapshot, recent } = demoView();
  return <CreatorHome challenge={challenge} snapshot={snapshot} recent={recent} viewerId="demo-host" />;
}
