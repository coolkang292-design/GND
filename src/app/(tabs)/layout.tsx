import { TabBar } from "@/components/tab-bar";

export default function TabsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-6">{children}</main>
      <TabBar />
    </>
  );
}
