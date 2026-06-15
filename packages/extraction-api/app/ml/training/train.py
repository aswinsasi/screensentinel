"""
ScreenSentinel Model Training Script.

Optimized for CPU training with 16GB RAM.
Trains in ~1-2 hours on a modern CPU.

Usage:
    python train.py                          # Generate data + train
    python train.py --skip-datagen           # Train only (data already generated)
    python train.py --epochs 30 --batch 16   # Custom settings
"""
import os
import sys
import json
import time
import argparse
import numpy as np
import cv2
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from pathlib import Path

# Add parent paths
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.ml.models.extractor_model import WatermarkExtractorModel, CombinedLoss
from app.ml.training.data_generator import generate_dataset


class WatermarkDataset(Dataset):
    """PyTorch dataset for watermark training data."""

    def __init__(self, data_dir: str, split: str = 'train', train_ratio: float = 0.85):
        self.data_dir = Path(data_dir)
        self.image_dir = self.data_dir / 'images'

        with open(self.data_dir / 'manifest.json') as f:
            manifest = json.load(f)

        # Split into train/val
        np.random.seed(42)
        indices = np.random.permutation(len(manifest))
        split_idx = int(len(manifest) * train_ratio)

        if split == 'train':
            self.samples = [manifest[i] for i in indices[:split_idx]]
        else:
            self.samples = [manifest[i] for i in indices[split_idx:]]

        print(f"  {split}: {len(self.samples)} samples")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        sample = self.samples[idx]

        # Load image
        img_path = self.image_dir / sample['filename']
        img = cv2.imread(str(img_path))
        if img is None:
            img = np.zeros((224, 224, 3), dtype=np.uint8)

        # Resize to model input
        img = cv2.resize(img, (224, 224))

        # Normalize to [0, 1] and convert to CHW
        img = img.astype(np.float32) / 255.0
        img = np.transpose(img, (2, 0, 1))  # HWC -> CHW

        # Targets
        is_watermarked = float(sample['is_watermarked'])
        bits = np.array(sample['bits'], dtype=np.float32)

        return (
            torch.from_numpy(img),
            torch.tensor(is_watermarked),
            torch.from_numpy(bits),
        )


