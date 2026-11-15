import type { ReactNode } from "react";
import { TopNav } from "@/components/navigation/top-nav";
import { BarrePeriodeVivante } from "@/features/periode/BarrePeriodeVivante";
import { periodeCourante } from "@/server/periode";

export default async function DashboardLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  const periode = await periodeCourante();

  return (
    <div className="flex min-h-svh flex-col">
      <TopNav />
      <BarrePeriodeVivante periodeInitiale={periode} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
