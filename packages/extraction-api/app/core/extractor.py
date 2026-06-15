"""Watermark extraction channels - classical CV implementations."""
import numpy as np


class SubPixelExtractor:
    """Extract Layer 1 (sub-pixel patterns) using spatial analysis."""

    def extract(self, image: np.ndarray) -> dict:
        """
        Classical extraction: analyze high-frequency spatial components.
        This is the baseline implementation - will be replaced by ML in Phase 5.
        """
        h, w = image.shape[:2]

        # Convert to grayscale for analysis
        if len(image.shape) == 3:
            gray = np.mean(image, axis=2)
        else:
            gray = image.astype(float)

        # High-pass filter to isolate micro-patterns
        kernel_size = 3
        blurred = self._gaussian_blur(gray, kernel_size)
        highpass = gray - blurred

        # Analyze energy distribution in grid cells
        grid_rows, grid_cols = 8, 16
        cell_h, cell_w = h // grid_rows, w // grid_cols
        bit_probs = []

        for r in range(grid_rows):
            for c in range(grid_cols):
                y1, y2 = r * cell_h, (r + 1) * cell_h
                x1, x2 = c * cell_w, (c + 1) * cell_w
                cell = highpass[y1:y2, x1:x2]

                # Compute local statistics
                energy = float(np.std(cell))
                bit_probs.append(min(1.0, max(0.0, energy / 10.0)))

        confidence = self._estimate_confidence(bit_probs)

        return {
            "bit_probabilities": bit_probs,
            "confidence": confidence,
            "channel": "subpixel",
        }

    def _gaussian_blur(self, img: np.ndarray, ksize: int) -> np.ndarray:
        """Simple box blur approximation."""
        from scipy.ndimage import uniform_filter
        return uniform_filter(img, size=ksize)

    def _estimate_confidence(self, probs: list) -> float:
        """Estimate extraction confidence from bit probability distribution."""
        arr = np.array(probs)
        # High confidence when bits are clearly 0 or 1 (far from 0.5)
        clarity = np.mean(np.abs(arr - 0.5) * 2)
        return float(np.clip(clarity, 0, 1))


class LuminanceExtractor:
    """Extract Layer 2 (luminance modulation) using brightness analysis."""

    def extract(self, image: np.ndarray) -> dict:
        h, w = image.shape[:2]

        # Convert to LAB and use L channel
        if len(image.shape) == 3:
            # Use luminance channel
            luminance = 0.299 * image[:,:,2] + 0.587 * image[:,:,1] + 0.114 * image[:,:,0]
        else:
            luminance = image.astype(float)

        # Divide into regions and analyze brightness deviations
        grid_rows, grid_cols = 8, 16
        cell_h, cell_w = h // grid_rows, w // grid_cols
        global_mean = float(np.mean(luminance))

        bit_probs = []
        for r in range(grid_rows):
            for c in range(grid_cols):
                y1, y2 = r * cell_h, (r + 1) * cell_h
                x1, x2 = c * cell_w, (c + 1) * cell_w
                cell = luminance[y1:y2, x1:x2]
                local_mean = float(np.mean(cell))

                # Brighter than average = bit 1, dimmer = bit 0
                delta = (local_mean - global_mean) / max(global_mean, 1)
                prob = 0.5 + delta * 50  # Scale small deltas to [0, 1]
                bit_probs.append(float(np.clip(prob, 0, 1)))

        confidence = self._estimate_confidence(bit_probs)

        return {
            "bit_probabilities": bit_probs,
            "confidence": confidence,
            "channel": "luminance",
        }

    def _estimate_confidence(self, probs: list) -> float:
        arr = np.array(probs)
        clarity = np.mean(np.abs(arr - 0.5) * 2)
        return float(np.clip(clarity, 0, 1))


class MacroLuminanceExtractor:
    """Extract Layer 5 (macro luminance) using large-zone brightness analysis.

    This is the most print/photo resilient extractor because it operates on
    large 4x4 grid zones rather than fine detail. Even a 160x90px image
    provides enough resolution for this extractor.
    """

    GRID_COLS = 4
    GRID_ROWS = 4

    def extract(self, image: np.ndarray) -> dict:
        h, w = image.shape[:2]

        if len(image.shape) == 3:
            luminance = 0.299 * image[:,:,2] + 0.587 * image[:,:,1] + 0.114 * image[:,:,0]
        else:
            luminance = image.astype(float)

        zone_h = h // self.GRID_ROWS
        zone_w = w // self.GRID_COLS
        global_mean = float(np.mean(luminance))

        bit_probs = []
        for r in range(self.GRID_ROWS):
            for c in range(self.GRID_COLS):
                y1, y2 = r * zone_h, (r + 1) * zone_h
                x1, x2 = c * zone_w, (c + 1) * zone_w
                zone = luminance[y1:y2, x1:x2]
                zone_mean = float(np.mean(zone))

                # Larger zones = more reliable delta measurement
                delta = (zone_mean - global_mean) / max(global_mean, 1)
                # Stronger scaling because macro deltas are 2-4% vs 0.5-1.5%
                prob = 0.5 + delta * 25
                bit_probs.append(float(np.clip(prob, 0, 1)))

        confidence = self._estimate_confidence(bit_probs)

        return {
            "bit_probabilities": bit_probs,
            "confidence": confidence,
            "channel": "macro_luminance",
        }

    def _estimate_confidence(self, probs: list) -> float:
        arr = np.array(probs)
        clarity = np.mean(np.abs(arr - 0.5) * 2)
        # Macro luminance is inherently more reliable
        return float(np.clip(clarity * 1.2, 0, 1))


