"""Bayesian fusion module - combines multi-channel extraction results."""
import numpy as np


class BayesianFusion:
    """Combine extraction results from multiple channels using Bayesian fusion."""

    # Default channel reliability priors
    CHANNEL_PRIORS = {
        "subpixel": 0.7,
        "luminance": 0.8,
        "svg_mesh": 0.75,
        "temporal": 0.6,
        "macro_luminance": 0.85,      # Very reliable, large-zone analysis
        "structural_layout": 0.80,    # Reliable, geometry-based
        "color_channel": 0.70,        # Good redundancy across RGB
    }

    def fuse(self, channel_results: list, degradation) -> dict:
        if not channel_results:
            return {"bits": [], "confidence": 0.0}

        # Estimate channel weights based on degradation
        weights = self._estimate_weights(channel_results, degradation)

        # Weighted average of bit probabilities
        max_bits = max(len(r["bit_probabilities"]) for r in channel_results)
        fused_probs = np.zeros(max_bits)
        total_weight = 0

        for result, weight in zip(channel_results, weights):
            probs = np.array(result["bit_probabilities"])
            n = len(probs)
            fused_probs[:n] += weight * probs
            total_weight += weight

        if total_weight > 0:
            fused_probs /= total_weight

        # Hard decision
        fused_bits = (fused_probs > 0.5).astype(int).tolist()

        # Combined confidence (Bayesian posterior)
        confidences = [r["confidence"] * w for r, w in zip(channel_results, weights)]
        combined = 1.0 - np.prod([1.0 - c for c in confidences if c > 0])

        return {
            "bits": fused_bits,
            "confidence": float(np.clip(combined, 0, 1)),
            "per_channel_weights": dict(zip(
                [r["channel"] for r in channel_results],
                [float(w) for w in weights],
            )),
        }

    def _estimate_weights(self, results: list, degradation) -> list:
        """Estimate channel reliability weights based on degradation type."""
        weights = []
        for result in results:
            channel = result["channel"]
            prior = self.CHANNEL_PRIORS.get(channel, 0.5)

            # Adjust for degradation
            jpeg_q = degradation.estimated_jpeg_quality
            if channel == "subpixel" and jpeg_q < 50:
                prior *= 0.5  # Sub-pixel patterns degrade heavily under compression
            if channel == "luminance" and degradation.is_photograph:
                prior *= 0.7  # Luminance less affected by screen photos

            weight = prior * result["confidence"]
            weights.append(weight)

        return weights
