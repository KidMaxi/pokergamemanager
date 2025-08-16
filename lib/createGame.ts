import { getSupabaseBrowser } from "./supabase"

export async function createGameAndStoreId(name: string, point_to_cash_rate: number, sessionObj: any): Promise<void> {
  const supabase = getSupabaseBrowser()
  const { data: u } = await supabase.auth.getUser()

  if (!u?.user?.id) {
    throw new Error("Not signed in")
  }

  const { data, error } = await supabase
    .from("games")
    .insert({
      owner_id: u.user.id,
      name,
      point_to_cash_rate,
      status: "active",
    })
    .select("id")
    .single()

  if (error) {
    throw error
  }

  sessionObj.dbId = data.id // keep DB id on the local game object
}
