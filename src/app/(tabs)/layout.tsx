import { TabBar } from "@/components/tab-bar";
import { OnboardingGate } from "@/components/onboarding-gate";
import { CheerBanner } from "@/components/cheer-banner";
import { LaunchMotivationSplash } from "@/components/launch-motivation-splash";

export default function TabsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <LaunchMotivationSplash />
      <OnboardingGate />
      <CheerBanner />
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-6">{children}</main>
      <TabBar />
    </>
  );
}
