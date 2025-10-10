"use client";

import { useRouter, usePathname } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { Search, X } from "lucide-react";

export default function TranscriptionsSearch({ 
  defaultQuery, 
  placeholder, 
  locale 
}: { 
  defaultQuery?: string; 
  placeholder?: string;
  locale: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState(defaultQuery || '');

  useEffect(() => {
    setQuery(defaultQuery || '');
  }, [defaultQuery]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = inputRef.current?.value?.trim() || '';
    // Reset to page 1 when searching
    const params = new URLSearchParams(q ? { q, page: '1' } : { page: '1' });
    // Use Next.js router for proper navigation
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('transcriptions:search'));
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const clearSearch = () => {
    setQuery('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('transcriptions:search'));
    }
    router.push(`${pathname}?page=1`);
  };

  return (
    <form className="mb-6" onSubmit={onSubmit}>
      <div className="relative max-w-md">
        <input
          ref={inputRef}
          name="q"
          defaultValue={defaultQuery}
          placeholder={placeholder || 'Search transcriptions...'}
          className="
            w-full px-4 py-2.5 pl-12 pr-24 rounded-xl
            bg-gray-900/50 border border-gray-800
            focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/20
            transition-all duration-200 text-sm text-white
            placeholder:text-gray-500
          "
        />
        <div className="absolute left-4 top-1/2 -translate-y-1/2">
          <Search className="w-4 h-4 text-gray-500" />
        </div>
        <button
          className="
            absolute right-2 top-1/2 -translate-y-1/2
            px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white
            transition-colors duration-200 text-sm font-medium
          "
          type="submit"
        >
          Search
        </button>
      </div>
    </form>
  );
}
