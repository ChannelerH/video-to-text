'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  FileText,
  LogOut,
  User,
  Users,
  ShoppingBag,
  MessageSquare,
  FolderOpen,
  Home,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface AdminSidebarProps {
  locale: string;
}

export default function AdminSidebar({ locale }: AdminSidebarProps) {
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = useState<string[]>(['cms']);

  const navigation = [
    {
      name: 'Dashboard',
      href: `/${locale}/admin`,
      icon: Home,
    },
    {
      name: 'Users',
      href: `/${locale}/admin/users`,
      icon: Users,
    },
    {
      name: 'Orders',
      href: `/${locale}/admin/orders`,
      icon: ShoppingBag,
    },
    {
      name: 'CMS',
      icon: FolderOpen,
      key: 'cms',
      children: [
        {
          name: 'Posts',
          href: `/${locale}/admin/posts`,
          icon: FileText,
        },
        {
          name: 'Categories',
          href: `/${locale}/admin/categories`,
          icon: FolderOpen,
        }
      ]
    },
    {
      name: 'Feedbacks',
      href: `/${locale}/admin/feedbacks`,
      icon: MessageSquare,
    }
  ];

  const isActive = (href: string) => {
    const normalizedPath = pathname.startsWith(`/${locale}`) 
      ? pathname 
      : `/${locale}${pathname}`;
    
    return normalizedPath === href || normalizedPath.startsWith(href + '/');
  };

  const toggleExpand = (key: string) => {
    setExpandedItems(prev => 
      prev.includes(key) 
        ? prev.filter(item => item !== key)
        : [...prev, key]
    );
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: `/${locale}` });
  };

  return (
    <aside className="w-60 h-screen bg-[#0e0e15] border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-800">
        <Link href={`/${locale}/admin`} className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="text-white font-semibold text-lg">Admin Panel</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => (
          <div key={item.name}>
            {item.children ? (
              <>
                <button
                  onClick={() => toggleExpand(item.key!)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-gray-400 hover:bg-gray-800/50 hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  {expandedItems.includes(item.key!) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                {expandedItems.includes(item.key!) && (
                  <div className="ml-4 mt-1 space-y-1">
                    {item.children.map((child) => (
                      <Link
                        key={child.name}
                        href={child.href}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                          isActive(child.href)
                            ? 'bg-blue-600/20 text-blue-500'
                            : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
                        }`}
                      >
                        <child.icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{child.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Link
                href={item.href!}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive(item.href!)
                    ? 'bg-blue-600/20 text-blue-500'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-800 p-4 space-y-2">
        <Link
          href={`/${locale}/dashboard`}
          className="flex items-center gap-3 px-3 py-2 text-gray-400 hover:bg-gray-800/50 hover:text-white rounded-lg transition-colors"
        >
          <Home className="w-4 h-4" />
          <span className="text-sm font-medium">Back to Dashboard</span>
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:bg-gray-800/50 hover:text-white rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}