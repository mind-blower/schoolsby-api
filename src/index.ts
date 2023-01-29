import { curly } from "node-libcurl";
import { JSDOM } from "jsdom";

const DEFAULT_LOGIN_URL = new URL("https://schools.by/login");

function getDefaultHeaders(): Record<string, string> {
    return {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
        "Accept-Language": "be-BY,be;q=0.5",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:108.0) Gecko/20100101 Firefox/108.0",
    };
}

// idk whats that
function getMagicCookie() {
    return "slc_cookie=%7BslcMakeBetter%7D";
}

async function fetchCsrfTokens(url: URL): Promise<{ header: string; input: string|undefined; }> {
    const response = await fetch(url, {
        "credentials": "omit",
        "headers": getDefaultHeaders(),
        "referrer": `${url}`
    });
    const text = await response.text();

    if (!response.ok) {
        throw new Error(`server returned not ok status code (${response.status})`);
    }

    const header = response.headers.get("Set-Cookie");
    if (header == null || header.length == 0) {
        throw new Error("no csrftoken cookie");
    }

    const dom = new JSDOM(text);
    const input: HTMLInputElement|null = dom.window?.document?.querySelector("input[name=csrfmiddlewaretoken]");
    return {
        header: header.substring("csrftoken=".length).split("; ", 1)[0],
        input: input?.value
    };
}

export async function logIn(username: string, password: string, loginUrl: URL = DEFAULT_LOGIN_URL): Promise<Client> {
    const url = new URL("https://schools.by/login");
    const { header, input } = await fetchCsrfTokens(url);

    let { result, ...headers } = (await curly.post('https://schools.by/login', {
        postFields: `csrfmiddlewaretoken=${input}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&%7C123=%7C123`,
        httpHeader: (() => {
            const headers = [];

            const defaultHeaders = getDefaultHeaders();
            for (const h in getDefaultHeaders()) {
                headers.push(`${h}: ${defaultHeaders[h]}`);
            }

            headers.push(`Content-Type: application/x-www-form-urlencoded`);
            headers.push(`Origin: ${url.origin}`);
            headers.push(`Referer: ${url}`);
            headers.push(`Cookie: csrftoken=${header}; ${getMagicCookie()}`);

            return headers;
        })(),
    })).headers[0];

    if (result!!.code < 200 || result!!.code > 399) {
        throw new Error(`Invalid result code (${result!!.code})`);
    }

    const cookies = headers["Set-Cookie"] as unknown as string[];
    for (const c in cookies) {
        cookies[c] = cookies[c].split("; ", 1)[0];
    }

    // TODO: also extract user_id from this thing

    return new Client(cookies);
}

export class Client {
    cookies!: string[];

    constructor(cookies: string[]) {
        this.cookies = cookies;
    }
}
