"""Main extraction pipeline - uses ML model when available, falls back to classical."""
import json
import numpy as np
from datetime import datetime, timezone
from app.core.preprocessor import ImagePreprocessor
from app.core.extractor import (
    SubPixelExtractor,
    LuminanceExtractor,
    MacroLuminanceExtractor,
    StructuralLayoutExtractor,
    ColorChannelExtractor,
)
from app.core.fusion import BayesianFusion
from app.db.session_store import SessionStore
from app.ml.ml_extractor import MLExtractor


class ExtractionPipeline:
    def __init__(self):
        self.preprocessor = ImagePreprocessor()
        self.subpixel_extractor = SubPixelExtractor()
        self.luminance_extractor = LuminanceExtractor()
        self.macro_luminance_extractor = MacroLuminanceExtractor()
        self.structural_layout_extractor = StructuralLayoutExtractor()
        self.color_channel_extractor = ColorChannelExtractor()
        self.fusion = BayesianFusion()
        self.session_store = SessionStore()
        self.ml_extractor = MLExtractor()
        self.last_layer_scores = {}
        self.last_image = None

    async def extract(self, image_bytes: bytes, extraction_id: str) -> dict:
        start_time = datetime.now(timezone.utc)

        # Step 1: Preprocess
        result = self.preprocessor.process(image_bytes)

        # Step 2: Try ML extraction first
        ml_result = self.ml_extractor.extract(result.normalized)

        if ml_result['model_used']:
            # ─── ML PATH (Phase 5) ───
            return self._ml_extraction(
                ml_result, result, extraction_id, start_time
            )
        else:
            # ─── Classical PATH (Phase 3 fallback) ───
            return self._classical_extraction(
                result, extraction_id, start_time
            )

    def _ml_extraction(self, ml_result, preprocess_result, extraction_id, start_time):
        """ML-powered extraction: use ML for presence, classical for matching."""

        # ML says no watermark → reject
        if not ml_result['is_watermarked']:
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
            return {
                "extraction_id": extraction_id,
                "attribution": {
                    "user_id": "no_watermark_detected",
                    "session_id": "none",
                    "confidence": round(ml_result['presence_confidence'], 4),
                    "match_type": "ml_no_watermark",
                },
                "per_layer_confidence": {
                    "ml_presence": round(ml_result['presence_confidence'], 4),
                    "ml_bit_confidence": round(ml_result['bit_confidence'], 4),
                },
                "degradation_analysis": preprocess_result.degradation.to_dict(),
                "processing_time_ms": round((datetime.now(timezone.utc) - start_time).total_seconds() * 1000, 1),
                "extraction_method": "ml",
            }

        # ML says watermark IS present → run classical extractors for scoring
        subpixel_result = self.subpixel_extractor.extract(preprocess_result.normalized)
        luminance_result = self.luminance_extractor.extract(preprocess_result.normalized)
        macro_result = self.macro_luminance_extractor.extract(preprocess_result.normalized)
        structural_result = self.structural_layout_extractor.extract(preprocess_result.normalized)
        color_result = self.color_channel_extractor.extract(preprocess_result.normalized)

        all_results = [subpixel_result, luminance_result, macro_result, structural_result, color_result]
        fused = self.fusion.fuse(all_results, preprocess_result.degradation)

        self.last_image = preprocess_result.normalized

        # Use dimension-based session matching
        self.last_layer_scores = {
            "subpixel": subpixel_result["confidence"],
            "luminance": luminance_result["confidence"],
            "macro_luminance": macro_result["confidence"],
            "structural_layout": structural_result["confidence"],
            "color_channel": color_result["confidence"],
        }
        attribution = self._classical_lookup_session(fused["confidence"], preprocess_result.normalized.shape)

        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        return {
            "extraction_id": extraction_id,
            "attribution": attribution,
            "per_layer_confidence": {
                "ml_presence": round(ml_result['presence_confidence'], 4),
                "subpixel": round(subpixel_result["confidence"], 4),
                "luminance": round(luminance_result["confidence"], 4),
                "macro_luminance": round(macro_result["confidence"], 4),
                "structural_layout": round(structural_result["confidence"], 4),
                "color_channel": round(color_result["confidence"], 4),
            },
            "degradation_analysis": preprocess_result.degradation.to_dict(),
            "processing_time_ms": round(elapsed, 1),
            "extraction_method": "ml_hybrid",
        }
        """ML-powered extraction path."""

        # Use ML model's watermark presence detection
        if not ml_result['is_watermarked']:
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
            return {
                "extraction_id": extraction_id,
                "attribution": {
                    "user_id": "no_watermark_detected",
                    "session_id": "none",
                    "confidence": round(ml_result['presence_confidence'], 4),
                    "match_type": "ml_no_watermark",
                },
                "per_layer_confidence": {
                    "ml_presence": round(ml_result['presence_confidence'], 4),
                    "ml_bit_confidence": round(ml_result['bit_confidence'], 4),
                },
                "degradation_analysis": preprocess_result.degradation.to_dict(),
                "processing_time_ms": round(elapsed, 1),
                "extraction_method": "ml",
            }

        # Watermark detected — look up session
        attribution = self._ml_lookup_session(
            ml_result['presence_confidence'],
            ml_result['bits'],
            preprocess_result.normalized.shape
        )

        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        return {
            "extraction_id": extraction_id,
            "attribution": attribution,
            "per_layer_confidence": {
                "ml_presence": round(ml_result['presence_confidence'], 4),
                "ml_bit_confidence": round(ml_result['bit_confidence'], 4),
            },
            "degradation_analysis": preprocess_result.degradation.to_dict(),
            "processing_time_ms": round(elapsed, 1),
            "extraction_method": "ml",
        }

    def _classical_extraction(self, preprocess_result, extraction_id, start_time):
        """Classical CV extraction path (fallback when no ML model)."""

        # Run all classical extraction channels
        subpixel_result = self.subpixel_extractor.extract(preprocess_result.normalized)
        luminance_result = self.luminance_extractor.extract(preprocess_result.normalized)
        macro_result = self.macro_luminance_extractor.extract(preprocess_result.normalized)
        structural_result = self.structural_layout_extractor.extract(preprocess_result.normalized)
        color_result = self.color_channel_extractor.extract(preprocess_result.normalized)

        all_results = [
            subpixel_result, luminance_result, macro_result,
            structural_result, color_result,
        ]

        # Fuse results
        fused = self.fusion.fuse(all_results, preprocess_result.degradation)

        self.last_image = preprocess_result.normalized
        # Store layer scores for lookup
        self.last_layer_scores = {
            "subpixel": subpixel_result["confidence"],
            "luminance": luminance_result["confidence"],
            "macro_luminance": macro_result["confidence"],
            "structural_layout": structural_result["confidence"],
            "color_channel": color_result["confidence"],
        }

        # Session lookup
        attribution = self._classical_lookup_session(
            fused["confidence"], preprocess_result.normalized.shape
        )

        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        return {
            "extraction_id": extraction_id,
            "attribution": attribution,
            "per_layer_confidence": {
                "subpixel": round(subpixel_result["confidence"], 4),
                "luminance": round(luminance_result["confidence"], 4),
                "macro_luminance": round(macro_result["confidence"], 4),
                "structural_layout": round(structural_result["confidence"], 4),
                "color_channel": round(color_result["confidence"], 4),
                "svg_mesh": 0.0,
                "temporal": 0.0,
            },
            "degradation_analysis": preprocess_result.degradation.to_dict(),
            "processing_time_ms": round(elapsed, 1),
            "extraction_method": "classical",
        }

    def _ml_lookup_session(self, confidence, extracted_bits, image_shape):
        """Session lookup using ML-extracted bits."""
        try:
            sessions = self.session_store.find_all_recent(hours=168)
            if not sessions:
                return {"user_id": "no_sessions_in_db", "confidence": 0.0, "match_type": "no_data"}

            # Match extracted bits against each session's expected pattern
            best_match = None
            best_score = 0.0

            for session in sessions:
                seed = session["pattern_seed"]
                expected = self._generate_expected_bits(seed, len(extracted_bits))
                similarity = self._bit_similarity(extracted_bits, expected)

                if similarity > best_score:
                    best_score = similarity
                    best_match = session

            # Require minimum similarity for attribution
            if best_score < 0.6:
                return {
                    "user_id": "no_match",
                    "session_id": "none",
                    "confidence": round(best_score, 4),
                    "match_type": "ml_below_threshold",
                    "best_similarity": round(best_score, 4),
                }

            return {
                "user_id": best_match["user_id"],
                "session_id": best_match["session_id"],
                "watermark_id": best_match["watermark_id"],
                "confidence": round(confidence * best_score, 4),
                "page_context": best_match.get("page_context", "/"),
                "match_type": "ml_bit_match",
                "similarity_score": round(best_score, 4),
                "sessions_searched": len(sessions),
            }

        except Exception as e:
            print(f"ML session lookup error: {e}")
            return {"user_id": "db_error", "confidence": 0.0, "error": str(e)}

    def _classical_lookup_session(self, confidence, image_shape):
        """Match by comparing extracted features against each session's expected pattern."""
        try:
            sessions = self.session_store.find_all_recent(hours=168)
            if not sessions:
                return {"user_id": "no_sessions_in_db", "confidence": 0.0, "match_type": "no_data"}

            high_layers = sum(1 for s in self.last_layer_scores.values() if s > 0.6)
            if high_layers < 3:
                return {
                    "user_id": "no_watermark_detected",
                    "session_id": "none",
                    "confidence": 0.0,
                    "match_type": "low_confidence",
                    "high_confidence_layers": high_layers,
                }

            # Get the extracted luminance pattern from the image
            extracted_pattern = self._extract_luminance_pattern(self.last_image)

            # Compare against each session's expected pattern
            best_match = None
            best_score = -1.0

            for session in sessions:
                seed = session.get("pattern_seed", 0)
                expected_pattern = self._generate_luminance_pattern(seed)
                score = self._correlate_patterns(extracted_pattern, expected_pattern)

                if score > best_score:
                    best_score = score
                    best_match = session

            if best_match is None or best_score < 0.1:
                return {
                    "user_id": "no_match",
                    "session_id": "none",
                    "confidence": 0.0,
                    "match_type": "no_pattern_match",
                }

            return {
                "user_id": best_match["user_id"],
                "session_id": best_match["session_id"],
                "watermark_id": best_match["watermark_id"],
                "confidence": round(confidence * min(best_score * 2, 1.0), 4),
                "page_context": best_match.get("page_context", "/"),
                "match_type": "template_match",
                "match_score": round(best_score, 4),
                "sessions_searched": len(sessions),
            }

        except Exception as e:
            print(f"Session lookup error: {e}")
            return {"user_id": "db_error", "confidence": 0.0, "error": str(e)}

    def _extract_luminance_pattern(self, image):
        """Extract 8x16 luminance grid from the image."""
        import numpy as np
        if len(image.shape) == 3:
            gray = 0.299 * image[:,:,2] + 0.587 * image[:,:,1] + 0.114 * image[:,:,0]
        else:
            gray = image.astype(float)

        h, w = gray.shape
        grid_r, grid_c = 8, 16
        cell_h, cell_w = h // grid_r, w // grid_c
        global_mean = float(np.mean(gray))

        pattern = []
        for r in range(grid_r):
            for c in range(grid_c):
                y1, y2 = r * cell_h, (r + 1) * cell_h
                x1, x2 = c * cell_w, (c + 1) * cell_w
                cell_mean = float(np.mean(gray[y1:y2, x1:x2]))
                # Positive = brighter than average, negative = dimmer
                pattern.append(cell_mean - global_mean)

        return pattern

    def _generate_luminance_pattern(self, seed):
        """Regenerate expected luminance pattern from seed (matches SDK logic)."""
        # Mulberry32 PRNG matching the SDK's SeededPRNG
        state = (seed ^ 0x4C554D49) & 0xFFFFFFFF  # Same XOR as LuminanceLayer

        pattern = []
        for i in range(128):  # 8x16 grid
            # Advance PRNG (Mulberry32)
            state = (state + 0x6D2B79F5) & 0xFFFFFFFF
            t = state
            t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
            t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF))) & 0xFFFFFFFF
            prng_val = ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

            # Generate expected bit from seed + position
            import hashlib
            h = hashlib.sha256(f"{seed}:{i}".encode()).digest()
            bit = (h[0] >> (i % 8)) & 1

            # Expected direction: bit 1 = brighter, bit 0 = dimmer
            magnitude = 0.005 + prng_val * 0.01
            direction = 1.0 if bit == 1 else -1.0
            pattern.append(direction * magnitude * 255)  # Scale to pixel range

        return pattern

    def _correlate_patterns(self, extracted, expected):
        """Compute normalized correlation between two patterns."""
        import numpy as np
        a = np.array(extracted)
        b = np.array(expected)

        min_len = min(len(a), len(b))
        a = a[:min_len]
        b = b[:min_len]

        # Normalize
        a_norm = a - np.mean(a)
        b_norm = b - np.mean(b)

        denom = np.sqrt(np.sum(a_norm**2) * np.sum(b_norm**2))
        if denom < 1e-10:
            return 0.0

        correlation = float(np.sum(a_norm * b_norm) / denom)
        return correlation
        """Session lookup for classical extraction (dimension-based)."""
        try:
            sessions = self.session_store.find_all_recent(hours=168)
            if not sessions:
                return {"user_id": "no_sessions_in_db", "confidence": 0.0, "match_type": "no_data"}

            img_h, img_w = image_shape[:2]

            matched_session = None
            for session in sessions:
                viewport = session.get("viewport")
                if not viewport:
                    continue
                if isinstance(viewport, str):
                    viewport = json.loads(viewport)

                vp_w = viewport.get("width", 0)
                vp_h = viewport.get("height", 0)
                if vp_w == 0 or vp_h == 0:
                    continue

                w_ratio = img_w / vp_w
                h_ratio = img_h / vp_h
                if 0.3 < w_ratio < 2.0 and 0.3 < h_ratio < 2.0:
                    matched_session = session
                    break

            if not matched_session:
                return {
                    "user_id": "no_matching_session",
                    "session_id": "none",
                    "confidence": 0.0,
                    "match_type": "dimension_mismatch",
                    "image_size": f"{img_w}x{img_h}",
                }

            high_layers = sum(1 for s in self.last_layer_scores.values() if s > 0.5)
            return {
                "user_id": matched_session["user_id"],
                "session_id": matched_session["session_id"],
                "watermark_id": matched_session["watermark_id"],
                "confidence": round(confidence, 4),
                "page_context": matched_session.get("page_context", "/"),
                "match_type": "classical_dimension",
                "high_confidence_layers": high_layers,
            }

        except Exception as e:
            print(f"Classical lookup error: {e}")
            return {"user_id": "db_error", "confidence": 0.0, "error": str(e)}

    def _generate_expected_bits(self, seed, num_bits):
        """Generate expected bit pattern from seed (Mulberry32 PRNG)."""
        import hashlib
        # Use seed to generate deterministic bits
        h = hashlib.sha256(str(seed).encode()).digest()
        bits = []
        for i in range(num_bits):
            byte_idx = i // 8
            bit_idx = i % 8
            if byte_idx < len(h):
                bits.append((h[byte_idx] >> bit_idx) & 1)
            else:
                bits.append(i % 2)
        return bits

    def _bit_similarity(self, extracted, expected):
        """Compute percentage of matching bits."""
        min_len = min(len(extracted), len(expected))
        if min_len == 0:
            return 0.0
        matches = sum(1 for i in range(min_len) if extracted[i] == expected[i])
        return matches / min_len
