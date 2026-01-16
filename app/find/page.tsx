"use client";

import { useState } from "react";

export default function FindPage() {
  const [input, setInput] = useState("");

  const addr = input.trim().toLowerCase();
  const valid = addr.startsWith("0x") && addr.length === 42;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-lg font-extrabold">Find</div>
      <div className="mt-2 text-sm font-bold text-slate-600">
        Search a wallet address and open its reward profile.
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="0x..."
          className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-[#1E4FFF]"
        />
        <a
          href={valid ? `/find/${addr}` : "#"}
          className={[
            "rounded-2xl px-4 py-3 text-sm font-extrabold",
            valid ? "bg-[#1E4FFF] text-white" : "bg-slate-100 text-slate-400 pointer-events-none",
          ].join(" ")}
        >
          Open
        </a>
      </div>

      <div className="mt-3 text-xs font-bold text-slate-500">
        Tip: You can also open directly: <span className="font-mono">/find/0x...</span>
      </div>
    </div>
  );
}
