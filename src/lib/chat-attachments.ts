import { uid, type ChatAttachment } from "@/stores/ide-store";
import type { ChatMessage, ContentPart } from "./llm";

export const MAX_ATTACHMENTS = 6;
export const ACCEPT_FILES = "image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.json,.ts,.tsx,.js,.jsx,.css,.html,.py,.rs,.go,.yml,.yaml,.toml,.xml,.svg,.sh,.ps1";

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const TEXT_EXTS = new Set([
  "txt",
  "md",
  "json",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "css",
  "scss",
  "html",
  "htm",
  "py",
  "rs",
  "go",
  "java",
  "kt",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "php",
  "rb",
  "sh",
  "bash",
  "ps1",
  "yml",
  "yaml",
  "toml",
  "xml",
  "svg",
  "sql",
  "graphql",
  "vue",
  "svelte",
  "env",
  "gitignore",
]);

const MAX_IMAGE_EDGE = 2048;
const MAX_TEXT_CHARS = 80_000;

function extOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isImageFile(file: File) {
  if (IMAGE_MIMES.has(file.type)) return true;
  return ["png", "jpg", "jpeg", "gif", "webp"].includes(extOf(file.name));
}

function isTextFile(file: File) {
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json" || file.type === "image/svg+xml") return true;
  return TEXT_EXTS.has(extOf(file.name));
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function imageToDataUrl(file: File) {
  if (typeof createImageBitmap !== "function") return readAsDataUrl(file);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return readAsDataUrl(file);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const mime = file.type === "image/png" || extOf(file.name) === "png" ? "image/png" : "image/jpeg";
  return canvas.toDataURL(mime, mime === "image/jpeg" ? 0.88 : undefined);
}

export async function filesToAttachments(
  files: File[],
  existingCount: number,
): Promise<{ attachments: ChatAttachment[]; errors: string[] }> {
  const attachments: ChatAttachment[] = [];
  const errors: string[] = [];
  const room = Math.max(0, MAX_ATTACHMENTS - existingCount);

  for (const file of files) {
    if (attachments.length >= room) {
      errors.push(`Only ${MAX_ATTACHMENTS} attachments per message.`);
      break;
    }
    if (isImageFile(file)) {
      try {
        attachments.push({
          id: uid(),
          name: file.name || "image",
          mime: file.type || "image/png",
          kind: "image",
          dataUrl: await imageToDataUrl(file),
        });
      } catch {
        errors.push(`Could not read image ${file.name || "clipboard"}.`);
      }
      continue;
    }
    if (isTextFile(file)) {
      try {
        const text = (await file.text()).slice(0, MAX_TEXT_CHARS);
        attachments.push({
          id: uid(),
          name: file.name || "file.txt",
          mime: file.type || "text/plain",
          kind: "text",
          text,
        });
      } catch {
        errors.push(`Could not read ${file.name}.`);
      }
      continue;
    }
    errors.push(`${file.name || "File"} is not an image or text file.`);
  }

  return { attachments, errors };
}

export function userApiContent(text: string, attachments: ChatAttachment[] = []): ChatMessage["content"] {
  const images = attachments.filter((a) => a.kind === "image" && a.dataUrl);
  const files = attachments.filter((a) => a.kind === "text" && a.text);
  let body = text.trim();
  for (const file of files) {
    body += `${body ? "\n\n" : ""}Attached file \`${file.name}\`:\n\`\`\`\n${file.text}\n\`\`\``;
  }
  if (images.length === 0) return body;
  const parts: ContentPart[] = [
    { type: "text", text: body || "Please look at the attached image(s)." },
  ];
  for (const image of images) {
    parts.push({
      type: "image_url",
      image_url: { url: image.dataUrl as string, detail: "auto" },
    });
  }
  return parts;
}
