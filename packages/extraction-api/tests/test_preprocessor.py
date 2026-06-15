import pytest
import numpy as np
from app.core.preprocessor import ImagePreprocessor, DegradationProfile

def test_degradation_profile_labels():
    d = DegradationProfile(estimated_jpeg_quality=90)
    assert d._compression_label() == "none"
    d.estimated_jpeg_quality = 70
    assert d._compression_label() == "light"
    d.estimated_jpeg_quality = 45
    assert d._compression_label() == "moderate"
    d.estimated_jpeg_quality = 20
    assert d._compression_label() == "heavy"

def test_preprocessor_rejects_invalid_image():
    preprocessor = ImagePreprocessor()
    with pytest.raises(ValueError, match="Could not decode"):
        preprocessor.process(b"not an image")
