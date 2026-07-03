import { EmbeddingModel, FlagEmbedding } from "fastembed";

const MAX_CHARS = 512;

const MODEL_MAP: Record<string, Exclude<EmbeddingModel, EmbeddingModel.CUSTOM>> = {
  "fast-all-MiniLM-L6-v2": EmbeddingModel.AllMiniLML6V2,
  "fast-bge-base-en": EmbeddingModel.BGEBaseEN,
  "fast-bge-base-en-v1.5": EmbeddingModel.BGEBaseENV15,
  "fast-bge-small-en": EmbeddingModel.BGESmallEN,
  "fast-bge-small-en-v1.5": EmbeddingModel.BGESmallENV15,
};

function resolveModel(): Exclude<EmbeddingModel, EmbeddingModel.CUSTOM> {
  const name = process.env.EMBED_MODEL;
  if (name && name in MODEL_MAP) return MODEL_MAP[name]!;
  return EmbeddingModel.AllMiniLML6V2;
}

let model: Promise<FlagEmbedding> | null = null;

function load(): Promise<FlagEmbedding> {
  if (!model) {
    const id = resolveModel();
    console.log(`[embed] loading ${id}`);
    model = FlagEmbedding.init({ model: id });
  }
  return model;
}

// ONNX sessions aren't safe for concurrent inference — run one at a time.
let chain: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => {},
    () => {},
  );
  return run;
}

function unit(v: ArrayLike<number>): number[] {
  const a = Array.from(v);
  let s = 0;
  for (const x of a) s += x * x;
  const d = Math.sqrt(s);
  if (!d) return a;
  return a.map((x) => x / d);
}

async function infer(text: string): Promise<number[] | null> {
  const m = await load();
  const gen = m.passageEmbed([text], 1);
  for await (const batch of gen) {
    const vec = batch[0];
    return vec ? unit(vec) : null;
  }
  return null;
}

// Load model and warm ONNX before indexers start hammering it.
export async function initEmbed(): Promise<void> {
  await serial(() => infer("warmup"));
  console.log("[embed] ready");
}

// L2-normalized sentence embedding for feed diversity sampling.
export async function embed(
  title: string | null,
  body: string | null,
): Promise<number[] | null> {
  const text = [title, body].filter(Boolean).join("\n").trim().slice(0, MAX_CHARS);
  if (!text) return null;

  try {
    return await serial(() => infer(text));
  } catch (e) {
    console.error("[embed] failed:", (e as Error).message);
    return null;
  }
}
