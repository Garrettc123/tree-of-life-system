// GARCAR ENTERPRISE — ATLAS Webhook Ingestion Edge Function
// Deploy: supabase functions deploy atlas-ingest --project-ref YOUR_REF --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ATLAS_API_URL = Deno.env.get("ATLAS_API_URL")!;
const ATLAS_API_KEY = Deno.env.get("ATLAS_API_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function detectSource(req: Request): string {
  if (req.headers.get("stripe-signature")) return "stripe";
  if (req.headers.get("x-github-event")) return "github";
  if (req.headers.get("x-docusign-signature-1")) return "docusign";
  const ua = req.headers.get("user-agent") ?? "";
  if (ua.toLowerCase().includes("apollo")) return "apollo";
  if (ua.toLowerCase().includes("linear")) return "linear";
  return "unknown";
}

async function verifyStripe(body: string, sig: string): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const ts =
      sig
        .split(",")
        .find((p) => p.startsWith("t="))
        ?.slice(2) ?? "";
    const v1 =
      sig
        .split(",")
        .find((p) => p.startsWith("v1="))
        ?.slice(3) ?? "";
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(STRIPE_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const buf = await crypto.subtle.sign(
      "HMAC",
      key,
      enc.encode(`${ts}.${body}`),
    );
    const computed = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return computed === v1;
  } catch {
    return false;
  }
}

// Routes source:event_type → ATLAS task_types
const ROUTING: Record<string, string> = {
  "stripe:payment_intent.succeeded": "accrual_tax,sweep_treasury,notify",
  "stripe:customer.subscription.created": "sweep_treasury,notify",
  "stripe:invoice.paid": "accrual_tax,sweep_treasury",
  "stripe:payment_intent.payment_failed": "notify",
  "github:push": "deploy",
  "github:release": "deploy,notify",
  "apollo:lead.created": "qualify_lead",
  "docusign:envelope-completed": "activate_subscription,notify",
};

async function dispatchAtlas(
  webhookId: string,
  source: string,
  eventType: string,
  payload: unknown,
) {
  const tasks = (ROUTING[`${source}:${eventType}`] ?? "log").split(",");
  await fetch(`${ATLAS_API_URL}/api/v1/dispatch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ATLAS_API_KEY}`,
    },
    body: JSON.stringify({
      webhook_event_id: webhookId,
      source,
      event_type: eventType,
      task_types: tasks,
      payload,
    }),
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });

  const body = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const source = detectSource(req);
  if (source === "stripe") {
    const valid = await verifyStripe(
      body,
      req.headers.get("stripe-signature") ?? "",
    );
    if (!valid)
      return new Response("Invalid Stripe signature", { status: 401 });
  }

  let eventId = crypto.randomUUID();
  let eventType = "unknown";
  if (source === "stripe") {
    eventId = payload.id as string;
    eventType = payload.type as string;
  } else if (source === "github") {
    eventId = req.headers.get("x-github-delivery") ?? eventId;
    eventType = req.headers.get("x-github-event") ?? "push";
  } else if (source === "docusign") {
    eventId = payload.envelopeId as string;
    eventType = payload.event as string;
  } else if (source === "apollo") {
    eventId = (payload.id as string) ?? eventId;
    eventType = "lead.created";
  }

  const { data: existing } = await supabase
    .from("webhook_events")
    .select("id,status")
    .eq("event_id", eventId)
    .maybeSingle();
  if (existing?.status === "processed")
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const { data: inserted, error } = await supabase
    .from("webhook_events")
    .upsert(
      {
        event_id: eventId,
        source,
        event_type: eventType,
        payload,
        status: "processing",
      },
      { onConflict: "event_id" },
    )
    .select("id")
    .single();
  if (error || !inserted) return new Response("DB error", { status: 500 });

  EdgeRuntime.waitUntil(dispatchAtlas(inserted.id, source, eventType, payload));

  return new Response(
    JSON.stringify({
      ok: true,
      id: inserted.id,
      source,
      event_type: eventType,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
