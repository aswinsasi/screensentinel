"""
Synthetic Training Data Generator for ScreenSentinel ML.

Generates pairs of:
  - Watermarked images (with known bit patterns)
  - Non-watermarked images (clean)
  - Degraded versions (JPEG, crop, noise, etc.)

No browser needed - creates page-like images programmatically.
"""
import os
import cv2
import json
import numpy as np
from pathlib import Path
from dataclasses import dataclass


@dataclass
class Sample:
    image: np.ndarray
    bits: np.ndarray          # 128-bit target (zeros for non-watermarked)
    is_watermarked: bool
    degradation: str          # 'clean', 'jpeg_50', 'crop_70', etc.


class SeededPRNG:
    """Python port of the SDK's Mulberry32 PRNG."""
    def __init__(self, seed: int):
        self.state = seed & 0xFFFFFFFF

    def next(self) -> float:
        self.state = (self.state + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    def next_float(self, lo=0.0, hi=1.0) -> float:
        return lo + self.next() * (hi - lo)

    def next_int(self, lo: int, hi: int) -> int:
        return int(self.next_float(lo, hi + 1))


class PageGenerator:
    """Generate realistic page-like background images."""

    def __init__(self, width=512, height=384):
        self.width = width
        self.height = height

    def generate(self, seed: int) -> np.ndarray:
        rng = np.random.RandomState(seed)
        style = rng.choice(['dark_dashboard', 'light_page', 'mixed', 'data_table'])

        if style == 'dark_dashboard':
            return self._dark_dashboard(rng)
        elif style == 'light_page':
            return self._light_page(rng)
        elif style == 'data_table':
            return self._data_table(rng)
        else:
            return self._mixed(rng)

    def _dark_dashboard(self, rng) -> np.ndarray:
        img = np.full((self.height, self.width, 3), [15, 23, 42], dtype=np.uint8)
        # Add card-like rectangles
        for _ in range(rng.randint(4, 10)):
            x1, y1 = rng.randint(10, self.width - 100), rng.randint(10, self.height - 60)
            w, h = rng.randint(80, 200), rng.randint(40, 120)
            color = [30 + rng.randint(0, 15), 41 + rng.randint(0, 15), 59 + rng.randint(0, 15)]
            cv2.rectangle(img, (x1, y1), (x1 + w, y1 + h), color, -1)
            # Border
            cv2.rectangle(img, (x1, y1), (x1 + w, y1 + h), [51, 65, 85], 1)
        # Add some text-like lines
        for _ in range(rng.randint(5, 15)):
            x = rng.randint(20, self.width - 100)
            y = rng.randint(20, self.height - 10)
            length = rng.randint(30, 150)
            color = [200 + rng.randint(0, 55)] * 3
            cv2.line(img, (x, y), (x + length, y), color, 1)
        return img

    def _light_page(self, rng) -> np.ndarray:
        img = np.full((self.height, self.width, 3), [245, 245, 250], dtype=np.uint8)
        for _ in range(rng.randint(3, 8)):
            x1, y1 = rng.randint(10, self.width - 100), rng.randint(10, self.height - 60)
            w, h = rng.randint(80, 250), rng.randint(40, 100)
            cv2.rectangle(img, (x1, y1), (x1 + w, y1 + h), [255, 255, 255], -1)
            cv2.rectangle(img, (x1, y1), (x1 + w, y1 + h), [220, 220, 225], 1)
        for _ in range(rng.randint(5, 20)):
            x = rng.randint(20, self.width - 100)
            y = rng.randint(20, self.height - 10)
            length = rng.randint(30, 200)
            cv2.line(img, (x, y), (x + length, y), [50 + rng.randint(0, 50)] * 3, 1)
        return img

    def _data_table(self, rng) -> np.ndarray:
        bg = rng.choice([20, 240])
        img = np.full((self.height, self.width, 3), bg, dtype=np.uint8)
        rows = rng.randint(5, 12)
        row_h = self.height // (rows + 1)
        for r in range(rows):
            y = (r + 1) * row_h
            shade = int(np.clip(bg + (10 if r % 2 == 0 else -5), 0, 255))
            cv2.rectangle(img, (10, y), (self.width - 10, y + row_h - 2), [shade] * 3, -1)
            # Columns
            for c in range(rng.randint(3, 6)):
                cx = 10 + c * (self.width // 6)
                line_color = int(np.clip(bg + 30 if bg < 128 else bg - 30, 0, 255))
                cv2.line(img, (cx, y), (cx, y + row_h), [line_color] * 3, 1)
        return img

    def _mixed(self, rng) -> np.ndarray:
        img = np.full((self.height, self.width, 3), rng.randint(10, 245), dtype=np.uint8)
        for _ in range(rng.randint(5, 15)):
            shape = rng.choice(['rect', 'line', 'circle'])
            color = [rng.randint(0, 255) for _ in range(3)]
            if shape == 'rect':
                x1, y1 = rng.randint(0, self.width), rng.randint(0, self.height)
                cv2.rectangle(img, (x1, y1), (x1 + rng.randint(20, 150), y1 + rng.randint(20, 80)), color, -1)
            elif shape == 'line':
                x1, y1 = rng.randint(0, self.width), rng.randint(0, self.height)
                cv2.line(img, (x1, y1), (x1 + rng.randint(20, 200), y1), color, 1)
            else:
                cx, cy = rng.randint(0, self.width), rng.randint(0, self.height)
                cv2.circle(img, (cx, cy), rng.randint(5, 40), color, -1)
        return img


class WatermarkEmbedder:
    """Python port of SDK watermark embedding (simplified for training data)."""

    def __init__(self, num_bits=128):
        self.num_bits = num_bits

    def generate_bits(self, user_id: str, session_id: str) -> np.ndarray:
        """Generate identity bits (matches SDK BitEncoder)."""
        # Simple hash-based bit generation
        import hashlib
        h = hashlib.sha256(f"{user_id}:{session_id}".encode()).digest()
        bits = np.zeros(self.num_bits, dtype=np.float32)
        for i in range(self.num_bits):
            byte_idx = i // 8
            bit_idx = i % 8
            if byte_idx < len(h):
                bits[i] = float((h[byte_idx] >> bit_idx) & 1)
            else:
                bits[i] = float(i % 2)
        return bits

    def embed(self, image: np.ndarray, bits: np.ndarray, seed: int, intensity: float = 1.0) -> np.ndarray:
        """Embed watermark into image using all layer techniques."""
        result = image.copy().astype(np.float32)
        h, w = result.shape[:2]

        # Layer 2: Luminance modulation (most important)
        result = self._embed_luminance(result, bits, seed, h, w, intensity)

        # Layer 5: Macro luminance (large zones)
        result = self._embed_macro_luminance(result, bits, seed, h, w, intensity)

        # Layer 7: Color channel encoding
        result = self._embed_color_channel(result, bits, seed, h, w, intensity)

        # Layer 1: Sub-pixel patterns (subtle)
        result = self._embed_subpixel(result, bits, seed, h, w, intensity)

        return np.clip(result, 0, 255).astype(np.uint8)

    def _embed_luminance(self, img, bits, seed, h, w, intensity):
        prng = SeededPRNG(seed ^ 0x4C554D49)
        grid_r, grid_c = 8, 16
        cell_h, cell_w = h // grid_r, w // grid_c

        for r in range(grid_r):
            for c in range(grid_c):
                bit_idx = (r * grid_c + c) % len(bits)
                direction = 1.0 if bits[bit_idx] > 0.5 else -1.0
                magnitude = (0.005 + prng.next() * 0.01) * intensity
                delta = direction * magnitude

                y1, y2 = r * cell_h, (r + 1) * cell_h
                x1, x2 = c * cell_w, (c + 1) * cell_w
                img[y1:y2, x1:x2] *= (1.0 + delta)

        return img

    def _embed_macro_luminance(self, img, bits, seed, h, w, intensity):
        prng = SeededPRNG(seed ^ 0x4D41434C)
        grid_r, grid_c = 4, 4
        zone_h, zone_w = h // grid_r, w // grid_c

        for r in range(grid_r):
            for c in range(grid_c):
                bit_idx = (r * grid_c + c) % len(bits)
                is_bright = bits[bit_idx] > 0.5

                opacity = (0.02 + prng.next() * 0.02) * intensity
                y1, y2 = r * zone_h, (r + 1) * zone_h
                x1, x2 = c * zone_w, (c + 1) * zone_w

                if is_bright:
                    img[y1:y2, x1:x2] += opacity * 255
                else:
                    img[y1:y2, x1:x2] -= opacity * 255

        return img

    def _embed_color_channel(self, img, bits, seed, h, w, intensity):
        prng = SeededPRNG(seed ^ 0x52474221)
        grid_size = 7
        cell_h, cell_w = h // grid_size, w // grid_size
        channels = [
            (0, 0.008),   # Blue
            (1, 0.006),   # Green
            (2, 0.010),   # Red
        ]

        bit_offset = 0
        for ch_idx, base_opacity in channels:
            for r in range(grid_size):
                for c in range(grid_size):
                    if bit_offset >= len(bits):
                        bit_offset = 0
                    bit = bits[bit_offset]
                    bit_offset += 1

                    if bit > 0.5:
                        y1, y2 = r * cell_h, (r + 1) * cell_h
                        x1, x2 = c * cell_w, (c + 1) * cell_w
                        img[y1:y2, x1:x2, ch_idx] += base_opacity * intensity * 255

        return img

    def _embed_subpixel(self, img, bits, seed, h, w, intensity):
        prng = SeededPRNG(seed ^ 0x5350584C)
        for i in range(min(len(bits), 128)):
            x = int(prng.next_float(5, w - 5))
            y = int(prng.next_float(5, h - 5))
            size = int(1 + prng.next() * 2)
            opacity = (0.01 + prng.next() * 0.02) * intensity
            use_black = prng.next() > 0.5

            color_val = 0.0 if use_black else 255.0
            is_circle = bits[i] > 0.5

            # Draw small mark
            for dy in range(-size, size + 1):
                for dx in range(-size, size + 1):
                    px, py = x + dx, y + dy
                    if 0 <= px < w and 0 <= py < h:
                        if is_circle and (dx*dx + dy*dy > size*size):
                            continue
                        img[py, px] = img[py, px] * (1 - opacity) + color_val * opacity

        return img


class DegradationPipeline:
    """Apply realistic degradation to training images."""

    def apply(self, img: np.ndarray, degradation_type: str, rng: np.random.RandomState) -> np.ndarray:
        if degradation_type == 'clean':
            return img
        elif degradation_type == 'jpeg_80':
            return self._jpeg(img, 80)
        elif degradation_type == 'jpeg_50':
            return self._jpeg(img, 50)
        elif degradation_type == 'jpeg_30':
            return self._jpeg(img, 30)
        elif degradation_type == 'crop_80':
            return self._crop(img, 0.8, rng)
        elif degradation_type == 'crop_50':
            return self._crop(img, 0.5, rng)
        elif degradation_type == 'noise':
            return self._noise(img, rng)
        elif degradation_type == 'resize_50':
            return self._resize(img, 0.5)
        elif degradation_type == 'color_jitter':
            return self._color_jitter(img, rng)
        elif degradation_type == 'combined_light':
            img = self._jpeg(img, 70)
            img = self._noise(img, rng, sigma=3)
            return img
        elif degradation_type == 'combined_heavy':
            img = self._jpeg(img, 40)
            img = self._crop(img, 0.7, rng)
            img = self._noise(img, rng, sigma=8)
            return img
        return img

    def _jpeg(self, img, quality):
        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
        _, buf = cv2.imencode('.jpg', img, encode_param)
        return cv2.imdecode(buf, cv2.IMREAD_COLOR)

    def _crop(self, img, ratio, rng):
        h, w = img.shape[:2]
        new_h, new_w = int(h * ratio), int(w * ratio)
        y = rng.randint(0, h - new_h + 1)
        x = rng.randint(0, w - new_w + 1)
        cropped = img[y:y+new_h, x:x+new_w]
        return cv2.resize(cropped, (w, h))

    def _noise(self, img, rng, sigma=5):
        noise = rng.normal(0, sigma, img.shape).astype(np.float32)
        return np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)

    def _resize(self, img, scale):
        h, w = img.shape[:2]
        small = cv2.resize(img, (int(w * scale), int(h * scale)))
        return cv2.resize(small, (w, h))

    def _color_jitter(self, img, rng):
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
        hsv[:,:,0] = (hsv[:,:,0] + rng.uniform(-10, 10)) % 180
        hsv[:,:,1] = np.clip(hsv[:,:,1] * rng.uniform(0.8, 1.2), 0, 255)
        hsv[:,:,2] = np.clip(hsv[:,:,2] * rng.uniform(0.85, 1.15), 0, 255)
        return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


DEGRADATION_TYPES = [
    'clean', 'jpeg_80', 'jpeg_50', 'jpeg_30',
    'crop_80', 'crop_50', 'noise', 'resize_50',
    'color_jitter', 'combined_light', 'combined_heavy',
]


def generate_dataset(
    output_dir: str,
    num_watermarked: int = 3000,
    num_clean: int = 1000,
    img_width: int = 512,
    img_height: int = 384,
):
    """Generate complete training dataset."""
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'images').mkdir(exist_ok=True)

    page_gen = PageGenerator(img_width, img_height)
    embedder = WatermarkEmbedder()
    degrader = DegradationPipeline()

    manifest = []
    idx = 0

    print(f"Generating {num_watermarked} watermarked + {num_clean} clean samples...")

    # Watermarked samples
    for i in range(num_watermarked):
        seed = 1000 + i
        user_id = f"user_{i:04d}"
        session_id = f"sess_{i:04d}"

        # Generate page background
        page = page_gen.generate(seed)

        # Generate identity bits
        bits = embedder.generate_bits(user_id, session_id)

        # Embed watermark
        watermarked = embedder.embed(page, bits, seed)

        # Apply random degradation
        rng = np.random.RandomState(seed + 50000)
        deg_type = DEGRADATION_TYPES[i % len(DEGRADATION_TYPES)]
        degraded = degrader.apply(watermarked, deg_type, rng)

        # Resize to model input size
        degraded = cv2.resize(degraded, (224, 224))

        # Save
        fname = f"wm_{idx:06d}.png"
        cv2.imwrite(str(output / 'images' / fname), degraded)
        manifest.append({
            'filename': fname,
            'is_watermarked': True,
            'bits': bits.tolist(),
            'degradation': deg_type,
            'seed': seed,
            'user_id': user_id,
        })
        idx += 1

        if (i + 1) % 500 == 0:
            print(f"  Watermarked: {i + 1}/{num_watermarked}")

    # Clean (non-watermarked) samples
    for i in range(num_clean):
        seed = 90000 + i
        page = page_gen.generate(seed)

        rng = np.random.RandomState(seed)
        deg_type = DEGRADATION_TYPES[i % len(DEGRADATION_TYPES)]
        degraded = degrader.apply(page, deg_type, rng)
        degraded = cv2.resize(degraded, (224, 224))

        fname = f"cl_{idx:06d}.png"
        cv2.imwrite(str(output / 'images' / fname), degraded)
        manifest.append({
            'filename': fname,
            'is_watermarked': False,
            'bits': [0.0] * 128,
            'degradation': deg_type,
            'seed': seed,
        })
        idx += 1

        if (i + 1) % 500 == 0:
            print(f"  Clean: {i + 1}/{num_clean}")

    # Save manifest
    with open(output / 'manifest.json', 'w') as f:
        json.dump(manifest, f)

    print(f"Dataset saved to {output_dir}/")
    print(f"  Total samples: {len(manifest)}")
    print(f"  Watermarked: {num_watermarked}")
    print(f"  Clean: {num_clean}")
    return manifest


if __name__ == '__main__':
    generate_dataset(
        output_dir='training_data',
        num_watermarked=3000,
        num_clean=1000,
    )
