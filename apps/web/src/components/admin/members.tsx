"use client";

import { ROLE_LABELS, ROLES, type Role } from "@ecolens/api/auth/roles";
import { Button } from "@ecolens/ui/components/button";
import { Input } from "@ecolens/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, UserMinus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PanelEmpty, PanelSkeleton } from "@/components/dashboard/widgets";
import { Field, Form, Reason } from "@/components/incidents/incident-forms";
import { useCanCallApi, useMe } from "@/components/shell/use-me";
import { useOnline } from "@/hooks/use-network";
import { formatDate } from "@/lib/format";
import { client, orpc } from "@/utils/orpc";

// Platform management: who has access, as what, at which institution. Access
// is by invitation only; institutions themselves are never created here.
// These actions go to Clerk directly, so they need a connection.

const roleLabel = (r: string) => ROLE_LABELS[r as Role] ?? r;
const selectClass =
  "bg-background h-8 w-full border px-2 text-xs outline-none focus-visible:ring-1";

export function Members() {
  const query = useQuery({
    ...orpc.admin.institutions.queryOptions(),
    enabled: useCanCallApi(),
  });
  const online = useOnline();
  const [inviteTo, setInviteTo] = useState<string | null>(null);

  if (!query.data) {
    return query.isError ? (
      <PanelEmpty>{query.error.message}</PanelEmpty>
    ) : (
      <PanelSkeleton rows={6} />
    );
  }

  return (
    <div className="space-y-4">
      {!online && (
        <p className="border border-amber-500/40 p-3 text-xs text-amber-800 dark:text-amber-200">
          You're offline. Member changes need a connection; the list shows what was last saved.
        </p>
      )}
      {query.data.map((inst) => (
        <section key={inst.id} className="border">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-medium">{inst.name}</h2>
              <p className="text-muted-foreground text-xs">
                {inst.members.length} member{inst.members.length === 1 ? "" : "s"}
                {inst.invitations.length > 0 && ` · ${inst.invitations.length} invited`}
              </p>
            </div>
            {inviteTo !== inst.id && (
              <Button
                size="sm"
                variant="outline"
                disabled={!online}
                onClick={() => setInviteTo(inst.id)}
              >
                <Mail /> Invite
              </Button>
            )}
          </header>
          {inviteTo === inst.id && (
            <div className="border-b p-4">
              <InviteForm institutionId={inst.id} onDone={() => setInviteTo(null)} />
            </div>
          )}
          <ul className="divide-y text-xs">
            {inst.members.map((m) => (
              <MemberRow key={m.userId} institutionId={inst.id} member={m} disabled={!online} />
            ))}
            {inst.invitations.map((v) => (
              <InvitationRow key={v.id} institutionId={inst.id} invitation={v} disabled={!online} />
            ))}
            {inst.members.length === 0 && inst.invitations.length === 0 && (
              <li className="text-muted-foreground px-4 py-3">No one has access yet.</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: orpc.admin.key() });
}

function InviteForm({ institutionId, onDone }: { institutionId: string; onDone: () => void }) {
  const refresh = useRefresh();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const invite = useMutation({
    mutationFn: () => client.admin.invite({ institutionId, email, role: role as Role }),
    onSuccess: () => {
      toast.success(`Invitation sent to ${email}`);
      void refresh();
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Form
      submitLabel={invite.isPending ? "Sending…" : "Send invitation"}
      missing={[!/^\S+@\S+\.\S+$/.test(email) && "an email address", !role && "a role"]}
      onSubmit={() => invite.mutate()}
      onCancel={onDone}
    >
      <Field label="Email">
        {(id) => (
          <Input
            id={id}
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@institution.gov.gh"
          />
        )}
      </Field>
      <Field label="Role" hint="Give the least access the job needs (principle 6).">
        {(id) => (
          <select
            id={id}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={selectClass}
          >
            <option value="" disabled>
              Choose a role
            </option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        )}
      </Field>
    </Form>
  );
}

function MemberRow({
  institutionId,
  member,
  disabled,
}: {
  institutionId: string;
  member: {
    userId: string;
    name: string | null;
    email: string | null;
    role: string;
    joinedAt: string;
  };
  disabled: boolean;
}) {
  const me = useMe();
  const refresh = useRefresh();
  const [mode, setMode] = useState<"role" | "remove" | null>(null);
  const [role, setRole] = useState(member.role as Role);
  const [reason, setReason] = useState("");
  const self = me.data?.userId === member.userId;

  const change = useMutation({
    mutationFn: async () => {
      if (mode === "remove") {
        await client.admin.remove({ institutionId, userId: member.userId, reason });
      } else {
        await client.admin.setRole({ institutionId, userId: member.userId, role, reason });
      }
    },
    onSuccess: () => {
      toast.success(mode === "remove" ? "Access removed" : "Role changed");
      setMode(null);
      setReason("");
      void refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {member.name ?? member.email ?? "Member"}
            {self && <span className="text-muted-foreground font-normal"> (you)</span>}
          </p>
          <p className="text-muted-foreground">
            {member.email && member.name ? `${member.email} · ` : ""}
            {roleLabel(member.role)} · since {formatDate(member.joinedAt)}
          </p>
        </div>
        {!self && !mode && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setMode("role")}>
              Change role
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              aria-label={`Remove ${member.name ?? member.email ?? "member"}`}
              onClick={() => setMode("remove")}
            >
              <UserMinus />
            </Button>
          </div>
        )}
      </div>
      {mode && (
        <div className="mt-3">
          <Form
            submitLabel={mode === "remove" ? "Remove access" : "Change role"}
            missing={[
              mode === "role" && role === member.role && "a different role",
              reason.trim().length < 10 && "a reason of at least 10 characters",
            ]}
            onSubmit={() => change.mutate()}
            onCancel={() => setMode(null)}
          >
            {mode === "role" && (
              <Field label="New role">
                {(id) => (
                  <select
                    id={id}
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className={selectClass}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <Reason
              label="Reason"
              value={reason}
              onChange={setReason}
              placeholder={
                mode === "remove"
                  ? "e.g. Left the institution on 30 October."
                  : "e.g. Now leads validation for the Pra basin."
              }
            />
          </Form>
        </div>
      )}
    </li>
  );
}

function InvitationRow({
  institutionId,
  invitation,
  disabled,
}: {
  institutionId: string;
  invitation: { id: string; email: string; role: string; createdAt: string };
  disabled: boolean;
}) {
  const refresh = useRefresh();
  const revoke = useMutation({
    mutationFn: () =>
      client.admin.revokeInvitation({
        institutionId,
        invitationId: invitation.id,
        email: invitation.email,
      }),
    onSuccess: () => {
      toast.success("Invitation withdrawn");
      void refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{invitation.email}</p>
        <p className="text-muted-foreground">
          Invited as {roleLabel(invitation.role)} · {formatDate(invitation.createdAt)}
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled || revoke.isPending}
        onClick={() => revoke.mutate()}
      >
        <X /> Withdraw
      </Button>
    </li>
  );
}
