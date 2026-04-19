import { useState } from 'react';
import { Activity, CheckCircle, Clock, AlertTriangle, RotateCcw, ChevronDown, ChevronUp, Zap, BarChart2 } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { useMetricsStore } from '../stores/metricsStore';

interface GlobalStats {
    total_generated: number;
    total_processed: number;
    total_dropped: number;
    avg_latency: number;
}

interface DashboardProps {
    stats: GlobalStats;
}

export function Dashboard({ stats }: DashboardProps) {
    const latencyHistory = useMetricsStore(s => s.latencyHistory);
    const availabilityHistory = useMetricsStore(s => s.availabilityHistory);
    const rpsHistory = useMetricsStore(s => s.rpsHistory);
    const currentAvailability = useMetricsStore(s => s.currentAvailability);
    const currentRps = useMetricsStore(s => s.currentRps);
    const reset = useMetricsStore(s => s.reset);
    const [collapsed, setCollapsed] = useState(window.innerWidth < 768);
    const [showCharts, setShowCharts] = useState(false);
    const availability = currentAvailability ?? 100;

    const avgLatencyTicks = stats.avg_latency || 0;
    const avgLatencySeconds = avgLatencyTicks / 60;

    const displayRps = currentRps;

    // Availability Color
    let statusColor = "text-green-600";
    let StatusIcon = CheckCircle;
    if (availability < 99) {
        statusColor = "text-yellow-600";
        StatusIcon = AlertTriangle;
    }
    if (availability < 95) {
        statusColor = "text-red-600";
        StatusIcon = AlertTriangle;
    }

    return (
        <div className={`absolute top-2 right-2 md:top-4 md:right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-100 z-[120] transition-all ${collapsed ? 'w-auto' : 'w-48 md:w-64 max-[400px]:w-40'}`}>
            {/* Header - always visible */}
            <div className={`flex items-center justify-between ${collapsed ? 'p-2 max-[400px]:p-1.5' : 'px-3 py-2 max-[400px]:px-2 max-[400px]:py-1.5'}`}>
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 transition-colors min-w-[28px] min-h-[28px]"
                >
                    <Activity size={12} />
                    {!collapsed && <span className="text-[10px] max-[400px]:text-[8px] font-bold uppercase tracking-widest">Metrics</span>}
                    {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} className="ml-1" />}
                </button>
                {!collapsed && (
                    <div className="flex items-center gap-0.5">
                        <button
                            onClick={() => setShowCharts(!showCharts)}
                            className={`flex items-center justify-center w-6 h-6 rounded-lg transition-colors ${showCharts ? 'text-blue-500 bg-blue-50 hover:bg-blue-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                            title="Toggle Charts"
                        >
                            <BarChart2 size={13} />
                        </button>
                        <button
                            onClick={reset}
                            className="flex items-center justify-center w-6 h-6 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Reset Metrics"
                        >
                            <RotateCcw size={13} />
                        </button>
                    </div>
                )}
            </div>

            {/* Collapsible body */}
            {!collapsed && (
                <div className="px-3 pb-3 max-[400px]:px-2 max-[400px]:pb-2">
                    <div className="flex flex-col gap-2">
                        {/* Availability - full width */}
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] max-[400px]:text-[8px] text-slate-500 font-semibold uppercase tracking-wider">Availability</span>
                            <div className={`flex items-center gap-1 text-lg max-[400px]:text-base font-bold ${statusColor}`}>
                                <StatusIcon size={14} className="max-[400px]:w-3 max-[400px]:h-3" />
                                <span className="tabular-nums tracking-tight">{availability.toFixed(2)}%</span>
                            </div>
                        </div>

                        {/* Latency + Throughput side by side */}
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-50">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] max-[400px]:text-[8px] text-slate-400 font-semibold uppercase tracking-wider">Avg Latency</span>
                                <div className="flex items-center gap-1 text-sm max-[400px]:text-xs font-bold text-blue-600">
                                    <Clock size={12} className="max-[400px]:w-2.5 max-[400px]:h-2.5" />
                                    <span className="tabular-nums">{avgLatencySeconds.toFixed(2)}s</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] max-[400px]:text-[8px] text-slate-400 font-semibold uppercase tracking-wider">Throughput</span>
                                <div className="flex items-center gap-1 text-sm max-[400px]:text-xs font-bold text-orange-500">
                                    <Zap size={12} className="max-[400px]:w-2.5 max-[400px]:h-2.5" />
                                    <span className="tabular-nums">{displayRps.toFixed(1)} rps</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Charts Section */}
                    {showCharts && <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
                        {/* Latency Chart */}
                        <div>
                            <span className="text-[9px] text-slate-400 font-semibold uppercase">Latency (last 2min)</span>
                            <div className="mt-0.5">
                                <ResponsiveContainer width="100%" height={48}>
                                    <AreaChart data={latencyHistory}>
                                        <defs>
                                            <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <YAxis hide domain={[0, 'auto']} />
                                        <Tooltip
                                            formatter={(value) => [`${(Number(value) || 0).toFixed(3)}s`, 'Latency']}
                                            labelFormatter={() => ''}
                                            contentStyle={{ fontSize: 10, padding: '2px 6px' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#3b82f6"
                                            strokeWidth={1.5}
                                            fill="url(#latencyGradient)"
                                            isAnimationActive={false}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Availability Chart */}
                        <div>
                            <span className="text-[9px] text-slate-400 font-semibold uppercase">Availability (last 2min)</span>
                            <div className="mt-0.5">
                                <ResponsiveContainer width="100%" height={48}>
                                    <AreaChart data={availabilityHistory}>
                                        <defs>
                                            <linearGradient id="availabilityGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <YAxis hide domain={[0, 100]} />
                                        <Tooltip
                                            formatter={(value) => [`${(Number(value) || 0).toFixed(2)}%`, 'Availability']}
                                            labelFormatter={() => ''}
                                            contentStyle={{ fontSize: 10, padding: '2px 6px' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#22c55e"
                                            strokeWidth={1.5}
                                            fill="url(#availabilityGradient)"
                                            isAnimationActive={false}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* RPS Chart */}
                        <div>
                            <span className="text-[9px] text-slate-400 font-semibold uppercase">Throughput (last 2min)</span>
                            <div className="mt-0.5">
                                <ResponsiveContainer width="100%" height={48}>
                                    <AreaChart data={rpsHistory}>
                                        <defs>
                                            <linearGradient id="rpsGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <YAxis hide domain={[0, 'auto']} />
                                        <Tooltip
                                            formatter={(value) => [`${(Number(value) || 0).toFixed(1)} req/s`, 'Throughput']}
                                            labelFormatter={() => ''}
                                            contentStyle={{ fontSize: 10, padding: '2px 6px' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#f97316"
                                            strokeWidth={1.5}
                                            fill="url(#rpsGradient)"
                                            isAnimationActive={false}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>}
                </div>
            )}
        </div>
    );
}
