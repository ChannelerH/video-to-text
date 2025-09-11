import { ReactNode } from "react";
// Use plain anchor to ensure hard navigation to root works regardless of locale
import { Sidebar } from "@/types/blocks/sidebar";
import SidebarNav from "@/components/console/sidebar/nav";

export default async function ConsoleLayout({
  children,
  sidebar,
  locale,
}: {
  children: ReactNode;
  sidebar?: Sidebar;
  locale?: string;
}) {
  return (
    <div className="container md:max-w-7xl py-8 mx-auto">
      <div className="mb-4">
        <a href={locale ? `/${locale}` : `/`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <img src="/logo.png" alt="Home" className="w-6 h-6" />
          <span>Home</span>
        </a>
      </div>
      <div className="w-full space-y-6 p-4 pb-16 block">
        <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
          {sidebar?.nav?.items && (
            <aside className="md:min-w-40 flex-shrink-0">
              <SidebarNav items={sidebar.nav?.items} />
            </aside>
          )}
          <div className="flex-1 lg:max-w-full">{children}</div>
        </div>
      </div>
    </div>
  );
}
