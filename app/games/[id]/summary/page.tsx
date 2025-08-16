import { getSupabaseBrowser } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default async function GameSummary({ params }: { params: { id: string } }) {
  const supabase = getSupabaseBrowser()
  const { data: rows, error } = await supabase
    .from("game_player_results")
    .select("profile_id, buyin_dollars, cashout_dollars, net_dollars, winner, profiles!inner(full_name)")
    .eq("game_id", params.id)
    .order("net_dollars", { ascending: false })

  if (error) throw error

  const winners = rows?.filter((r) => r.winner) || []
  const totals = rows?.reduce(
    (acc: any, r: any) => ({
      buy: (acc.buy ?? 0) + Number(r.buyin_dollars),
      cash: (acc.cash ?? 0) + Number(r.cashout_dollars),
      net: (acc.net ?? 0) + Number(r.net_dollars),
    }),
    {},
  ) || { buy: 0, cash: 0, net: 0 }

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Final Results</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Buy-in ($)</TableHead>
                <TableHead className="text-right">Cash-out ($)</TableHead>
                <TableHead className="text-right">Net ($)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows?.map((r: any) => (
                <TableRow key={r.profile_id} className={r.winner ? "bg-green-50 dark:bg-green-900/20" : ""}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <span>{r.profiles?.full_name ?? r.profile_id}</span>
                    {r.winner && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                        Winner
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{Number(r.buyin_dollars).toFixed(1)}</TableCell>
                  <TableCell className="text-right">{Number(r.cashout_dollars).toFixed(1)}</TableCell>
                  <TableCell
                    className={`text-right font-semibold ${Number(r.net_dollars) > 0 ? "text-green-600" : Number(r.net_dollars) < 0 ? "text-red-600" : ""}`}
                  >
                    {Number(r.net_dollars).toFixed(1)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Totals</TableCell>
                <TableCell className="text-right font-semibold">{totals.buy.toFixed(1)}</TableCell>
                <TableCell className="text-right font-semibold">{totals.cash.toFixed(1)}</TableCell>
                <TableCell className="text-right font-semibold">{totals.net.toFixed(1)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
