"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function ClickableRow({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <tr
      onClick={() => router.push(href)}
      className={`cursor-pointer hover:brightness-95 dark:hover:brightness-125 ${className}`}
    >
      {children}
    </tr>
  );
}
