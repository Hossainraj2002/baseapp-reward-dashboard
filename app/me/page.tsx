// app/me/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

type MeApiResponse = {
  user: {
    fid: number;
    username: string | null;
    displayName: string | null;
    pfpUrl: string | null;
    followerCount: number;
    followingCount: number;
  };
  thisWeek: {
    weekStartISO: string;
    weekEndISO: string;
    casts: number;
    repliesAuthored: number;
    likesReceived: number;
    recastsReceived: number;
  };
  topCasts: Array<{
    hash: string | null;
    text: string;
    timestamp: string | null;
    likes: number;
    recasts: number;
    score: number;
  }>;
  meta: { updatedAt: string; source: string };
};

function shortText(s: string, n = 110) {
  const t = (s || "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1) + "…";
}

export default function MePage() {
  const { context } = useMiniKit();
  const fid = useMemo(() => {
    const raw = context?.user?.fid;
    const num = raw ? Number(raw) : NaN;
    return Number.isFinite(num) ? num : null;
  }, [context?.user?.fid]);

  const [data, setData] = useState<MeApiResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!fid) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`/api/me?fid=${fid}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load /api/me");
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fid]);

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto w-full max-w-md px-4 pb-20 pt-5">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Me</h1>
          <div className="text-xs text-slate-500">Royal blue + white</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-2xl bg-[#1E4FFF]">
              {data?.user?.pfpUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.user.pfpUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>

            <div className="min-w-0">
              <div className="truncate text-base font-semibold">
                {data?.user?.displayName || data?.user?.username || (fid ? `FID ${fid}` : "Loading…")}
              </div>
              <div className="truncate text-sm text-slate-600">
                {data?.user?.username ? `@${data.user.username}` : fid ? `FID ${fid}` : "No viewer context yet"}
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-3 text-sm text-slate-700">
            <div className="rounded-xl border border-slate-200 px-3 py-2">
              <div className="text-xs text-slate-500">Followers</div>
              <div className="font-semibold">{data?.user?.followerCount ?? "—"}</div>
            </div>
            <div className="rounded-xl border border-slate-200 px-3 py-2">
              <div className="text-xs text-slate-500">Following</div>
              <div className="font-semibold">{data?.user?.followingCount ?? "—"}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold">Social activity</h2>
            <span className="text-xs text-slate-500">This week</span>
          </div>

          {loading ? <div className="text-sm text-slate-600">Loading…</div> : null}
          {err ? <div className="text-sm text-red-600">{err}</div> : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Casts</div>
              <div className="text-lg font-semibold">{data?.thisWeek?.casts ?? "—"}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Replies made</div>
              <div className="text-lg font-semibold">{data?.thisWeek?.repliesAuthored ?? "—"}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Likes received</div>
              <div className="text-lg font-semibold">{data?.thisWeek?.likesReceived ?? "—"}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs text-slate-500">Recasts received</div>
              <div className="text-lg font-semibold">{data?.thisWeek?.recastsReceived ?? "—"}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-sm font-semibold">Top casts (this week)</div>
            <div className="space-y-2">
              {(data?.topCasts ?? []).map((c, idx) => (
                <div key={idx} className="rounded-xl border border-slate-200 p-3">
                  <div className="text-sm">{shortText(c.text)}</div>
                  <div className="mt-2 flex gap-3 text-xs text-slate-600">
                    <span>♥ {c.likes}</span>
                    <span>↻ {c.recasts}</span>
                  </div>
                </div>
              ))}
              {!loading && !err && (data?.topCasts?.length ?? 0) === 0 ? (
                <div className="text-sm text-slate-600">No casts found in this week window.</div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-400">
          Viewer social uses MiniKit context (FID). Address profiles only show social if linked.
        </div>
      </div>
    </main>
  );
}
