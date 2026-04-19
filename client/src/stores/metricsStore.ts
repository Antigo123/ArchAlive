import { create } from 'zustand';

interface MetricPoint {
    time: number; // Simulation tick
    value: number;
}

interface MetricsState {
    latencyHistory: MetricPoint[];
    availabilityHistory: MetricPoint[];
    rpsHistory: MetricPoint[];
    lastRecordedTick: number;
    lastProcessed: number;
    lastDropped: number;
    lastGenerated: number;
    currentAvailability: number;
    currentRps: number;

    pushMetrics: (tick: number, stats: {
        avg_latency: number;
        total_processed: number;
        total_dropped: number;
        total_generated: number;
    }) => void;
    reset: () => void;
}

const MAX_HISTORY = 480; // 2 minutes at 4Hz

export const useMetricsStore = create<MetricsState>((set) => ({
    latencyHistory: [],
    availabilityHistory: [],
    rpsHistory: [],
    lastRecordedTick: 0,
    lastProcessed: 0,
    lastDropped: 0,
    lastGenerated: 0,
    currentAvailability: 100,
    currentRps: 0,

    pushMetrics: (tick, stats) => set((state) => {
        // Record 4 times per second (every 15 ticks)
        if (tick - state.lastRecordedTick < 15) {
            return state;
        }

        const intervalTicks = tick - state.lastRecordedTick;
        const intervalSeconds = intervalTicks / 60;

        const deltaProcessed = Math.max(0, stats.total_processed - state.lastProcessed);
        const deltaDropped = Math.max(0, stats.total_dropped - state.lastDropped);
        const deltaGenerated = Math.max(0, stats.total_generated - state.lastGenerated);
        const deltaTotal = deltaProcessed + deltaDropped;

        // During zero-traffic intervals, treat availability as 100% (no requests = no failures)
        let recentAvailability = 100;
        if (deltaTotal > 0) {
            recentAvailability = (deltaProcessed / deltaTotal) * 100;
        }

        // Apply Exponential Moving Average (20% new data, 80% history)
        // If it's drastically dipping (e.g 0%), it drops beautifully fast. If recovering, it crawls up smoothly.
        const smoothedAvailability = (recentAvailability * 0.2) + (state.currentAvailability * 0.8);

        const latencySeconds = (stats.avg_latency || 0) / 60;

        // Raw requests per second over this interval
        const rawRps = intervalSeconds > 0 ? deltaGenerated / intervalSeconds : 0;

        // Apply EMA to smooth out discrete packet spawning jitter (35% new, 65% history)
        const smoothedRps = state.currentRps === 0
            ? rawRps  // cold start: accept first real value immediately
            : (rawRps * 0.35) + (state.currentRps * 0.65);

        const newLatency = state.latencyHistory.slice(state.latencyHistory.length >= MAX_HISTORY ? 1 : 0);
        newLatency.push({ time: tick, value: latencySeconds });

        const newAvailability = state.availabilityHistory.slice(state.availabilityHistory.length >= MAX_HISTORY ? 1 : 0);
        newAvailability.push({ time: tick, value: smoothedAvailability });

        const newRps = state.rpsHistory.slice(state.rpsHistory.length >= MAX_HISTORY ? 1 : 0);
        newRps.push({ time: tick, value: smoothedRps });

        return {
            latencyHistory: newLatency,
            availabilityHistory: newAvailability,
            rpsHistory: newRps,
            lastRecordedTick: tick,
            lastProcessed: stats.total_processed,
            lastDropped: stats.total_dropped,
            lastGenerated: stats.total_generated,
            currentAvailability: smoothedAvailability,
            currentRps: smoothedRps,
        };
    }),

    reset: () => set({
        latencyHistory: [],
        availabilityHistory: [],
        rpsHistory: [],
        lastRecordedTick: 0,
        lastProcessed: 0,
        lastDropped: 0,
        lastGenerated: 0,
        currentAvailability: 100,
        currentRps: 0,
    }),
}));
