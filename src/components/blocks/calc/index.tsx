"use client";

import { useMemo, useState } from "react";
import { Section as SectionType } from "@/types/blocks/section";

export default function CostCalculator({ section }: { section: SectionType }) {
  if (section?.disabled) return null;

  const cfg = (section as any).config || {};
  const maxHours: number = cfg.maxHours ?? 100;
  const hourlyManualRate: number = cfg.hourlyManualRate ?? 30; // currency per hour
  const planPrice: number = cfg.planPrice ?? 199; // currency per month
  const currency: string = cfg.currency ?? "¥";

  const [hours, setHours] = useState<number>(Math.min(40, maxHours));

  const manualCost = useMemo(() => Math.round(hours * hourlyManualRate), [hours, hourlyManualRate]);
  const ourCost = planPrice;
  const saved = Math.max(manualCost - ourCost, 0);
  const savePct = manualCost > 0 ? Math.round((saved / manualCost) * 100) : 0;

  return (
    <section id={section.name || "calculator"} className="py-16">
      <div className="container">
        {section.title && (
          <h2 className="mb-3 text-3xl font-semibold lg:text-4xl">{section.title}</h2>
        )}
        {section.description && (
          <p className="mb-8 max-w-2xl text-muted-foreground lg:text-lg">{section.description}</p>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 rounded-xl border p-6">
            <label className="mb-3 block text-sm font-medium">
              {cfg.hoursLabel || "Hours to transcribe per month"}
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={maxHours}
                value={hours}
                onChange={(e) => setHours(parseInt(e.target.value || "0", 10))}
                className="w-full accent-primary"
              />
              <div className="w-16 text-right tabular-nums">{hours}h</div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {cfg.rangeHint || `0—${maxHours} hours`}
            </p>
          </div>

          <div className="rounded-xl border p-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{cfg.manualLabel || "Manual transcription"}</span>
                <span className="font-semibold tabular-nums">
                  {currency}{manualCost.toLocaleString()}/mo
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{cfg.planLabel || "Our plan"}</span>
                <span className="font-semibold tabular-nums">
                  {currency}{ourCost.toLocaleString()}/mo
                </span>
              </div>
              <div className="mt-3 h-px bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm">{cfg.saveLabel || "You save"}</span>
                <span className="text-xl font-bold tabular-nums text-primary">
                  {currency}{saved.toLocaleString()} / {savePct}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {section.buttons && (
          <div className="mt-6">
            <a
              href={section.buttons[0]?.url || "#pricing"}
              className="inline-flex items-center rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground shadow hover:opacity-90"
            >
              {section.buttons[0]?.title || "Start saving now"}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

