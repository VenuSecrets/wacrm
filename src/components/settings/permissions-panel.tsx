'use client';

// ============================================================
// PermissionsPanel — Settings → Permisos
//
// Per-member interface permissions. For each teammate the owner/admin
// ticks which sections they may open (Calendar, Photos, Contacts,
// Inbox, Dashboard, …). "Everything ticked" = no restriction (full
// access, stored as NULL). Owners and admins always have full access
// and aren't editable here — the gate is for agents/viewers.
//
// Writes go through PATCH /api/account/members/[id]/sections, which
// calls the SECURITY DEFINER RPC `set_member_sections` (migration
// 033). This screen is a navigation gate on top of Supabase RLS, not
// the security boundary itself.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, CheckCheck, Square } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import type { AccountMember } from '@/types';
import { NAV_SECTIONS, type NavSection } from '@/lib/auth/sections';
import { SettingsPanelHead } from './settings-panel-head';
import { ROLE_META } from './role-meta';

const ALL_KEYS = NAV_SECTIONS.map((s) => s.key);

/** Baseline "allowed set" for a member: null (no restriction) → all
 *  sections ticked. */
function toSet(allowed: string[] | null): Set<NavSection> {
  if (allowed == null) return new Set(ALL_KEYS);
  return new Set(ALL_KEYS.filter((k) => allowed.includes(k)));
}

