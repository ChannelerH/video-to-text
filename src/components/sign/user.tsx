"use client";

import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useRouter } from "@/i18n/navigation";
import { User } from "@/types/user";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { NavItem } from "@/types/blocks/base";

export default function SignUser({ user }: { user: User }) {
  const t = useTranslations();
  const router = useRouter();
  React.useEffect(() => {
    // Prefetch dashboard route to make navigation feel instant
    try {
      router.prefetch?.("/dashboard");
    } catch {}
  }, [router]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="cursor-pointer">
          <AvatarImage src={user.avatar_url} alt={user.nickname} />
          <AvatarFallback>{user.nickname}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="mx-4 bg-background">
        {/* User name - non-clickable header */}
        <div className="px-2 py-1.5 text-sm font-semibold text-center">
          {user.nickname}
        </div>
        <DropdownMenuSeparator />
        
        {/* Dashboard link */}
        <DropdownMenuItem
          className="flex justify-center cursor-pointer"
          onSelect={() => router.push("/dashboard")}
        >
          Dashboard
        </DropdownMenuItem>
        
        {/* Admin system if admin */}
        {user.is_admin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex justify-center cursor-pointer"
              onSelect={() => router.push("/admin/users")}
            >
              {t("user.admin_system")}
            </DropdownMenuItem>
          </>
        )}
        
        <DropdownMenuSeparator />
        
        {/* Sign out */}
        <DropdownMenuItem
          className="flex justify-center cursor-pointer"
          onSelect={() => signOut()}
        >
          {t("user.sign_out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
