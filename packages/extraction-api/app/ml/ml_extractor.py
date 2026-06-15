"""
ML-Powered Watermark Extractor.

Uses the trained ONNX model for watermark detection and bit extraction.
Falls back to classical extractors if no model is available.
"""
import os
import cv2
import numpy as np
from pathlib import Path


class MLExtractor:
    """
    Unified ML extractor that replaces all classical extraction channels.

    Uses a single CNN model that outputs:
      - presence: probability that the image contains a ScreenSentinel watermark
      - bits: 128 probabilities for identity bit extraction
    """

    def __init__(self, model_path: str = None):
        self.model = None
        self.model_loaded = False

        if model_path is None:
            # Search common locations
            search_paths = [
                'models/screensentinel_extractor.onnx',
                '../models/screensentinel_extractor.onnx',
                os.path.join(os.path.dirname(__file__), '..', '..', 'models', 'screensentinel_extractor.onnx'),
            ]
            for path in search_paths:
                if os.path.exists(path):
                    model_path = path
                    break

        if model_path and os.path.exists(model_path):
            try:
                import onnxruntime as ort
                self.model = ort.InferenceSession(
                    model_path,
                    providers=['CPUExecutionProvider']
                )
                self.model_loaded = True
                print(f"ML model loaded: {model_path}")
            except Exception as e:
                print(f"Failed to load ML model: {e}")
                self.model_loaded = False
        else:
            print("No ML model found. Using classical extraction only.")

    def extract(self, image: np.ndarray) -> dict:
        """
        Run ML extraction on an image.

        Returns:
            dict with:
              - is_watermarked: bool
              - presence_confidence: float (0-1)
              - bit_probabilities: list of 128 floats
              - bits: list of 128 ints (hard decision)
              - bit_confidence: float (average certainty per bit)
        """
        if not self.model_loaded:
            return {
                'is_watermarked': False,
                'presence_confidence': 0.0,
                'bit_probabilities': [0.5] * 128,
                'bits': [0] * 128,
                'bit_confidence': 0.0,
                'model_used': False,
            }

        # Preprocess image for model input
        input_tensor = self._preprocess(image)

        # Run inference
        input_name = self.model.get_inputs()[0].name
        outputs = self.model.run(None, {input_name: input_tensor})

        presence_prob = float(outputs[0][0])
        bit_probs = outputs[1][0].tolist()

        # Hard decision on bits
        bits = [1 if p > 0.5 else 0 for p in bit_probs]

        # Bit confidence: how far each bit is from 0.5 (uncertain)
        bit_confidence = float(np.mean([abs(p - 0.5) * 2 for p in bit_probs]))

        return {
            'is_watermarked': presence_prob > 0.5,
            'presence_confidence': presence_prob,
            'bit_probabilities': bit_probs,
            'bits': bits,
            'bit_confidence': bit_confidence,
            'model_used': True,
        }

    def _preprocess(self, image: np.ndarray) -> np.ndarray:
        """Prepare image for model input: resize, normalize, reshape."""
        # Resize to 224x224
        img = cv2.resize(image, (224, 224))

        # Normalize to [0, 1]
        img = img.astype(np.float32) / 255.0

        # HWC -> CHW
        img = np.transpose(img, (2, 0, 1))

        # Add batch dimension: (1, 3, 224, 224)
        img = np.expand_dims(img, axis=0)

        return img
