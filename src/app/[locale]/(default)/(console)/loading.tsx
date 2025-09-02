"use client";

import { Loader } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader className="mr-2 h-5 w-5 animate-spin" />
      <span>Loading...</span>
    </div>
  );
}

