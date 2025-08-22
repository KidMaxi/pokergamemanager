import { createClient } from "@/lib/supabase-server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { computeSettlements } from "@/components/summary/SettlementAlgo"
import { Trophy, TrendingDown, Minus } from "lucide-react"

export default async function GameSummary({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from("game_player_results")
    .select("profile_id, buyin_dollars, cashout_dollars, net_dollars, winner, profiles!inner(full_name)")
    .eq("game_id", params.id)
    .order("net_dollars", { ascending: false })

  if (error) throw error
  if (!rows?.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <div className="text-6xl mb-4">🎲</div>
            <h2 className="text-xl font-bold mb-2">No Results Found</h2>
            <p className="text-slate-600">
              No results saved for this game. If you just finalized, please refresh the page.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const players = rows.map((r: any) => ({
    id: r.profile_id,
    name: r.profiles?.full_name ?? r.profile_id,
    net: Number(r.net_dollars), // dollars with one decimal
  }))
  const transfers = computeSettlements(players)

  const totals = rows.reduce(
    (acc: any, r: any) => ({
      buy: acc.buy + Number(r.buyin_dollars),
      cash: acc.cash + Number(r.cashout_dollars),
      net: acc.net + Number(r.net_dollars),
    }),
    { buy: 0, cash: 0, net: 0 },
  )

  const winners = rows.filter((r: any) => Number(r.net_dollars) > 0)
  const losers = rows.filter((r: any) => Number(r.net_dollars) < 0)
  const breakEven = rows.filter((r: any) => Number(r.net_dollars) === 0)
  const biggestWinner = winners.length > 0 ? winners[0] : null
  const biggestLoser = losers.length > 0 ? losers[losers.length - 1] : null

  return (
    <div
      className="min-h-screen text-white"
      style={{
        backgroundImage: "url('/images/poker-table-background.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
        backgroundColor: "#0a0f1a",
      }}
    >
      <div className="container mx-auto p-6 max-w-6xl space-y-8">
        <Card className="bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-md border-2 border-green-500/50 shadow-2xl">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent flex items-center justify-center gap-4">
              <Trophy className="text-yellow-500" size={48} />
              Game Complete!
            </CardTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-blue-600/80 backdrop-blur-sm rounded-xl p-4 text-center border border-blue-400/50">
                <div className="text-2xl font-bold">{rows.length}</div>
                <div className="text-xs text-blue-200">Players</div>
              </div>
              <div className="bg-green-600/80 backdrop-blur-sm rounded-xl p-4 text-center border border-green-400/50">
                <div className="text-2xl font-bold">${totals.buy.toFixed(1)}</div>
                <div className="text-xs text-green-200">Total Pot</div>
              </div>
              <div className="bg-yellow-600/80 backdrop-blur-sm rounded-xl p-4 text-center border border-yellow-400/50">
                <div className="text-2xl font-bold">{winners.length}</div>
                <div className="text-xs text-yellow-200">Winners</div>
              </div>
              <div className="bg-red-600/80 backdrop-blur-sm rounded-xl p-4 text-center border border-red-400/50">
                <div className="text-2xl font-bold">{losers.length}</div>
                <div className="text-xs text-red-200">Losers</div>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="bg-gradient-to-br from-green-900/90 to-emerald-900/90 backdrop-blur-md border-2 border-green-500/50 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-green-300 flex items-center gap-3">
              💰 Payment Settlement
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transfers.length === 0 ? (
              <div className="text-center p-12 bg-gradient-to-br from-green-800/60 to-emerald-800/60 rounded-2xl border border-green-500/50">
                <div className="text-6xl mb-4">🎉</div>
                <p className="text-green-200 text-2xl font-bold mb-2">Perfect Balance!</p>
                <p className="text-green-300 text-lg">No payments needed - everyone broke even!</p>
              </div>
            ) : (
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-white mb-4">Who Pays Whom:</h3>
                <div className="space-y-4">
                  {transfers.map((transfer, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-6 bg-gradient-to-r from-slate-800/90 to-slate-900/90 rounded-xl border border-slate-600/50 hover:border-green-500/70 transition-all duration-300"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-full w-12 h-12 flex items-center justify-center text-lg font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <span className="font-bold text-red-300 text-xl">
                            {players.find((p) => p.id === transfer.fromId)?.name}
                          </span>
                          <span className="mx-4 text-green-400">→</span>
                          <span className="font-bold text-green-300 text-xl">
                            {players.find((p) => p.id === transfer.toId)?.name}
                          </span>
                        </div>
                      </div>
                      <div className="bg-gradient-to-r from-green-600 to-emerald-500 text-white px-6 py-3 rounded-lg font-bold text-2xl">
                        ${transfer.amount.toFixed(1)}
                      </div>
                    </div>
                  ))}
                </div>
                {Math.abs(totals.net) > 0.05 && (
                  <div className="mt-4 p-4 bg-red-900/60 border border-red-500/50 rounded-lg">
                    <p className="text-red-300 font-semibold">
                      ⚠️ Warning: Totals don't sum to zero (${totals.net.toFixed(1)} difference). Check buy-ins/cash-outs
                      for accuracy.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-md border-2 border-slate-600/50 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-white flex items-center gap-3">
              <Trophy className="text-yellow-500" />
              Player Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Winners Section */}
            {winners.length > 0 && (
              <div>
                <h3 className="text-2xl font-bold text-green-400 mb-4 flex items-center gap-2">
                  <Trophy className="text-yellow-500" size={24} />
                  Winners ({winners.length})
                </h3>
                <div className="space-y-3">
                  {winners.map((player: any, index: number) => (
                    <div
                      key={player.profile_id}
                      className="flex items-center justify-between p-4 bg-gradient-to-r from-green-900/60 to-emerald-900/60 rounded-xl border border-green-500/50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white font-bold">
                          {player.profiles?.full_name?.charAt(0).toUpperCase() || "?"}
                        </div>
                        <div>
                          <span className="font-bold text-white text-lg">{player.profiles?.full_name}</span>
                          {index === 0 && (
                            <span className="ml-2 text-xs px-2 py-1 bg-yellow-500 text-black rounded-full">
                              🏆 Biggest Winner
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-300 text-xl">
                          +${Number(player.net_dollars).toFixed(1)}
                        </div>
                        <div className="text-green-400 text-sm">Profit</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Losers Section */}
            {losers.length > 0 && (
              <div>
                <h3 className="text-2xl font-bold text-red-400 mb-4 flex items-center gap-2">
                  <TrendingDown size={24} />
                  Losers ({losers.length})
                </h3>
                <div className="space-y-3">
                  {losers.map((player: any) => (
                    <div
                      key={player.profile_id}
                      className="flex items-center justify-between p-4 bg-gradient-to-r from-red-900/60 to-red-800/60 rounded-xl border border-red-500/50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center text-white font-bold">
                          {player.profiles?.full_name?.charAt(0).toUpperCase() || "?"}
                        </div>
                        <span className="font-bold text-white text-lg">{player.profiles?.full_name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-red-300 text-xl">${Number(player.net_dollars).toFixed(1)}</div>
                        <div className="text-red-400 text-sm">Loss</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Break-even Section */}
            {breakEven.length > 0 && (
              <div>
                <h3 className="text-2xl font-bold text-yellow-400 mb-4 flex items-center gap-2">
                  <Minus size={24} />
                  Break-even ({breakEven.length})
                </h3>
                <div className="space-y-3">
                  {breakEven.map((player: any) => (
                    <div
                      key={player.profile_id}
                      className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-900/60 to-yellow-800/60 rounded-xl border border-yellow-500/50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold">
                          {player.profiles?.full_name?.charAt(0).toUpperCase() || "?"}
                        </div>
                        <span className="font-bold text-white text-lg">{player.profiles?.full_name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-yellow-300 text-xl">$0.0</div>
                        <div className="text-yellow-400 text-sm">Even</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-md border-2 border-slate-600/50 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-white">Detailed Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-600">
                  <TableHead className="text-slate-300">Player</TableHead>
                  <TableHead className="text-right text-slate-300">Buy-in ($)</TableHead>
                  <TableHead className="text-right text-slate-300">Cash-out ($)</TableHead>
                  <TableHead className="text-right text-slate-300">Net ($)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow
                    key={r.profile_id}
                    className={`border-slate-700 ${r.winner ? "bg-green-900/20" : Number(r.net_dollars) < 0 ? "bg-red-900/20" : "bg-yellow-900/20"}`}
                  >
                    <TableCell className="font-medium text-white flex items-center gap-2">
                      <span>{r.profiles?.full_name ?? r.profile_id}</span>
                      {r.winner && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-600 text-white">Winner</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-slate-300">{Number(r.buyin_dollars).toFixed(1)}</TableCell>
                    <TableCell className="text-right text-slate-300">{Number(r.cashout_dollars).toFixed(1)}</TableCell>
                    <TableCell
                      className={`text-right font-semibold ${Number(r.net_dollars) > 0 ? "text-green-400" : Number(r.net_dollars) < 0 ? "text-red-400" : "text-yellow-400"}`}
                    >
                      {Number(r.net_dollars).toFixed(1)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-slate-500">
                  <TableCell className="font-semibold text-white">Totals</TableCell>
                  <TableCell className="text-right font-semibold text-slate-300">{totals.buy.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-300">{totals.cash.toFixed(1)}</TableCell>
                  <TableCell
                    className={`text-right font-semibold ${Math.abs(totals.net) > 0.05 ? "text-red-400" : "text-slate-300"}`}
                  >
                    {totals.net.toFixed(1)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
