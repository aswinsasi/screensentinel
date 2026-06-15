"""Image preprocessing pipeline for watermark extraction."""
import cv2
import numpy as np
from dataclasses import dataclass, field


@dataclass
class DegradationProfile:
    estimated_jpeg_quality: int = 95
    is_photograph: bool = False
    perspective_corrected: bool = False
    crop_ratio: float = 1.0
    noise_level: float = 0.0
    has_moire: bool = False

    def to_dict(self) -> dict:
        return {
            "compression_level": self._compression_label(),
            "perspective_distortion": self.perspective_corrected,
            "crop_detected": self.crop_ratio < 0.95,
            "estimated_source": "phone_camera" if self.is_photograph else "screenshot_tool",
            "moire_detected": self.has_moire,
            "estimated_jpeg_quality": self.estimated_jpeg_quality,
        }

    def _compression_label(self) -> str:
        q = self.estimated_jpeg_quality
        if q > 85:
            return "none"
        if q > 60:
            return "light"
        if q > 35:
            return "moderate"
        return "heavy"


@dataclass
class PreprocessResult:
    normalized: np.ndarray = field(repr=False)
    original_size: tuple = (0, 0)
    degradation: DegradationProfile = field(default_factory=DegradationProfile)


class ImagePreprocessor:
    """Normalize uploaded images for watermark extraction."""

    def process(self, image_bytes: bytes) -> PreprocessResult:
        # Decode image
        arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image")

        original_size = img.shape[:2]
        degradation = DegradationProfile()

        # Step 1: Estimate JPEG quality
        degradation.estimated_jpeg_quality = self._estimate_jpeg_quality(image_bytes)

        # Step 2: Detect if photo-of-screen
        degradation.is_photograph = self._detect_screen_photo(img)

        # Step 3: Perspective correction (if photo)
        if degradation.is_photograph:
            img, corrected = self._correct_perspective(img)
            degradation.perspective_corrected = corrected

        # Step 4: Color normalization
        img = self._normalize_color(img)

        # Step 5: Noise estimation and denoising
        degradation.noise_level = self._estimate_noise(img)
        if degradation.noise_level > 5.0:
            img = cv2.bilateralFilter(img, 9, 75, 75)

        return PreprocessResult(
            normalized=img,
            original_size=original_size,
            degradation=degradation,
        )

    def _estimate_jpeg_quality(self, image_bytes: bytes) -> int:
        """Estimate JPEG quality from file size heuristic."""
        # Simple heuristic: decode, re-encode at known qualities, compare sizes
        arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return 95
        h, w = img.shape[:2]
        pixels = h * w
        bpp = (len(image_bytes) * 8) / max(pixels, 1)

        if bpp > 4:
            return 95
        if bpp > 2:
            return 80
        if bpp > 1:
            return 60
        if bpp > 0.5:
            return 40
        return 20

    def _detect_screen_photo(self, img: np.ndarray) -> bool:
        """Detect screen photos via frequency domain analysis."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        f_transform = np.fft.fft2(gray)
        f_shift = np.fft.fftshift(f_transform)
        magnitude = np.log(np.abs(f_shift) + 1)

        # Screen photos show periodic peaks (moire)
        h, w = magnitude.shape
        center_h, center_w = h // 2, w // 2
        # Exclude center region and look for bright peaks
        mask = np.zeros_like(magnitude, dtype=bool)
        mask[center_h - 20:center_h + 20, center_w - 20:center_w + 20] = True
        magnitude[mask] = 0

        threshold = np.mean(magnitude) + 3 * np.std(magnitude)
        peaks = np.sum(magnitude > threshold)
        return peaks > 50

    def _correct_perspective(self, img: np.ndarray) -> tuple:
        """Attempt perspective correction using edge detection."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            return img, False

        # Find largest contour
        largest = max(contours, key=cv2.contourArea)
        epsilon = 0.02 * cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, epsilon, True)

        if len(approx) == 4:
            pts = approx.reshape(4, 2).astype(np.float32)
            # Order points: top-left, top-right, bottom-right, bottom-left
            pts = self._order_points(pts)
            w = max(np.linalg.norm(pts[1] - pts[0]), np.linalg.norm(pts[2] - pts[3]))
            h = max(np.linalg.norm(pts[3] - pts[0]), np.linalg.norm(pts[2] - pts[1]))
            dst = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
            M = cv2.getPerspectiveTransform(pts, dst)
            warped = cv2.warpPerspective(img, M, (int(w), int(h)))
            return warped, True

        return img, False

    def _order_points(self, pts: np.ndarray) -> np.ndarray:
        """Order 4 points as: top-left, top-right, bottom-right, bottom-left."""
        rect = np.zeros((4, 2), dtype=np.float32)
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]
        d = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(d)]
        rect[3] = pts[np.argmax(d)]
        return rect

    def _normalize_color(self, img: np.ndarray) -> np.ndarray:
        """Normalize to consistent color space."""
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l = clahe.apply(l)
        normalized = cv2.merge([l, a, b])
        return cv2.cvtColor(normalized, cv2.COLOR_LAB2BGR)

    def _estimate_noise(self, img: np.ndarray) -> float:
        """Estimate noise level using Laplacian variance."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        return float(laplacian.var()) ** 0.5 / 100