class StructuralLayoutExtractor:
    """Extract Layer 6 (structural layout) using content-block spacing analysis.

    Detects content blocks via edge detection and measures inter-block
    spacing ratios. The ratios encode identity bits because the SDK
    shifted margins/padding by ±1-2px per bit.

    This is the ultimate physical-capture survivor because layout geometry
    is preserved through printing, photography, and even photocopying.
    """

    def extract(self, image: np.ndarray) -> dict:
        h, w = image.shape[:2]

        if len(image.shape) == 3:
            gray = np.mean(image, axis=2).astype(np.uint8)
        else:
            gray = image.astype(np.uint8)

        # Detect content block boundaries using edge detection
        # Use Sobel for horizontal and vertical edges
        sobel_h = np.abs(np.diff(gray.astype(float), axis=0))
        sobel_v = np.abs(np.diff(gray.astype(float), axis=1))

        # Find horizontal spacing patterns (vertical edges = column boundaries)
        col_energy = np.mean(sobel_v, axis=0)
        # Find vertical spacing patterns (horizontal edges = row boundaries)
        row_energy = np.mean(sobel_h, axis=1)

        # Detect peaks (content block boundaries)
        col_peaks = self._find_peaks(col_energy, min_distance=w // 20)
        row_peaks = self._find_peaks(row_energy, min_distance=h // 20)

        # Compute spacing ratios between consecutive peaks
        bit_probs = []

        # Horizontal spacing ratios
        if len(col_peaks) >= 3:
            spacings = np.diff(col_peaks).astype(float)
            mean_spacing = np.mean(spacings)
            for s in spacings[:64]:
                # Wider than mean = bit 1, narrower = bit 0
                ratio = s / max(mean_spacing, 1)
                prob = 0.5 + (ratio - 1.0) * 20  # Amplify small differences
                bit_probs.append(float(np.clip(prob, 0, 1)))

        # Vertical spacing ratios
        if len(row_peaks) >= 3:
            spacings = np.diff(row_peaks).astype(float)
            mean_spacing = np.mean(spacings)
            for s in spacings[:64]:
                ratio = s / max(mean_spacing, 1)
                prob = 0.5 + (ratio - 1.0) * 20
                bit_probs.append(float(np.clip(prob, 0, 1)))

        # Pad to expected length if needed
        while len(bit_probs) < 16:
            bit_probs.append(0.5)  # No information

        confidence = self._estimate_confidence(bit_probs)

        return {
            "bit_probabilities": bit_probs,
            "confidence": confidence,
            "channel": "structural_layout",
        }

    def _find_peaks(self, signal: np.ndarray, min_distance: int = 10) -> list:
        """Simple peak detection via local maxima."""
        peaks = []
        for i in range(min_distance, len(signal) - min_distance):
            window = signal[max(0, i-min_distance):i+min_distance+1]
            if signal[i] == np.max(window) and signal[i] > np.mean(signal) * 1.5:
                if not peaks or (i - peaks[-1]) >= min_distance:
                    peaks.append(i)
        return peaks

    def _estimate_confidence(self, probs: list) -> float:
        arr = np.array(probs)
        non_neutral = arr[np.abs(arr - 0.5) > 0.05]
        if len(non_neutral) == 0:
            return 0.0
        clarity = np.mean(np.abs(non_neutral - 0.5) * 2)
        return float(np.clip(clarity, 0, 1))


class ColorChannelExtractor:
    """Extract Layer 7 (color channel) by analyzing R, G, B independently.

    Splits the image into color channels and runs grid-based analysis
    on each. Even if one channel is destroyed (grayscale conversion),
    the other two carry enough bits for identity recovery.
    """

    GRID_SIZE = 7  # 7x7 grid per channel

    def extract(self, image: np.ndarray) -> dict:
        if len(image.shape) != 3 or image.shape[2] < 3:
            return {"bit_probabilities": [0.5] * 128, "confidence": 0.0, "channel": "color_channel"}

        h, w = image.shape[:2]
        cell_h = h // self.GRID_SIZE
        cell_w = w // self.GRID_SIZE

        all_probs = []

        # Process each color channel independently
        for ch_idx in range(3):  # B, G, R in OpenCV
            channel = image[:, :, ch_idx].astype(float)
            ch_mean = float(np.mean(channel))

            for r in range(self.GRID_SIZE):
                for c in range(self.GRID_SIZE):
                    y1, y2 = r * cell_h, (r + 1) * cell_h
                    x1, x2 = c * cell_w, (c + 1) * cell_w
                    cell = channel[y1:y2, x1:x2]
                    cell_mean = float(np.mean(cell))

                    delta = (cell_mean - ch_mean) / max(ch_mean, 1)
                    prob = 0.5 + delta * 30
                    all_probs.append(float(np.clip(prob, 0, 1)))

        confidence = self._estimate_confidence(all_probs)

        return {
            "bit_probabilities": all_probs[:128],
            "confidence": confidence,
            "channel": "color_channel",
        }

    def _estimate_confidence(self, probs: list) -> float:
        arr = np.array(probs)
        clarity = np.mean(np.abs(arr - 0.5) * 2)
        return float(np.clip(clarity, 0, 1))
