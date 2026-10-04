import { createClient } from "@supabase/supabase-js";
import { verifyWebhook } from "npm:@clerk/backend/webhooks";

Deno.serve(async (req) => {
  // Clerk webhooks should only use POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
    });
  }

  try {
    // Verify that this request genuinely came from Clerk
    const evt = await verifyWebhook(req);

    // We only care about account deletion
    if (evt.type !== "user.deleted") {
      return new Response("Event ignored", {
        status: 200,
      });
    }

    const clerkId = evt.data.id;

    if (!clerkId) {
      console.error("user.deleted webhook is missing Clerk user ID");

      return new Response("Missing Clerk user ID", {
        status: 400,
      });
    }

    // Get Supabase's privileged server-side key
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      secretKeys.default,
    );

    // Delete the user from Supabase.
    // ON DELETE CASCADE will remove:
    // accounts, transactions and budgets automatically.
    const { error } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("clerk_id", clerkId);

    if (error) {
      console.error("Supabase account deletion failed:", error);

      return new Response("Database cleanup failed", {
        status: 500,
      });
    }

    console.log(`Successfully deleted Supabase data for ${clerkId}`);

    return new Response("Account cleanup successful", {
      status: 200,
    });
  } catch (error) {
    console.error("Clerk webhook verification/processing failed:", error);

    return new Response("Webhook verification failed", {
      status: 400,
    });
  }
});
