'use client';

// ============================================================
// AddMemberDialog — Settings → Team members → "Añadir miembro"
//
// Replaces the share-a-link invite flow with a direct one: the owner
// types the teammate's email (+ optional name) and role; the server
// creates the account with a generated password (POST /api/account/
// members/create) and emails the credentials. The result step shows
// the email + password + login link so the owner can also share them
// by WhatsApp — the safety net when SMTP isn't configured or delivery
// fails.
// ============================================================

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, MailCheck, MessageCircle, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';

type InviteRole = 'admin' | 'agent' | 'viewer';

const ROLE_DESCRIPTIONS: Record<InviteRole, string> = {
  admin:
    'Puede invitar a otras personas, gestionar ajustes y permisos, enviar mensajes y editar datos.',
  agent:
    'Puede usar la bandeja, contactos, difusiones, automatizaciones y flujos. No accede a ajustes ni a la gestión de miembros.',
  viewer: 'Solo lectura en todas las páginas. No puede enviar ni editar nada.',
};

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful create so the parent re-fetches the roster. */
  onCreated: () => void;
}

interface CreatedMember {
  email: string;
  password: string;
  loginUrl: string;
  role: InviteRole;
  emailed: boolean;
  accountName: string;
}

export function AddMemberDialog({
  open,
  onOpenChange,
  onCreated,
}: AddMemberDialogProps) {
  const { account } = useAuth();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<InviteRole>('agent');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreatedMember | null>(null);

  function reset() {
    setEmail('');
    setFullName('');
    setRole('agent');
    setSubmitting(false);
    setResult(null);
  }

  async function handleCreate() {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error('Introduce un correo electrónico válido');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/members/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          role,
          full_name: fullName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'No se pudo crear la cuenta');
        return;
      }
      setResult({
        email: data.email,
        password: data.password,
        loginUrl: data.loginUrl,
        role,
        emailed: Boolean(data.emailed),
        accountName: account?.name ?? 'nuestro equipo',
      });
      onCreated();
    } catch (err) {
      console.error('[AddMemberDialog] create error:', err);
      toast.error('No se pudo conectar con el servidor. ¿Reintentar?');
    } finally {
      setSubmitting(false);
    }
  }

  function shareText(r: CreatedMember): string {
    return [
      `Hola, este es tu acceso a ${r.accountName}:`,
      `Correo: ${r.email}`,
      `Contraseña: ${r.password}`,
      `Entra aquí: ${r.loginUrl}`,
    ].join('\n');
  }

  async function copyAll() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(shareText(result));
      toast.success('Datos de acceso copiados');
    } catch {
      toast.error('No se pudo copiar — cópialo manualmente');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-popover border-border sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-popover-foreground">
                <MailCheck className="size-4 text-primary" />
                Miembro añadido
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {result.emailed
                  ? `Le hemos enviado un correo a ${result.email} con su acceso. También puedes compartírselo tú:`
                  : `Comparte estos datos de acceso con la persona (por ejemplo, por WhatsApp):`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between gap-3 py-1">
                  <span className="text-muted-foreground">Correo</span>
                  <span className="font-medium text-foreground">
                    {result.email}
                  </span>
                </div>
                <div className="flex justify-between gap-3 py-1">
                  <span className="text-muted-foreground">Contraseña</span>
                  <span className="font-mono font-medium text-foreground">
                    {result.password}
                  </span>
                </div>
                <div className="flex justify-between gap-3 py-1">
                  <span className="text-muted-foreground">Enlace</span>
                  <a
                    href={result.loginUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="max-w-[60%] truncate font-medium text-primary hover:underline"
                  >
                    {result.loginUrl}
                  </a>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={copyAll}
                  variant="outline"
                  className="flex-1"
                >
                  <Copy className="size-4" />
                  Copiar
                </Button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareText(result))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1"
                >
                  <Button
                    type="button"
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <MessageCircle className="size-4" />
                    WhatsApp
                  </Button>
                </a>
              </div>

              <p className="text-xs text-muted-foreground">
                Por seguridad, la contraseña solo se muestra ahora. Si la
                pierdes, puedes eliminar el miembro y volver a añadirlo.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Hecho
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-popover-foreground">
                <UserPlus className="size-4 text-primary" />
                Añadir miembro
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Escribe el correo de la persona y se creará su cuenta con una
                contraseña. Le llegará un correo con sus datos para iniciar
                sesión.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  Correo electrónico
                </Label>
                <Input
                  type="email"
                  autoComplete="off"
                  placeholder="trabajadora@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !submitting) handleCreate();
                  }}
                  className="bg-muted border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  Nombre (opcional)
                </Label>
                <Input
                  type="text"
                  placeholder="Nombre de la persona"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-muted border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Rol</Label>
                <Select value={role} onValueChange={(v) => v && setRole(v as InviteRole)}>
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="agent">Agente</SelectItem>
                    <SelectItem value="viewer">Visor</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ROLE_DESCRIPTIONS[role]}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleCreate}
                disabled={submitting}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                Crear y enviar acceso
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
