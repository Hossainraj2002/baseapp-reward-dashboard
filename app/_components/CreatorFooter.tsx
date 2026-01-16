"use client";

import { useState } from "react";

const TIP_ADDRESS = "0xd4a1D777e2882487d47c96bc23A47CeaB4f4f18A";

export default function CreatorFooter({ compact }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copyTip() {
    try {
      await navigator.clipboard.writeText(TIP_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <div className={compact ? "mt-4" : "mt-6"}>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-extrabold text-slate-900">Support the creator</div>
          <button
            type="button"
            onClick={copyTip}
            className="rounded-xl bg-[#1E4FFF] px-3 py-2 text-xs font-extrabold text-white"
          >
            {copied ? "Copied" : "Copy tip address"}
          </button>
        </div>

        <div className="mt-2 text-xs text-slate-600">
          Tip address (Base): <span className="font-mono">{TIP_ADDRESS}</span>
        </div>

        {/* Hidden “Created by” (not visible directly) */}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-extrabold text-slate-500">
            About
          </summary>
          <div className="mt-2 text-xs text-slate-600">
            Created by Akbar.
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-extrabold text-slate-900"
                href="https://x.com/akbarX402"
                target="_blank"
                rel="noreferrer"
              >
                X profile
              </a>
              <a
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-extrabold text-slate-900"
                href="https://base.app/profile/akbaronchain"
                target="_blank"
                rel="noreferrer"
              >
                Base profile
              </a>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
