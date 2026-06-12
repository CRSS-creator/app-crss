import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CrmContract } from "@/lib/crmContractService";

type GenerateContractRequest = {
  contract?: CrmContract;
};

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRM_CONTRACTS_BUCKET = "crm-umowy";

export async function POST(request: NextRequest) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Brakuje konfiguracji Supabase dla zapisu wygenerowanego PDF." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null) as GenerateContractRequest | null;
  const contract = body?.contract;

  if (!contract?.id) {
    return NextResponse.json({ error: "Brakuje danych umowy." }, { status: 400 });
  }

  const templatePath = resolveTemplatePath(contract.typ_umowy);
  if (!templatePath || !existsSync(templatePath)) {
    return NextResponse.json(
      { error: `Brakuje szablonu DOCX dla umowy ${contract.typ_umowy} w katalogu templates.` },
      { status: 500 }
    );
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "crss-contract-"));

  try {
    const fileName = buildGeneratedContractFileName(contract.numer_umowy, contract.nazwa_klienta);
    const outputDocxPath = path.join(workDir, fileName.replace(/\.pdf$/i, ".docx"));
    const outputPdfPath = path.join(workDir, fileName);
    const replacementsPath = path.join(workDir, "replacements.json");
    const scriptPath = path.join(workDir, "fill-docx-template.py");

    await writeFile(replacementsPath, JSON.stringify(buildTemplateFields(contract)), "utf8");
    await writeFile(scriptPath, PYTHON_DOCX_FILLER, "utf8");

    await execFileAsync("python3", [scriptPath, templatePath, outputDocxPath, replacementsPath]);
    await convertDocxToPdf(outputDocxPath, workDir);

    const convertedPdfPath = resolveConvertedPdfPath(workDir, outputDocxPath, outputPdfPath);
    if (!existsSync(convertedPdfPath)) {
      return NextResponse.json(
        { error: "Nie udało się utworzyć PDF z szablonu DOCX." },
        { status: 500 }
      );
    }

    const pdfBuffer = await readFile(convertedPdfPath);
    const storagePath = `${contract.id}/generated/${Date.now()}-${fileName}`;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const uploadResult = await supabase.storage
      .from(CRM_CONTRACTS_BUCKET)
      .upload(storagePath, pdfBuffer, {
        cacheControl: "3600",
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadResult.error) {
      return NextResponse.json({ error: uploadResult.error.message }, { status: 500 });
    }

    const updateResult = await supabase
      .from("crm_umowy")
      .update({
        status: "wygenerowana",
        wygenerowany_pdf_path: storagePath,
        wygenerowany_pdf_name: fileName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contract.id)
      .select("*")
      .single();

    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, fileName, contract: updateResult.data });
  } catch (error) {
    console.error("Błąd generowania umowy z DOCX:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nie udało się wygenerować umowy z DOCX." },
      { status: 500 }
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function resolveTemplatePath(contractType: CrmContract["typ_umowy"]) {
  const templatesDir = path.join(process.cwd(), "templates");
  const candidates = contractType === "KH"
    ? ["Umowa_CRSS_KH_N8N.docx", "Umowa CRSS KH N8N.docx", "Umowa CRSS KH.docx"]
    : ["Umowa_CRSS_KU_N8N.docx", "Umowa CRSS KU N8N.docx", "Umowa CRSS KU.docx"];

  return candidates
    .map((fileName) => path.join(templatesDir, fileName))
    .find((candidate) => existsSync(candidate)) || null;
}

function buildTemplateFields(contract: CrmContract) {
  return {
    numer_umowy: contract.numer_umowy || "",
    pierwszy_okres: contract.pierwszy_okres || "",
    nazwa_klienta: contract.nazwa_klienta || "",
    siedziba: contract.siedziba || "",
    nip: contract.nip || "",
    reprezentant: contract.reprezentant || "",
    email_klienta: contract.email_klienta || "",
    abonament_netto: formatTemplateValue(contract.abonament_netto),
    limit_dokumentow: formatTemplateValue(contract.limit_dokumentow),
    obsluga_kadrowa: contract.obsluga_kadrowa ? "tak" : "nie",
    ustalenia_indywidualne: contract.ustalenia_indywidualne || "",
  };
}

function formatTemplateValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value);
}

async function convertDocxToPdf(docxPath: string, outputDir: string) {
  const args = ["--headless", "--convert-to", "pdf", "--outdir", outputDir, docxPath];
  try {
    await execFileAsync("libreoffice", args);
  } catch (firstError) {
    try {
      await execFileAsync("soffice", args);
    } catch {
      throw firstError;
    }
  }
}

function resolveConvertedPdfPath(workDir: string, outputDocxPath: string, preferredPath: string) {
  if (existsSync(preferredPath)) return preferredPath;
  const libreOfficeName = `${path.basename(outputDocxPath, path.extname(outputDocxPath))}.pdf`;
  return path.join(workDir, libreOfficeName);
}

function execFileAsync(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(command, args, { timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve();
    });
  });
}

function buildGeneratedContractFileName(contractNumber: string | null, contractorName: string | null) {
  const numberPart = sanitizeFileNamePart(contractNumber || "bez-numeru");
  const contractorPart = sanitizeFileNamePart(contractorName || "kontrahent");
  return `umowa_${numberPart}_${contractorPart}.pdf`;
}

function sanitizeFileNamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "brak";
}

const PYTHON_DOCX_FILLER = String.raw`import html
import json
import re
import sys
import zipfile

TEMPLATE_PATH = sys.argv[1]
OUTPUT_PATH = sys.argv[2]
REPLACEMENTS_PATH = sys.argv[3]

with open(REPLACEMENTS_PATH, "r", encoding="utf-8") as file:
    replacements = json.load(file)

XML_PARTS = (
    "word/document.xml",
    "word/header",
    "word/footer",
    "word/footnotes.xml",
    "word/endnotes.xml",
    "word/comments.xml",
)

def placeholder_pattern(key):
    placeholder = "{{" + key + "}}"
    between_chars = r"(?:<[^>]+>)*"
    return re.compile(between_chars.join(re.escape(char) for char in placeholder))

def replace_placeholders(xml):
    updated = xml
    for key, raw_value in replacements.items():
        value = html.escape(str(raw_value), quote=False)
        updated = placeholder_pattern(key).sub(value, updated)
    return updated

with zipfile.ZipFile(TEMPLATE_PATH, "r") as source:
    with zipfile.ZipFile(OUTPUT_PATH, "w", zipfile.ZIP_DEFLATED) as target:
        for item in source.infolist():
            data = source.read(item.filename)
            if item.filename.startswith(XML_PARTS) and item.filename.endswith(".xml"):
                text = data.decode("utf-8")
                data = replace_placeholders(text).encode("utf-8")
            target.writestr(item, data)
`;
