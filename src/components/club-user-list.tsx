import { DeleteClubUserButton } from "@/components/delete-club-user-button";
import { EditClubUserButton } from "@/components/edit-club-user-button";

type Props = {
  users: Array<{ id: string; name: string; email: string }>;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

export function ClubUserList({ users, updateAction, deleteAction }: Props) {
  return (
    <div className="min-w-0 rounded-lg border">
      <div aria-hidden="true" className="hidden grid-cols-[1fr_1.3fr_auto] gap-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
        <span>Navn</span><span>E-mail</span><span>Handlinger</span>
      </div>
      <ul className="divide-y divide-border/50">
        {users.map(user => (
          <li key={user.id} className="grid min-w-0 gap-2 p-3 hover:bg-muted/20 sm:grid-cols-[1fr_1.3fr_auto] sm:items-start sm:gap-4 sm:px-4">
            <p className="min-w-0 break-words text-sm font-medium">{user.name}</p>
            <p className="min-w-0 break-all text-sm text-muted-foreground">{user.email}</p>
            <div className="flex min-w-0 flex-wrap items-start gap-2 pt-1 sm:justify-end sm:pt-0">
              <EditClubUserButton action={updateAction} userId={user.id} userName={user.name} userEmail={user.email} />
              <DeleteClubUserButton action={deleteAction} userId={user.id} userName={user.name} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
