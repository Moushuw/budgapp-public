import { OngletsPrincipaux } from "./OngletsPrincipaux";

export function TopNav() {
  return (
    <header className="border-border border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6">
        <span className="from-brand-from shrink-0 to-brand-to bg-gradient-to-r bg-clip-text text-lg font-semibold text-transparent">
          BudgApp
        </span>
        <OngletsPrincipaux />
      </div>
    </header>
  );
}
