import Empty from "@/components/blocks/empty";
import { CSSProperties, ReactNode } from "react";
import { getUserInfo } from "@/services/user";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const userInfo = await getUserInfo();
  if (!userInfo || !userInfo.email) {
    redirect("/auth/signin");
  }

  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim());
  if (!adminEmails?.includes(userInfo?.email)) {
    return <Empty message="No access" />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 60)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties
      }
    >
      <AdminSidebar locale={locale} />
      <SidebarInset>
        <div className="h-screen overflow-y-auto bg-[#0a0a0f]">
          <div className="p-8">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
