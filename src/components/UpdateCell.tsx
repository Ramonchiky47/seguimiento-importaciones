"use client";

import { UpdateButton } from "./UpdateButton";

export function UpdateCell({
  id,
  onUpdate,
  stickyBg = "",
}: {
  id: number;
  onUpdate: (id: number) => Promise<void>;
  stickyBg?: string;
}) {
  return (
    <td
      className={`sticky left-0 z-10 w-8 whitespace-nowrap px-2 py-1.5 ${stickyBg}`}
      onClick={(e) => e.stopPropagation()}
    >
      <UpdateButton id={id} onUpdate={onUpdate} />
    </td>
  );
}
