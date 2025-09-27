import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { CreditCard, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getUserUuid } from '@/services/user';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}

export default async function OrdersPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  await getTranslations();
  const { page = '1', pageSize = '20' } = await searchParams;
  const currentPage = Math.max(1, parseInt(page || '1', 10) || 1);
  const size = Math.min(100, Math.max(5, parseInt(pageSize || '20', 10) || 20));

  const userUuid = await getUserUuid();
  if (!userUuid) return null;

  const { items, total } = await getOrders(userUuid, currentPage, size);
  const totalPages = Math.max(1, Math.ceil(total / size));

  const formatDateTime = (d?: string | Date | null) => {
    if (!d) return '-';
    const x = d instanceof Date ? d : new Date(d);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
  };

  return (
    <div className="min-h-full bg-[#0a0a0f]">
      <div className="max-w-5xl mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Order History</h1>
          <p className="text-gray-400">Your recent purchases and subscriptions</p>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900/60 to-gray-900/40 border border-gray-800 p-8">
          <div className="absolute top-0 right-0 w-64 h-64 -mr-32 -mt-32">
            <div className="w-full h-full bg-gradient-to-br from-blue-600/10 to-indigo-600/10 rounded-full blur-3xl" />
          </div>

          <div className="relative">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/20 flex items-center justify-center">
                  <CreditCard className="w-8 h-8 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">All Orders</h2>
                  <p className="text-sm text-gray-400">Showing {items.length} of {total}</p>
                </div>
              </div>
              <Link
                href={`/${locale}/dashboard/account`}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Back to Account →
              </Link>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-900/60">
                  <tr className="text-left text-gray-400">
                    <th className="px-4 py-3 font-medium">Order No</th>
                    <th className="px-4 py-3 font-medium">Product Name</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Interval</th>
                    <th className="px-4 py-3 font-medium">Paid At</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((o) => (
                    <tr key={`row-${o.order_no}`} className="border-t border-gray-800 text-gray-200">
                      <td className="px-4 py-3 font-mono">{o.order_no}</td>
                      <td className="px-4 py-3">{o.product_name || '—'}</td>
                      <td className="px-4 py-3">{o.currency === 'USD' ? '$ ' : `${o.currency} `}{(o.amount/100).toFixed(2)}</td>
                      <td className="px-4 py-3 capitalize">{o.interval === 'one-time' ? 'One–Time' : (o.interval || '—')}</td>
                      <td className="px-4 py-3">{formatDateTime(o.created_at)}</td>
                      <td className="px-4 py-3 capitalize">{o.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
              <span>Page {currentPage} of {totalPages}</span>
              <div className="flex items-center gap-2">
                <Link
                  aria-disabled={currentPage <= 1}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-800 ${currentPage <= 1 ? 'opacity-50 pointer-events-none' : 'hover:bg-gray-800/60 text-white'}`}
                  href={`/${locale}/dashboard/orders?page=${currentPage - 1}&pageSize=${size}`}
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </Link>
                <Link
                  aria-disabled={currentPage >= totalPages}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-800 ${currentPage >= totalPages ? 'opacity-50 pointer-events-none' : 'hover:bg-gray-800/60 text-white'}`}
                  href={`/${locale}/dashboard/orders?page=${currentPage + 1}&pageSize=${size}`}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function getOrders(userUuid: string, page: number, pageSize: number) {
  const offset = (page - 1) * pageSize;
  const [countRow] = await db()
    .select({ count: sql<number>`COUNT(*)` })
    .from(orders)
    .where(and(eq(orders.user_uuid, userUuid), eq(orders.status, 'paid')));

  const items = await db()
    .select({
      order_no: orders.order_no,
      product_name: orders.product_name,
      amount: orders.amount,
      currency: orders.currency,
      status: orders.status,
      created_at: orders.created_at,
      interval: orders.interval,
    })
    .from(orders)
    .where(and(eq(orders.user_uuid, userUuid), eq(orders.status, 'paid')))
    .orderBy(desc(orders.created_at))
    .limit(pageSize)
    .offset(offset);

  return { items, total: Number(countRow?.count || 0) };
}
