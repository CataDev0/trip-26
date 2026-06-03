import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const AUTH_TOKEN_KEY = "auth_token";

async function readStoredToken() {
    if (Capacitor.isNativePlatform()) {
        const { value } = await Preferences.get({ key: AUTH_TOKEN_KEY });
        return value || null;
    }

    if (typeof window !== "undefined") {
        return window.sessionStorage.getItem(AUTH_TOKEN_KEY);
    }

    return null;
}

async function writeStoredToken(token: string) {
    if (Capacitor.isNativePlatform()) {
        await Preferences.set({ key: AUTH_TOKEN_KEY, value: token });
        return;
    }

    if (typeof window !== "undefined") {
        window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    }
}

async function removeStoredToken() {
    if (Capacitor.isNativePlatform()) {
        await Preferences.remove({ key: AUTH_TOKEN_KEY });
        return;
    }

    if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
}

export async function getAuthHeader() {
    const value = await readStoredToken();
    if (value) {
        return { Authorization: `Basic ${value}` };
    }
    return {};
}

export async function setAuthCredentials(username: string, password: string) {
    const token = btoa(`${username}:${password}`);
    await writeStoredToken(token);
}

export async function clearAuth() {
    await removeStoredToken();
}

export async function authFetch(url: string, options: any = {}) {
    const headers = await getAuthHeader();
    options.headers = {
        ...options.headers,
        ...headers
    };

    const res = await fetch(url, options);
    if (res.status === 401) {
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("require-login"));
        }
    }
    return res;
}
