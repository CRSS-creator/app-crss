// GUS BIR 1.1: https://api.stat.gov.pl/Home/RegonApi
// Server-only module; never return the API key, session ID or raw SOAP response.
const ENDPOINT = "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
const NS = "http://CIS/BIR/PUBL/2014/07";
export type RegonCheck = {
  source: string;
  status: "ok" | "warning" | "error" | "skipped";
  label: string;
  details: { regon?: string; nip?: string; name?: string; checkedAt?: string };
};

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function xmlDecode(value: string) {
  return value.replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, n: string) => {
    const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  }).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function tag(xml: string, name: string) {
  const match = xml.match(new RegExp("<(?:[\\w.-]+:)?" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?" + name + "\\s*>"));
  const value = match?.[1]?.trim() || "";
  return value.startsWith("<![CDATA[") && value.endsWith("]]>") ? value.slice(9, -3) : xmlDecode(value);
}

export async function verifyRegon(nip: string, key = process.env.REGON_KEY, request: typeof fetch = fetch): Promise<RegonCheck> {
  const result = (status: RegonCheck["status"], label: string, details: RegonCheck["details"] = {}): RegonCheck => ({ source: "GUS REGON", status, label, details });
  if (!key?.trim()) return result("skipped", "Nie skonfigurowano integracji GUS REGON.");
  if (!/^\d{10}$/.test(nip)) return result("error", "Nieprawidłowy NIP dla GUS REGON.");
  let sid = "";
  async function call(method: string, payload: string, timeout = 12000) {
    const action = NS + "/IUslugaBIRzewnPubl/" + method;
    const response = await request(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": 'application/soap+xml; charset=utf-8; action="' + action + '"', ...(sid ? { sid } : {}) },
      body: '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing"><s:Header><a:Action s:mustUnderstand="1">' + action + '</a:Action><a:To s:mustUnderstand="1">' + ENDPOINT + '</a:To></s:Header><s:Body><' + method + ' xmlns="' + NS + '">' + payload + '</' + method + '></s:Body></s:Envelope>',
      signal: AbortSignal.timeout(timeout),
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) throw new Error("GUS request failed");
    const xml = await response.text();
    // BIR may wrap the SOAP envelope in a multipart/related response.
    if (/<(?:[\w.-]+:)?Fault[\s>]/.test(xml)) throw new Error("GUS SOAP fault");
    return tag(xml, method + "Result");
  }
  try {
    sid = await call("Zaloguj", "<pKluczUzytkownika>" + xmlEscape(key.trim()) + "</pKluczUzytkownika>");
    if (!sid) return result("error", "GUS REGON nie zaakceptował klucza lub usługa jest niedostępna.");
    const xml = await call("DaneSzukajPodmioty", '<pParametryWyszukiwania xmlns:d="' + NS + '/DataContract"><d:Nip>' + nip + '</d:Nip></pParametryWyszukiwania>');
    const records = [...xml.matchAll(/<(?:[\w.-]+:)?dane(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?dane\s*>/g)]
      .map(match => ({ nip: tag(match[1], "Nip"), regon: tag(match[1], "Regon"), name: tag(match[1], "Nazwa") }))
      .filter(record => record.nip === nip && /^\d{9}$/.test(record.regon));
    const regons = new Set(records.map(record => record.regon));
    if (regons.size !== 1) return result("warning", "GUS REGON nie zwrócił jednoznacznego podmiotu dla tego NIP.");
    return result("ok", "Potwierdzono numer REGON w GUS.", { ...records[0], checkedAt: new Date().toISOString() });
  } catch {
    return result("error", "Nie udało się pobrać danych z GUS REGON. Spróbuj ponownie później.");
  } finally {
    if (sid) await call("Wyloguj", "<pIdentyfikatorSesji>" + xmlEscape(sid) + "</pIdentyfikatorSesji>", 3000).catch(() => {});
  }
}
