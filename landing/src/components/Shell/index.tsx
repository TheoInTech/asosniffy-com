import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
