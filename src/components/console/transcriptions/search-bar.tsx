"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

export default function SearchBar({ defaultQuery, placeholder, submitLabel }: { defaultQuery?: string; placeholder?: string; submitLabel?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = inputRef.current?.value?.trim() || '';
    // Only grid shows loading; dispatch event for table overlay
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('transcriptions:search'));
    }
    const params = new URLSearchParams(q ? { q } : {});
    router.push(`/my-transcriptions?${params.toString()}`);
  };

  return (
    <form className="mb-6" onSubmit={onSubmit}>
      <div className="relative max-w-md">
        <input
          ref={inputRef}
          name="q"
          defaultValue={defaultQuery}
          placeholder={placeholder || 'Search title or URL'}
          className="
            w-full px-4 py-3 pl-12 rounded-xl 
            bg-background border border-border/50 
            focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20
            transition-all duration-200 text-sm
            placeholder:text-muted-foreground/60
          "
        />
        <div className="absolute left-4 top-1/2 -translate-y-1/2">
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          className="
            absolute right-2 top-1/2 -translate-y-1/2
            px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground
            transition-colors duration-200 text-sm font-medium
          "
          type="submit"
        >
          {submitLabel || 'Search'}
        </button>
      </div>
    </form>
  );
}

