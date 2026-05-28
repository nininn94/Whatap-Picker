"use client";

import dynamic from "next/dynamic";

const PickerApp = dynamic(() => import("@/App"), {
  ssr: false,
  loading: () => (
    <main className="flex h-screen min-h-screen items-center justify-center bg-background text-foreground">
      뽑기판을 불러오는 중입니다.
    </main>
  ),
});

export default function Page() {
  return <PickerApp />;
}
