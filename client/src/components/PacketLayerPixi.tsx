import { useEffect, useRef, memo } from 'react';
import { Application, useTick, useApplication } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { useStore, type Node } from '@xyflow/react';

interface PacketHoverData {
    sx: number; // screen x
    sy: number; // screen y
    label: string;
}

interface PacketLayerProps {
    nodesMapRef: React.RefObject<Map<string, Node>>;
    // Worker-provided data refs
    packetBufferRef: React.RefObject<Float32Array | null>;
    packetCountRef: React.RefObject<number>;
    nodeIdToIndexRef: React.RefObject<Map<string, number>>;
    width?: number;
    height?: number;
}

// Bezier control points structure (cached per edge)
interface BezierControlPoints {
    sx: number; sy: number;  // Start point
    cp1x: number; cp1y: number;  // Control point 1
    cp2x: number; cp2y: number;  // Control point 2
    tx: number; ty: number;  // End point
}

// Mirror of Rust get_handle_val: returns the handle's position index for Pixi rendering
// Streams/deps → positive (right side), endpoints → negative (left side), unknown → 0
function getHandleVal(nodeData: any, handleId: string | null | undefined): number {
    if (!handleId) return 0;
    const streams = (nodeData?.streams as any[]) || [];
    const deps = (nodeData?.dependencies as any[]) || [];
    const eps = (nodeData?.endpoints as any[]) || [];
    const si = streams.findIndex((s: any) => s.id === handleId);
    if (si >= 0) return si + 1;
    const di = deps.findIndex((d: any) => d.id === handleId);
    if (di >= 0) return di + 1;
    const ei = eps.findIndex((e: any) => e.id === handleId);
    if (ei >= 0) return -(ei + 1);
    return 0;
}

// PERFORMANCE: Compute control points (expensive - should be cached)
function computeBezierControlPoints(
    sx: number, sy: number, tx: number, ty: number,
    sourcePos: string = 'right', targetPos: string = 'left'
): BezierControlPoints {
    const xDist = Math.abs(tx - sx);
    const yDist = Math.abs(ty - sy);

    const isHorizontal = (sourcePos === 'left' || sourcePos === 'right');
    const offset = isHorizontal ? Math.max(xDist * 0.5, 25) : Math.max(yDist * 0.5, 25);

    let cp1x = sx, cp1y = sy;
    let cp2x = tx, cp2y = ty;

    switch (sourcePos) {
        case 'right': cp1x += offset; break;
        case 'left': cp1x -= offset; break;
        case 'bottom': cp1y += offset; break;
        case 'top': cp1y -= offset; break;
    }

    switch (targetPos) {
        case 'right': cp2x += offset; break;
        case 'left': cp2x -= offset; break;
        case 'bottom': cp2y += offset; break;
        case 'top': cp2y -= offset; break;
    }

    return { sx, sy, cp1x, cp1y, cp2x, cp2y, tx, ty };
}

// PERFORMANCE: Fast interpolation along cached Bezier curve  
function interpolateBezier(t: number, cp: BezierControlPoints): { x: number; y: number } {
    const c0 = (1 - t) ** 3;
    const c1 = 3 * ((1 - t) ** 2) * t;
    const c2 = 3 * (1 - t) * (t ** 2);
    const c3 = t ** 3;

    return {
        x: c0 * cp.sx + c1 * cp.cp1x + c2 * cp.cp2x + c3 * cp.tx,
        y: c0 * cp.sy + c1 * cp.cp1y + c2 * cp.cp2y + c3 * cp.ty
    };
}

interface PixiAppInternalProps {
    transformRef: React.RefObject<[number, number, number]>;
    packetScreenPositionsRef: React.MutableRefObject<PacketHoverData[]>;
    canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}

