// Backward-compatible shim: the original Lottie wrapper has been replaced with
// the lighter PixelScene SVG renderer (see components/PixelScene/index.tsx).
// Existing call sites keep working without churn.
"use client";

export {
  PixelScene as Lottie,
  type PixelSceneProps as LottieProps,
  type SceneName as LottieName,
} from "@/components/PixelScene";
