"""SightForge Inference Service - Modal App, Images, and Volumes.

Defines the Modal App, specialized CPU and GPU container images, Volumes for weights
and extracted frames, and secret declarations without task logic (R35, R38, R39, R83, KTD2).
"""

import modal

from .config import (
    FRAMES_MOUNT_PATH,
    FRAMES_VOLUME_NAME,
    WEIGHTS_MOUNT_PATH,
    WEIGHTS_VOLUME_NAME,
)

# 1. Initialize Modal App
app = modal.App("sightforge-inference")

# 2. Volumes: Model Weights (persistent) and Video Frames (ephemeral) (R38, R39)
weights_volume = modal.Volume.from_name(WEIGHTS_VOLUME_NAME, create_if_missing=True)
frames_volume = modal.Volume.from_name(FRAMES_VOLUME_NAME, create_if_missing=True)

# Volume mounts dictionary for function/class decorators
VOLUME_MOUNTS = {
    WEIGHTS_MOUNT_PATH: weights_volume,
    FRAMES_MOUNT_PATH: frames_volume,
}

# 3. Secrets Declaration (R83)
inference_secrets = modal.Secret.from_name(
    "sightforge-inference-secrets",
    required_keys=[
        "MODAL_CALLBACK_SECRET",
    ],
)

# 4. CPU Container Image: Media probe, decode, and frame extraction (R37)
cpu_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "fastapi[standard]>=0.115.0",
        "pillow>=11.0.0",
        "numpy>=2.0.0",
        "requests>=2.32.0",
        "pydantic>=2.10.0",
        "torch>=2.4.0",
        "torchvision>=0.19.0",
        "ultralytics>=8.3.0",
        "opencv-python-headless>=4.10.0",
    )
    .add_local_python_source("sightforge_inference")
)

# 5. GPU Container Image: YOLO26 multi-task computer vision inference (R35, R38)
# Carries PyTorch, Ultralytics, and OpenCV shared libraries; zero ffmpeg/media toolchain.
gpu_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "libgl1-mesa-glx",
        "libglib2.0-0",
    )
    .pip_install(
        "torch>=2.4.0",
        "torchvision>=0.19.0",
        "ultralytics>=8.3.0",
        "opencv-python-headless>=4.10.0",
        "pillow>=11.0.0",
        "numpy>=2.0.0",
        "requests>=2.32.0",
        "pydantic>=2.10.0",
    )
    .add_local_python_source("sightforge_inference")
)