const PixiApp = (props: PacketLayerProps & PixiAppInternalProps) => {
    const pixiContext = useApplication() as any;
    const app = pixiContext?.app || pixiContext;

    if (!app) return null;

    // ParticleContainer for GPU-batched sprite rendering (much faster than regular Container)
    const particleContainerRef = useRef<PIXI.Container | null>(null);
    // Separate container for text labels (ParticleContainer doesn't support Text)
    const textContainerRef = useRef<PIXI.Container>(new PIXI.Container());

    // Pool
    const spritesRef = useRef<PIXI.Sprite[]>([]);
    const textPoolRef = useRef<PIXI.Text[]>([]); // Pool for error code labels

    // Node Position Cache: Index -> [x, y, w, h, type_int]
    const nodeCache = useRef<Float32Array>(new Float32Array(2000 * 5));

    // PERFORMANCE: Bezier control points cache
    // Key: "sourceIdx|targetIdx|sVal|tVal" -> cached control points
    const bezierCacheRef = useRef<Map<string, BezierControlPoints>>(new Map());
    // Exact edge positions from ReactFlow internal store - these take priority over heuristics
    const edgePosMapRef = useRef<Map<string, BezierControlPoints>>(new Map());
    // Track node positions to invalidate Bezier cache when nodes move
    const nodePosVersionRef = useRef(0);
    const lastNodePosVersionRef = useRef(-1);

    // Get exact edge positions from the ReactFlow internal store
    const rfEdges = useStore(s => s.edges);

    // Rebuild exact edge position map whenever edges or node mapping changes
    useEffect(() => {
        const map = new Map<string, BezierControlPoints>();
        const nodesMap = props.nodesMapRef.current;
        const nodeIdToIndex = props.nodeIdToIndexRef.current;
        if (!nodesMap || !nodeIdToIndex) { edgePosMapRef.current = map; return; }

        for (const edge of rfEdges) {
            const e = edge as any;
            // ReactFlow populates sourceX/sourceY/targetX/targetY on internal edges
            if (e.sourceX == null || e.targetX == null) continue;

            const sIdx = nodeIdToIndex.get(edge.source) ?? -1;
            const tIdx = nodeIdToIndex.get(edge.target) ?? -1;
            if (sIdx < 0 || tIdx < 0) continue;

            const srcData = nodesMap.get(edge.source)?.data;
            const tgtData = nodesMap.get(edge.target)?.data;

            const sVal = getHandleVal(srcData, edge.sourceHandle);
            const tVal = getHandleVal(tgtData, edge.targetHandle);

            const cp = computeBezierControlPoints(
                e.sourceX, e.sourceY, e.targetX, e.targetY,
                e.sourcePosition || 'right', e.targetPosition || 'left'
            );
            map.set(`${sIdx}|${tIdx}|${sVal}|${tVal}`, cp);
        }

        edgePosMapRef.current = map;
        bezierCacheRef.current.clear();
        nodePosVersionRef.current++;
    }, [rfEdges]); // eslint-disable-line react-hooks/exhaustive-deps

    // Textures State
    const texturesRef = useRef<{ blue: PIXI.Texture, green: PIXI.Texture, orange: PIXI.Texture, red: PIXI.Texture, yellow: PIXI.Texture } | null>(null);

    // Reverse index lookup: sim index -> node label / node object (for hover tooltip)
    const indexToNodeNameRef = useRef<Map<number, string>>(new Map());
    const indexToNodeRef = useRef<Map<number, Node>>(new Map());

    useEffect(() => {
        if (!app?.renderer) return;
        const canvas = app.canvas || app.view;
        if (canvas) props.canvasRef.current = canvas as HTMLCanvasElement;
    }, [app, app?.renderer]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!app?.renderer) return;
        // Create ParticleContainer with optimized settings
        // Note: ParticleContainer in PixiJS v8 may have different API
        const particleContainer = new PIXI.Container();
        particleContainer.sortableChildren = false; // Disable sorting for performance
        particleContainerRef.current = particleContainer;

        app.stage.addChild(particleContainer);
        app.stage.addChild(textContainerRef.current);

        const generateTextures = () => {
            // Helper to create texture from canvas
            const createTexture = (drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, width: number, height: number) => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) drawFn(ctx, width, height);
                return PIXI.Texture.from(canvas);
            };

            // 1. Blue Circle
            const blue = createTexture((ctx, w, h) => {
                ctx.beginPath();
                ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
                ctx.fillStyle = '#3b82f6';
                ctx.fill();
                ctx.strokeStyle = '#1e3a8a'; // Dark Blue
                ctx.lineWidth = 12; // Scaled down in sprite
                ctx.stroke();
            }, 128, 128);

            // 2. Green Circle
            const green = createTexture((ctx, w, h) => {
                ctx.beginPath();
                ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
                ctx.fillStyle = '#22c55e';
                ctx.fill();
                ctx.strokeStyle = '#14532d'; // Dark Green
                ctx.lineWidth = 12;
                ctx.stroke();
            }, 128, 128);

            // 3. Orange Circle (Write)
            const orange = createTexture((ctx, w, h) => {
                ctx.beginPath();
                ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
                ctx.fillStyle = '#f97316';
                ctx.fill();
                ctx.strokeStyle = '#7c2d12'; // Dark Orange
                ctx.lineWidth = 12;
                ctx.stroke();
            }, 128, 128);

            // 4. Red Circle (Dropped)
            const red = createTexture((ctx, w, h) => {
                ctx.beginPath();
                ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
                ctx.fillStyle = '#ef4444';
                ctx.fill();
                ctx.strokeStyle = '#7f1d1d'; // Dark Red
                ctx.lineWidth = 12;
                ctx.stroke();
            }, 128, 128);

            // 5. Yellow Circle (Retry)
            const yellow = createTexture((ctx, w, h) => {
                ctx.beginPath();
                ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
                ctx.fillStyle = '#fbbf24'; // Amber-400
                ctx.fill();
                ctx.strokeStyle = '#000000'; // Black
                ctx.lineWidth = 12;
                ctx.stroke();
            }, 128, 128);

            texturesRef.current = { blue, green, orange, red, yellow };

            // Initialize Pool - add all sprites to particle container
            const pool: PIXI.Sprite[] = [];
            for (let i = 0; i < 20000; i++) {
                const s = new PIXI.Sprite(blue); // Default texture
                s.width = 14; s.height = 14;
                s.anchor.set(0.5);
                s.visible = false;
                particleContainerRef.current!.addChild(s);
                pool.push(s);
            }
            spritesRef.current = pool;

            // Initialize Text Pool for Error Codes
            const textPool: PIXI.Text[] = [];
            const errorTextStyle = new PIXI.TextStyle({
                fontFamily: 'Arial',
                fontSize: 10,
                fontWeight: 'bold',
                fill: '#dc2626',
                stroke: { color: '#ffffff', width: 2 },
            });
            for (let i = 0; i < 500; i++) {
                const t = new PIXI.Text({ text: '', style: errorTextStyle });
                t.anchor.set(0.5, 1);
                t.visible = false;
                textContainerRef.current.addChild(t);
                textPool.push(t);
            }
            textPoolRef.current = textPool;
        };

        generateTextures();

        return () => {
            if (particleContainerRef.current) {
                app.stage?.removeChild(particleContainerRef.current);
                particleContainerRef.current.destroy({ children: true });
            }
            app.stage?.removeChild(textContainerRef.current);
            textContainerRef.current.destroy({ children: true });
        }
    }, [app, app?.renderer]);

    // Resize renderer when dimensions change
    useEffect(() => {
        if (app && app.renderer && props.width && props.height) {
            app.renderer.resize(props.width, props.height);
        }
    }, [app, props.width, props.height]);

    // Handle Transform (Zoom/Pan) - apply to both containers
    useTick(() => {
        const [x, y, zoom] = props.transformRef.current ?? [0, 0, 1];
        if (particleContainerRef.current) {
            particleContainerRef.current.position.set(x, y);
            particleContainerRef.current.scale.set(zoom);
        }
        textContainerRef.current.position.set(x, y);
        textContainerRef.current.scale.set(zoom);
    });

    // Index Cache
    const indexCache = useRef<Map<string, number>>(new Map());

    // Track last node count AND last nodeIdToIndex Map object reference.
    // When either changes (topology rebuild or updated index mapping from worker),
    // the cached node→WASM-index entries must be discarded because ClearEdges
    // re-assigns indices from scratch.
    const lastNodeCountRef = useRef(0);
    const lastNodeIdToIndexMapRef = useRef<Map<string, number> | null>(null);

    // PERFORMANCE: Frame skipping - update packets every Nth frame to reduce CPU load
    const frameCountRef = useRef(0);
    const FRAME_SKIP = 1; // Update packets every frame (60fps)

    useTick((_delta) => {
        const nodesMap = props.nodesMapRef.current;
        if (!nodesMap) return;

        // Clear index cache when node count changes OR when nodeIdToIndexRef gets a new
        // Map object (i.e. worker sent an updated mapping after topology rebuild).
        // ClearEdges in the WASM re-assigns all node indices from scratch, so any
        // previously cached node→index entries are stale and must be evicted.
        const currentIdxMap = props.nodeIdToIndexRef.current;
        if (nodesMap.size !== lastNodeCountRef.current || currentIdxMap !== lastNodeIdToIndexMapRef.current) {
            indexCache.current.clear();
            indexToNodeNameRef.current.clear();
            indexToNodeRef.current.clear();
            lastNodeCountRef.current = nodesMap.size;
            lastNodeIdToIndexMapRef.current = currentIdxMap;
        }

        // Ensure textures loaded
        const textures = texturesRef.current;
        if (!textures) return;

        // Frame skipping for expensive packet updates
        frameCountRef.current++;
        const shouldUpdatePackets = frameCountRef.current % FRAME_SKIP === 0;

        // 1. Update Node Cache (Fast) - also detect position changes
        let positionsChanged = false;
        nodesMap.forEach(n => {
            let idx = indexCache.current.get(n.id) ?? -1;
            if (idx === -1) {
                // Get index from worker-provided mapping
                idx = props.nodeIdToIndexRef.current?.get(n.id) ?? -1;
                if (idx >= 0) {
                    indexCache.current.set(n.id, idx);
                    indexToNodeNameRef.current.set(idx, (n.data?.label as string) || n.id);
                    indexToNodeRef.current.set(idx, n);
                }
            }

            if (idx >= 0 && idx < 2000) {
                const off = idx * 5;
                // Detect position changes
                if (nodeCache.current[off] !== n.position.x || nodeCache.current[off + 1] !== n.position.y) {
                    positionsChanged = true;
                }
                nodeCache.current[off] = n.position.x;
                nodeCache.current[off + 1] = n.position.y;
                nodeCache.current[off + 2] = n.measured?.width || 150;
                nodeCache.current[off + 3] = n.measured?.height || 0;
                // Type mapping
                let t = 0;
                if (n.type === 'client') t = 1; else if (n.type === 'server') t = 2; else if (n.type === 'database') t = 3; else if (n.type === 'load_balancer') t = 4; else if (n.type === 'cache') t = 5; else if (n.type === 'message_queue') t = 6; else if (n.type === 'topic') t = 7; else if (n.type === 'api_gateway') t = 8;
                nodeCache.current[off + 4] = t;
            }
        });

        // Increment version if any positions changed
        if (positionsChanged) {
            nodePosVersionRef.current++;
        }

        // PERFORMANCE: Invalidate Bezier cache if node positions changed
        // We detect this by comparing a simple position hash
        if (lastNodePosVersionRef.current !== nodePosVersionRef.current) {
            bezierCacheRef.current.clear();
            lastNodePosVersionRef.current = nodePosVersionRef.current;
        }

        // PERFORMANCE: Skip expensive packet updates on non-update frames
        // Node cache and transform updates still happen every frame
        if (!shouldUpdatePackets) return;

        // Build set of valid node indices to skip packets for deleted nodes
        const validIndices = new Set<number>();
        nodesMap.forEach(n => {
            const idx = indexCache.current.get(n.id) ?? -1;
            if (idx >= 0) validIndices.add(idx);
        });

        // 2. Render Packets from worker-provided buffer
        const buffer = props.packetBufferRef.current;
        const count = props.packetCountRef.current || 0;
        const totalFloats = count * 9;

        if (!buffer || totalFloats === 0) {
            // Hide all sprites when no packets to render
            const sprites = spritesRef.current;
            for (let j = 0; j < sprites.length; j++) {
                sprites[j].visible = false;
            }
            const textPool = textPoolRef.current;
            for (let t = 0; t < textPool.length; t++) {
                textPool[t].visible = false;
            }
            props.packetScreenPositionsRef.current.length = 0;
            return;
        }

        // Reset hover snapshot each frame
        props.packetScreenPositionsRef.current.length = 0;

        const sprites = spritesRef.current;
        let active = 0;
        let textIdx = 0; // Track text pool usage

        for (let i = 0; i < count && active < sprites.length; i++) {
            const base = i * 9;
            const s_idx = buffer[base + 0];
            const t_idx = buffer[base + 1];
            const progress = buffer[base + 2];
            const pType = buffer[base + 3];
            const s_val = buffer[base + 5];
            const t_val = buffer[base + 6];
            const errorCode = buffer[base + 7]; // HTTP error code (0 = none)
            const retryCount = buffer[base + 8]; // Retry Count

            // Skip packets for deleted nodes
            if (!validIndices.has(s_idx) || !validIndices.has(t_idx)) continue;


            // Lookup Coords
            const s_off = s_idx * 5;
            const t_off = t_idx * 5;

            // Source Dimensions
            const sn_x = nodeCache.current[s_off];
            const sn_y = nodeCache.current[s_off + 1];
            const sn_w = nodeCache.current[s_off + 2];
            const sn_h = nodeCache.current[s_off + 3];
            const sn_type = nodeCache.current[s_off + 4];

            // Target Dimensions
            const tn_x = nodeCache.current[t_off];
            const tn_y = nodeCache.current[t_off + 1];
            const tn_w = nodeCache.current[t_off + 2];
            const tn_h = nodeCache.current[t_off + 3];
            const tn_type = nodeCache.current[t_off + 4];

            // Determine Sides
            // s_val > 0 -> Right, < 0 -> Left, 0 -> Center (Default Right)
            // t_val > 0 -> Right, < 0 -> Left, 0 -> Center (Default Left)

            const ROW_HEIGHT = 40;
            const ROW_CENTER = 16; // Center of h-8 (32px) row

            // Source Pos
            let sx = sn_x + sn_w / 2;
            let sy = sn_y + sn_h / 2;
            let sSide = 'right';

            // Heuristics for Header Height based on Type (1=Client, 2=Server, 3=DB, 4=LB, 5=Cache, 6=Queue, 7=Topic, 8=API Gateway)
            // Server = 147 (Headers + Load Bar + Titles), Client = 90, LB = 20
            // API Gateway = 85: 58px card header + 8px p-2 + 16px "Outputs" label = 82px to first row top; +16 (ROW_CENTER) = 98 but we encode the offset into sHeader
            const sHeader = (sn_type === 1) ? 90 : (sn_type === 4) ? 20 : (sn_type === 8) ? 85 : 147;
            // API Gateway row pitch is h-8 (32px) + space-y-1.5 (6px) = 38px
            const sRowPitch = (sn_type === 8) ? 38 : ROW_HEIGHT;
            const sHasList = (sn_h > 80 || sn_type === 1 || sn_type === 8) && sn_type !== 3 && sn_type !== 4 && sn_type !== 5 && sn_type !== 6 && sn_type !== 7;
            const sHasReplyRow = (sn_type === 2);

            if (s_val > 0) {
                sx = sn_x + sn_w;
                if (sHasList) {
                    // If output (s_val > 0) and has reply row (Server only), skip the first row (RR)
                    const rowIdx = sHasReplyRow ? s_val : (s_val - 1);
                    sy = sn_y + sHeader + rowIdx * sRowPitch + ROW_CENTER;
                }
                sSide = 'right';
            } else if (s_val < 0) {
                sx = sn_x;
                if (sHasList && sn_type !== 8) {
                    sy = sn_y + sHeader + (Math.abs(s_val) - 1) * sRowPitch + ROW_CENTER;
                }
                sSide = 'left';
            }

            // Target Pos
            let tx = tn_x + tn_w / 2;
            let ty = tn_y + tn_h / 2;
            let tSide = 'left';

            // Heuristics for Header Height based on Type
            const tHeader = (tn_type === 1) ? 90 : (tn_type === 4) ? 20 : (tn_type === 8) ? 85 : 147;
            const tRowPitch = (tn_type === 8) ? 38 : ROW_HEIGHT;
            const tHasList = (tn_h > 80 || tn_type === 1 || tn_type === 8) && tn_type !== 3 && tn_type !== 4 && tn_type !== 5 && tn_type !== 6 && tn_type !== 7;
            const tHasReplyRow = (tn_type === 2);

            // Removed outdated 40% vertical heuristic. Handles are now exactly at 50% height.


            if (t_val > 0) {
                tx = tn_x + tn_w;
                if (tHasList) {
                    // Right side output - skip the reply row if present
                    const rowIdx = tHasReplyRow ? t_val : (t_val - 1);
                    ty = tn_y + tHeader + rowIdx * tRowPitch + ROW_CENTER;
                }
                tSide = 'right';
            } else if (t_val < 0) {
                tx = tn_x;
                if (tHasList && tn_type !== 8) {
                    // Left side input - never has reply row
                    // API Gateway left handle is at node center, not row-based
                    ty = tn_y + tHeader + (Math.abs(t_val) - 1) * tRowPitch + ROW_CENTER;
                }
                tSide = 'left';
            }

            // PERFORMANCE: Use cached Bezier control points
            const cacheKey = `${s_idx}|${t_idx}|${s_val}|${t_val}`;

            // Prefer exact positions from ReactFlow internal store (matches drawn edges precisely)
            let controlPoints = edgePosMapRef.current.get(cacheKey);

            // Fall back to heuristic cache (for reply packets and other unmapped paths)
            if (!controlPoints) {
                controlPoints = bezierCacheRef.current.get(cacheKey);
                if (!controlPoints || lastNodePosVersionRef.current !== nodePosVersionRef.current) {
                    controlPoints = computeBezierControlPoints(sx, sy, tx, ty, sSide, tSide);
                    bezierCacheRef.current.set(cacheKey, controlPoints);
                }
            }

            // Fast interpolation along cached curve
            const pos = interpolateBezier(progress, controlPoints);

            // Two-Way Highway: Offset Y based on packet type
            // Requests (pType 0 or 2) = top lane (offset above handle), Replies (pType 1) = bottom lane (offset below handle)
            const LANE_OFFSET = 8; // Full distance between lanes is 16px (symmetric about row center)
            const VERTICAL_SHIFT = 0; // Pure symmetric offset now

            const isReply = Math.abs(pType - 1.0) < 0.01;

            // Base shift
            pos.y += VERTICAL_SHIFT;

            // Handle Dropped Packets (loaded > 0 means dropped TTL)
            const droppedTTL = buffer[base + 4]; // 'loaded' field

            const sprite = sprites[active++];
            sprite.visible = true;

            if (droppedTTL > 0.1) {
                // Gravity Drop Logic
                // Start from normal end position and fall
                // Max TTL is 20 (from Rust). 20 -> 0.
                const MAX_TTL = 20.0;
                const fallProgress = (MAX_TTL - droppedTTL); // 0 to 20
                const speedFactor = 0.25; // 20*20 = 400. 400 * 0.25 = 100px drop
                pos.y += fallProgress * fallProgress * speedFactor;

                sprite.texture = textures.red;
                sprite.alpha = droppedTTL / MAX_TTL; // Fade out

                // Show error code label
                if (errorCode > 0 && textIdx < textPoolRef.current.length) {
                    const textLabel = textPoolRef.current[textIdx++];
                    textLabel.text = String(Math.round(errorCode));
                    textLabel.x = pos.x;
                    textLabel.y = pos.y - 10; // Above the packet
                    textLabel.alpha = sprite.alpha;
                    textLabel.visible = true;
                }
            } else {
                // Normal Flight
                if (isReply) {
                    pos.y += LANE_OFFSET; // Perfectly symmetric bottom lane
                } else {
                    pos.y -= LANE_OFFSET; // Perfectly symmetric top lane
                }

                // Texture & Tint (Only if not dropped)
                if (Math.abs(pType - 1.0) < 0.01) { // Reply
                    sprite.texture = textures.green;
                } else if (Math.abs(pType - 2.0) < 0.01) { // Write
                    sprite.texture = textures.orange;
                } else if (retryCount > 0) { // Retry (Yellow)
                    sprite.texture = textures.yellow;
                } else {
                    sprite.texture = textures.blue;
                }

                // Fading
                // Fade in requests from client, and fade in ALL replies at start
                // sn_type 1 = Client.
                if ((sn_type === 1 || isReply) && progress < 0.1) {
                    sprite.alpha = progress / 0.1;
                } else {
                    sprite.alpha = 1.0;
                }
            }

            sprite.x = pos.x;
            sprite.y = pos.y;

            // Record screen position for hover detection
            const [vpX, vpY, vpZoom] = props.transformRef.current ?? [0, 0, 1];
            const srcName = indexToNodeNameRef.current.get(s_idx) ?? `node${s_idx}`;
            const tgtName = indexToNodeNameRef.current.get(t_idx) ?? `node${t_idx}`;
            const pTypeLabel = pType === 1 ? '← Reply' : pType === 2 ? '→ Write' : '→ Request';

            // Resolve the URL from the source handle:
            // s_val > 0  → stream/dependency at index (s_val - 1)
            // s_val < 0  → endpoint at index (abs(s_val) - 1)
            let url: string | null = null;
            if (s_val !== 0) {
                const srcNode = indexToNodeRef.current.get(s_idx);
                if (srcNode) {
                    const epIdx = Math.round(Math.abs(s_val)) - 1;
                    if (s_val > 0) {
                        const streams = (srcNode.data?.streams as any[]) || [];
                        const ep = streams[epIdx];
                        if (ep?.method && ep?.path) url = `${ep.method} ${ep.path}`;
                    } else {
                        const endpoints = (srcNode.data?.endpoints as any[]) || [];
                        const ep = endpoints[epIdx];
                        if (ep?.method && ep?.path) url = `${ep.method} ${ep.path}`;
                    }
                }
            }

            let hoverLabel = `${srcName} → ${tgtName}  ·  ${pTypeLabel}`;
            if (url) hoverLabel += `  ·  ${url}`;
            if (errorCode > 0) hoverLabel += `  ·  ${Math.round(errorCode)}`;
            if (retryCount > 0) hoverLabel += `  ·  retry ${Math.round(retryCount)}`;
            props.packetScreenPositionsRef.current.push({
                sx: pos.x * vpZoom + vpX,
                sy: pos.y * vpZoom + vpY,
                label: hoverLabel,
            });
        }

        // Hide remaining sprites
        for (let j = active; j < sprites.length; j++) {
            sprites[j].visible = false;
        }

        // Hide remaining text labels
        const textPool = textPoolRef.current;
        for (let t = textIdx; t < textPool.length; t++) {
            textPool[t].visible = false;
        }
    });

    return null;
}

export const PacketLayerPixi = memo(function PacketLayerPixi(props: PacketLayerProps) {
    const transform = useStore(s => s.transform); // [x, y, zoom]
    const transformRef = useRef<[number, number, number]>(transform);
    transformRef.current = transform; // always current, no stale closure in useTick

    const packetScreenPositionsRef = useRef<PacketHoverData[]>([]);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    return (
        <>
            <Application
                width={props.width || window.innerWidth}
                height={props.height || window.innerHeight}
                backgroundAlpha={0}
                antialias={true}
                resolution={window.devicePixelRatio || 2}
                autoDensity={true}
                className="absolute top-0 left-0 pointer-events-none"
            >
                <PixiApp
                    {...props}
                    transformRef={transformRef}
                    packetScreenPositionsRef={packetScreenPositionsRef}
                    canvasRef={canvasRef}
                />
            </Application>
        </>
    );
});
