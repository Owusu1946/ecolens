"use client";

import { ClerkFailed, useAuth, useClerk, useSignIn } from "@clerk/nextjs";
import { Button } from "@ecolens/ui/components/button";
import { Input } from "@ecolens/ui/components/input";
import { Label } from "@ecolens/ui/components/label";
import { ArrowLeft, Loader2, WifiOff } from "lucide-react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useOnline } from "@/hooks/use-network";
import { afterSignInPath, taskPath } from "@/lib/auth-redirect";

import { DemoAccounts, isTestEmail, TEST_CODE } from "./demo-accounts";

// Custom Clerk sign-in (Core 3 SignInFuture API). Email code is the primary
// method; password and Microsoft/Google are offered where the account has
// them. There is no public sign-up: pilot access is by institutional invitation.

type Step = "email" | "code" | "password" | "second_factor";

const NO_ACCOUNT =
  "No Ecolens account uses that sign-in. Access is by invitation: ask your institution's Ecolens administrator.";
const RESEND_SECONDS = 30;

export function SignInFlow() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const clerk = useClerk();
  const router = useRouter();
  const params = useSearchParams();
  const online = useOnline();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(
    params.get("error") === "no_account" ? NO_ACCOUNT : null,
  );
  const [cooldown, setCooldown] = useState(0);
  const navigating = useRef(false);
  const busy = fetchStatus === "fetching";

  const destination = () => afterSignInPath(params.get("redirect_url"));

  const go = (path: string) => {
    navigating.current = true;
    if (path.startsWith("http")) window.location.href = path;
    else router.replace(path as Route);
  };

  // Already signed in (or part-way through, e.g. choosing an institution).
  useEffect(() => {
    if (!isLoaded || !isSignedIn || navigating.current) return;
    const task = clerk.session?.currentTask;
    go(task ? taskPath(task.key, destination()) : destination());
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function finish() {
    if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") {
      // Device trust / MFA. The instance only enables email codes as a second factor.
      if (!signIn.supportedSecondFactors.some((f) => f.strategy === "email_code")) {
        setNotice(
          "This account needs a verification method Ecolens does not support yet. Contact your administrator.",
        );
        return;
      }
      const { error } = await signIn.mfa.sendEmailCode();
      if (!error) {
        setStep("second_factor");
        setCooldown(RESEND_SECONDS);
      }
      return;
    }
    if (signIn.status !== "complete") return;
    navigating.current = true;
    await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        const dest = destination();
        go(decorateUrl(session.currentTask ? taskPath(session.currentTask.key, dest) : dest));
      },
    });
  }

  async function sendCode(address: string) {
    setNotice(null);
    setEmail(address);
    const { error } = await signIn.emailCode.sendCode({ emailAddress: address });
    if (!error) {
      setStep("code");
      setCooldown(RESEND_SECONDS);
    }
  }

  async function resend() {
    const { error } =
      step === "second_factor"
        ? await signIn.mfa.sendEmailCode()
        : await signIn.emailCode.sendCode();
    if (!error) setCooldown(RESEND_SECONDS);
  }

  async function verify(code: string) {
    const { error } =
      step === "second_factor"
        ? await signIn.mfa.verifyEmailCode({ code })
        : await signIn.emailCode.verifyCode({ code });
    if (!error) await finish();
  }

  async function submitPassword(password: string) {
    const { error } = await signIn.password({ emailAddress: email, password });
    if (!error) await finish();
  }

  async function sso(strategy: "oauth_microsoft" | "oauth_google") {
    setNotice(null);
    await signIn.sso({
      strategy,
      redirectUrl: destination(),
      redirectCallbackUrl: `/sign-in/sso-callback?redirect_url=${encodeURIComponent(destination())}`,
    });
  }

  function startOver() {
    signIn.reset();
    setNotice(null);
    setStep("email");
  }

  const identifierError =
    errors.fields.identifier?.code === "form_identifier_not_found"
      ? NO_ACCOUNT
      : errors.fields.identifier?.message;
  const globalError = errors.global?.[0]?.message;
  const testEmail = isTestEmail(email);
  const canUsePassword = signIn.supportedFirstFactors.some((f) => f.strategy === "password");

  return (
    <div
      key={step}
      className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
    >
      {step !== "email" && (
        <button
          type="button"
          onClick={startOver}
          className="text-muted-foreground hover:text-foreground mb-6 -ml-0.5 inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeft className="size-3.5" />
          Use a different email
        </button>
      )}

      {step === "email" && (
        <>
          <Heading title="Sign in to Ecolens">
            Use the email address your institution registered for the pilot.
          </Heading>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get("email");
              if (typeof value === "string") void sendCode(value.trim());
            }}
          >
            <Field id="email" label="Work email" error={identifierError}>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email webauthn"
                inputMode="email"
                required
                autoFocus
                defaultValue={email}
                placeholder="name@institution.gov.gh"
                aria-invalid={!!identifierError}
                className="h-10 text-sm md:text-sm"
              />
            </Field>
            <Submit busy={busy} online={online} ready={isLoaded}>
              Email me a sign-in code
            </Submit>
          </form>

          <div className="text-muted-foreground my-6 flex items-center gap-3 text-[11px] uppercase">
            <span className="bg-border h-px flex-1" />
            or
            <span className="bg-border h-px flex-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="lg"
              className="h-10"
              disabled={busy || !online || !isLoaded}
              onClick={() => sso("oauth_microsoft")}
            >
              <MicrosoftIcon />
              Microsoft
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-10"
              disabled={busy || !online || !isLoaded}
              onClick={() => sso("oauth_google")}
            >
              <GoogleIcon />
              Google
            </Button>
          </div>

          <DemoAccounts onPick={(address) => void sendCode(address)} />
        </>
      )}

      {(step === "code" || step === "second_factor") && (
        <>
          {testEmail ? (
            <Heading title="Enter the test code">
              <span className="text-foreground font-medium">{email}</span> is a demo account, so no
              email is sent. Its code is always{" "}
              <span className="text-foreground font-mono">{TEST_CODE}</span>.
            </Heading>
          ) : (
            <Heading title={step === "code" ? "Check your email" : "Confirm it's you"}>
              {step === "code"
                ? "We sent a 6-digit code to "
                : "This device is new to your account. We sent a code to "}
              <span className="text-foreground font-medium">{email}</span>.
            </Heading>
          )}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get("code");
              if (typeof value === "string") void verify(value.trim());
            }}
          >
            <Field id="code" label="Sign-in code" error={errors.fields.code?.message}>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                placeholder="000000"
                aria-invalid={!!errors.fields.code}
                className="h-12 text-center font-mono text-lg tracking-[0.5em] md:text-lg"
                onChange={(e) => {
                  if (/^\d{6}$/.test(e.currentTarget.value)) e.currentTarget.form?.requestSubmit();
                }}
              />
            </Field>
            <Submit busy={busy} online={online} ready={isLoaded}>
              Continue
            </Submit>
            {testEmail && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-10 w-full text-sm"
                disabled={busy || !online || !isLoaded}
                onClick={() => void verify(TEST_CODE)}
              >
                Use test code {TEST_CODE}
              </Button>
            )}
          </form>
          <div className="mt-4 flex items-center justify-between text-xs">
            {testEmail ? (
              <span />
            ) : (
              <button
                type="button"
                disabled={cooldown > 0 || busy || !online}
                onClick={() => void resend()}
                className="text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground disabled:opacity-70"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            )}
            {step === "code" && canUsePassword && (
              <button
                type="button"
                onClick={() => setStep("password")}
                className="text-muted-foreground hover:text-foreground"
              >
                Use password instead
              </button>
            )}
          </div>
        </>
      )}

      {step === "password" && (
        <>
          <Heading title="Enter your password">
            Signing in as <span className="text-foreground font-medium">{email}</span>.
          </Heading>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get("password");
              if (typeof value === "string") void submitPassword(value);
            }}
          >
            <Field id="password" label="Password" error={errors.fields.password?.message}>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                aria-invalid={!!errors.fields.password}
                className="h-10 text-sm md:text-sm"
              />
            </Field>
            <Submit busy={busy} online={online} ready={isLoaded}>
              Sign in
            </Submit>
          </form>
          <button
            type="button"
            onClick={() => void sendCode(email)}
            className="text-muted-foreground hover:text-foreground mt-4 text-xs"
          >
            Email me a code instead
          </button>
        </>
      )}

      {(notice || globalError) && (
        <p role="alert" className="text-destructive mt-4 text-xs leading-relaxed">
          {notice ?? globalError}
        </p>
      )}
      {!online && (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300"
        >
          <WifiOff className="mt-px size-3.5 shrink-0" />
          You're offline. Signing in needs a connection; this page will be ready as soon as you're
          back.
        </p>
      )}
      <ClerkFailed>
        <p role="alert" className="text-destructive mt-4 text-xs leading-relaxed">
          Couldn't reach the sign-in service. Check your connection, then{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="underline underline-offset-2"
          >
            try again
          </button>
          .
        </p>
      </ClerkFailed>
    </div>
  );
}

function Heading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm text-pretty">{children}</p>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-xs leading-relaxed">
          {error}
        </p>
      )}
    </div>
  );
}

function Submit({
  busy,
  online,
  ready,
  children,
}: {
  busy: boolean;
  online: boolean;
  /** Clerk's script has loaded; on a slow connection this can take a moment. */
  ready: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="submit"
      size="lg"
      disabled={busy || !online || !ready}
      className="h-10 w-full text-sm"
    >
      {(busy || (online && !ready)) && <Loader2 className="animate-spin" />}
      {ready || !online ? children : "Connecting…"}
    </Button>
  );
}

function MicrosoftIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16">
      <path fill="#f25022" d="M1 1h6.5v6.5H1z" />
      <path fill="#7fba00" d="M8.5 1H15v6.5H8.5z" />
      <path fill="#00a4ef" d="M1 8.5h6.5V15H1z" />
      <path fill="#ffb900" d="M8.5 8.5H15V15H8.5z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.7 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
  );
}
