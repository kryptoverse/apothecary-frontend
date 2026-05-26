export const API_BASE_URL = ( // env value || 
    'http://localhost:5000/api/v1'
).replace(/\/+$/, '');

export type ApiResponse<T> = {
    success: boolean;
    message?: string;
    data?: T;
    errors?: Array<{ field?: string; message: string }>;
    error?: { code?: string };
};

export function getApiBaseUrl() {
    return API_BASE_URL;
}

export async function apiRequest<T>(
    path: string,
    options: RequestInit & { token?: string } = {}
): Promise<ApiResponse<T>> {
    const { token, headers, body, ...rest } = options;
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
        ...rest,
        headers: {
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers,
        },
        body,
    });

    const text = await response.text();
    let payload: ApiResponse<T>;

    try {
        payload = text ? JSON.parse(text) : { success: response.ok };
    } catch {
        payload = {
            success: false,
            message: text || `Request failed with status ${response.status}`,
        };
    }

    if (!response.ok) {
        if (isTokenExpiredResponse(response.status, payload)) {
            handleExpiredSession();
            return new Promise<ApiResponse<T>>(() => undefined);
        }

        const validationMessage = payload.errors?.map((error) => error.message).join(' ');
        throw new Error(validationMessage || payload.message || `Request failed with status ${response.status}`);
    }

    return payload;
}

function isTokenExpiredResponse<T>(status: number, payload: ApiResponse<T>) {
    const message = payload.message?.toUpperCase();
    const code = payload.error?.code?.toUpperCase();
    return status === 401 && (message === 'TOKEN_EXPIRED' || code === 'TOKEN_EXPIRED');
}

function handleExpiredSession() {
    if (typeof window === 'undefined') {
        return;
    }

    localStorage.removeItem('ApothecaryAuthSession');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('backendRole');

    if (window.location.pathname !== '/auth/login') {
        window.location.replace('/auth/login');
    }
}
