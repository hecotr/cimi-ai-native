import type { Artifact, Claim, ContextPackManifest, ContextSource } from "@cimiloop/protocol";

const FORBIDDEN_SOURCE_KEYS = new Set(["executor_transcript", "transcript", "conversation", "runtime_log"]);

export const buildEvaluatorContext = (input: {
  artifact: Artifact;
  claims: readonly Claim[];
  sources: readonly ContextSource[];
}): Pick<ContextPackManifest, "sources" | "validity"> & { claim_ids: string[] } => {
  const sources = input.sources.filter((source) => !FORBIDDEN_SOURCE_KEYS.has(source.key));
  return {
    sources,
    validity: "valid",
    claim_ids: input.claims.map((claim) => claim.id)
  };
};
