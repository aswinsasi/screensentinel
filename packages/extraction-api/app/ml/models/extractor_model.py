"""
ScreenSentinel Watermark Extraction Model.

Lightweight CNN designed for CPU training (no GPU required).
Architecture: Modified MobileNet-style with depthwise separable convolutions.

Two output heads:
  1. Presence head: Is this image watermarked? (binary, sigmoid)
  2. Bit head: Extract 128 identity bits (128 sigmoids)

Input: 224x224x3 image
Output: (presence_prob, bit_probs[128])
"""
import torch
import torch.nn as nn
import torch.nn.functional as F


class DepthwiseSeparableConv(nn.Module):
    """Efficient convolution block used in MobileNet."""
    def __init__(self, in_ch, out_ch, stride=1):
        super().__init__()
        self.depthwise = nn.Conv2d(in_ch, in_ch, 3, stride=stride, padding=1, groups=in_ch, bias=False)
        self.bn1 = nn.BatchNorm2d(in_ch)
        self.pointwise = nn.Conv2d(in_ch, out_ch, 1, bias=False)
        self.bn2 = nn.BatchNorm2d(out_ch)

    def forward(self, x):
        x = F.relu6(self.bn1(self.depthwise(x)))
        x = F.relu6(self.bn2(self.pointwise(x)))
        return x


class WatermarkExtractorModel(nn.Module):
    """
    Lightweight watermark extraction CNN.

    ~1.2M parameters. Trains in ~1-2 hours on CPU with 4000 samples.
    """
    def __init__(self, num_bits=128):
        super().__init__()
        self.num_bits = num_bits

        # Feature extractor (MobileNet-style)
        self.features = nn.Sequential(
            # Input: 224x224x3
            nn.Conv2d(3, 32, 3, stride=2, padding=1, bias=False),  # 112x112
            nn.BatchNorm2d(32),
            nn.ReLU6(inplace=True),

            DepthwiseSeparableConv(32, 64),                         # 112x112
            DepthwiseSeparableConv(64, 128, stride=2),              # 56x56
            DepthwiseSeparableConv(128, 128),                       # 56x56
            DepthwiseSeparableConv(128, 256, stride=2),             # 28x28
            DepthwiseSeparableConv(256, 256),                       # 28x28
            DepthwiseSeparableConv(256, 512, stride=2),             # 14x14
            DepthwiseSeparableConv(512, 512),                       # 14x14
            DepthwiseSeparableConv(512, 512),                       # 14x14
            DepthwiseSeparableConv(512, 1024, stride=2),            # 7x7
            DepthwiseSeparableConv(1024, 1024),                     # 7x7
        )

        # Global average pooling
        self.gap = nn.AdaptiveAvgPool2d(1)

        # Presence head: Is watermark present?
        self.presence_head = nn.Sequential(
            nn.Linear(1024, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(256, 1),
        )

        # Bit extraction head: Extract 128 identity bits
        self.bit_head = nn.Sequential(
            nn.Linear(1024, 512),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(512, 256),
            nn.ReLU(inplace=True),
            nn.Linear(256, num_bits),
        )

    def forward(self, x):
        # Extract features
        features = self.features(x)                  # (B, 1024, 7, 7)
        pooled = self.gap(features).flatten(1)       # (B, 1024)

        # Presence prediction
        presence = torch.sigmoid(self.presence_head(pooled))  # (B, 1)

        # Bit extraction
        bits = torch.sigmoid(self.bit_head(pooled))           # (B, 128)

        return presence.squeeze(1), bits

    def count_parameters(self):
        return sum(p.numel() for p in self.parameters() if p.requires_grad)


class CombinedLoss(nn.Module):
    """Combined loss for presence detection + bit extraction."""
    def __init__(self, presence_weight=1.0, bit_weight=2.0):
        super().__init__()
        self.presence_weight = presence_weight
        self.bit_weight = bit_weight
        self.bce = nn.BCELoss()

    def forward(self, pred_presence, pred_bits, target_presence, target_bits):
        # Presence loss (binary cross-entropy)
        loss_presence = self.bce(pred_presence, target_presence)

        # Bit loss (only for watermarked images)
        watermarked_mask = target_presence > 0.5
        if watermarked_mask.any():
            loss_bits = self.bce(
                pred_bits[watermarked_mask],
                target_bits[watermarked_mask]
            )
        else:
            loss_bits = torch.tensor(0.0)

        total = self.presence_weight * loss_presence + self.bit_weight * loss_bits
        return total, loss_presence.item(), loss_bits.item()


if __name__ == '__main__':
    model = WatermarkExtractorModel()
    print(f"Model parameters: {model.count_parameters():,}")

    # Test forward pass
    dummy = torch.randn(2, 3, 224, 224)
    presence, bits = model(dummy)
    print(f"Presence shape: {presence.shape}")  # (2,)
    print(f"Bits shape: {bits.shape}")          # (2, 128)
    print(f"Presence values: {presence.detach().numpy()}")
    print(f"Sample bits: {bits[0, :10].detach().numpy()}")
