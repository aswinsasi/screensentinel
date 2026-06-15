"""Lightweight adversarial training - hardens ML model against stripping attacks."""
import sys
import time
import argparse
import numpy as np
import cv2
import torch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.ml.models.extractor_model import WatermarkExtractorModel, CombinedLoss
from app.ml.training.data_generator import PageGenerator, WatermarkEmbedder


class AdversarialAttacks:
    def __init__(self):
        self.attacks = [
            self._jpeg_destroy, self._brightness_equalize,
            self._channel_swap, self._edge_smooth,
            self._contrast_crush, self._color_quantize,
        ]

    def apply_random(self, img, rng):
        n = rng.randint(1, 3)
        selected = rng.choice(len(self.attacks), size=n, replace=False)
        result = img.copy()
        for idx in selected:
            result = self.attacks[idx](result, rng)
            result = np.clip(result, 0, 255).astype(np.uint8)
        return result

    def _jpeg_destroy(self, img, rng):
        q = rng.randint(5, 25)
        _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, q])
        return cv2.imdecode(buf, cv2.IMREAD_COLOR)

    def _brightness_equalize(self, img, rng):
        h, w = img.shape[:2]
        grid = 4
        cell_h, cell_w = h // grid, w // grid
        target = float(np.mean(img))
        result = img.astype(np.float32)
        for r in range(grid):
            for c in range(grid):
                y1, y2 = r * cell_h, (r + 1) * cell_h
                x1, x2 = c * cell_w, (c + 1) * cell_w
                cell_mean = float(np.mean(result[y1:y2, x1:x2]))
                if cell_mean > 0:
                    blend = rng.uniform(0.3, 0.7)
                    result[y1:y2, x1:x2] *= (1.0 + blend * (target / cell_mean - 1.0))
        return result

    def _channel_swap(self, img, rng):
        ch = list(range(3))
        rng.shuffle(ch)
        blend = rng.uniform(0.3, 0.7)
        return (img.astype(float) * (1 - blend) + img[:, :, ch].astype(float) * blend).astype(np.uint8)

    def _edge_smooth(self, img, rng):
        return cv2.bilateralFilter(img, rng.choice([5, 7, 9]), 75, 75)

    def _contrast_crush(self, img, rng):
        f = rng.uniform(0.3, 0.7)
        m = np.mean(img)
        return ((img.astype(float) - m) * f + m).astype(np.uint8)

    def _color_quantize(self, img, rng):
        levels = rng.choice([8, 16, 32])
        return (img // levels * levels).astype(np.uint8)


def adversarial_train(args):
    print("=" * 50)
    print("  Adversarial Training")
    print("=" * 50)

    model = WatermarkExtractorModel(num_bits=128)
    checkpoint = torch.load(args.base_model, weights_only=True)
    model.load_state_dict(checkpoint['model_state_dict'])
    print(f"Base model loaded: {checkpoint.get('val_accuracy', '?')}")

    criterion = CombinedLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    attacker = AdversarialAttacks()
    page_gen = PageGenerator(512, 384)
    embedder = WatermarkEmbedder()

    model_dir = Path(args.model_dir)
    model_dir.mkdir(parents=True, exist_ok=True)
    best_acc = 0.0

    for epoch in range(args.epochs):
        t0 = time.time()
        model.train()
        total_loss, correct, total = 0, 0, 0

        for batch_start in range(0, args.samples_per_epoch, args.batch):
            bs = min(args.batch, args.samples_per_epoch - batch_start)
            images, presences, bits_list = [], [], []

            for i in range(bs):
                idx = epoch * args.samples_per_epoch + batch_start + i
                rng = np.random.RandomState(idx)

                if rng.random() < 0.75:
                    page = page_gen.generate(idx)
                    bits = embedder.generate_bits(f"adv_{idx}", f"s_{idx}")
                    wm = embedder.embed(page, bits, idx)
                    attacked = attacker.apply_random(wm, rng)
                    images.append(cv2.resize(attacked, (224, 224)))
                    presences.append(1.0)
                    bits_list.append(bits)
                else:
                    page = page_gen.generate(idx + 100000)
                    images.append(cv2.resize(page, (224, 224)))
                    presences.append(0.0)
                    bits_list.append(np.zeros(128, dtype=np.float32))

            img_t = torch.from_numpy(np.stack([im.astype(np.float32).transpose(2, 0, 1) / 255.0 for im in images]))
            pres_t = torch.tensor(presences, dtype=torch.float32)
            bits_t = torch.from_numpy(np.stack(bits_list))

            optimizer.zero_grad()
            pred_p, pred_b = model(img_t)
            loss, _, _ = criterion(pred_p, pred_b, pres_t, bits_t)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            total_loss += loss.item()
            correct += ((pred_p > 0.5).float() == pres_t).sum().item()
            total += len(pres_t)

        acc = correct / total
        print(f"  Epoch {epoch+1}/{args.epochs} | Loss: {total_loss / (args.samples_per_epoch / args.batch):.4f} | Acc: {acc:.1%} | {time.time()-t0:.0f}s")

        if acc > best_acc:
            best_acc = acc
            torch.save({'model_state_dict': model.state_dict(), 'val_accuracy': acc}, model_dir / 'best_model_hardened.pt')

    print(f"\nDone! Best: {best_acc:.1%}")
    print("Exporting ONNX...")
    model.eval()
    try:
        torch.onnx.export(model, torch.randn(1, 3, 224, 224), str(model_dir / 'screensentinel_extractor_hardened.onnx'),
                          opset_version=14, input_names=['image'], output_names=['presence', 'bits'])
        print(f"Saved: {model_dir / 'screensentinel_extractor_hardened.onnx'}")
    except Exception as e:
        print(f"ONNX export failed: {e}")
        print("Export manually after installing onnxscript")


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--base-model', default='models/best_model.pt')
    p.add_argument('--epochs', type=int, default=5)
    p.add_argument('--batch', type=int, default=4)
    p.add_argument('--lr', type=float, default=5e-4)
    p.add_argument('--samples-per-epoch', type=int, default=100)
    p.add_argument('--model-dir', default='models')
    adversarial_train(p.parse_args())
