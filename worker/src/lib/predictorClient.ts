/**
 * Client for the sibling dhaka_kacchi_ai_harness repo's internal-only
 * post-engagement predictor service (predictor/ - see that repo's
 * ml/00-problem-framing through ml/05-production for how the model was
 * built, compared against baselines, and chosen).
 *
 * Reached only over PREDICTOR_URL (the docker-compose internal network,
 * e.g. http://predictor:8000) - never a public URL. Mirrors the
 * reporting/cockpit repositories' own "undefined when not configured,
 * route answers 503" convention (see index.ts's wiring) rather than
 * throwing at startup - local dev doesn't need this service running just
 * to work on orders.
 */

export type PredictorPlatform = "facebook" | "instagram";

export interface PredictorInput {
  platform: PredictorPlatform;
  contentType?: string;
  caption: string;
  plannedPostedAt: string;
}

export interface PredictorReason {
  feature: string;
  contribution: number;
}

export interface PredictorResult {
  label: "likely_below_typical" | "likely_at_or_above_typical";
  probability: number;
  threshold: number;
  modelVersion: string;
  topReasons: PredictorReason[];
}

/** Thrown when the predictor service itself fails or is unreachable - the
 * route handler turns this into a 502, distinct from a 400 for bad input
 * (which the service's own 422 response maps to) or the 503 the route
 * already returns when PREDICTOR_URL isn't configured at all. */
export class PredictorServiceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PredictorServiceError";
  }
}

export interface PredictorClient {
  predict(input: PredictorInput): Promise<PredictorResult>;
}

interface RawPredictResponse {
  label: PredictorResult["label"];
  probability: number;
  threshold: number;
  model_version: string;
  top_reasons: { feature: string; contribution: number }[];
}

export function createHttpPredictorClient(baseUrl: string): PredictorClient {
  return {
    async predict(input) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/v1/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: input.platform,
            content_type: input.contentType,
            caption: input.caption,
            planned_posted_at: input.plannedPostedAt,
          }),
        });
      } catch (cause) {
        throw new PredictorServiceError(
          `could not reach the predictor service at ${baseUrl}: ${(cause as Error).message}`,
        );
      }

      if (res.status === 422) {
        const body: unknown = await res.json().catch(() => ({ detail: "invalid input" }));
        const detail =
          typeof body === "object" && body !== null && "detail" in body
            ? (body as { detail: unknown }).detail
            : undefined;
        throw new PredictorServiceError(typeof detail === "string" ? detail : "invalid input", 422);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new PredictorServiceError(
          `predictor service returned ${res.status}: ${text}`,
          res.status,
        );
      }

      const data = (await res.json()) as RawPredictResponse;
      return {
        label: data.label,
        probability: data.probability,
        threshold: data.threshold,
        modelVersion: data.model_version,
        topReasons: data.top_reasons.map((r) => ({
          feature: r.feature,
          contribution: r.contribution,
        })),
      };
    },
  };
}
