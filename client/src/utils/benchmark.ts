/**
 * ArchAlive Performance Benchmark Utilities
 * 
 * Usage:
 * 1. Import in Editor.tsx or run directly in DevTools
 * 2. Call runAllBenchmarks(sim, wasmMemory) 
 * 3. Compare results before/after optimizations
 */

import type { Simulation } from 'simulation';

export interface BenchmarkResults {
    tickMs: number;
    ticksPerSecond: number;
    bufferReadMs: number;
    statusReadMs: number;
    activePackets: number;
    frameTimingP50?: number;
    frameTimingP95?: number;
    frameTimingP99?: number;
}

/**
 * Run comprehensive benchmarks on the simulation
 */
export function runAllBenchmarks(
    sim: Simulation,
    wasmMemory: WebAssembly.Memory,
    iterations: number = 1000
): BenchmarkResults {
    console.log('\n🚀 Starting ArchAlive Performance Benchmarks...\n');

    const results: BenchmarkResults = {
        tickMs: 0,
        ticksPerSecond: 0,
        bufferReadMs: 0,
        statusReadMs: 0,
        activePackets: 0,
    };

    // 1. Pure tick performance
    console.log(`Running ${iterations} tick iterations...`);
    const tickStart = performance.now();
    for (let i = 0; i < iterations; i++) {
        sim.tick();
    }
    const tickElapsed = performance.now() - tickStart;
    results.tickMs = tickElapsed / iterations;
    results.ticksPerSecond = 1000 / results.tickMs;

    // 2. Get active packet count
    const simAny = sim as any;
    results.activePackets = simAny.get_packet_buffer_len?.() / 9 || 0;

    // 3. Packet buffer read performance
    const bufferIterations = 1000;
    const bufferStart = performance.now();
    for (let i = 0; i < bufferIterations; i++) {
        const ptr = simAny.get_packet_buffer_ptr();
        const len = simAny.get_packet_buffer_len();
        if (len > 0) {
            const buffer = new Float32Array(wasmMemory.buffer, ptr, len);
            // Simulate actual read (force memory access)
            let sum = 0;
            for (let j = 0; j < Math.min(len, 100); j++) sum += buffer[j];
        }
    }
    results.bufferReadMs = (performance.now() - bufferStart) / bufferIterations;

    // 4. Node status buffer read performance
    const statusIterations = 1000;
    const statusStart = performance.now();
    for (let i = 0; i < statusIterations; i++) {
        const ptr = simAny.get_node_status_buffer_ptr();
        const len = simAny.get_node_status_buffer_len();
        if (len > 0) {
            const buffer = new Float32Array(wasmMemory.buffer, ptr, len);
            let sum = 0;
            for (let j = 0; j < len; j++) sum += buffer[j];
        }
    }
    results.statusReadMs = (performance.now() - statusStart) / statusIterations;

    // Print results
    console.log('\n═══════════════════════════════════════════');
    console.log('       ARCHALIVE BENCHMARK RESULTS         ');
    console.log('═══════════════════════════════════════════');
    console.log(`  Tick Performance:`);
    console.log(`    Per tick:       ${results.tickMs.toFixed(4)} ms`);
    console.log(`    Ticks/second:   ${results.ticksPerSecond.toFixed(0)}`);
    console.log(`    Active packets: ${results.activePackets}`);
    console.log('');
    console.log(`  Buffer Read Performance:`);
    console.log(`    Packet buffer:  ${results.bufferReadMs.toFixed(4)} ms`);
    console.log(`    Status buffer:  ${results.statusReadMs.toFixed(4)} ms`);
    console.log('═══════════════════════════════════════════\n');

    return results;
}

/**
 * Measure frame timing over a duration
 */
export function measureFrameTiming(durationMs: number = 5000): Promise<{
    avgFps: number;
    p50: number;
    p95: number;
    p99: number;
    droppedFrames: number;
}> {
    return new Promise((resolve) => {
        const frameTimes: number[] = [];
        let lastTime = performance.now();
        const startTime = lastTime;

        function frame(time: number) {
            const delta = time - lastTime;
            lastTime = time;
            frameTimes.push(delta);

            if (time - startTime < durationMs) {
                requestAnimationFrame(frame);
            } else {
                // Analyze
                const sorted = [...frameTimes].sort((a, b) => a - b);
                const avg = frameTimes.reduce((a, b) => a + b) / frameTimes.length;
                const p50 = sorted[Math.floor(sorted.length * 0.5)];
                const p95 = sorted[Math.floor(sorted.length * 0.95)];
                const p99 = sorted[Math.floor(sorted.length * 0.99)];
                const droppedFrames = frameTimes.filter(t => t > 33.33).length;

                console.log('\n═══════════════════════════════════════════');
                console.log('         FRAME TIMING RESULTS              ');
                console.log('═══════════════════════════════════════════');
                console.log(`  Frames measured: ${frameTimes.length}`);
                console.log(`  Average FPS:     ${(1000 / avg).toFixed(1)}`);
                console.log(`  P50 frame time:  ${p50.toFixed(2)} ms`);
                console.log(`  P95 frame time:  ${p95.toFixed(2)} ms`);
                console.log(`  P99 frame time:  ${p99.toFixed(2)} ms`);
                console.log(`  Dropped frames:  ${droppedFrames} (>33ms)`);
                console.log('═══════════════════════════════════════════\n');

                resolve({
                    avgFps: 1000 / avg,
                    p50,
                    p95,
                    p99,
                    droppedFrames,
                });
            }
        }

        requestAnimationFrame(frame);
    });
}

/**
 * Quick benchmark - paste-friendly for DevTools
 */
export function quickBenchmark(sim: any, iterations: number = 1000): void {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) sim.tick();
    const elapsed = performance.now() - start;
    console.log(`⚡ ${iterations} ticks in ${elapsed.toFixed(2)}ms (${(elapsed / iterations).toFixed(4)}ms/tick)`);
}

// Expose to window for DevTools access
if (typeof window !== 'undefined') {
    (window as any).ArchAliveBenchmark = {
        runAllBenchmarks,
        measureFrameTiming,
        quickBenchmark,
    };
}
