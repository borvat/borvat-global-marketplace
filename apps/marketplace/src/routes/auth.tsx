import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

const authSearch = z.object({ next: z.string().optional() });

function safeNext(next: string | undefined): string {
  if (!next) return "/";
  // Only allow same-origin relative paths (must start with "/", not "//").
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export const Route = createFileRoute("/auth")({
  validateSearch: authSearch,
  head: () => ({
    meta: [
      { title: "Inloggen of registreren — Borvat" },
      { name: "description", content: "Log in of maak een account aan op Borvat." },
      { property: "og:title", content: "Inloggen — Borvat" },
      { property: "og:description", content: "Toegang tot je bestellingen en verkopers-tools." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const target = safeNext(next);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + target,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        toast.success("Account aangemaakt! Je bent ingelogd.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welkom terug!");
      }
      // Full navigation preserves the consent route's search params on reload.
      window.location.href = target;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Er ging iets mis");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + target,
    });
    if (result.error) {
      toast.error("Google-login mislukt");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    window.location.href = target;
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="bg-card border border-border rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-1">
          {mode === "in" ? "Inloggen" : "Account aanmaken"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {mode === "in" ? "Welkom terug bij Borvat" : "Word deel van Borvat"}
        </p>

        <button
          onClick={google}
          disabled={busy}
          className="w-full border border-border rounded py-2 mb-4 hover:bg-muted flex items-center justify-center gap-2 text-sm font-medium"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Doorgaan met Google
        </button>

        <div className="text-xs text-center text-muted-foreground mb-4">of met e-mail</div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "up" && (
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Volledige naam"
              className="w-full border border-border rounded px-3 py-2 bg-background"
            />
          )}
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            className="w-full border border-border rounded px-3 py-2 bg-background"
          />
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Wachtwoord (min. 6 tekens)"
            className="w-full border border-border rounded px-3 py-2 bg-background"
          />
          <button
            disabled={busy}
            className="w-full bg-brand text-brand-foreground rounded py-2 font-medium hover:opacity-95"
          >
            {mode === "in" ? "Inloggen" : "Account aanmaken"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          className="w-full text-sm text-brand mt-4 hover:underline"
        >
          {mode === "in"
            ? "Nog geen account? Registreer nu."
            : "Al een account? Log in."}
        </button>

        <Link to="/" className="block text-xs text-center text-muted-foreground mt-4">
          Terug naar de homepage
        </Link>
      </div>
    </div>
  );
}
