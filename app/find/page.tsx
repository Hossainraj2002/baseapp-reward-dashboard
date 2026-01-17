"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function isValidAddress(a: string) {
  const s = a.trim().toLowerCase();
  return s.startsWith("0x") && s.length === 42;
}

export default function FindPage() {
  const router = useRouter();
  const [input, setInput] = useState("");

  const addr = useMemo(() => input.trim().toLowerCase(), [input]);
  const valid = isValidAddress(addr);

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-24 pt-5">
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

          <button
            type="button"
            onClick={() => valid && router.push(`/find/${addr}`)}
            className={[
              "rounded-2xl px-4 py-3 text-sm font-extrabold",
              valid ? "bg-[#1E4FFF] text-white" : "bg-slate-100 text-slate-400",
            ].join(" ")}
            disabled={!valid}
          >
            Open
          </button>
        </div>

        <div className="mt-3 text-xs font-bold text-slate-500">
          Tip: You can also open directly:{" "}
          <span className="font-mono">/find/0x...</span>
        </div>
      </div>
    </div>
  );
}