function sameSet(a: Set<NavSection>, b: Set<NavSection>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

interface RowState {
  selected: Set<NavSection>;
  baseline: Set<NavSection>;
  saving: boolean;
}

export function PermissionsPanel() {
  const { user, profileLoading } = useAuth();
  const canManage = useCan('manage-members');

  const [members, setMembers] = useState<AccountMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/members');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'No se pudieron cargar los miembros');
      const list: AccountMember[] = data.members ?? [];
      setMembers(list);
      const next: Record<string, RowState> = {};
      for (const m of list) {
        const base = toSet(m.allowed_sections);
        next[m.user_id] = { selected: new Set(base), baseline: base, saving: false };
      }
      setRows(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setSelected = useCallback(
    (userId: string, updater: (prev: Set<NavSection>) => Set<NavSection>) => {
      setRows((prev) => {
        const row = prev[userId];
        if (!row) return prev;
        return { ...prev, [userId]: { ...row, selected: updater(row.selected) } };
      });
    },
    [],
  );

  const toggle = useCallback(
    (userId: string, key: NavSection) => {
      setSelected(userId, (prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [setSelected],
  );

  const save = useCallback(
    async (m: AccountMember) => {
      const row = rows[m.user_id];
      if (!row) return;
      // All ticked → clear the restriction (null = full access, and
      // any future section is auto-included). Otherwise send the list.
      const sections =
        row.selected.size === ALL_KEYS.length ? null : Array.from(row.selected);

      setRows((prev) => ({
        ...prev,
        [m.user_id]: { ...prev[m.user_id], saving: true },
      }));
      try {
        const res = await fetch(`/api/account/members/${m.user_id}/sections`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sections }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? 'No se pudo guardar');
        // Move the baseline to the snapshot we actually saved, but keep
        // whatever `selected` is NOW — if the admin toggled more boxes
        // while the request was in flight, those edits stay pending
        // (dirty) instead of being silently reverted.
        setRows((prev) => ({
          ...prev,
          [m.user_id]: {
            ...prev[m.user_id],
            baseline: new Set(row.selected),
            saving: false,
          },
        }));
        toast.success(`Permisos actualizados para ${m.full_name || 'el miembro'}`);
      } catch (err) {
        setRows((prev) => ({
          ...prev,
          [m.user_id]: { ...prev[m.user_id], saving: false },
        }));
        toast.error(err instanceof Error ? err.message : 'Error al guardar');
      }
    },
    [rows],
  );

  const editableMembers = useMemo(
    () =>
      (members ?? []).filter(
        (m) =>
          (m.role === 'agent' || m.role === 'viewer') && m.user_id !== user?.id,
      ),
    [members, user?.id],
  );
  const fullAccessMembers = useMemo(
    () =>
      (members ?? []).filter(
        (m) => m.role === 'owner' || m.role === 'admin' || m.user_id === user?.id,
      ),
    [members, user?.id],
  );

  // `useCan` reports false while the profile is still loading, so wait
  // for it to settle before deciding — otherwise an admin sees the
  // "solo administradores" card flash in before the grid replaces it.
  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div>
        <SettingsPanelHead
          title="Permisos"
          description="Controla a qué secciones de la aplicación puede acceder cada miembro del equipo."
        />
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Solo los administradores y el dueño de la cuenta pueden gestionar
            los permisos del equipo.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <SettingsPanelHead
        title="Permisos"
        description="Elige a qué secciones puede acceder cada miembro. Marcar todas equivale a acceso completo. El dueño y los administradores siempre tienen acceso completo."
      />

      {error ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : members === null ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {editableMembers.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Todavía no hay miembros de tipo agente o visor a los que
                asignar permisos. Invita a tu personal desde “Team members”.
              </CardContent>
            </Card>
          ) : (
            editableMembers.map((m) => {
              const row = rows[m.user_id];
              if (!row) return null;
              const roleMeta = ROLE_META[m.role];
              const dirty = !sameSet(row.selected, row.baseline);
              const isFull = row.selected.size === ALL_KEYS.length;
              return (
                <Card key={m.user_id}>
                  <CardContent className="p-4 sm:p-5">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <Avatar className="size-9 shrink-0">
                        {m.avatar_url ? (
                          <AvatarImage src={m.avatar_url} alt={m.full_name} />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                          {(m.full_name || m.email || 'U').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {m.full_name || m.email || 'Miembro'}
                        </p>
                        <span
                          className={`mt-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${roleMeta.className}`}
                        >
                          {roleMeta.label}
                          {isFull ? ' · acceso completo' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setSelected(m.user_id, () => new Set(ALL_KEYS))
                          }
                        >
                          <CheckCheck className="size-4" />
                          Todo
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setSelected(m.user_id, () => new Set())
                          }
                        >
                          <Square className="size-4" />
                          Nada
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
                      {NAV_SECTIONS.map((s) => {
                        const id = `perm-${m.user_id}-${s.key}`;
                        const checked = row.selected.has(s.key);
                        return (
                          <label
                            key={s.key}
                            htmlFor={id}
                            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-transparent p-1.5 hover:bg-muted/50"
                          >
                            <Checkbox
                              id={id}
                              checked={checked}
                              onCheckedChange={() => toggle(m.user_id, s.key)}
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground">
                                {s.label}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {s.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-3">
                      {dirty ? (
                        <span className="text-xs text-muted-foreground">
                          Cambios sin guardar
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        disabled={!dirty || row.saving}
                        onClick={() => save(m)}
                      >
                        {row.saving ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Guardar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}

          {fullAccessMembers.length > 0 ? (
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShieldCheck className="size-4 text-primary" />
                  Acceso completo (no editable)
                </div>
                <ul className="flex flex-col gap-2">
                  {fullAccessMembers.map((m) => {
                    const roleMeta = ROLE_META[m.role];
                    const isSelf = m.user_id === user?.id;
                    return (
                      <li key={m.user_id} className="flex items-center gap-3">
                        <Avatar className="size-7 shrink-0">
                          {m.avatar_url ? (
                            <AvatarImage src={m.avatar_url} alt={m.full_name} />
                          ) : null}
                          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                            {(m.full_name || m.email || 'U').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {m.full_name || m.email || 'Miembro'}
                          {isSelf ? ' (tú)' : ''}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${roleMeta.className}`}
                        >
                          {roleMeta.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
