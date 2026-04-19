export interface MethodColor {
    bg: string;
    text: string;
    border: string;
    handle?: string; // For Node handles
}

export const METHOD_COLORS: Record<string, MethodColor> = {
    GET: {
        bg: 'bg-blue-50',
        text: 'text-blue-600',
        border: 'border-blue-200',
        handle: '!bg-blue-500'
    },
    POST: {
        bg: 'bg-orange-50',
        text: 'text-orange-600',
        border: 'border-orange-200',
        handle: '!bg-orange-500'
    },
    PUT: {
        bg: 'bg-orange-50',
        text: 'text-orange-600',
        border: 'border-orange-200',
        handle: '!bg-orange-500'
    },
    PATCH: {
        bg: 'bg-orange-50',
        text: 'text-orange-600',
        border: 'border-orange-200',
        handle: '!bg-orange-500'
    },
    DELETE: {
        bg: 'bg-orange-50',
        text: 'text-orange-600',
        border: 'border-orange-200',
        handle: '!bg-orange-500'
    },
};

export const getMethodColor = (method: string): MethodColor => {
    return METHOD_COLORS[method.toUpperCase()] || METHOD_COLORS.GET;
};
