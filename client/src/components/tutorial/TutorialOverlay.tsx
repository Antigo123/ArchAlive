import { useEffect, useState, useCallback } from 'react';
import type { TutorialStep } from '../../puzzles/types';

interface TutorialOverlayProps {
    currentStep: TutorialStep | null;
    isActive: boolean;
}

// Mapping of step conditions to CSS selectors for highlighting
const HIGHLIGHT_TARGETS: Record<string, {
    selector: string;
    arrow: 'left' | 'right' | 'top' | 'bottom';
    message?: string;
}> = {
    // Step conditions that target the sidebar
    'node_added': {
        selector: '[data-sidebar]',
        arrow: 'left',
        message: 'Drag from the sidebar'
    },
    // Step conditions that target connection handles
    'edge_added': {
        selector: '[data-main-canvas] .react-flow__node',
        arrow: 'right',
        message: 'Connect the nodes'
    },
    // Step conditions that target the inspector
    'url_configured': {
        selector: '[data-inspector]',
        arrow: 'right',
        message: 'Click a node to configure'
    },
    'forwarding_configured': {
        selector: '[data-inspector]',
        arrow: 'right',
        message: 'Configure the logic'
    },
    // Generic conditions
    'traffic_flowing': {
        selector: '[data-main-canvas]',
        arrow: 'top',
        message: 'Watch the simulation'
    },
    'url_mismatch_observed': {
        selector: '.react-flow__renderer',
        arrow: 'top',
        message: 'Notice the errors'
    }
};

interface HighlightRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function TutorialOverlay({ currentStep, isActive }: TutorialOverlayProps) {
    const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);
    const [arrowPosition, setArrowPosition] = useState<{ x: number; y: number; direction: string } | null>(null);

    const updateHighlight = useCallback(() => {
        if (!currentStep || !isActive) {
            setHighlightRect(null);
            setArrowPosition(null);
            return;
        }

        const target = currentStep.highlight ?? HIGHLIGHT_TARGETS[currentStep.condition];
        if (!target) {
            setHighlightRect(null);
            setArrowPosition(null);
            return;
        }

        const element = document.querySelector(target.selector);
        if (!element || element.closest('[data-inspector]')) {
            // Skip highlight if element not found or lives inside the inspector panel
            setHighlightRect(null);
            setArrowPosition(null);
            return;
        }

        const rect = element.getBoundingClientRect();
        const padding = 8;

        setHighlightRect({
            x: rect.left - padding,
            y: rect.top - padding,
            width: rect.width + padding * 2,
            height: rect.height + padding * 2
        });

        // Position arrow based on direction
        let arrowX = rect.left + rect.width / 2;
        let arrowY = rect.top + rect.height / 2;

        switch (target.arrow) {
            case 'left':
                arrowX = rect.left - 60;
                break;
            case 'right':
                arrowX = rect.right + 60;
                break;
            case 'top':
                arrowY = rect.top - 60;
                break;
            case 'bottom':
                arrowY = rect.bottom + 60;
                break;
        }

        if (target.arrow) {
            setArrowPosition({ x: arrowX, y: arrowY, direction: target.arrow });
        } else {
            setArrowPosition(null);
        }
    }, [currentStep, isActive]);

    useEffect(() => {
        if (!isActive) return;

        // Update on mount and when step changes
        updateHighlight();

        // Also update periodically in case elements move
        const interval = setInterval(updateHighlight, 500);

        // Update on window resize
        window.addEventListener('resize', updateHighlight);

        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', updateHighlight);
        };
    }, [updateHighlight, isActive]);

    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (!isActive || !currentStep || isMobile) return null;

    return (
        <>
            {/* Spotlight overlay (Darkness removed, just border) */}
            {highlightRect && (
                <svg
                    className="fixed inset-0 z-[400] pointer-events-none"
                    style={{ width: '100vw', height: '100vh' }}
                >
                    {/* Highlight border */}
                    <rect
                        x={highlightRect.x}
                        y={highlightRect.y}
                        width={highlightRect.width}
                        height={highlightRect.height}
                        rx="12"
                        fill="none"
                        stroke="rgb(99, 102, 241)"
                        strokeWidth="3"
                        className="animate-pulse"
                    />
                </svg>
            )}

            {/* Animated arrow */}
            {arrowPosition && (
                <div
                    className="fixed z-[401] pointer-events-none"
                    style={{
                        left: arrowPosition.x,
                        top: arrowPosition.y,
                        transform: 'translate(-50%, -50%)'
                    }}
                >
                    <div className={`tutorial-arrow tutorial-arrow-${arrowPosition.direction}`}>
                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                            <path
                                d="M12 24H36M36 24L24 12M36 24L24 36"
                                stroke="rgb(99, 102, 241)"
                                strokeWidth="4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                </div>
            )}

            {/* CSS for animations */}
            <style>{`
                .tutorial-arrow {
                    animation: bounce 1s ease-in-out infinite;
                }
                .tutorial-arrow-left {
                    transform: rotate(180deg);
                }
                .tutorial-arrow-right {
                    transform: rotate(0deg);
                }
                .tutorial-arrow-top {
                    transform: rotate(-90deg);
                }
                .tutorial-arrow-bottom {
                    transform: rotate(90deg);
                }
                @keyframes bounce {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(10px); }
                }
                .tutorial-arrow-left {
                    animation: bounce-left 1s ease-in-out infinite;
                }
                .tutorial-arrow-top {
                    animation: bounce-top 1s ease-in-out infinite;
                }
                .tutorial-arrow-bottom {
                    animation: bounce-bottom 1s ease-in-out infinite;
                }
                @keyframes bounce-left {
                    0%, 100% { transform: rotate(180deg) translateX(0); }
                    50% { transform: rotate(180deg) translateX(10px); }
                }
                @keyframes bounce-top {
                    0%, 100% { transform: rotate(-90deg) translateY(0); }
                    50% { transform: rotate(-90deg) translateY(-10px); }
                }
                @keyframes bounce-bottom {
                    0%, 100% { transform: rotate(90deg) translateY(0); }
                    50% { transform: rotate(90deg) translateY(10px); }
                }
            `}</style>
        </>
    );
}
