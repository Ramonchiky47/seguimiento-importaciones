"use client";

import { DeleteButton } from "./DeleteButton";

export function RowActions({
  id,
  onDelete,
  canDelete = true,
}: {
  id: number;
  onDelete: (id: number) => Promise<void>;
  canDelete?: boolean;
}) {
  return (
    <td className="whitespace-nowrap px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
      {canDelete && <DeleteButton id={id} onDelete={onDelete} />}
    </td>
  );
}