def train(args):
    """Main training loop."""
    print("=" * 60)
    print("  ScreenSentinel ML Training")
    print("=" * 60)
    print(f"  Device: CPU")
    print(f"  Epochs: {args.epochs}")
    print(f"  Batch size: {args.batch}")
    print(f"  Learning rate: {args.lr}")
    print()

    # Step 1: Generate training data (if needed)
    data_dir = args.data_dir
    if not args.skip_datagen:
        print("Step 1: Generating training data...")
        generate_dataset(
            output_dir=data_dir,
            num_watermarked=args.num_watermarked,
            num_clean=args.num_clean,
        )
        print()
    else:
        print("Step 1: Skipping data generation (--skip-datagen)")
        print()

    # Step 2: Create datasets
    print("Step 2: Loading datasets...")
    train_dataset = WatermarkDataset(data_dir, split='train')
    val_dataset = WatermarkDataset(data_dir, split='val')

    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch,
        shuffle=True,
        num_workers=0,  # CPU-friendly
        pin_memory=False,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch,
        shuffle=False,
        num_workers=0,
    )
    print()

    # Step 3: Create model
    print("Step 3: Creating model...")
    model = WatermarkExtractorModel(num_bits=128)
    print(f"  Parameters: {model.count_parameters():,}")

    criterion = CombinedLoss(presence_weight=1.0, bit_weight=2.0)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    print()

    # Step 4: Training loop
    print("Step 4: Training...")
    best_val_acc = 0.0
    model_dir = Path(args.model_dir)
    model_dir.mkdir(parents=True, exist_ok=True)

    for epoch in range(args.epochs):
        epoch_start = time.time()

        # ─── Train ───
        model.train()
        train_loss = 0.0
        train_presence_correct = 0
        train_total = 0

        for batch_idx, (images, targets_presence, targets_bits) in enumerate(train_loader):
            optimizer.zero_grad()

            pred_presence, pred_bits = model(images)
            loss, loss_p, loss_b = criterion(pred_presence, pred_bits, targets_presence, targets_bits)

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            train_loss += loss.item()
            predicted = (pred_presence > 0.5).float()
            train_presence_correct += (predicted == targets_presence).sum().item()
            train_total += len(targets_presence)

        scheduler.step()

        train_acc = train_presence_correct / train_total
        avg_train_loss = train_loss / len(train_loader)

        # ─── Validate ───
        model.eval()
        val_loss = 0.0
        val_presence_correct = 0
        val_bit_accuracy = 0.0
        val_total = 0
        val_wm_count = 0

        with torch.no_grad():
            for images, targets_presence, targets_bits in val_loader:
                pred_presence, pred_bits = model(images)
                loss, _, _ = criterion(pred_presence, pred_bits, targets_presence, targets_bits)

                val_loss += loss.item()
                predicted = (pred_presence > 0.5).float()
                val_presence_correct += (predicted == targets_presence).sum().item()
                val_total += len(targets_presence)

                # Bit accuracy (only for watermarked samples)
                wm_mask = targets_presence > 0.5
                if wm_mask.any():
                    pred_hard = (pred_bits[wm_mask] > 0.5).float()
                    target_hard = (targets_bits[wm_mask] > 0.5).float()
                    bit_acc = (pred_hard == target_hard).float().mean().item()
                    val_bit_accuracy += bit_acc * wm_mask.sum().item()
                    val_wm_count += wm_mask.sum().item()

        val_acc = val_presence_correct / val_total
        avg_val_loss = val_loss / len(val_loader)
        avg_bit_acc = val_bit_accuracy / max(val_wm_count, 1)

        elapsed = time.time() - epoch_start

        print(
            f"  Epoch {epoch+1:3d}/{args.epochs} | "
            f"Loss: {avg_train_loss:.4f}/{avg_val_loss:.4f} | "
            f"Presence: {train_acc:.1%}/{val_acc:.1%} | "
            f"Bits: {avg_bit_acc:.1%} | "
            f"{elapsed:.0f}s"
        )

        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'val_accuracy': val_acc,
                'bit_accuracy': avg_bit_acc,
            }, model_dir / 'best_model.pt')

        # Save latest
        torch.save({
            'epoch': epoch,
            'model_state_dict': model.state_dict(),
            'val_accuracy': val_acc,
            'bit_accuracy': avg_bit_acc,
        }, model_dir / 'latest_model.pt')

    print()
    print(f"Training complete! Best validation accuracy: {best_val_acc:.1%}")
    print(f"Model saved to {model_dir}/")

    # Step 5: Export to ONNX
    print()
    print("Step 5: Exporting to ONNX...")
    export_onnx(model, model_dir / 'screensentinel_extractor.onnx')
    print(f"  ONNX model saved to {model_dir / 'screensentinel_extractor.onnx'}")
    print()
    print("Done! Copy the .onnx file to your extraction API models/ directory.")


def export_onnx(model, output_path):
    """Export trained model to ONNX format."""
    model.eval()
    dummy_input = torch.randn(1, 3, 224, 224)

    torch.onnx.export(
        model,
        dummy_input,
        str(output_path),
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=['image'],
        output_names=['presence', 'bits'],
        dynamic_axes={
            'image': {0: 'batch_size'},
            'presence': {0: 'batch_size'},
            'bits': {0: 'batch_size'},
        },
    )


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='ScreenSentinel ML Training')
    parser.add_argument('--epochs', type=int, default=20, help='Training epochs')
    parser.add_argument('--batch', type=int, default=8, help='Batch size (keep small for CPU)')
    parser.add_argument('--lr', type=float, default=1e-3, help='Learning rate')
    parser.add_argument('--num-watermarked', type=int, default=3000, help='Watermarked samples')
    parser.add_argument('--num-clean', type=int, default=1000, help='Clean samples')
    parser.add_argument('--data-dir', type=str, default='training_data', help='Training data directory')
    parser.add_argument('--model-dir', type=str, default='models', help='Model output directory')
    parser.add_argument('--skip-datagen', action='store_true', help='Skip data generation')

    args = parser.parse_args()
    train(args)
