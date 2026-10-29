import { parseImageStream, recordsOfKind } from "@meta-sam/parser";
import { addUsage, dataUrl, meta, MODELS } from "../meta/client.ts";
import type { RunResult, SamBox } from "../types.ts";

// SAM 3.1 takes one noun phrase per request and streams boxes as special-token text.
export async function samBoxes(r: RunResult, jpg: Buffer, size: { width: number; height: number }, phrases: string[]): Promise<SamBox[]> {
  const boxes: SamBox[] = [];
  for (const phrase of phrases) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = (await (meta().responses.create as any)({
      model: MODELS.sam,
      stream: true,
      metadata: { mask_encoding: "one_bit" },
      input: [{ role: "user", content: [{ type: "input_text", text: phrase }, { type: "input_image", image_url: dataUrl(jpg) }] }],
    })) as AsyncIterable<{ type: string }>;
    const result = await parseImageStream(stream).finalResult;
    addUsage(r, MODELS.sam, 0, 0, 1);
    const found = recordsOfKind(result.records, "box")
      .slice()
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 2);
    for (const b of found) boxes.push({ label: phrase, left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: size.width, h: size.height });
  }
  return boxes;
}
