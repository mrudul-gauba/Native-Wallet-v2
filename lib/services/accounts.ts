import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountType = "CASH" | "CREDIT_CARD" | "BANK" | "SAVINGS";

export type Accounts = {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  user_id: string;
  is_default: boolean;
  created_at: string;
};

export async function getAccounts(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as Accounts[];
}
