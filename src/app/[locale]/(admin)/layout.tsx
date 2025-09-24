import Empty from "@/components/blocks/empty";
import { ReactNode } from "react";
import { getUserInfo } from "@/services/user";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/sidebar";

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
    <div className="flex h-screen bg-[#0a0a0f]">
      {/* Admin Sidebar */}
      <AdminSidebar locale={locale} />
      
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
