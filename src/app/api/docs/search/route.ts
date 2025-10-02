import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

export const { GET } = createFromSource(source, {
  // Allow multiple locales, but map unsupported ones (like zh) to english tokenizer
  language: undefined,
  localeMap: {
    zh: "english",
  },
});
