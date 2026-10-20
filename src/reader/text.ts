/** Absätze eines Dokumenttexts – gleiche Aufteilung für Anzeige und Vorlesen. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export interface Chunk {
  text: string;
  /** Position des Abschnitts im Absatz. */
  start: number;
}

/**
 * WebKit bricht sehr lange Äußerungen teils ab oder meldet ihr Ende nicht.
 * Deshalb wird jeder Absatz in Sätze bzw. Stücke von höchstens `max` Zeichen
 * zerlegt. Ohne Lookbehind, damit es auch in Safari 16.0 läuft.
 */
export function splitChunks(paragraph: string, max = 220): Chunk[] {
  const sentences: Chunk[] = [];
  const pattern = /[^.!?…;:]+(?:[.!?…;:]+["“”»«)\]]*|$)\s*/g;
  for (const match of paragraph.matchAll(pattern)) {
    if (match[0].trim()) {
      sentences.push({ text: match[0], start: match.index });
    }
  }

  const chunks: Chunk[] = [];
  for (const sentence of sentences) {
    for (const piece of splitLong(sentence, max)) {
      const last = chunks.at(-1);
      // Kurze Sätze zusammenfassen, damit die Sprachmelodie natürlich bleibt.
      if (last && last.text.length + piece.text.length <= max && last.text.length < max / 2) {
        last.text += piece.text;
      } else {
        chunks.push({ ...piece });
      }
    }
  }
  return chunks
    .map((chunk) => ({ text: chunk.text.trimEnd(), start: chunk.start }))
    .filter((chunk) => chunk.text.length > 0);
}

function splitLong(chunk: Chunk, max: number): Chunk[] {
  const result: Chunk[] = [];
  let { text, start } = chunk;
  while (text.length > max) {
    const window = text.slice(0, max);
    let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf(' – '));
    if (cut < max / 3) {
      cut = window.lastIndexOf(' ');
    }
    if (cut <= 0) {
      cut = max - 1;
    }
    result.push({ text: text.slice(0, cut + 1), start });
    start += cut + 1;
    text = text.slice(cut + 1);
  }
  result.push({ text, start });
  return result;
}
