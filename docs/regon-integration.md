# GUS REGON in AML

Configure `REGON_KEY` in the running Next.js server environment or its `.env.local`, then restart the server. Never use a `NEXT_PUBLIC_` prefix or commit the key. A local file does not configure a separate production host.

AML verification queries GUS BIR 1.1 by NIP, closes the session, records the source status and uses the confirmed nine-digit REGON in both the register and report. Ambiguous results, timeouts and missing configuration retain any previously known REGON. The integration does not change beneficiary data or authorization rules.

Run regression tests: `node --test tests/regon.test.cjs`.

Official interface and WSDL: https://api.stat.gov.pl/Home/RegonApi and https://wyszukiwarkaregon.stat.gov.pl/wsBIR/wsdl/UslugaBIRzewnPubl-ver11-prod.wsdl
